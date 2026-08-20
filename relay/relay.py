"""
Relay residencial de scraping de Amazon para Nodo.

Corre en una conexión RESIDENCIAL (tu PC / casa). El backend de producción le
reenvía los pedidos de scraping para que Amazon vea una IP residencial y no la
del datacenter (que Amazon bloquea con páginas anti-bot).

Uso rápido:
    pip install -r requirements.txt
    RELAY_TOKEN=<el-mismo-token-que-en-el-.env-del-server> python relay.py

Después exponelo con Cloudflare Tunnel (ver README.md) y pegá la URL pública
resultante en AMAZON_RELAY_URL del .env del servidor.
"""
import os
import re
import json
import base64
import random
import asyncio
import urllib.parse

import uvicorn
from bs4 import BeautifulSoup
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

try:
    from curl_cffi.requests import AsyncSession as CurlSession, RequestsError
except ImportError:  # dependencia nueva: el venv viejo del relay no la tiene
    raise SystemExit(
        "ERROR: falta curl_cffi. Actualizá las dependencias del relay:\n"
        "    pip install -r requirements.txt"
    )

RELAY_TOKEN = os.environ.get("RELAY_TOKEN", "")
RELAY_PORT = int(os.environ.get("RELAY_PORT", "8799"))

# Amazon no mira sólo el User-Agent: lee el handshake TLS y el perfil HTTP/2. Un cliente
# HTTP de Python disfrazado con headers de Chrome se detecta igual. curl_cffi reproduce la
# huella completa del navegador; se rota entre intentos.
_IMPERSONATE = ["chrome124", "chrome131", "safari180"]

# El perfil impersonado ya manda User-Agent, Accept, Accept-Encoding y sec-ch-ua coherentes
# con su huella. Acá sólo va lo que traería alguien que llega desde una búsqueda.
_EXTRA_HEADERS = {
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.google.com/",
}

_PRICE_SELECTORS = [
    ".apexPriceToPay .a-offscreen",
    "#apex_offerDisplay_desktop .a-offscreen",
    "#corePriceDisplay_desktop_feature_div .a-offscreen",
    "#corePrice_feature_div .a-offscreen",
    "#price_inside_buybox",
    "#newBuyBoxPrice",
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    "#priceblock_saleprice",
    ".a-price.priceToPay .a-offscreen",
    ".a-price .a-offscreen",
]

_SHORTLINK_HOSTS = ("a.co", "amzn.to", "amzn.eu", "amzn.com", "amzn.asia")
_MAX_ATTEMPTS = 3


def _extract_asin(url_or_asin: str) -> str | None:
    raw = url_or_asin.strip()
    if re.fullmatch(r"[A-Z0-9]{10}", raw):
        return raw
    m = re.search(
        r"/(?:dp/product|dp|gp/product|gp/aw/d|gp/aw/ode|product)/([A-Z0-9]{10})",
        raw,
    )
    if m:
        return m.group(1)
    try:
        parsed = urllib.parse.urlparse(raw)
        params = dict(urllib.parse.parse_qsl(parsed.query))
        for k in ("asin", "ASIN", "pd_rd_i"):
            v = params.get(k, "")
            if re.fullmatch(r"[A-Z0-9]{10}", v):
                return v
        if "ats" in params:
            data = json.loads(base64.b64decode(params["ats"] + "=="))
            candidates = data.get("explicitCandidates", "")
            if candidates:
                return candidates.split(",")[0].strip()
    except Exception:
        pass
    if re.search(r"amazon|amzn|a\.co", raw, re.I):
        m = re.search(r"\b(B0[A-Z0-9]{8})\b", raw)
        if m:
            return m.group(1)
    return None


def _is_blocked(r) -> bool:
    if r.status_code != 200:
        return True
    low = r.text.lower()
    if "captcha" in str(r.url).lower():
        return True
    if "to discuss automated access" in low or "api-services-support@amazon" in low:
        return True
    if "producttitle" not in low:
        return True
    return False


def _parse_price_from_json(html: str) -> float | None:
    for key in ("buyBoxPrice", "fullPrice"):
        hits = re.findall(key + r"\\\\&quot;:([\d.]+)", html)
        if hits:
            try:
                return float(hits[0])
            except ValueError:
                continue
    return None


def _parse_price(html: str, soup: BeautifulSoup) -> float | None:
    for selector in _PRICE_SELECTORS:
        for el in soup.select(selector):
            text = el.get_text(strip=True)
            if "$" not in text:
                continue
            m = re.search(r"\d{1,4}(?:\.\d{1,2})?", text.replace(",", ""))
            if not m:
                continue
            try:
                value = float(m.group())
            except ValueError:
                continue
            if value > 0:
                return value
    return _parse_price_from_json(html)


def _parse_image(soup: BeautifulSoup, html: str) -> str | None:
    img = soup.select_one("#landingImage[data-old-hires]")
    if img and img.get("data-old-hires", "").startswith("http"):
        return img["data-old-hires"]
    img = soup.select_one("#landingImage, #imgTagWrapperId img, #main-image-container img")
    if img:
        src = str(img.get("src") or "")
        if src.startswith("http") and "transparent-pixel" not in src and src.endswith((".jpg", ".png", ".webp")):
            return src
    m = re.search(r'"hiRes"\s*:\s*"(https://m\.media-amazon\.com/images/I/[^"]+\.jpg)"', html)
    if m:
        return m.group(1)
    return None


def _parse_bullets(soup: BeautifulSoup) -> str | None:
    bullets: list[str] = []
    for el in soup.select("#feature-bullets ul li span.a-list-item"):
        t = el.get_text(" ", strip=True)
        if not t or len(t) < 12:
            continue
        low = t.lower()
        if "make sure this fits" in low or "see more product details" in low:
            continue
        if len(t) > 90:
            t = t[:88].rstrip() + "…"
        bullets.append(t)
        if len(bullets) >= 3:
            break
    if not bullets:
        return None
    return "\n".join(f"• {b}" for b in bullets)[:240]


async def _resolve_shortlink(url: str) -> str | None:
    try:
        async with CurlSession(impersonate=random.choice(_IMPERSONATE), timeout=15) as s:
            resp = await s.get(url, headers=_EXTRA_HEADERS)
            asin = _extract_asin(str(resp.url))
            if asin:
                return asin
            m = (re.search(r'"asin"\s*:\s*"(B0[A-Z0-9]{8})"', resp.text, re.I)
                 or re.search(r'id="ASIN"[^>]*value="(B0[A-Z0-9]{8})"', resp.text))
            return m.group(1) if m else None
    except RequestsError:
        return None


app = FastAPI(title="Nodo Amazon Relay", docs_url=None, redoc_url=None)


class ScrapeIn(BaseModel):
    url: str


class ScrapeOut(BaseModel):
    asin: str
    name: str | None
    price_usd: float | None
    url: str
    # El backend guarda estos dos en su cache: sin ellos, un producto traído por el relay
    # nacía sin foto ni descripción y así quedaba cacheado 24h para todos los tenants.
    image_url: str | None = None
    description: str | None = None


@app.get("/health")
async def health():
    return {"status": "ok", "service": "nodo-amazon-relay"}


@app.post("/scrape", response_model=ScrapeOut)
async def scrape(body: ScrapeIn, x_relay_token: str = Header(default="")):
    if not RELAY_TOKEN or x_relay_token != RELAY_TOKEN:
        raise HTTPException(status_code=401, detail="Token de relay inválido.")

    # Compartir desde la app de Amazon pega texto, no una URL pelada.
    m_url = re.search(r"https?://\S+", body.url.strip())
    link = m_url.group(0).rstrip(").,;\"'") if m_url else body.url.strip()

    asin = _extract_asin(link)
    if not asin:
        host = (urllib.parse.urlparse(link).hostname or "").lower()
        host = host[4:] if host.startswith("www.") else host
        if host in _SHORTLINK_HOSTS:
            asin = await _resolve_shortlink(link)
    if not asin:
        raise HTTPException(status_code=422, detail="No se pudo extraer el ASIN de la URL.")

    product_url = f"https://www.amazon.com/dp/{asin}"
    last_detail = "Amazon bloqueó la solicitud (anti-bot)."
    missing = 0   # veces que Amazon dijo 404: el producto no existe, no es bloqueo

    for attempt in range(_MAX_ATTEMPTS):
        # Perfil distinto por intento; sesión/cookies frescas (un intento bloqueado deja
        # cookies marcadas, por eso una sesión nueva cada vez).
        try:
            async with CurlSession(impersonate=random.choice(_IMPERSONATE), timeout=25) as client:
                await client.get("https://www.amazon.com/", headers=_EXTRA_HEADERS)
                await asyncio.sleep(random.uniform(0.5, 1.4))
                await client.post(
                    "https://www.amazon.com/portal-migration/hz/glow/address-change",
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded",
                        "x-requested-with": "XMLHttpRequest",
                        "Accept": "*/*",
                        "Origin": "https://www.amazon.com",
                        "Referer": "https://www.amazon.com/",
                    },
                    data="locationType=LOCATION_INPUT&zipCode=10001&deviceType=desktop&stateOrRegion=NY&countryCode=US&pageType=Detail&actionSource=glow",
                )
                await asyncio.sleep(random.uniform(0.5, 1.4))
                r = await client.get(product_url, headers=_EXTRA_HEADERS)
        except RequestsError as exc:
            last_detail = "Amazon tardó demasiado en responder." if "timed out" in str(exc).lower() \
                else "Error de red al conectar con Amazon."
        else:
            if not _is_blocked(r):
                soup = BeautifulSoup(r.text, "html.parser")
                title_el = soup.select_one("#productTitle")
                name = title_el.get_text(strip=True) if title_el else None
                return ScrapeOut(
                    asin=asin, name=name, price_usd=_parse_price(r.text, soup),
                    url=product_url, image_url=_parse_image(soup, r.text),
                    description=_parse_bullets(soup),
                )
            if r.status_code == 404:
                missing += 1
            last_detail = f"Amazon devolvió una página anti-bot (status {r.status_code})."

        if attempt < _MAX_ATTEMPTS - 1:
            await asyncio.sleep(random.uniform(1.2, 2.5) * (attempt + 1))

    # Un 404 en todos los intentos no es bloqueo: ese producto ya no está en Amazon.
    if missing == _MAX_ATTEMPTS:
        raise HTTPException(status_code=404, detail="Ese producto ya no está en Amazon. Revisá el enlace.")

    raise HTTPException(status_code=503, detail=f"{last_detail} Reintentá en unos segundos.")


if __name__ == "__main__":
    if not RELAY_TOKEN:
        raise SystemExit("ERROR: definí la variable de entorno RELAY_TOKEN antes de arrancar.")
    print(f"Nodo Amazon Relay escuchando en http://0.0.0.0:{RELAY_PORT}")
    uvicorn.run(app, host="0.0.0.0", port=RELAY_PORT)
