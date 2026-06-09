import re
import asyncio
import random
import base64
import json
import urllib.parse
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import httpx
from bs4 import BeautifulSoup

from core.limiter import limiter
from core.config import settings

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

    # Patrones de path: /dp/, /gp/product/, /dp/product/, /gp/aw/d/ (móvil),
    # /gp/aw/ode/, /product/
    m = re.search(
        r"/(?:dp/product|dp|gp/product|gp/aw/d|gp/aw/ode|product)/([A-Z0-9]{10})",
        raw,
    )
    if m:
        return m.group(1)

    # ASIN en query params (?asin=, ?ASIN=, ?pd_rd_i=) o Buy Again (ats base64)
    try:
        parsed = urllib.parse.urlparse(raw)
        params = dict(urllib.parse.parse_qsl(parsed.query))
        for k in ("asin", "ASIN", "pd_rd_i"):
            v = params.get(k, "")
            if re.fullmatch(r"[A-Z0-9]{10}", v):
                return v
        if "ats" in params:
            padded = params["ats"] + "=="
            data = json.loads(base64.b64decode(padded))
            candidates = data.get("explicitCandidates", "")
            if candidates:
                return candidates.split(",")[0].strip()
    except Exception:
        pass

    # Último recurso: un token tipo ASIN (B0...) suelto en una URL de Amazon
    if re.search(r"amazon|amzn|a\.co", raw, re.I):
        m = re.search(r"\b(B0[A-Z0-9]{8})\b", raw)
        if m:
            return m.group(1)

    return None


# Dominios cortos de Amazon que NO contienen el ASIN: hay que seguir el redirect.
_SHORTLINK_HOSTS = ("a.co", "amzn.to", "amzn.eu", "amzn.com", "amzn.asia")


async def _resolve_shortlink(url: str, headers: dict) -> str | None:
    """Sigue el redirect de un link corto de Amazon y extrae el ASIN del destino."""
    timeout = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
            resp = await client.get(url, headers=headers)
            return _extract_asin(str(resp.url))
    except (httpx.RequestError, httpx.TimeoutException):
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


def _browser_headers() -> dict:
    """Headers de un Chrome real (incluye sec-ch-ua/sec-fetch) para no parecer bot."""
    return {
        "User-Agent": random.choice(_USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://www.google.com/",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-User": "?1",
        "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
    }


def _is_blocked(r: httpx.Response) -> bool:
    """True si Amazon devolvió una página anti-bot (challenge/captcha) en vez del producto."""
    if r.status_code != 200:
        return True
    low = r.text.lower()
    if "captcha" in str(r.url).lower():
        return True
    if "to discuss automated access" in low or "api-services-support@amazon" in low:
        return True
    # Las páginas de challenge / "Dogs of Amazon" son chicas y no traen el productTitle
    if "producttitle" not in low:
        return True
    return False


# Amazon bloquea de forma intermitente las IPs de datacenter. No es un baneo fijo:
# reintentando con sesión fresca y pausas suele salir el producto.
_MAX_ATTEMPTS = 3


async def _try_relay(url: str) -> ScrapeResponse | None:
    """
    Reenvía el scraping al relay residencial (si está configurado), porque Amazon
    bloquea la IP del datacenter. Devuelve la respuesta del relay, o None si el
    relay no responde (para caer al scraping directo). Un 422 del relay (ASIN
    inválido) se propaga, porque el scraping directo tampoco lo resolvería.
    """
    if not settings.AMAZON_RELAY_URL:
        return None
    relay_url = settings.AMAZON_RELAY_URL.rstrip("/") + "/scrape"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(90.0)) as client:
            r = await client.post(
                relay_url,
                json={"url": url},
                headers={"X-Relay-Token": settings.AMAZON_RELAY_TOKEN},
            )
    except (httpx.RequestError, httpx.TimeoutException):
        return None  # relay caído → fallback a scraping directo

    if r.status_code == 200:
        d = r.json()
        return ScrapeResponse(
            asin=d["asin"], name=d.get("name"),
            price_usd=d.get("price_usd"), url=d.get("url", url),
        )
    if r.status_code == 422:
        raise HTTPException(status_code=422, detail="No se pudo extraer el ASIN de la URL.")
    return None  # 503/otro → fallback a scraping directo


@router.post("/scrape", response_model=ScrapeResponse)
@limiter.limit("30/minute")
async def scrape_amazon(body: ScrapeRequest, request: Request):
    # Relay residencial primero (Amazon bloquea la IP del datacenter).
    relayed = await _try_relay(body.url)
    if relayed is not None:
        return relayed

    base_headers = _browser_headers()

    asin = _extract_asin(body.url)

    # Links cortos (a.co, amzn.to, amzn.eu...) no traen el ASIN: seguir el redirect.
    if not asin:
        host = (urllib.parse.urlparse(body.url.strip()).hostname or "").lower()
        host = host[4:] if host.startswith("www.") else host
        if host in _SHORTLINK_HOSTS:
            asin = await _resolve_shortlink(body.url.strip(), base_headers)

    if not asin:
        raise HTTPException(status_code=422, detail="No se pudo extraer el ASIN de la URL.")

    product_url = f"https://www.amazon.com/dp/{asin}"
    timeout = httpx.Timeout(connect=6.0, read=12.0, write=6.0, pool=6.0)
    last_detail = "Amazon bloqueó la solicitud (anti-bot)."

    for attempt in range(_MAX_ATTEMPTS):
        # User-Agent distinto por intento; sesión/cookies frescas (un intento
        # bloqueado deja cookies marcadas, por eso un cliente nuevo cada vez).
        headers = {**base_headers, "User-Agent": random.choice(_USER_AGENTS)}
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
                # 1. Homepage → establece sesión
                await client.get("https://www.amazon.com/", headers=headers)
                await asyncio.sleep(random.uniform(0.5, 1.4))

                # 2. Zip de USA → buybox y precios en USD
                await client.post(
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
                await asyncio.sleep(random.uniform(0.5, 1.4))

                # 3. Producto
                r = await client.get(product_url, headers=headers)
        except httpx.TimeoutException:
            last_detail = "Amazon tardó demasiado en responder."
        except httpx.RequestError:
            last_detail = "Error de red al conectar con Amazon."
        else:
            if not _is_blocked(r):
                soup = BeautifulSoup(r.text, "html.parser")
                title_el = soup.select_one("#productTitle")
                name = title_el.get_text(strip=True) if title_el else None
                price = _parse_price(r.text, soup)
                return ScrapeResponse(asin=asin, name=name, price_usd=price, url=product_url)
            last_detail = f"Amazon devolvió una página anti-bot (status {r.status_code})."

        # Backoff incremental antes de reintentar (no tras el último intento)
        if attempt < _MAX_ATTEMPTS - 1:
            await asyncio.sleep(random.uniform(1.2, 2.5) * (attempt + 1))

    raise HTTPException(
        status_code=503,
        detail=f"{last_detail} Reintentá en unos segundos.",
    )
