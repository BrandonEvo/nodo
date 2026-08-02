"""
Preview de los links públicos que el dueño comparte por WhatsApp.

Nginx manda acá SOLO a los scrapers de preview (facebookexternalhit, WhatsApp,
Telegram, Googlebot…); los humanos siguen recibiendo el index.html estático. El
motivo es que la SPA tiene un único index.html con los OG de la landing del SaaS:
el cliente que recibía el catálogo de su vendedora veía "Nodo — Sistema de Gestión
para tu Negocio" y no abría el link porque parecía publicidad.

Reglas de este router:
- Nunca aparece la marca Nodo en lo que ve el cliente final.
- Nunca se expone teléfono, cuenta bancaria, nombre de cliente, PIN ni tenant_id:
  un HTML plano es comida de bots de spam, y estos links se reenvían.
- Los links personales (un pedido, una cita) no dicen QUÉ compró nadie.
- HTML con `no-store`: Cloudflare no honra `Vary: User-Agent`, así que una
  respuesta cacheada podría llegarle a un humano.
"""
import base64
import binascii
import hashlib
import html
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from core.limiter import limiter
from db.session import get_session
from models import (
    BookingService,
    BookingSettings,
    StoreProduct,
    StoreSettings,
    Tenant,
)
from models.bakery import ShopperCatalogItem, ShopperCatalogSettings
from models.import_catalog import ImportCatalogItem, ImportCatalogSettings

router = APIRouter(tags=["Link preview"])

SITE = "https://hellonodo.com"
# Los links personales se reenvían: preview sin marca, sin monto y sin producto.
PRIVATE_SURFACES = {
    "tracking": ("Tu pedido", "Mirá en qué paso va tu pedido, sin tener que preguntar."),
    "import-tracking": ("Tu pedido", "Mirá en qué paso va tu pedido, sin tener que preguntar."),
    "pedido": ("Tu pedido", "Revisá el estado y el detalle de tu pedido."),
    "cita": ("Tu cita", "Fecha, hora y detalles de tu cita."),
    "mi-pedido": ("Tu pedido", "Revisá lo que apartaste y agregá más antes de que cierre."),
    "mi-maleta": ("Tu pedido", "Revisá lo que apartaste y agregá más antes de que cierre."),
    "mis-pedidos": ("Tus pedidos", "Revisá lo que apartaste y agregá más antes de que cierre."),
    "mi-reserva": ("Tu reserva", "Revisá los detalles de lo que apartaste."),
}
# Guatemala es UTC-6 fijo (sin horario de verano); la BD guarda UTC naive.
GT_OFFSET = timedelta(hours=6)
_MONTHS = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
           "agosto", "septiembre", "octubre", "noviembre", "diciembre")


def _clip(text: str, limit: int) -> str:
    """WhatsApp corta el título a ~60 y la descripción a ~110. Lo que pasa de ahí
    no existe, así que se corta en palabra y no a la mitad de una."""
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    return text[:limit - 1].rsplit(" ", 1)[0] + "…"


def _gt_date(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    local = dt - GT_OFFSET
    return f"{local.day} de {_MONTHS[local.month - 1]}"


def _page(
    *,
    title: str,
    desc: str,
    path: str,
    robots: str,
    site_name: str,
    image: str | None = None,
    theme: str | None = None,
    items: list[tuple[str, float | None]] | None = None,
) -> str:
    e = html.escape
    title, desc = _clip(title, 60), _clip(desc, 110)
    url = f"{SITE}{path}"
    tags = [
        '<meta charset="utf-8">',
        f"<title>{e(title)}</title>",
        f'<meta name="description" content="{e(desc)}">',
        f'<meta name="robots" content="{robots}">',
        f'<link rel="canonical" href="{e(url)}">',
        '<meta property="og:type" content="website">',
        f'<meta property="og:site_name" content="{e(site_name)}">',
        f'<meta property="og:title" content="{e(title)}">',
        f'<meta property="og:description" content="{e(desc)}">',
        f'<meta property="og:url" content="{e(url)}">',
        '<meta property="og:locale" content="es_GT">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{e(title)}">',
        f'<meta name="twitter:description" content="{e(desc)}">',
    ]
    if image:
        tags += [
            f'<meta property="og:image" content="{e(image)}">',
            f'<meta property="og:image:secure_url" content="{e(image)}">',
            '<meta property="og:image:type" content="image/jpeg">',
            '<meta property="og:image:width" content="1200">',
            '<meta property="og:image:height" content="630">',
            f'<meta property="og:image:alt" content="{e(site_name)}">',
            f'<meta name="twitter:image" content="{e(image)}">',
        ]
    if theme:
        tags.append(f'<meta name="theme-color" content="{e(theme)}">')

    body = [f"<h1>{e(site_name)}</h1>", f"<p>{e(desc)}</p>"]
    if items:
        rows = "".join(
            f"<li>{e(t)}{'' if p is None else f' — Q{p:,.2f}'}</li>" for t, p in items[:12]
        )
        body.append(f"<ul>{rows}</ul>")
    body.append(f'<p><a href="{e(url)}">Abrir</a></p>')

    return (
        "<!doctype html><html lang=\"es\"><head>"
        + "".join(tags)
        + "</head><body>"
        + "".join(body)
        + "</body></html>"
    )


def _img_url(surface: str, token: uuid.UUID, tenant: Tenant) -> str | None:
    if not tenant.og_image:
        return None
    stamp = hashlib.sha256(tenant.og_image.encode("utf-8", "ignore")).hexdigest()[:8]
    return f"{SITE}/og/img/{surface}/{token}.jpg?v={stamp}"


def _html(content: str) -> HTMLResponse:
    return HTMLResponse(
        content,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


def _not_found() -> HTMLResponse:
    return _html(_page(
        title="Link no disponible",
        desc="Puede que el enlace se haya cortado al copiarlo. Pedí el link completo a quien te lo compartió.",
        path="/",
        robots="noindex, nofollow",
        site_name="Link no disponible",
    ))


async def _tenant(tenant_id: uuid.UUID, session: AsyncSession) -> Tenant | None:
    return await session.get(Tenant, tenant_id)


# ── Superficies ───────────────────────────────────────────────────────────────

async def _shopper(token: uuid.UUID, session: AsyncSession) -> HTMLResponse | None:
    settings = (await session.execute(
        select(ShopperCatalogSettings).where(
            ShopperCatalogSettings.public_token == token,
            ShopperCatalogSettings.is_active == True,  # noqa: E712
        )
    )).scalar_one_or_none()
    if not settings:
        return None
    tenant = await _tenant(settings.tenant_id, session)
    negocio = settings.business_name or (tenant.name if tenant else None) or "Catálogo"

    rows = (await session.execute(
        select(ShopperCatalogItem).where(
            ShopperCatalogItem.tenant_id == settings.tenant_id,
            ShopperCatalogItem.is_published == True,  # noqa: E712
            ShopperCatalogItem.is_active == True,  # noqa: E712
        ).order_by(ShopperCatalogItem.created_at.desc()).limit(12)
    )).scalars().all()
    disponibles = [
        i for i in rows
        if i.is_made_to_order or (i.stock_total - i.stock_reserved - i.stock_sold) > 0
    ]
    n = len(disponibles)

    live = settings.store_status == "live"
    if live:
        title = f"🔴 En vivo: {settings.store_name} — {negocio}" if settings.store_name \
            else f"🔴 {negocio} está comprando en vivo"
        desc = (f"Subo cada hallazgo al momento. Quedan {n} disponibles — apartá lo tuyo antes de que cierre."
                if n else "Estoy comprando ahorita. Quedate atento, en un rato subo más.")
    elif n:
        origen = (settings.origin_label or "").strip()
        title = f"{negocio} — Lo que traigo {origen}" if origen else f"{negocio} — Catálogo"
        desc = (f"{n} productos para apartar hoy. Precio en quetzales y entrega "
                f"en {settings.delivery_days_min} a {settings.delivery_days_max} días.")
    else:
        viaje = settings.trip_label or "viaje"
        title = negocio
        desc = f"Ahorita no hay nada publicado. Escribime y te aviso apenas suba lo del próximo {viaje}."

    return _html(_page(
        title=title, desc=desc, path=f"/catalogo/{token}", robots="noindex, follow",
        site_name=negocio, image=_img_url("catalogo", token, tenant) if tenant else None,
        theme=tenant.theme_color if tenant else None,
        items=[(i.title, float(i.price_gtq) if i.price_gtq is not None else None) for i in disponibles],
    ))


async def _importaciones(token: uuid.UUID, session: AsyncSession) -> HTMLResponse | None:
    settings = (await session.execute(
        select(ImportCatalogSettings).where(
            ImportCatalogSettings.public_token == token,
            ImportCatalogSettings.is_active == True,  # noqa: E712
        )
    )).scalar_one_or_none()
    if not settings:
        return None
    tenant = await _tenant(settings.tenant_id, session)
    negocio = settings.business_name or (tenant.name if tenant else None) or "Catálogo"

    rows = (await session.execute(
        select(ImportCatalogItem).where(
            ImportCatalogItem.tenant_id == settings.tenant_id,
            ImportCatalogItem.is_published == True,  # noqa: E712
            ImportCatalogItem.is_active == True,  # noqa: E712
        ).order_by(ImportCatalogItem.created_at.desc()).limit(12)
    )).scalars().all()
    n = len(rows)

    origen = (settings.origin_label or "").strip()
    title = f"{negocio} — {settings.trip_name}" if settings.trip_name else (
        f"{negocio} — Lo que viene {origen}" if origen else f"{negocio} — Catálogo")
    cierre = _gt_date(settings.trip_close_at)
    viaje = settings.trip_label or "viaje"
    desc = (f"{n} productos para apartar. Entrega estimada en {settings.delivery_days_min} a "
            f"{settings.delivery_days_max} días.") if n else \
        f"Ahorita no hay nada publicado. Escribime y te aviso apenas abra el próximo {viaje}."
    if n and cierre:
        desc += f" El {viaje} cierra el {cierre}."

    return _html(_page(
        title=title, desc=desc, path=f"/importa/{token}", robots="noindex, follow",
        site_name=negocio, image=_img_url("importa", token, tenant) if tenant else None,
        theme=tenant.theme_color if tenant else None,
        items=[(i.title, float(i.price_gtq) if i.price_gtq is not None else None) for i in rows],
    ))


async def _tienda(token: uuid.UUID, session: AsyncSession) -> HTMLResponse | None:
    settings = (await session.execute(
        select(StoreSettings).where(
            StoreSettings.public_token == token,
            StoreSettings.is_active == True,  # noqa: E712
        )
    )).scalar_one_or_none()
    if not settings:
        return None
    tenant = await _tenant(settings.tenant_id, session)
    negocio = (tenant.name if tenant else None) or "Tienda"

    rows = (await session.execute(
        select(StoreProduct).where(
            StoreProduct.tenant_id == settings.tenant_id,
            StoreProduct.is_published == True,  # noqa: E712
            StoreProduct.is_active == True,  # noqa: E712
        ).limit(12)
    )).scalars().all()

    if not settings.is_open:
        title, desc = negocio, "Ahorita no estamos tomando pedidos en línea. Mirá el catálogo y escribinos."
    else:
        title = f"{negocio} — Pedí en línea"
        desc = f"{len(rows)} productos disponibles hoy. Armá tu pedido y te lo confirmamos por WhatsApp."

    return _html(_page(
        title=title, desc=desc, path=f"/tienda/{token}", robots="noindex, follow",
        site_name=negocio, image=_img_url("tienda", token, tenant) if tenant else None,
        theme=tenant.theme_color if tenant else None,
        items=[(p.name, float(p.price) if getattr(p, "price", None) is not None else None) for p in rows],
    ))


async def _agenda(token: uuid.UUID, session: AsyncSession) -> HTMLResponse | None:
    settings = (await session.execute(
        select(BookingSettings).where(
            BookingSettings.public_token == token,
            BookingSettings.is_active == True,  # noqa: E712
        )
    )).scalar_one_or_none()
    if not settings:
        return None
    tenant = await _tenant(settings.tenant_id, session)
    negocio = (tenant.name if tenant else None) or "Agenda"

    rows = (await session.execute(
        select(BookingService).where(
            BookingService.tenant_id == settings.tenant_id,
            BookingService.is_active == True,  # noqa: E712
        ).limit(12)
    )).scalars().all()

    if not settings.is_open:
        title, desc = negocio, "La agenda en línea está cerrada por ahora. Escribinos y te ubicamos."
    else:
        title = f"{negocio} — Reservá tu cita"
        precios = [float(s.price) for s in rows if s.price is not None]
        desde = f" {len(rows)} servicios desde Q{min(precios):,.2f}." if precios else ""
        desc = f"Mirá los horarios libres y reservá en un minuto, sin llamadas.{desde}"

    return _html(_page(
        title=title, desc=desc, path=f"/agenda/{token}", robots="noindex, follow",
        site_name=negocio, image=_img_url("agenda", token, tenant) if tenant else None,
        theme=tenant.theme_color if tenant else None,
        items=[(s.name, float(s.price) if s.price is not None else None) for s in rows],
    ))


_RESOLVERS = {
    "catalogo": _shopper,
    "importa": _importaciones,
    "tienda": _tienda,
    "agenda": _agenda,
}


@router.get("/{surface}/{token}", response_class=HTMLResponse)
@limiter.limit("60/minute")
async def link_preview(
    request: Request,
    surface: str,
    token: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    if surface in PRIVATE_SURFACES:
        title, desc = PRIVATE_SURFACES[surface]
        return _html(_page(
            title=title, desc=desc, path=f"/{surface}/{token}",
            robots="noindex, nofollow", site_name=title,
        ))

    resolver = _RESOLVERS.get(surface)
    if resolver is None:
        return _not_found()
    return (await resolver(token, session)) or _not_found()


@router.get("/img/{surface}/{token}.jpg")
@limiter.limit("60/minute")
async def link_preview_image(
    request: Request,
    surface: str,
    token: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Sirve como bytes la tarjeta que el navegador compuso al guardar la marca.
    Sin ella el preview sale sin foto — nunca con la del SaaS."""
    resolver_table = {
        "catalogo": (ShopperCatalogSettings, ShopperCatalogSettings.public_token),
        "importa": (ImportCatalogSettings, ImportCatalogSettings.public_token),
        "tienda": (StoreSettings, StoreSettings.public_token),
        "agenda": (BookingSettings, BookingSettings.public_token),
    }
    entry = resolver_table.get(surface)
    if entry is None:
        return Response(status_code=404)
    model, column = entry
    settings = (await session.execute(select(model).where(column == token))).scalar_one_or_none()
    if not settings:
        return Response(status_code=404)
    tenant = await _tenant(settings.tenant_id, session)
    if not tenant or not tenant.og_image:
        return Response(status_code=404)

    raw = tenant.og_image.split(",", 1)[-1]
    try:
        data = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        return Response(status_code=404)
    # Un scraper abandona rápido: si la tarjeta es absurdamente pesada, mejor sin foto.
    if len(data) > 600_000:
        return Response(status_code=404)

    return Response(
        content=data,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "public, max-age=86400, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
