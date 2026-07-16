import re
import asyncio
import random
import base64
import json
import logging
import urllib.parse
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
import httpx
from bs4 import BeautifulSoup
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.limiter import limiter
from core.config import settings
from db.session import get_session
from models.bakery import AmazonScrapeCache

log = logging.getLogger(__name__)
router = APIRouter(tags=["Amazon"])

# Ventana de frescura de la cache. Dentro de este plazo devolvemos el scrape cacheado sin
# volver a pegarle a Amazon (evita el 503 anti-bot). Fuera de plazo re-scrapeamos, pero si
# Amazon bloquea caemos a la entrada vieja como fallback (dato viejo > nada).
_CACHE_TTL_HOURS = 24

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


def _parse_image(soup: BeautifulSoup, html: str) -> str | None:
    # data-old-hires es la imagen hi-res sin lazy-loading (más fiable)
    img = soup.select_one("#landingImage[data-old-hires]")
    if img and img.get("data-old-hires", "").startswith("http"):
        return img["data-old-hires"]
    # Fallback: src del #landingImage cuando ya está cargado
    img = soup.select_one("#landingImage, #imgTagWrapperId img, #main-image-container img")
    if img:
        src = str(img.get("src") or "")
        if src.startswith("http") and "transparent-pixel" not in src and src.endswith((".jpg", ".png", ".webp")):
            return src
    # Último recurso: JSON embebido de colorImages
    m = re.search(r'"hiRes"\s*:\s*"(https://m\.media-amazon\.com/images/I/[^"]+\.jpg)"', html)
    if m:
        return m.group(1)
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


def _parse_bullets(soup: BeautifulSoup) -> str | None:
    """Viñetas 'About this item' (#feature-bullets) — materia prima de la descripción.

    Se queda con lo IMPORTANTE: hasta 3 viñetas, cada una recortada a ~90 chars,
    y el total tope a 240. El vendedor luego puede resumir/editar en el panel.
    """
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


class ScrapeRequest(BaseModel):
    url: str


class ScrapeResponse(BaseModel):
    asin: str
    name: str | None
    price_usd: float | None
    image_url: str | None
    url: str
    # Viñetas de Amazon como base editable para la descripción de venta.
    description: str | None = None


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


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _cache_to_response(row: AmazonScrapeCache) -> ScrapeResponse:
    return ScrapeResponse(
        asin=row.asin, name=row.name,
        price_usd=float(row.price_usd) if row.price_usd is not None else None,
        image_url=row.image_url, url=row.product_url, description=row.description,
    )


async def _cache_get(session: AsyncSession, asin: str) -> AmazonScrapeCache | None:
    try:
        return await session.get(AmazonScrapeCache, asin)
    except Exception:  # una falla de cache nunca debe romper el scrape
        log.warning("amazon cache lookup failed for %s", asin, exc_info=True)
        return None


async def _cache_serve(session: AsyncSession, row: AmazonScrapeCache) -> ScrapeResponse:
    """Devuelve la respuesta cacheada e incrementa hit_count (best-effort)."""
    resp = _cache_to_response(row)
    try:
        await session.execute(
            AmazonScrapeCache.__table__.update()
            .where(AmazonScrapeCache.__table__.c.asin == row.asin)
            .values(hit_count=AmazonScrapeCache.__table__.c.hit_count + 1)
        )
        await session.commit()
    except Exception:
        await session.rollback()
        log.warning("amazon cache hit bump failed for %s", row.asin, exc_info=True)
    return resp


async def _cache_upsert(session: AsyncSession, r: ScrapeResponse, source: str) -> None:
    """Guarda/actualiza el scrape exitoso (UPSERT por ASIN, tolera carrera entre tenants).
    Nunca propaga errores — la cache es un extra, no debe tumbar la respuesta al usuario."""
    now = _now()
    try:
        stmt = pg_insert(AmazonScrapeCache.__table__).values(
            asin=r.asin, name=r.name,
            price_usd=Decimal(str(r.price_usd)) if r.price_usd is not None else None,
            image_url=r.image_url, product_url=r.url, description=r.description,
            source=source, hit_count=0, created_at=now, updated_at=now,
        ).on_conflict_do_update(
            index_elements=['asin'],
            set_=dict(name=r.name,
                      price_usd=Decimal(str(r.price_usd)) if r.price_usd is not None else None,
                      image_url=r.image_url, product_url=r.url, description=r.description,
                      source=source, updated_at=now),
        )
        await session.execute(stmt)
        await session.commit()
    except Exception:
        await session.rollback()
        log.warning("amazon cache upsert failed for %s", r.asin, exc_info=True)


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
            price_usd=d.get("price_usd"), image_url=d.get("image_url"),
            url=d.get("url", url), description=d.get("description"),
        )
    if r.status_code == 422:
        raise HTTPException(status_code=422, detail="No se pudo extraer el ASIN de la URL.")
    return None  # 503/otro → fallback a scraping directo


@router.post("/scrape", response_model=ScrapeResponse)
@limiter.limit("30/minute")
async def scrape_amazon(
    body: ScrapeRequest, request: Request,
    session: AsyncSession = Depends(get_session),
):
    base_headers = _browser_headers()

    # 1. Resolver ASIN localmente (para la cache). Links cortos → seguir el redirect.
    asin = _extract_asin(body.url)
    if not asin:
        host = (urllib.parse.urlparse(body.url.strip()).hostname or "").lower()
        host = host[4:] if host.startswith("www.") else host
        if host in _SHORTLINK_HOSTS:
            asin = await _resolve_shortlink(body.url.strip(), base_headers)

    # 2. Cache FRESCA → devolver ya, sin pegarle a Amazon (esquiva el 503 anti-bot).
    #    Un scrape exitoso de cualquier tenant sirve a todos.
    cached = await _cache_get(session, asin) if asin else None
    if cached is not None and cached.updated_at >= _now() - timedelta(hours=_CACHE_TTL_HOURS):
        return await _cache_serve(session, cached)

    # 3. Relay residencial (Amazon bloquea la IP del datacenter). Éxito → cachear.
    relayed = await _try_relay(body.url)
    if relayed is not None:
        await _cache_upsert(session, relayed, source="relay")
        return relayed

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
                image = _parse_image(soup, r.text)
                description = _parse_bullets(soup)
                resp = ScrapeResponse(asin=asin, name=name, price_usd=price,
                                      image_url=image, url=product_url, description=description)
                await _cache_upsert(session, resp, source="direct")   # sirve a los demás tenants
                return resp
            last_detail = f"Amazon devolvió una página anti-bot (status {r.status_code})."

        # Backoff incremental antes de reintentar (no tras el último intento)
        if attempt < _MAX_ATTEMPTS - 1:
            await asyncio.sleep(random.uniform(1.2, 2.5) * (attempt + 1))

    # Amazon bloqueó todo. Si había una entrada vieja en cache, servirla (dato viejo > 503:
    # el dueño ve nombre/imagen/descripción y ajusta el precio a mano).
    if cached is not None:
        return await _cache_serve(session, cached)

    raise HTTPException(
        status_code=503,
        detail=f"{last_detail} Reintentá en unos segundos.",
    )
