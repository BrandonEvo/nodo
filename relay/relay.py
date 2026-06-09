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

import httpx
import uvicorn
from bs4 import BeautifulSoup
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

RELAY_TOKEN = os.environ.get("RELAY_TOKEN", "")
RELAY_PORT = int(os.environ.get("RELAY_PORT", "8799"))

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
]

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


def _browser_headers() -> dict:
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


async def _resolve_shortlink(url: str, headers: dict) -> str | None:
    timeout = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
            resp = await client.get(url, headers=headers)
            return _extract_asin(str(resp.url))
    except (httpx.RequestError, httpx.TimeoutException):
        return None


app = FastAPI(title="Nodo Amazon Relay", docs_url=None, redoc_url=None)


class ScrapeIn(BaseModel):
    url: str


class ScrapeOut(BaseModel):
    asin: str
    name: str | None
    price_usd: float | None
    url: str


@app.get("/health")
async def health():
    return {"status": "ok", "service": "nodo-amazon-relay"}


@app.post("/scrape", response_model=ScrapeOut)
async def scrape(body: ScrapeIn, x_relay_token: str = Header(default="")):
    if not RELAY_TOKEN or x_relay_token != RELAY_TOKEN:
        raise HTTPException(status_code=401, detail="Token de relay inválido.")

    base_headers = _browser_headers()
    asin = _extract_asin(body.url)
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
        headers = {**base_headers, "User-Agent": random.choice(_USER_AGENTS)}
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
                await client.get("https://www.amazon.com/", headers=headers)
                await asyncio.sleep(random.uniform(0.5, 1.4))
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
                return ScrapeOut(asin=asin, name=name, price_usd=price, url=product_url)
            last_detail = f"Amazon devolvió una página anti-bot (status {r.status_code})."

        if attempt < _MAX_ATTEMPTS - 1:
            await asyncio.sleep(random.uniform(1.2, 2.5) * (attempt + 1))

    raise HTTPException(status_code=503, detail=f"{last_detail} Reintentá en unos segundos.")


if __name__ == "__main__":
    if not RELAY_TOKEN:
        raise SystemExit("ERROR: definí la variable de entorno RELAY_TOKEN antes de arrancar.")
    print(f"Nodo Amazon Relay escuchando en http://0.0.0.0:{RELAY_PORT}")
    uvicorn.run(app, host="0.0.0.0", port=RELAY_PORT)
