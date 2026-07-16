/**
 * Catálogo público del Personal Shopper — "Drop en vivo".
 * Tienda en vivo con reloj gigante tipo drop: apartar en 1 toque, escasez honesta
 * (quedan N), momentum real, pedido acumulado + PIN. Al cerrar la tienda todo se
 * congela. Nunca expone costos ni capacidad interna.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Loader2, Package, MessageCircle, Check, Plus, Zap, Flame,
  ShoppingBag, Store, ArrowRight, HelpCircle,
} from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ShopperFirstBuyTour, type ShopperTourStep } from '@/components/ShopperFirstBuyTour';
import { haptic } from '@/utils/haptic';
import {
  shopperCatalogService as svc,
  type PublicShopperCatalog, type PublicShopperItem,
} from '@/services/shopper_catalog.service';
import { availableFacets, deriveFacets } from '@/apps/personal-shopper/facets';
import { rememberCoupon } from '@/utils/shopperCoupon';

interface Props { token: string; }

const fmtQ = (n: number) => 'Q' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface RememberedClient { name: string; phone: string; }
const CLIENT_KEY = 'nodo_shopper_client';
const orderKey = (t: string) => `nodo_shopper_order_${t}`;
// Global, no por catálogo: quien ya aprendió a comprar en una tienda no necesita
// la lección en la siguiente.
const TOUR_KEY = 'nodo_shopper_tour_seen_v1';

function loadClient(): RememberedClient | null {
  try { const v = localStorage.getItem(CLIENT_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
function saveClient(c: RememberedClient) { try { localStorage.setItem(CLIENT_KEY, JSON.stringify(c)); } catch { /* */ } }

/** Luminancia → texto negro/blanco sobre el color de marca. */
function onColor(hex?: string | null): string {
  if (!hex) return '#FFFFFF';
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111111' : '#FFFFFF';
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

// El backend serializa datetimes naive en UTC (sin 'Z'); hay que forzar UTC al parsear.
const toMs = (iso?: string | null): number | null => {
  if (!iso) return null;
  const s = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
  return new Date(s).getTime();
};

function timeAgo(iso?: string | null, now = Date.now()): string | null {
  const t = toMs(iso);
  if (t == null) return null;
  const diff = now - t;
  if (diff < 0 || diff > 86400000) return null;
  const h = Math.floor(diff / 3600000), m = Math.floor(diff / 60000);
  if (h >= 1) return `hace ${h}h`;
  if (m >= 1) return `hace ${m}m`;
  return 'recién';
}

export function ShopperCatalogPage({ token }: Props) {
  const [cat, setCat] = useState<PublicShopperCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [facet, setFacet] = useState<string | null>(null);
  const [reserveItem, setReserveItem] = useState<PublicShopperItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [orderToken, setOrderToken] = useState<string | null>(() => { try { return localStorage.getItem(orderKey(token)); } catch { return null; } });
  const [orderCount, setOrderCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [undoable, setUndoable] = useState(false);
  const [confetti, setConfetti] = useState(false);
  // Sets transitorios que gatean las animaciones del merge en vivo (por id).
  const [entered, setEntered] = useState<Set<string>>(() => new Set());
  const [ticking, setTicking] = useState<Set<string>>(() => new Set());
  const [closing, setClosing] = useState<Set<string>>(() => new Set());
  const [arrivals, setArrivals] = useState(0);
  const [crossSell, setCrossSell] = useState<{ title: string; items: PublicShopperItem[] } | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(() => new Set());
  const reservedIds = useRef<Set<string>>(new Set());   // apartados en esta sesión → no re-sugerirlos
  const [tourOpen, setTourOpen] = useState(false);
  const tourSteps = useRef<ShopperTourStep[]>([]);   // congelados al abrir: un merge no mueve el objetivo
  const tourArmed = useRef(true);                    // el primer scroll/toque desarma la auto-apertura
  const tourPending = useRef(false);                 // paso 2 en espera de que la reserva exista
  const client = useRef<RememberedClient | null>(loadClient());
  const now = useNow();

  // ── Estado del poller (refs → no re-render) ─────────────────────────────────
  const vRef = useRef<string | null>(null);          // último stamp de versión conocido
  const liveRef = useRef(false);
  const closesRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<() => void>(() => {});
  const lastFetch = useRef(0);
  const sheetOpen = useRef(false);
  const dirty = useRef(false);                        // cambió con el sheet abierto → aplicar al cerrar
  const loadedOnce = useRef(false);
  const catRef = useRef<PublicShopperCatalog | null>(null);
  const orderRef = useRef<string[]>([]);              // ids en orden de 1ª aparición (append-only)
  const firstNewId = useRef<string | null>(null);
  const arrivalsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Un toast con acción vive más (hay que leerlo Y decidir). El timer se reemplaza,
  // no se acumula: dos flashes seguidos no se pisan el cierre.
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoRef = useRef<(() => void) | null>(null);
  const flash = useCallback((m: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    undoRef.current = undo ?? null;
    setUndoable(!!undo);
    setToast(m);
    toastTimer.current = setTimeout(() => {
      setToast(null); setUndoable(false); undoRef.current = null;
    }, undo ? 6000 : 2600);
  }, []);

  // Cupón compartido por link (…?cupon=CODE) → se guarda por catálogo y la página de
  // pedido lo auto-aplica. Limpiamos el query para no re-guardarlo al navegar.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('cupon');
    if (!code) return;
    rememberCoupon(token, code);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('cupon');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch { /* */ }
  }, [token]);

  // Integra un catálogo fresco preservando scroll y sin parpadeo: diff por id, anima
  // sólo lo que cambió (cards nuevos, "quedan N" que baja, ítems que cierran).
  const applyMerge = useCallback((fresh: PublicShopperCatalog) => {
    const prevMap = new Map((catRef.current?.items ?? []).map(i => [i.id, i]));
    const enters: string[] = [], ticks: string[] = [], closes: string[] = [];
    const order = orderRef.current;
    for (const it of fresh.items) {
      const before = prevMap.get(it.id);
      if (!before) {
        if (!order.includes(it.id)) order.push(it.id);      // append ⇒ no empuja lo que se mira
        if (loadedOnce.current) enters.push(it.id);          // no animar en el primer render
      } else {
        if (it.remaining != null && before.remaining != null && it.remaining < before.remaining) ticks.push(it.id);
        if (it.closed && !before.closed) closes.push(it.id);
      }
    }
    const alive = new Set(fresh.items.map(i => i.id));
    orderRef.current = order.filter(id => alive.has(id));     // podar despublicados/agotados
    catRef.current = fresh;
    setCat(fresh);
    loadedOnce.current = true;

    if (enters.length) {
      firstNewId.current = enters[0];
      setEntered(s => { const n = new Set(s); enters.forEach(id => n.add(id)); return n; });
      enters.forEach(id => setTimeout(() => setEntered(s => { const n = new Set(s); n.delete(id); return n; }), 6000));
      setArrivals(a => a + enters.length);
      haptic.tap();
      if (arrivalsTimer.current) clearTimeout(arrivalsTimer.current);
      arrivalsTimer.current = setTimeout(() => setArrivals(0), 4000);
    }
    ticks.forEach(id => { setTicking(s => new Set(s).add(id)); setTimeout(() => setTicking(s => { const n = new Set(s); n.delete(id); return n; }), 400); });
    closes.forEach(id => { setClosing(s => new Set(s).add(id)); setTimeout(() => setClosing(s => { const n = new Set(s); n.delete(id); return n; }), 600); });
  }, []);

  const mergeFetch = useCallback(async (v?: string) => {
    lastFetch.current = Date.now();
    try {
      const fresh = await svc.getPublic(token, v);
      vRef.current = fresh.v;                                 // v autoritativo del payload completo
      applyMerge(fresh);
    } catch { /* el poll sigue vivo */ }
  }, [token, applyMerge]);

  // Primer paint: siembra cat + v + orden sin animar; luego arranca el poller.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const fresh = await svc.getPublic(token);
        if (!alive) return;
        vRef.current = fresh.v;
        liveRef.current = fresh.store_status === 'live';
        closesRef.current = toMs(fresh.store_closes_at);
        orderRef.current = fresh.items.map(i => i.id);
        catRef.current = fresh;
        setCat(fresh);
        loadedOnce.current = true;
        setReady(true);
      } catch { if (alive) setError('No encontramos esta tienda.'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [token]);

  // Cadencia adaptativa: 30s en reposo, 8s en vivo, 3.5s en el último minuto. Jitter ±15%.
  const nextDelay = useCallback(() => {
    if (!liveRef.current) return 30000 * (0.85 + Math.random() * 0.3);
    const left = closesRef.current != null ? closesRef.current - Date.now() : Infinity;
    return (left <= 60000 ? 3500 : 8000) * (0.85 + Math.random() * 0.3);
  }, []);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (document.hidden) return;                              // pausado en background (batería/PWA)
    timerRef.current = setTimeout(() => { void tickRef.current(); }, nextDelay());
  }, [nextDelay]);

  const tick = useCallback(async () => {
    try {
      const p = await svc.getPulse(token);
      const wasLiveNow = liveRef.current;
      liveRef.current = p.live;
      closesRef.current = toMs(p.closes_at);
      if (p.live && !wasLiveNow && loadedOnce.current) { flash('🔴 ¡La tienda abrió!'); haptic.confirm(); }
      if (vRef.current != null && p.v !== vRef.current) {
        if (sheetOpen.current) dirty.current = true;          // no tocar la lista bajo el sheet
        else await mergeFetch(p.v);
      }
    } catch { /* swallow; el loop sigue */ }
    finally { schedule(); }
  }, [token, flash, mergeFetch, schedule]);
  useEffect(() => { tickRef.current = tick; }, [tick]);

  // Arranca el loop + wake por Page Visibility / focus (con catch-up dedupeado a 3s).
  useEffect(() => {
    if (!ready) return;
    schedule();
    const wake = () => {
      if (document.hidden) { if (timerRef.current) clearTimeout(timerRef.current); return; }
      if (Date.now() - lastFetch.current > 3000 && !sheetOpen.current) void mergeFetch();
      schedule();
    };
    const onHide = () => { if (timerRef.current) clearTimeout(timerRef.current); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('pagehide', onHide);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [ready, schedule, mergeFetch]);

  // Sheet de reserva o tutorial abierto → diferir merges; al cerrar, aplicar el
  // pendiente. Sin esto un merge inserta cards y corre el grid bajo el spotlight.
  useEffect(() => {
    const blocked = reserveItem != null || tourOpen || crossSell != null;
    sheetOpen.current = blocked;
    if (!blocked && dirty.current) { dirty.current = false; void mergeFetch(); }
  }, [reserveItem, tourOpen, crossSell, mergeFetch]);

  useEffect(() => {
    if (!orderToken) return;
    svc.getOrder(orderToken).then(o => setOrderCount(o.total_items)).catch(() => setOrderToken(null));
  }, [orderToken]);

  const theme = cat?.theme_color;
  const rootStyle = theme ? ({ ['--nodo-primary' as any]: theme, ['--nodo-on-primary' as any]: onColor(theme) }) : undefined;

  // Efectivo: si el reloj ya pasó, tratamos la tienda como cerrada aunque el último
  // fetch dijera 'live' (se sincroniza al refrescar).
  const closesMs = toMs(cat?.store_closes_at);
  const liveNow = !!cat && cat.store_status === 'live' && (closesMs == null || closesMs > now);
  // El tutorial muestra el countdown real: la urgencia no se pausa, se enfoca.
  const drop = liveNow && closesMs != null ? fmtDrop(closesMs - now) : null;

  // Al agotarse el reloj local, refrescamos una vez para traer el estado cerrado real.
  const wasLive = useRef(false);
  useEffect(() => {
    if (liveNow) wasLive.current = true;
    else if (wasLive.current) { wasLive.current = false; void mergeFetch(); }
  }, [liveNow, mergeFetch]);

  // Orden estable append-only: los cards nuevos entran al final de su sección, así
  // no empujan hacia abajo lo que el usuario está mirando (scroll preservado).
  const rank = useCallback((id: string) => { const i = orderRef.current.indexOf(id); return i < 0 ? 1e9 : i; }, []);
  const liveItems = useMemo(() => cat ? cat.items.filter(i => i.listing === 'live').sort((a, b) => rank(a.id) - rank(b.id)) : [], [cat, rank]);
  const catalogItems = useMemo(() => {
    if (!cat) return [];
    const base = cat.items.filter(i => i.listing === 'catalog').sort((a, b) => rank(a.id) - rank(b.id));
    if (!facet) return base;
    return base.filter(i => deriveFacets(i).includes(facet));
  }, [cat, facet, rank]);
  const facets = useMemo(() => cat ? availableFacets(cat.items.filter(i => i.listing === 'catalog')) : [], [cat]);

  // ── Tutorial de primera compra ──────────────────────────────────────────────
  const [tourTargetId, setTourTargetId] = useState<string | null>(null);
  const tourTarget = useMemo(() => {
    const pick = (arr: PublicShopperItem[]) => arr.find(i => !i.closed && !(i.remaining != null && i.remaining <= 0));
    return (liveNow ? pick(liveItems) : undefined) ?? pick(catalogItems) ?? null;
  }, [liveNow, liveItems, catalogItems]);

  const startTour = useCallback(() => {
    const t = tourTarget;
    const steps: ShopperTourStep[] = [];
    if (t) steps.push({
      target: 'reservar', emoji: '👆', interactive: true,
      text: `Tocá ${t.listing === 'live' ? 'Reservar' : 'Apartar'}. No pagás nada ahora.`,
    });
    steps.push({ target: 'pedido', emoji: '🧾', text: 'Aquí seguís tu pedido.' });
    tourSteps.current = steps;
    setTourTargetId(t?.id ?? null);
    setTourOpen(true);
  }, [tourTarget]);

  const closeTour = useCallback(() => {
    setTourOpen(false);
    setTourTargetId(null);
    try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* Safari privado bloquea storage */ }
  }, []);

  // El velo tiene que irse para no tapar el sheet de reserva, pero el paso 2 no se
  // pierde: vuelve cuando el pedido existe de verdad y el pill ya está en pantalla.
  const onTourTapThrough = useCallback(() => {
    tourPending.current = true;
    closeTour();
  }, [closeTour]);

  // Auto-apertura en la primera visita: sólo si hay algo reservable, nunca compró
  // antes, y al drop le quedan más de 90s (con 40 segundos se necesita el botón,
  // no una lección). El primer scroll o toque la desarma: ya arrancó solo.
  useEffect(() => {
    if (!ready || !cat || !tourArmed.current) return;
    if (client.current || orderToken || !tourTarget) return;
    try { if (localStorage.getItem(TOUR_KEY)) return; } catch { return; }
    if (liveNow && closesMs != null && closesMs - Date.now() < 90000) return;

    // En vivo esperamos a que el reloj tickee al menos una vez: un número que no se
    // movió no es urgencia, es decorado.
    const t = setTimeout(() => {
      if (!tourArmed.current) return;
      tourArmed.current = false;
      if (window.matchMedia?.('(pointer: coarse)').matches) haptic.tap();
      startTour();
    }, liveNow ? 1400 : 700);

    const disarm = () => { tourArmed.current = false; };
    window.addEventListener('scroll', disarm, { once: true, passive: true });
    window.addEventListener('pointerdown', disarm, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener('scroll', disarm);
      window.removeEventListener('pointerdown', disarm);
    };
  }, [ready, cat, tourTarget, liveNow, closesMs, orderToken, startTour]);

  const doUndo = async (orderTok: string, lineId: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null); setUndoable(false); undoRef.current = null;
    try {
      const o = await svc.deleteOrderLine(orderTok, lineId);
      setOrderCount(o.total_items);
      haptic.tap();
      flash('Listo, lo quitamos.');
    } catch {
      flash('No se pudo deshacer.');
    }
    void mergeFetch();
  };

  // "Se llevan juntos" = co-ocurrencia REAL por order_token, que el backend ya calcula
  // y manda en `bought_with` (top 4, sólo en stock). Mientras no haya pedidos con 2+
  // productos viene vacío: ahí NO inventamos co-ocurrencia — cae a otra etiqueta que
  // también es verdad, ordenada por lo más pedido (dato real del payload).
  const suggestAfter = (item: PublicShopperItem) => {
    const c = catRef.current;
    if (!c) return null;
    const ok = (i: PublicShopperItem) =>
      i.id !== item.id && !reservedIds.current.has(i.id) &&
      !i.closed && !(i.listing === 'live' && !liveNow) &&
      !(i.remaining != null && i.remaining <= 0);
    const byId = new Map(c.items.map(i => [i.id, i]));
    const co = (item.bought_with ?? [])
      .map(id => byId.get(id))
      .filter((i): i is PublicShopperItem => !!i && ok(i));
    if (co.length) return { title: 'Se llevan juntos', items: co.slice(0, 3) };
    const rest = c.items.filter(ok).sort((a, b) => b.reserved_count - a.reserved_count);
    return rest.length ? { title: 'Seguí armando tu maleta', items: rest.slice(0, 3) } : null;
  };

  const doReserve = async (item: PublicShopperItem, name: string, phone: string, qty = 1, silent = false) => {
    setBusyId(item.id);
    try {
      const res = await svc.createReservation(token, item.id, { client_name: name, client_phone: phone, quantity: qty });
      reservedIds.current.add(item.id);
      saveClient({ name, phone }); client.current = { name, phone };
      if (res.order_token) { setOrderToken(res.order_token); try { localStorage.setItem(orderKey(token), res.order_token); } catch { /* */ } }
      setOrderCount(c => c + qty);
      haptic.confirm();
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (!reduce && !sessionStorage.getItem('shopper_confetti')) {
        sessionStorage.setItem('shopper_confetti', '1'); setConfetti(true); setTimeout(() => setConfetti(false), 1200);
      }
      // Deshacer en vez de confirmar: un toque accidental cuesta un toque, no un
      // WhatsApp. El DELETE de la línea ya libera el stock.
      const undo = res.order_token && res.id
        ? () => { void doUndo(res.order_token!, res.id); }
        : undefined;
      flash(res.order_pin ? `¡Apartado! Tu PIN es ${res.order_pin} 🔑` : '¡Apartado! 🎉', undo);
      setReserveItem(null);

      // Primero enseñar, después vender: el tutorial se queda con la primera compra
      // (el primerizo acaba de dar sus datos, no se le encima un cross-sell), y de la
      // segunda en adelante —que es la de margen casi puro— entra "Se llevan juntos".
      // `silent` corta la recursión al apartar desde el sheet de sugerencias.
      if (tourPending.current) {
        tourPending.current = false;
        setTimeout(() => {
          tourSteps.current = [{ target: 'pill', emoji: '🧾', text: 'Aquí seguís tu pedido.' }];
          setTourOpen(true);
        }, 1500);
      } else if (silent) {
        setAddedIds(s => new Set(s).add(item.id));
      } else {
        setTimeout(() => { const s = suggestAfter(item); if (s) { setAddedIds(new Set()); setCrossSell(s); } }, 700);
      }
      void mergeFetch();   // refresca stock / "quedan N" al instante (hace tick, no salta)
    } catch (e: any) {
      // El 409 de agotado/insuficiente trae detail estructurado {code, message, remaining}.
      // Otros errores traen detail string. Mostramos el mensaje y, si viene `remaining`,
      // parcheamos el stock del ítem al instante para voltear la card a AGOTADO sin esperar
      // el poll (mergeFetch confirma con el servidor un tick después).
      const d = e?.response?.data?.detail;
      const msg = typeof d === 'string' ? d : (d?.message || 'No se pudo apartar.');
      if (d?.code === 'sold_out') haptic.error();
      flash(msg);
      if (d && typeof d === 'object' && typeof d.remaining === 'number') {
        const rem = d.remaining as number;
        setCat(prev => prev ? {
          ...prev,
          items: prev.items.map(i => i.id === item.id ? { ...i, remaining: rem } : i),
        } : prev);
      }
      void mergeFetch();
    } finally {
      setBusyId(null);
    }
  };

  const onReserveClick = (item: PublicShopperItem) => {
    haptic.tap();
    if (client.current) void doReserve(item, client.current.name, client.current.phone);
    else setReserveItem(item);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-nodo-canvas"><Loader2 className="w-8 h-8 animate-spin text-nodo-sub" /></div>;
  if (error || !cat) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-nodo-canvas gap-3 px-6 text-center">
      <Store size={44} className="text-nodo-dim" />
      <p className="text-lg font-black text-nodo-ink">{error}</p>
    </div>
  );

  const renderCard = (it: PublicShopperItem) => (
    <ProductCard key={it.id} item={it} now={now}
      forceClosed={it.listing === 'live' && !liveNow}
      isNew={entered.has(it.id)} ticking={ticking.has(it.id)} closing={closing.has(it.id)}
      tourId={it.id === tourTargetId ? 'reservar' : undefined}
      busy={busyId === it.id} onReserve={() => onReserveClick(it)} />
  );

  const scrollToNew = () => {
    haptic.tap();
    const id = firstNewId.current;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (id) document.getElementById('sc-' + id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    setArrivals(0);
  };

  return (
    <div className="min-h-screen bg-nodo-canvas" style={rootStyle}>
      <style>{`
        @keyframes shopper-fall { 0% { transform: translateY(-10vh) rotate(0); opacity: 1 } 100% { transform: translateY(110vh) rotate(720deg); opacity: 0 } }
        @keyframes shopper-bump { 0% { transform: scale(1) } 40% { transform: scale(1.14) } 100% { transform: scale(1) } }
        @keyframes shopper-card-in { from { opacity: 0; transform: translate3d(0,10px,0) scale(.96) } to { opacity: 1; transform: translate3d(0,0,0) scale(1) } }
        @keyframes shopper-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes shopper-badge-pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.09) } }
        @keyframes shopper-count-tick { 0% { transform: translate3d(0,0,0); opacity: 1 } 40% { transform: translate3d(0,-45%,0); opacity: .35 } 60% { transform: translate3d(0,45%,0); opacity: .35 } 100% { transform: translate3d(0,0,0); opacity: 1 } }
        @keyframes shopper-nudge { 0%,100% { transform: scale(1) } 35% { transform: scale(1.14) } }
        @keyframes shopper-badge-drop { from { opacity: 0; transform: translate3d(0,4px,0) } to { opacity: 1; transform: translate3d(0,0,0) } }
        @keyframes shopper-pill-in { from { opacity: 0; transform: translate3d(-50%,-10px,0) } to { opacity: 1; transform: translate3d(-50%,0,0) } }
        .s-card-in    { animation: shopper-card-in .38s cubic-bezier(.22,1,.36,1) both; }
        .s-badge-new  { animation: shopper-badge-pulse 1.2s ease-in-out 3; }
        .s-tick       { display: inline-block; animation: shopper-count-tick .30s ease-out; }
        .s-nudge      { animation: shopper-nudge .26s ease-out; }
        .s-closebadge { animation: shopper-badge-drop .30s ease-out both; }
        .s-pill-in    { animation: shopper-pill-in .28s cubic-bezier(.22,1,.36,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .s-card-in, .s-closebadge { animation: shopper-fade-in .2s linear both; }
          .s-pill-in { animation: shopper-fade-in .2s linear both; transform: translateX(-50%); }
          .s-badge-new, .s-tick, .s-nudge { animation: none; }
        }
      `}</style>

      <div role="status" aria-live="polite" className="sr-only">{toast}</div>
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 bg-nodo-ink text-nodo-canvas text-sm font-bold px-4 py-3 rounded-2xl shadow-lg max-w-[90vw]">
          <span className="flex-1 text-center">{toast}</span>
          {undoable && (
            <button onClick={() => undoRef.current?.()}
              className="shrink-0 h-11 px-3 -my-1 text-nodo-canvas font-black text-xs border border-nodo-canvas/30 rounded-lg active:scale-90 transition-transform">
              Deshacer
            </button>
          )}
        </div>
      )}
      {arrivals > 0 && (
        <button onClick={scrollToNew}
          className="s-pill-in fixed top-[68px] left-1/2 z-[55] flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-nodo-primary text-nodo-on-primary text-[13px] font-black shadow-lg active:scale-95">
          <Zap size={13} /> {arrivals} nuevo{arrivals !== 1 ? 's' : ''}
        </button>
      )}
      {confetti && (
        <div className="fixed inset-0 z-[65] pointer-events-none overflow-hidden">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="absolute w-2 h-3 rounded-sm"
              style={{
                left: `${(i * 6.5 + 4) % 100}%`,
                background: ['#f59e0b', '#3b82f6', '#ec4899', '#10b981', '#8b5cf6'][i % 5],
                animation: `shopper-fall ${0.9 + (i % 5) * 0.12}s ease-in forwards`,
                animationDelay: `${(i % 4) * 0.05}s`,
              }} />
          ))}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-nodo-card/90 backdrop-blur border-b border-nodo-line px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {cat.logo_url
            ? <img src={cat.logo_url} className="w-9 h-9 rounded-xl object-cover" alt="" />
            : <div className="w-9 h-9 rounded-xl bg-nodo-primary text-nodo-on-primary flex items-center justify-center"><Store size={18} /></div>}
          <div className="min-w-0">
            <p className="text-sm font-black text-nodo-ink truncate leading-tight">{cat.business_name || 'Mi Tienda'}</p>
            <p className="text-[11px] text-nodo-sub truncate">{cat.origin_label ?? 'desde USA 🇺🇸'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => { haptic.tap(); startTour(); }} aria-label="Cómo comprar"
            className="w-10 h-10 rounded-full bg-nodo-inset border border-nodo-line text-nodo-sub flex items-center justify-center active:scale-90 transition-transform">
            <HelpCircle size={17} />
          </button>
          {cat.whatsapp_number && (
            <a href={`https://wa.me/${cat.whatsapp_number.replace(/\D/g, '')}`} target="_blank" rel="noopener"
              className="w-10 h-10 rounded-full bg-nodo-success-bg text-nodo-success-tx flex items-center justify-center active:scale-90 shrink-0">
              <MessageCircle size={18} />
            </a>
          )}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-4 pb-28">
        {/* Ver mi pedido */}
        <a href={orderToken ? `/mi-maleta/${orderToken}` : `/mi-maleta?c=${token}`} data-tour="pedido"
          className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-2xl bg-nodo-inset border border-nodo-line active:scale-[0.99]">
          <span className="text-sm font-bold text-nodo-ink flex items-center gap-2"><ShoppingBag size={16} className="text-nodo-primary" /> Consulta tu pedido</span>
          <ArrowRight size={16} className="text-nodo-dim" />
        </a>

        {/* Hero. El catálogo le gana al drop cerrado: con la tienda cerrada pero
            productos comprables, "El drop terminó" mandaba a WhatsApp y enterraba
            el negocio permanente. La lápida sólo queda si no hay nada más que vender. */}
        {liveNow ? (
          <LiveDropHero
            storeName={cat.store_name} closesMs={closesMs} now={now}
            reservedPeople={cat.reserved_people} reservedUnits={cat.reserved_units}
          />
        ) : catalogItems.length > 0 ? (
          <div className="rounded-[28px] p-5 bg-nodo-primary text-nodo-on-primary" style={{ boxShadow: 'var(--nodo-shadow-hero)' }}>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-nodo-on-primary/80">🛍️ Catálogo</p>
            <p className="text-2xl font-black mt-1">Apartá lo que quieras traer</p>
            {cat.delivery_days_min > 0 && (
              <p className="text-sm font-bold text-nodo-on-primary/95 mt-1">Entrega estimada {cat.delivery_days_min}–{cat.delivery_days_max} días</p>
            )}
          </div>
        ) : liveItems.length > 0 ? (
          <div className="rounded-[28px] p-5 bg-nodo-ink text-nodo-canvas" style={{ boxShadow: 'var(--nodo-shadow-hero)' }}>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-nodo-canvas/70">🏁 Tienda cerrada</p>
            <p className="text-2xl font-black mt-1">El drop terminó</p>
            <p className="text-sm font-semibold text-nodo-canvas/70 mt-1">
              Escribime por WhatsApp para el próximo.
            </p>
          </div>
        ) : null}

        {/* Los 3 hechos que el primerizo necesita antes de tocar nada. Siempre
            visibles: sirven en la visita 1 y en la 40, y los lee un lector de pantalla. */}
        {(liveItems.length > 0 || catalogItems.length > 0) && (
          <ul className="flex flex-col gap-2 px-4 py-3 rounded-2xl bg-nodo-inset border border-nodo-line">
            <FactRow emoji="✋" text="Apartás sin pagar nada" />
            {cat.whatsapp_number && <FactRow emoji="💬" text="Te escribimos por WhatsApp" />}
            {cat.delivery_days_min > 0 && <FactRow emoji="✈️" text={`Llega en ${cat.delivery_days_min}–${cat.delivery_days_max} días`} />}
          </ul>
        )}

        {/* Grid en vivo */}
        {liveItems.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider flex items-center gap-1.5">
              {liveNow ? <><Zap size={12} className="text-nodo-primary" /> En vivo ahora</> : 'Del último drop'}
            </p>
            <div className="grid grid-cols-2 gap-3">{liveItems.map(renderCard)}</div>
          </div>
        )}

        {/* Facetas del catálogo */}
        {facets.length > 0 && (
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
            <FacetChip active={facet === null} onClick={() => setFacet(null)} emoji="🛍️" label="Todo" />
            {facets.map(f => <FacetChip key={f.id} active={facet === f.id} onClick={() => setFacet(f.id)} emoji={f.emoji} label={f.label} />)}
          </div>
        )}

        {/* Grid catálogo */}
        {catalogItems.length > 0 && (
          <div className="flex flex-col gap-3">
            {liveItems.length > 0 && (
              <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">📦 También por encargo</p>
            )}
            <div className="grid grid-cols-2 gap-3">{catalogItems.map(renderCard)}</div>
          </div>
        )}

        {liveItems.length === 0 && catalogItems.length === 0 && (
          <div className="nodo-empty-state py-16"><Package size={36} className="text-nodo-dim mb-2" /><p className="text-sm font-bold text-nodo-dim">Nada por aquí todavía</p><p className="text-xs text-nodo-sub mt-1">Volvé pronto para el próximo drop</p></div>
        )}
      </div>

      {/* Order pill */}
      {orderCount > 0 && (
        <a href={`/mi-maleta/${orderToken}`} data-tour="pill"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 pl-4 pr-3 py-3 rounded-full bg-nodo-ink text-nodo-canvas font-black shadow-lg active:scale-95 transition-transform"
          style={{ animation: 'shopper-bump 0.3s ease-out' }} key={orderCount}>
          <ShoppingBag size={18} />
          <span className="text-sm">Mi pedido · {orderCount}</span>
          <span className="w-6 h-6 rounded-full bg-nodo-canvas/20 flex items-center justify-center"><ArrowRight size={14} /></span>
        </a>
      )}

      <ReserveSheet item={reserveItem} onClose={() => setReserveItem(null)}
        remembered={client.current}
        busy={busyId != null}
        onSubmit={(name, phone) => reserveItem && doReserve(reserveItem, name, phone)} />

      <CrossSellSheet data={crossSell} added={addedIds} busyId={busyId}
        onClose={() => setCrossSell(null)}
        onAdd={(i) => client.current && doReserve(i, client.current.name, client.current.phone, 1, true)} />

      {tourOpen && (
        <ShopperFirstBuyTour steps={tourSteps.current} clock={drop?.big} urgent={drop?.urgent}
          onClose={closeTour} onTapThrough={onTourTapThrough} />
      )}
    </div>
  );
}

// ── Hero: reloj gigante del drop ─────────────────────────────────────────────────
function LiveDropHero({ storeName, closesMs, now, reservedPeople, reservedUnits }: {
  storeName?: string | null; closesMs: number | null; now: number;
  reservedPeople: number; reservedUnits: number;
}) {
  const diff = closesMs != null ? closesMs - now : null;
  const clock = diff != null ? fmtDrop(diff) : null;
  const urgent = clock?.urgent ?? false;
  return (
    <div className="rounded-[28px] p-5 bg-nodo-primary text-nodo-on-primary" style={{ boxShadow: 'var(--nodo-shadow-hero)' }}>
      <div className="flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
        </span>
        <span className="text-[12px] font-black uppercase tracking-[0.14em]">En vivo{storeName ? ` · ${storeName}` : ''}</span>
      </div>

      {clock ? (
        <div className="mt-2 flex items-end gap-2">
          <span className={`font-black tabular-nums tracking-tighter leading-none text-[56px] ${urgent ? 'text-red-200 motion-safe:animate-pulse' : ''}`}>{clock.big}</span>
          <span className="text-sm font-bold text-nodo-on-primary/70 mb-2">{urgent ? '¡última llamada!' : 'para cerrar'}</span>
        </div>
      ) : (
        <p className="mt-2 text-3xl font-black leading-none">🔴 Estoy en la tienda ahora</p>
      )}

      <p className="text-sm font-semibold text-nodo-on-primary/80 mt-2">Reservá antes de que cierre — cuando el reloj llega a cero, se acabó.</p>
      {reservedPeople >= 2 && (
        <p className="text-[12px] font-black text-nodo-on-primary mt-2 flex items-center gap-1.5">
          <Flame size={13} /> {reservedPeople} personas ya apartaron {reservedUnits}
        </p>
      )}
    </div>
  );
}

function fmtDrop(diffMs: number): { big: string; urgent: boolean } {
  if (diffMs <= 0) return { big: '0:00', urgent: true };
  const s = Math.floor(diffMs / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return { big: `${d}d ${h}h`, urgent: false };
  if (h > 0) return { big: `${h}:${p(m)}:${p(sec)}`, urgent: false };
  return { big: `${m}:${p(sec)}`, urgent: m < 10 };
}

// Sugerencias post-reserva. Filas verticales (no la tira horizontal de tarjetitas):
// targets grandes y una sola columna se leen mejor que un carrusel de 96px.
function CrossSellSheet({ data, added, busyId, onClose, onAdd }: {
  data: { title: string; items: PublicShopperItem[] } | null;
  added: Set<string>; busyId: string | null;
  onClose: () => void; onAdd: (i: PublicShopperItem) => void;
}) {
  return (
    <BottomSheet open={data != null} onClose={onClose} title={data?.title ?? ''}
      footer={
        <button onClick={onClose} className="nodo-btn-secondary w-full">
          {added.size > 0 ? 'Listo' : 'No, gracias'}
        </button>
      }>
      <div className="flex flex-col gap-2.5">
        {data?.items.map(i => {
          const isAdded = added.has(i.id);
          return (
            <div key={i.id} className="flex items-center gap-3 p-2 rounded-2xl bg-nodo-inset border border-nodo-line">
              {i.image_url
                ? <img src={i.image_url} className="w-14 h-14 rounded-xl object-cover shrink-0" alt="" />
                : <div className="w-14 h-14 rounded-xl bg-nodo-card flex items-center justify-center text-nodo-dim shrink-0"><Package size={20} /></div>}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-nodo-ink line-clamp-2 leading-tight">{i.title}</p>
                {i.price_gtq != null && <p className="text-sm font-black text-nodo-ink tabular-nums">{fmtQ(i.price_gtq)}</p>}
              </div>
              <button onClick={() => !isAdded && onAdd(i)} disabled={isAdded || busyId === i.id}
                className={`shrink-0 h-11 px-4 rounded-xl text-sm font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform ${isAdded ? 'bg-nodo-success-bg text-nodo-success-tx' : 'bg-nodo-primary text-nodo-on-primary'}`}>
                {busyId === i.id ? <Loader2 size={15} className="animate-spin" />
                  : isAdded ? <><Check size={15} /> Listo</>
                  : <><Plus size={15} /> Agregar</>}
              </button>
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
}

function FactRow({ emoji, text }: { emoji: string; text: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="text-base leading-none" aria-hidden="true">{emoji}</span>
      <span className="text-sm font-bold text-nodo-ink">{text}</span>
    </li>
  );
}

function FacetChip({ active, onClick, emoji, label }: { active: boolean; onClick: () => void; emoji: string; label: string }) {
  return (
    <button onClick={() => { haptic.tap(); onClick(); }}
      className={`shrink-0 px-3.5 py-2 rounded-full text-sm font-bold flex items-center gap-1.5 active:scale-95 transition-transform ${active ? 'bg-nodo-primary text-nodo-on-primary' : 'bg-nodo-card border border-nodo-line text-nodo-ink'}`}>
      <span>{emoji}</span> {label}
    </button>
  );
}

function ProductCard({ item, now, forceClosed, busy, isNew, ticking, closing, tourId, onReserve }: {
  item: PublicShopperItem; now: number; forceClosed: boolean; busy: boolean;
  isNew: boolean; ticking: boolean; closing: boolean; tourId?: string; onReserve: () => void;
}) {
  const ago = timeAgo(item.last_reserved_at, now);
  const closed = item.closed || forceClosed;
  const soldOut = item.remaining != null && item.remaining <= 0;
  const low = !closed && item.remaining != null && item.remaining > 0 && item.remaining <= 3;
  const isLive = item.listing === 'live';
  const cta = closed ? (soldOut ? 'Agotado' : 'Cerrado') : isLive ? 'Reservar' : 'Apartar';
  return (
    <div id={'sc-' + item.id}
      className={`nodo-card overflow-hidden flex flex-col transition-opacity duration-500 ${closed ? 'opacity-60' : ''} ${isNew ? 's-card-in' : ''}`}>
      <div className="relative aspect-square bg-nodo-inset">
        {item.image_url ? <img src={item.image_url} loading="lazy" className="w-full h-full object-cover" alt={item.title} />
          : <div className="w-full h-full flex items-center justify-center text-nodo-dim"><Package size={30} /></div>}
        {item.is_offer && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-nodo-danger-tx text-white text-[10px] font-black">🔥 Oferta</span>}
        {isNew && !closed && (
          <span className="s-badge-new absolute top-2 right-2 px-2 py-0.5 rounded-full bg-nodo-primary text-nodo-on-primary text-[10px] font-black">NUEVO ✨</span>
        )}
        {closed ? (
          <span className={`absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-nodo-ink text-nodo-canvas text-[10px] font-black ${closing ? 's-closebadge' : ''}`}>{soldOut ? 'AGOTADO' : 'CERRADO'}</span>
        ) : low ? (
          <span className={`absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-nodo-danger-tx text-white text-[10px] font-black motion-safe:animate-pulse ${ticking ? 's-nudge' : ''}`}>¡Quedan <span key={item.remaining ?? 0} className={ticking ? 's-tick' : ''}>{item.remaining}</span>!</span>
        ) : item.remaining != null ? (
          <span className={`absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-nodo-card/90 text-nodo-ink text-[10px] font-black ${ticking ? 's-nudge' : ''}`}><span key={item.remaining} className={ticking ? 's-tick' : ''}>{item.remaining}</span> disponibles</span>
        ) : null}
      </div>
      <div className="p-2.5 flex flex-col gap-1 flex-1">
        {item.hook && <p className="text-[11px] font-bold text-nodo-primary leading-tight line-clamp-1">{item.hook}</p>}
        <p className="text-[13px] font-bold text-nodo-ink leading-tight line-clamp-2">{item.title}</p>
        {item.price_gtq != null && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-black text-nodo-ink tabular-nums">{fmtQ(item.price_gtq)}</span>
            {item.is_offer && item.compare_at_price_gtq != null && (
              <span className="text-[11px] font-semibold text-nodo-dim line-through tabular-nums">{fmtQ(item.compare_at_price_gtq)}</span>
            )}
          </div>
        )}
        {item.reserved_count > 0 && !closed ? (
          <p className="text-[10px] font-black text-nodo-primary flex items-center gap-1"><Flame size={11} /> {item.reserved_count} apartado{item.reserved_count !== 1 ? 's' : ''}{ago ? ` · ${ago}` : ''}</p>
        ) : ago ? (
          <p className="text-[10px] font-semibold text-nodo-sub">apartado {ago}</p>
        ) : null}
        <button onClick={onReserve} disabled={busy || closed} data-tour={tourId}
          className="mt-auto h-11 rounded-xl bg-nodo-primary text-nodo-on-primary text-sm font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-40">
          {busy ? <Loader2 size={15} className="animate-spin" /> : closed ? cta : <>{isLive ? <Zap size={15} /> : <Plus size={15} />} {cta}</>}
        </button>
      </div>
    </div>
  );
}

function ReserveSheet({ item, onClose, remembered, busy, onSubmit }: {
  item: PublicShopperItem | null; onClose: () => void; remembered: RememberedClient | null;
  busy: boolean; onSubmit: (name: string, phone: string) => void;
}) {
  const [name, setName] = useState(remembered?.name || '');
  const [phone, setPhone] = useState(remembered?.phone || '');
  useEffect(() => { if (item) { setName(remembered?.name || ''); setPhone(remembered?.phone || ''); } }, [item, remembered]);
  const valid = name.trim().length > 1 && phone.replace(/\D/g, '').length >= 8;
  const isLive = item?.listing === 'live';
  return (
    <BottomSheet open={item != null} onClose={onClose} title={isLive ? 'Reservá antes de que cierre' : 'Aparta tu producto'}
      footer={
        <button onClick={() => valid && onSubmit(name.trim(), phone.trim())} disabled={!valid || busy}
          className="w-full h-14 rounded-2xl bg-nodo-primary text-nodo-on-primary font-black active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} {isLive ? 'RESERVAR ⚡' : 'APARTAR'}
        </button>
      }>
      <div className="flex flex-col gap-4">
        {item && (
          <div className="flex items-center gap-3">
            {item.image_url ? <img src={item.image_url} className="w-14 h-14 rounded-xl object-cover" alt="" /> : <div className="w-14 h-14 rounded-xl bg-nodo-inset flex items-center justify-center text-nodo-dim"><Package size={20} /></div>}
            <div className="min-w-0">
              <p className="text-sm font-bold text-nodo-ink line-clamp-2">{item.title}</p>
              {item.price_gtq != null && <p className="text-sm font-black text-nodo-ink tabular-nums">{fmtQ(item.price_gtq)}</p>}
            </div>
          </div>
        )}
        <div><label className="nodo-label">Tu nombre</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre y apellido" className="nodo-input" autoFocus /></div>
        <div><label className="nodo-label">Tu WhatsApp</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="5512 3456" className="nodo-input" inputMode="tel" /></div>
        <p className="text-[11px] text-nodo-sub">Guardamos tu lugar y precio. Te contactamos por WhatsApp para confirmar. 🔒</p>
      </div>
    </BottomSheet>
  );
}
