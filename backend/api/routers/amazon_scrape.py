import re
import random
import base64
import json
import urllib.parse
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import httpx
from bs4 import BeautifulSoup

from core.limiter import limiter

router = APIRouter(tags=["Amazon"])

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
]

# Selectores ordenados del más específico (buybox actual) al más genérico.
# El primero que devuelva un número válido gana.
_PRICE_SELECTORS = [
    # Buybox principal — precio real de compra
    ".apexPriceToPay .a-offscreen",
    "#apex_offerDisplay_desktop .a-offscreen",
    "#corePriceDisplay_desktop_feature_div .a-offscreen",
    "#corePrice_feature_div .a-offscreen",
    "#price_inside_buybox",
    "#newBuyBoxPrice",
    # Bloques legacy
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    "#priceblock_saleprice",
    ".a-price.priceToPay .a-offscreen",
    # Con zip USA activo, el buybox queda en .a-price .a-offscreen estándar
    ".a-price .a-offscreen",
]


def _extract_asin(url_or_asin: str) -> str | None:
    raw = url_or_asin.strip()

    # ASIN directo
    if re.fullmatch(r"[A-Z0-9]{10}", raw):
        return raw

    # URL con /dp/ o /gp/product/
    m = re.search(r"/(?:dp|gp/product)/([A-Z0-9]{10})", raw)
    if m:
        return m.group(1)

    # URL de Buy Again con parámetro ats en base64
    try:
        parsed = urllib.parse.urlparse(raw)
        params = dict(urllib.parse.parse_qsl(parsed.query))
        if "ats" in params:
            padded = params["ats"] + "=="
            data = json.loads(base64.b64decode(padded))
            candidates = data.get("explicitCandidates", "")
            if candidates:
                return candidates.split(",")[0].strip()
    except Exception:
        pass

    return None


def _parse_price_from_json(html: str) -> float | None:
    """
    Amazon embeds a double-escaped JSON in the page with USD prices
    regardless of the server's geo-location.
    Keys tried in priority order: buyBoxPrice → fullPrice.
    """
    for key in ("buyBoxPrice", "fullPrice"):
        # Pattern: keyName\&quot;:35.99
        hits = re.findall(key + r"\\\\&quot;:([\d.]+)", html)
        if hits:
            try:
                return float(hits[0])
            except ValueError:
                continue
    return None


def _parse_price(html: str, soup: BeautifulSoup) -> float | None:
    # Con el zip de USA activo el buybox muestra USD (símbolo $).
    # Buscar primero en selectores específicos del buybox con precio en USD.
    for selector in _PRICE_SELECTORS:
        for el in soup.select(selector):
            text = el.get_text(strip=True)
            if "$" not in text:
                continue  # ignorar precios en GTQ u otras monedas
            m = re.search(r"\d{1,4}(?:\.\d{1,2})?", text.replace(",", ""))
            if not m:
                continue
            try:
                value = float(m.group())
            except ValueError:
                continue
            if value > 0:
                return value

    # Fallback: JSON embebido (USD sin importar IP)
    return _parse_price_from_json(html)


class ScrapeRequest(BaseModel):
    url: str


class ScrapeResponse(BaseModel):
    asin: str
    name: str | None
    price_usd: float | None
    url: str


@router.post("/scrape", response_model=ScrapeResponse)
@limiter.limit("30/minute")
async def scrape_amazon(body: ScrapeRequest, request: Request):
    asin = _extract_asin(body.url)
    if not asin:
        raise HTTPException(status_code=422, detail="No se pudo extraer el ASIN de la URL.")

    headers = {
        "User-Agent": random.choice(_USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://www.google.com/",
        "Connection": "keep-alive",
    }

    product_url = f"https://www.amazon.com/dp/{asin}"

    # Timeout ajustado por request: homepage y zip son rápidos, producto puede tardar más.
    # Total máximo ~20s en vez de 45s.
    timeout = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
            # 1. Homepage para sesión limpia (sin esto el zip change devuelve 403)
            await client.get("https://www.amazon.com/", headers=headers)

            # 2. Zip de USA → Amazon muestra buybox y precios en USD
            zip_r = await client.post(
                "https://www.amazon.com/portal-migration/hz/glow/address-change",
                headers={
                    **headers,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "x-requested-with": "XMLHttpRequest",
                    "Accept": "*/*",
                    "Origin": "https://www.amazon.com",
                    "Referer": "https://www.amazon.com/",
                },
                data="locationType=LOCATION_INPUT&zipCode=10001&deviceType=desktop&stateOrRegion=NY&countryCode=US&pageType=Detail&actionSource=glow",
            )
            if zip_r.status_code not in (200, 207):
                raise HTTPException(
                    status_code=503,
                    detail="Amazon bloqueó la sesión temporalmente. Intenta de nuevo en unos segundos.",
                )

            # 3. Producto con sesión establecida
            r = await client.get(product_url, headers=headers)
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Amazon tardó demasiado en responder. Intenta de nuevo.")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Error de red al conectar con Amazon.")

    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Amazon respondió con status {r.status_code}.")

    if "captcha" in r.url.path.lower() or "robot" in r.text.lower()[:500]:
        raise HTTPException(status_code=429, detail="Amazon bloqueó la solicitud. Intenta de nuevo en unos segundos.")

    soup = BeautifulSoup(r.text, "html.parser")

    title_el = soup.select_one("#productTitle")
    name = title_el.get_text(strip=True) if title_el else None

    price = _parse_price(r.text, soup)

    return ScrapeResponse(asin=asin, name=name, price_usd=price, url=product_url)
