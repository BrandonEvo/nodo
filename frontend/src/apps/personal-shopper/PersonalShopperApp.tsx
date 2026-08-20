import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Loader2, AlertTriangle, Check, X, Trash2, Search, Camera, Link2, PencilLine,
  Bell, Settings2, Share2, Package, Users, Tag, MessageCircle, Box, Sparkles, ArrowRight,
  Store, Radio, Zap, Clock, Flame, Minus, Play, Ticket, Dices, Power, ChevronDown,
  Maximize2, History, UserPlus, ListChecks,
} from 'lucide-react';
import type { AppProps } from '../index';
import { useModuleChrome, ModuleActions } from '@/components/chrome/ModuleChrome';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { haptic } from '@/utils/haptic';
import { fileToResizedDataUrl } from '@/utils/image';
import {
  shopperCatalogService as svc,
  type ShopperCatalogItem, type ShopperCatalogSettings, type ShopperCalcSettings,
  type ShopperReservation, type ShopperResStatus, type ShopperListing,
  type ShopperCoupon, type ShopperCouponInput, type CouponDiscountType,
  type ShopperStats, type ShopperStoreSession,
} from '@/services/shopper_catalog.service';
import { shopperAmazonService } from '@/services/shopper_amazon.service';
import {
  calculate, toSnapshot, directSnapshot, suggestPrices, round2,
  fmtGTQ, fmtUSD,
  type CalcConfig, type FreightMode, type CostCurrency,
} from './shopperPricing';

// ── Estados de reserva ──────────────────────────────────────────────────────────
const RES_META: Record<ShopperResStatus, { label: string; emoji: string; cls: string }> = {
  pendiente:     { label: 'Apartado',      emoji: '🕒', cls: 'bg-nodo-warn-bg text-nodo-warn-tx' },
  confirmada:    { label: 'Confirmado',    emoji: '✅', cls: 'bg-nodo-pastel-blue text-blue-700 dark:text-blue-300' },
  comprada:      { label: 'Comprado',      emoji: '🛍️', cls: 'bg-nodo-pastel-lavender text-violet-700 dark:text-violet-300' },
  en_camino:     { label: 'En camino',     emoji: '📦', cls: 'bg-nodo-pastel-peach text-amber-700 dark:text-amber-300' },
  entregada:     { label: 'Entregado',     emoji: '🎉', cls: 'bg-nodo-success-bg text-nodo-success-tx' },
  no_disponible: { label: 'No lo conseguí', emoji: '😔', cls: 'bg-nodo-inset text-nodo-sub' },
  cancelada:     { label: 'Cancelado',     emoji: '✖️', cls: 'bg-nodo-danger-bg text-nodo-danger-tx' },
};
const FLOW: ShopperResStatus[] = ['pendiente', 'confirmada', 'comprada', 'en_camino', 'entregada'];

function toConfig(cs: ShopperCalcSettings): CalcConfig {
  return {
    freightMode: cs.freight_mode,
    exchangeRate: cs.exchange_rate,
    taxRate: cs.tax_rate,
    defaultMarkupPct: cs.default_markup_pct,
    suitcaseCostUsd: cs.suitcase_cost_usd ?? null,
    suitcaseCapacityLbs: cs.suitcase_capacity_lbs ?? null,
    boxCostUsd: cs.box_cost_usd ?? null,
    boxLengthIn: cs.box_length_in ?? null,
    boxWidthIn: cs.box_width_in ?? null,
    boxHeightIn: cs.box_height_in ?? null,
    dimUnit: cs.dim_unit,
  };
}

const num = (v: string) => parseFloat((v || '').replace(',', '.')) || 0;

// El backend serializa datetimes naive en UTC (sin 'Z'); hay que forzar UTC al parsear.
const toMs = (iso?: string | null): number | null => {
  if (!iso) return null;
  const s = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
  return new Date(s).getTime();
};

// Reloj vivo que sólo tickea cuando hace falta (tienda abierta / countdown visible).
function useNow(active: boolean, ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

// Formatea el countdown de la venta: días si falta mucho, si no H:MM:SS / MM:SS.
function fmtClock(diffMs: number): { big: string; small: string; urgent: boolean } {
  if (diffMs <= 0) return { big: '0:00', small: 'se acabó', urgent: true };
  const s = Math.floor(diffMs / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return { big: `${d}d ${h}h`, small: 'para que cierre', urgent: false };
  if (h > 0) return { big: `${h}:${p(m)}:${p(sec)}`, small: 'para que cierre', urgent: false };
  return { big: `${m}:${p(sec)}`, small: 'para que cierre', urgent: m < 10 };
}

// Link al pedido del cliente — acceso rápido para compartir.
const orderLink = (orderToken?: string | null): string | null =>
  orderToken ? `${window.location.origin}/mi-pedido/${orderToken}` : null;

// ── Lightbox de imagen ──────────────────────────────────────────────────────────
// Portal a document.body: el contenido del BottomSheet vive dentro de .nodo-glass-panel
// (backdrop-filter), que es bloque contenedor de los `fixed` → sin portal quedaría recortado.
function ImageLightbox({ src, title, onClose }: { src: string; title?: string | null; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
  return createPortal(
    <div onClick={onClose}
      className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
      <button onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center active:scale-90 transition-transform">
        <X size={20} />
      </button>
      <img src={src} alt={title || ''} onClick={e => e.stopPropagation()}
        className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl" />
      {title && <p className="mt-4 text-white/90 text-sm font-bold text-center max-w-md line-clamp-2">{title}</p>}
    </div>,
    document.body,
  );
}

// ── Resultado de la venta (clímax al cerrar) ────────────────────────────────────
type SaleResultData = {
  units: number;
  reservations: number;
  clients: number;
  revenueGtq: number;
  topTitle: string | null;
  topUnits: number;
};

// Alcance de la venta: reservas vivas (no canceladas/no_disponible) creadas desde que
// abriste. Es lo APARTADO — plata prometida, todavía no cobrada (por eso el copy).
function computeSaleResult(
  reservations: ShopperReservation[], items: ShopperCatalogItem[], openedMs: number,
): SaleResultData {
  const byId = new Map(items.map(i => [i.id, i]));
  let units = 0, revenueGtq = 0, count = 0;
  const phones = new Set<string>();
  const perItem = new Map<string, { title: string; units: number }>();
  for (const r of reservations) {
    if (!r.is_active || r.status === 'cancelada' || r.status === 'no_disponible') continue;
    if (openedMs && (toMs(r.created_at) ?? 0) < openedMs - 5000) continue;
    const it = byId.get(r.catalog_item_id);
    const price = it?.price_gtq ?? r.item_price_gtq ?? 0;
    units += r.quantity;
    revenueGtq += price * r.quantity;
    count += 1;
    if (r.client_phone) phones.add(r.client_phone);
    const title = it?.title ?? r.item_title ?? '—';
    const p = perItem.get(r.catalog_item_id) ?? { title, units: 0 };
    p.units += r.quantity; perItem.set(r.catalog_item_id, p);
  }
  let topTitle: string | null = null, topUnits = 0;
  for (const p of perItem.values()) if (p.units > topUnits) { topUnits = p.units; topTitle = p.title; }
  return { units, reservations: count, clients: phones.size, revenueGtq, topTitle, topUnits };
}

function SaleResultModal({ data, onClose, onNewSale }: {
  data: SaleResultData; onClose: () => void; onNewSale: () => void;
}) {
  const empty = data.reservations === 0;
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-5 animate-in fade-in duration-200">
      {/* Opaco a propósito: `nodo-card-hero` es glass, y sobre el scrim negro la
          tarjeta se disolvía en el fondo — el cierre de la venta quedaba sin contenedor. */}
      <div className="w-full max-w-sm bg-nodo-card border border-nodo-line rounded-nodo-lg p-6 text-center animate-in zoom-in-95 duration-300"
        style={{ boxShadow: 'var(--nodo-shadow-hero)' }}>
        <div className="text-5xl mb-2">{empty ? '🌱' : '🏁'}</div>
        <h2 className="text-[26px] font-black text-nodo-ink leading-tight">
          {empty ? 'Venta cerrada' : '¡Cerraste la venta!'}
        </h2>
        <p className="text-sm font-semibold text-nodo-sub mt-1">
          {empty
            ? 'Esta vez nadie apartó nada. Probá otro horario o avisales por WhatsApp antes de abrir.'
            : `${data.clients} ${data.clients === 1 ? 'persona apartó' : 'personas apartaron'} algo 🎉`}
        </p>

        {!empty && (
          <>
            <div className="mt-5 rounded-2xl bg-nodo-primary text-nodo-on-primary p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-nodo-on-primary/80">Te apartaron</p>
              <p className="text-[40px] font-black tabular-nums leading-none mt-1">{fmtGTQ(data.revenueGtq)}</p>
              <p className="text-[11px] font-bold text-nodo-on-primary/80 mt-1">
                {data.units} producto{data.units === 1 ? '' : 's'} · {data.reservations} pedido{data.reservations === 1 ? '' : 's'}
              </p>
            </div>
            {data.topTitle && (
              <div className="mt-2.5 rounded-2xl bg-nodo-inset p-3 text-left">
                <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">Lo que más se llevaron</p>
                <p className="text-sm font-black text-nodo-ink line-clamp-1 mt-0.5">{data.topTitle}</p>
                <p className="text-[11px] font-bold text-nodo-sub tabular-nums">{data.topUnits} {data.topUnits === 1 ? 'vez' : 'veces'}</p>
              </div>
            )}
            <p className="text-[11px] font-semibold text-nodo-dim mt-3">
              Este dinero todavía no es tuyo: te lo apartaron. Escribiles por WhatsApp desde
              Reservas para confirmar y cobrar.
            </p>
          </>
        )}

        <button onClick={() => { haptic.tap(); onNewSale(); }}
          className="nodo-btn-primary mt-5">
          <Radio size={18} /> Abrir otra venta
        </button>
        <button onClick={onClose}
          className="w-full h-12 mt-2 rounded-2xl font-black text-sm text-nodo-sub active:scale-95 transition-transform">
          Listo
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export function PersonalShopperApp(_props: AppProps) {
  const [items, setItems] = useState<ShopperCatalogItem[]>([]);
  const [settings, setSettings] = useState<ShopperCatalogSettings | null>(null);
  const [calc, setCalc] = useState<ShopperCalcSettings | null>(null);
  const calcConfig = useMemo(() => (calc ? toConfig(calc) : null), [calc]);
  const [reservations, setReservations] = useState<ShopperReservation[]>([]);
  const [coupons, setCoupons] = useState<ShopperCoupon[]>([]);
  const [stats, setStats] = useState<ShopperStats | null>(null);
  const [saleResult, setSaleResult] = useState<SaleResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [createListing, setCreateListing] = useState<ShopperListing | null>(null);
  const [showOpen, setShowOpen] = useState(false);
  const [showReservas, setShowReservas] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showClients, setShowClients] = useState(false);
  const [showCoupons, setShowCoupons] = useState(false);
  const [showCostFix, setShowCostFix] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showManualSale, setShowManualSale] = useState(false);

  // Modo Editar: no es una preferencia de vista (el grid con fotos es lo que ve el
  // cliente), es una herramienta de mantenimiento. Por eso es temporal y no persiste.
  const [manage, setManage] = useState<null | 'catalog' | 'live'>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [riskAsk, setRiskAsk] = useState<{ all: string[]; safe: string[]; risky: ShopperCatalogItem[] } | null>(null);
  // Ítems ya borrados en pantalla pero cuyo DELETE todavía no salió: el backend hace
  // soft-delete SIN restore, así que deshacer sólo existe si el request aún no se disparó.
  const [ghosts, setGhosts] = useState<Set<string>>(() => new Set());
  const pendingDelete = useRef<{ ids: string[]; timer: ReturnType<typeof setTimeout> } | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // El toast con Deshacer vive 6s (hay que leerlo y decidir); el informativo, 2.6s.
  const flash = useCallback((kind: 'ok' | 'err', msg: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ kind, msg, undo });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 6000 : 2600);
  }, []);

  const load = useCallback(async () => {
    try {
      const [its, st, cs, res, cps, sts] = await Promise.all([
        svc.list(), svc.getSettings(), svc.getCalcSettings(), svc.listReservations(),
        svc.listCoupons().catch(() => [] as ShopperCoupon[]),
        svc.getStats().catch(() => null),
      ]);
      setItems(its); setSettings(st); setCalc(cs); setReservations(res); setCoupons(cps);
      setStats(sts);
    } catch {
      flash('err', 'No se pudo cargar tu tienda. Probá de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [flash]);
  useEffect(() => { void load(); }, [load]);

  const rawLive = settings?.store_status === 'live';
  const now = useNow(rawLive || loading === false);   // tickea mientras haya tienda abierta
  const closesMs = toMs(settings?.store_closes_at);
  const timedOut = rawLive && closesMs != null && closesMs <= now;
  const storeLive = rawLive && !timedOut;

  const pendingCount = reservations.filter(r => r.status === 'pendiente' && r.is_active).length;
  const activeCoupons = coupons.filter(c => c.is_active).length;
  const couponRedeemed = coupons.reduce((s, c) => s + c.redeemed_count, 0);
  const openedMs = toMs(settings?.store_opened_at) ?? 0;

  // Reporting HONESTO: viene del endpoint /stats (baldes realizado/en firme/potencial,
  // neteados de cupón). El summary local viejo mentía — mezclaba pendiente con cobrado y
  // no restaba cupones. `hasStats` = hay al menos una línea viva para mostrar la tarjeta.
  const assumedLines = stats
    ? stats.realized.assumed_cost_lines + stats.committed.assumed_cost_lines + stats.potential.assumed_cost_lines
    : 0;
  const hasStats = !!stats
    && (stats.realized.lines + stats.committed.lines + stats.potential.lines) > 0;

  // Los productos detrás de "N sin costo real": vendidos (o apartados) sin que sepamos
  // qué te costaron, así que /stats adivina el costo y la ganancia que ves es de mentira.
  // Son ESTOS los que hay que arreglar, y por eso el badge abre una lista y no un cartel.
  const costlessItems = useMemo(() => {
    const counted = new Set(
      reservations
        .filter(r => r.is_active && (FLOW as string[]).includes(r.status))
        .map(r => r.catalog_item_id),
    );
    // Sin `calc_mode` el costo no tiene origen conocido. O falta (y entonces sólo
    // importa cuando el ítem ya movió plata), o se cargó cuando el campo pedía
    // quetzales y el dueño escribía el precio en dólares: un costo 7.75× más chico
    // que el real, que infla la ganancia y afloja el piso de descuento del cupón.
    return items.filter(i =>
      i.calc_mode == null && (i.calc_total_cost_gtq != null || counted.has(i.id)));
  }, [items, reservations]);

  // Ítems de la venta actual = publicados 'live' durante esta sesión.
  // `*All` incluye los fantasmas (filas que ya salieron en pantalla pero cuyo DELETE
  // todavía no salió): el modo Editar las necesita montadas para animarlas y para que
  // Deshacer las devuelva. Todo lo demás consume las listas ya filtradas.
  const liveAll = useMemo(
    () => items.filter(i => i.listing === 'live' && i.is_published && i.is_active
      && (!openedMs || (toMs(i.published_at) ?? Infinity) >= openedMs - 5000)),
    [items, openedMs],
  );
  // Con la tienda cerrada, un ítem que quedó en 'live' no lo ve nadie: ni el cliente ni el
  // dueño, que sólo administra el catálogo. Existía pero no había forma de borrarlo nunca.
  const catalogAll = useMemo(
    () => items.filter(i => i.is_active
      && (i.listing === 'catalog' || (i.listing === 'live' && !storeLive))),
    [items, storeLive],
  );
  const liveItems = useMemo(() => liveAll.filter(i => !ghosts.has(i.id)), [liveAll, ghosts]);
  const catalogItems = useMemo(() => catalogAll.filter(i => !ghosts.has(i.id)), [catalogAll, ghosts]);

  // Cuántos clientes tienen apartado cada producto. Es el único dato que el undo no
  // puede explicar solo, así que decide si el borrado masivo pregunta o no pregunta.
  const reservedCount = useMemo(() => {
    const m = new Map<string, number>();
    reservations.forEach(r => {
      if (!r.is_active || r.status === 'cancelada' || r.status === 'no_disponible') return;
      m.set(r.catalog_item_id, (m.get(r.catalog_item_id) ?? 0) + 1);
    });
    return m;
  }, [reservations]);

  const manageRows = manage === 'live' ? liveItems : catalogItems;

  const flushDelete = useCallback(async () => {
    const p = pendingDelete.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingDelete.current = null;
    const ids = p.ids;
    // De a 4: cuarenta DELETE simultáneos desde el celular pegan contra el rate-limit.
    const fails: string[] = [];
    for (let i = 0; i < ids.length; i += 4) {
      const chunk = ids.slice(i, i + 4);
      const r = await Promise.allSettled(chunk.map(id => svc.remove(id)));
      r.forEach((x, k) => { if (x.status === 'rejected') fails.push(chunk[k]); });
    }
    if (!alive.current) return;
    // Recargar ANTES de soltar el fantasma, o la fila ya borrada reaparece un instante
    // (sigue en `items` y nada la tapa). Se limpian sólo los ids de ESTE lote: si mientras
    // tanto entró otro borrado, sus fantasmas tienen que seguir en pie.
    await load();
    setGhosts(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
    if (fails.length) flash('err', `No se pudo quitar ${fails.length}. Siguen en tu catálogo.`);
  }, [load, flash]);

  // Salir del módulo o mandarlo a background confirma lo pendiente: el dueño ya decidió,
  // cancelarle el borrado en silencio sería peor que aplicarlo. Si iOS mata la pestaña
  // antes, el producto simplemente sigue vivo — el modo de falla es el seguro.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flushDelete(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); void flushDelete(); };
  }, [flushDelete]);

  const commitDelete = useCallback((ids: string[]) => {
    if (!ids.length) return;
    void flushDelete();                     // nunca dos lotes en vuelo
    setGhosts(prev => new Set([...prev, ...ids]));
    setSelected(new Set());
    setRiskAsk(null);
    haptic.confirm();
    const timer = setTimeout(() => { void flushDelete(); }, 6000);
    pendingDelete.current = { ids, timer };
    flash('ok', ids.length === 1 ? 'Producto quitado' : `${ids.length} productos quitados`, () => {
      clearTimeout(timer);
      pendingDelete.current = null;
      setGhosts(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
      setToast(null);
      haptic.tap();
    });
  }, [flushDelete, flash]);

  // Puerta única de borrado: pregunta sólo cuando hay algo que el undo no puede contar.
  const requestDelete = useCallback((ids: string[]) => {
    if (!ids.length) return;
    const risky = manageRows.filter(i => ids.includes(i.id) && (reservedCount.get(i.id) ?? 0) > 0);
    if (!risky.length) { commitDelete(ids); return; }
    haptic.reject();
    setRiskAsk({ all: ids, safe: ids.filter(id => !(reservedCount.get(id) ?? 0)), risky });
  }, [manageRows, reservedCount, commitDelete]);

  // Selección por criterio real: es acá donde 12 toques se vuelven 1.
  const quickPicks = useMemo(() => {
    const picks = manage === 'live'
      ? [
          { key: 'all',   label: 'Todos',    ids: manageRows.map(i => i.id) },
          { key: 'out',   label: 'Agotados', ids: manageRows.filter(i => i.stock_available <= 0).map(i => i.id) },
          { key: 'free',  label: 'Sin apartados', ids: manageRows.filter(i => !reservedCount.get(i.id)).map(i => i.id) },
        ]
      : [
          { key: 'all',    label: 'Todos',    ids: manageRows.map(i => i.id) },
          { key: 'exp',    label: 'Vencidos', ids: manageRows.filter(i => { const m = toMs(i.expires_at); return m != null && m <= now; }).map(i => i.id) },
          { key: 'hidden', label: 'Ocultos',  ids: manageRows.filter(i => !i.is_published).map(i => i.id) },
          { key: 'free',   label: 'Sin apartados', ids: manageRows.filter(i => !reservedCount.get(i.id)).map(i => i.id) },
        ];
    return picks.filter(p => p.ids.length > 0);
  }, [manage, manageRows, reservedCount, now]);

  useModuleChrome('Mi Tienda', storeLive ? 'Vendiendo en vivo 🔴' : 'Abrí una venta o publicá en tu catálogo');

  const toggleSelected = useCallback((id: string) => {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  // Un solo swipe abierto a la vez.
  const openSwipe = useRef<(() => void) | null>(null);
  const registerOpenSwipe = useCallback((close: () => void) => {
    if (openSwipe.current && openSwipe.current !== close) openSwipe.current();
    openSwipe.current = close;
  }, []);

  useEffect(() => {
    if (manage) return;
    setSelected(new Set());
    openSwipe.current = null;
  }, [manage]);
  // Si la lista se vació no queda nada que editar. Se mide sobre la lista CON fantasmas
  // para no desmontar el modo (y la animación) a mitad del borrado.
  const manageAllLen = (manage === 'live' ? liveAll : catalogAll).length;
  useEffect(() => {
    if (manage && manageAllLen === 0) setManage(null);
  }, [manage, manageAllLen]);

  const publicUrl = settings ? `${window.location.origin}/catalogo/${settings.public_token}` : '';
  const share = useCallback(async () => {
    haptic.tap();
    // Un link pelado en WhatsApp se lee como spam. El mensaje da el contexto antes
    // de que el cliente decida abrirlo, y el link va en la última línea para que la
    // tarjeta del preview quede pegada al texto.
    const live = settings?.store_status === 'live';
    const biz = settings?.business_name?.trim();
    const origen = settings?.origin_label?.trim();
    const text = live
      ? `Estoy comprando ahorita 🛒\nVoy subiendo todo lo que encuentro y se aparta al toque. Cuando cierro, ya no entra nadie más.`
      : `¡Hola! Ya subí lo que traigo${origen ? ` ${origen}` : ''} ✈️\nPrecios en quetzales y apartás en 30 segundos, sin llamadas.`;
    const shareUrl = `${publicUrl}?src=wa`;
    const ok = await navigator.share?.({ title: biz || 'Mi catálogo', text, url: shareUrl })
      .then(() => true).catch(() => false);
    if (!ok) {
      await navigator.clipboard?.writeText(`${text}\n${shareUrl}`);
      flash('ok', 'Mensaje copiado. Pegalo en WhatsApp.');
    }
  }, [publicUrl, flash, settings]);

  const openStore = useCallback(async (storeName: string, minutes: number | null, bannerUrl: string | null) => {
    setBusy(true);
    try {
      // banner_url: '' quita la foto, un data URI la reemplaza, omitirlo la conserva.
      // El sheet siembra su estado con la foto actual, así que reabrir sin tocarla
      // reenviaba la MISMA imagen entera — cientos de KB de subida desde el teléfono
      // del dueño, en cada reapertura, para dejar todo igual.
      const untouched = bannerUrl === (settings?.store_banner_url ?? null);
      const st = await svc.openStore({
        store_name: storeName || null, minutes,
        ...(untouched ? {} : { banner_url: bannerUrl ?? '' }),
      });
      setSettings(st); setShowOpen(false);
      haptic.done();
      flash('ok', '¡Estás en vivo! 🔴');
    } catch (e) {
      // Lo único que puede pasarse de tamaño acá es la portada. Decirlo, en vez de
      // dejar al dueño tocando ABRIR contra un mensaje que no explica nada.
      const status = (e as { response?: { status?: number } })?.response?.status;
      flash('err', status === 413 || status === 422
        ? 'La foto de portada pesa demasiado. Elegí otra o abrí sin foto.'
        : errMsg(e) ?? 'No se pudo abrir la venta.');
    } finally { setBusy(false); }
  }, [flash, settings]);

  const closeStore = useCallback(async () => {
    if (!confirm('¿Cerrar la venta? Ya nadie va a poder apartar más. Lo que ya te apartaron no se pierde.')) return;
    setBusy(true);
    // Snapshot de la ventana de la venta ANTES de que settings pase a cerrado (openedMs
    // se deriva de settings): reservas creadas desde que abriste.
    const opened = toMs(settings?.store_opened_at) ?? 0;
    try {
      const st = await svc.closeStore();
      setSettings(st);
      haptic.done();
      const result = computeSaleResult(reservations, items, opened);
      setSaleResult(result);   // clímax: pantalla "Resultado de la venta"
      void load();             // refresca stats para el reporting de arriba
    } catch {
      flash('err', 'No se pudo cerrar la venta.');
    } finally { setBusy(false); }
  }, [flash, settings, reservations, items, load]);

  return (
    <>
      {/* Un toast que sólo informa puede vivir donde no estorbe. Uno que pide una decisión
          en 6 segundos tiene que vivir donde el pulgar ya está. */}
      {toast && (toast.undo ? (
        <div className="fixed left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 bg-nodo-ink text-nodo-canvas text-sm font-bold px-4 py-3 rounded-2xl shadow-lg max-w-[92vw]"
          style={{ bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))' }}>
          <span className="flex-1">{toast.msg}</span>
          <button onClick={toast.undo}
            className="shrink-0 h-11 px-3 -my-1 font-black text-xs border border-nodo-canvas/30 rounded-lg active:scale-90 transition-transform">
            Deshacer
          </button>
        </div>
      ) : (
        <div className={`fixed top-4 right-4 z-[70] flex items-center gap-3 text-sm font-bold px-4 py-3 rounded-2xl shadow-lg max-w-xs
          ${toast.kind === 'ok' ? 'bg-nodo-success-bg border border-nodo-success-bd text-nodo-success-tx'
                                : 'bg-nodo-danger-bg border border-nodo-danger-bd text-nodo-danger-tx'}`}>
          {toast.kind === 'ok' ? <Check size={16} /> : <AlertTriangle size={16} />}
          <span>{toast.msg}</span>
        </div>
      ))}

      <div className={`flex flex-col gap-5 ${manage ? 'pb-40' : ''}`}>
        <ModuleActions>
          <button onClick={() => { haptic.tap(); setShowReservas(true); }}
            className="nodo-appbar-action" aria-label="Reservas">
            <Bell size={16} />
            {pendingCount > 0 && (
              <span className="nodo-appbar-badge bg-nodo-primary text-nodo-on-primary">{pendingCount}</span>
            )}
          </button>
          <button onClick={() => { haptic.tap(); setShowCoupons(true); }}
            className="nodo-appbar-action" aria-label="Cupones">
            <Ticket size={16} />
            {activeCoupons > 0 && (
              <span className="nodo-appbar-badge bg-nodo-success-tx text-[color:var(--nodo-on-success)]">{activeCoupons}</span>
            )}
          </button>
          <button onClick={() => { haptic.tap(); setShowSettings(true); }}
            className="nodo-appbar-action" aria-label="Ajustes">
            <Settings2 size={16} />
          </button>
        </ModuleActions>

        {loading ? (
          <div className="nodo-spinner-container"><Loader2 className="w-8 h-8 animate-spin text-nodo-sub" /></div>
        ) : storeLive ? (
          /* ══════════ TIENDA EN VIVO ══════════ */
          <>
            <LiveHero
              storeName={settings?.store_name} bannerUrl={settings?.store_banner_url}
              closesMs={closesMs} now={now}
              items={liveItems.length}
              reserving={reservations.filter(r => r.is_active && r.status === 'pendiente').length}
              onClose={closeStore} onShare={share} busy={busy}
            />

            <div className="flex items-center justify-between">
              <p className="nodo-section-label !mb-0">En la venta ({liveItems.length})</p>
              <div className="flex items-center gap-3">
                {liveItems.length > 0 && manage !== 'live' && (
                  <button onClick={() => { haptic.tap(); setManage('live'); }}
                    className="text-xs font-bold text-nodo-sub flex items-center gap-1 active:scale-95 transition-transform">
                    <ListChecks size={13} /> Editar
                  </button>
                )}
                {liveItems.length > 0 && (
                  <button onClick={share} className="text-xs font-black text-nodo-primary flex items-center gap-1 active:scale-95">
                    <Share2 size={13} /> Compartir
                  </button>
                )}
              </div>
            </div>

            {liveItems.length === 0 ? (
              <div className="nodo-empty-state py-12">
                <Zap size={38} className="text-nodo-primary mb-3" />
                <p className="text-sm font-bold text-nodo-ink">Subí tu primer producto</p>
                <p className="text-xs text-nodo-sub mt-1">Le tomás la foto, le ponés precio y listo</p>
              </div>
            ) : manage === 'live' ? (
              <ManageList rows={liveAll} ghosts={ghosts} now={now} selected={selected}
                reservedCount={reservedCount} onToggle={toggleSelected}
                onDelete={id => requestDelete([id])} registerOpen={registerOpenSwipe} />
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {liveItems.map(it => <LiveItemCard key={it.id} item={it} />)}
              </div>
            )}
          </>
        ) : (
          /* ══════════ TIENDA CERRADA ══════════ */
          <>
            {timedOut && (
              <div className="rounded-nodo-md border p-4 flex items-center gap-3 bg-nodo-warn-bg border-nodo-warn-bd">
                <Clock size={20} className="text-nodo-warn-tx shrink-0" />
                <p className="flex-1 text-sm font-bold text-nodo-warn-tx">Se acabó el tiempo de tu última venta.</p>
                <button onClick={closeStore} disabled={busy}
                  className="h-9 px-3 rounded-xl bg-nodo-warn-tx text-[color:var(--nodo-on-warn)] text-xs font-black active:scale-95 disabled:opacity-40">
                  Cerrar
                </button>
              </div>
            )}

            {/* Hero: abrir tienda en vivo */}
            <button onClick={() => { haptic.tap(); setShowOpen(true); }}
              className="nodo-card-hero-primary p-6 text-left active:scale-[0.98] transition-transform">
              <div className="flex items-center gap-2 text-nodo-on-primary/90 mb-2">
                <Radio size={18} />
                <span className="text-[11px] font-black uppercase tracking-[0.14em]">Venta en vivo</span>
              </div>
              <p className="text-[26px] font-black leading-tight">Abrir venta 🔴</p>
              <p className="text-sm font-semibold text-nodo-on-primary/80 mt-1">
                Estás en la tienda comprando. Mostrá lo que ves y dales un tiempo para apartarlo.
              </p>
              <span className="inline-flex items-center gap-1.5 mt-4 h-11 px-5 rounded-full bg-nodo-on-primary text-nodo-primary font-black text-sm">
                <Play size={16} /> Empezar la venta
              </span>
            </button>

            {/* Cómo te fue — reporting honesto (endpoint /stats): realizado (plata de
                verdad) arriba, pipeline en firme/potencial abajo. Todo neteado de cupón. */}
            {hasStats && stats && (
              <div className="nodo-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="nodo-section-label !mb-0">Cómo te fue</p>
                  <button onClick={() => { haptic.tap(); setShowHistory(true); }}
                    className="text-[11px] font-black text-nodo-primary flex items-center gap-1 active:scale-95">
                    <History size={12} /> Ventas anteriores
                  </button>
                </div>

                {/* Ganado de verdad = entregado. Es la única plata que existe. */}
                <div className="rounded-2xl bg-nodo-success-bg p-3.5 mb-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-nodo-success-tx/80 uppercase tracking-wide">Ya ganaste (entregado)</p>
                    {stats.realized.orders > 0 && (
                      <span className="text-[10px] font-bold text-nodo-success-tx/70 tabular-nums">
                        {stats.realized.orders} pedido{stats.realized.orders === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  {stats.realized.lines > 0 ? (
                    <>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <p className="text-[28px] font-black text-nodo-success-tx tabular-nums leading-none">{fmtGTQ(stats.realized.profit_gtq)}</p>
                        <span className="text-[11px] font-bold text-nodo-success-tx/70">te quedó limpio</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-[11px] font-bold text-nodo-success-tx/80 tabular-nums">
                        <span>Cobraste {fmtGTQ(stats.realized.net_revenue_gtq)}</span>
                        {stats.realized.coupon_gtq > 0 && <span>· −{fmtGTQ(stats.realized.coupon_gtq)} en cupones</span>}
                        {stats.exchange_rate > 0 && <span>· {fmtUSD(stats.realized_profit_usd)}</span>}
                      </div>
                    </>
                  ) : (
                    <p className="text-[13px] font-bold text-nodo-success-tx/80 mt-1">
                      Se llena cuando marques un pedido como entregado 🎉
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl bg-nodo-inset p-3">
                    <p className="text-[10px] font-bold text-nodo-sub uppercase tracking-wide">Ya es seguro</p>
                    <p className="text-lg font-black text-nodo-ink tabular-nums leading-tight">{fmtGTQ(stats.committed.net_revenue_gtq)}</p>
                    <p className="text-[10px] font-bold text-nodo-sub tabular-nums">{stats.committed.units} prod. · ganás {fmtGTQ(stats.committed.profit_gtq)}</p>
                  </div>
                  <div className="rounded-2xl bg-nodo-inset p-3">
                    <p className="text-[10px] font-bold text-nodo-sub uppercase tracking-wide">Todavía en duda</p>
                    <p className="text-lg font-black text-nodo-ink tabular-nums leading-tight">{fmtGTQ(stats.potential.net_revenue_gtq)}</p>
                    <p className="text-[10px] font-bold text-nodo-sub tabular-nums">{stats.potential.units} prod. · ganás {fmtGTQ(stats.potential.profit_gtq)}</p>
                  </div>
                </div>

                {/* El aviso viejo era un cartel muerto: te decía que los números estaban
                    adivinados y no te dejaba hacer nada. Ahora abre la lista y se arregla. */}
                {assumedLines > 0 && costlessItems.length > 0 && (
                  <button onClick={() => { haptic.tap(); setShowCostFix(true); }}
                    className="mt-2.5 w-full rounded-2xl bg-nodo-warn-bg border border-nodo-warn-bd p-3 flex items-center gap-2.5 text-left active:scale-[0.99] transition-transform">
                    <AlertTriangle size={16} className="text-nodo-warn-tx shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-black text-nodo-warn-tx">
                        Estos números son un estimado
                      </p>
                      <p className="text-[11px] font-semibold text-nodo-warn-tx/80">
                        Nos falta saber qué te costaron {costlessItems.length} producto{costlessItems.length === 1 ? '' : 's'}. Tocá para decirnos.
                      </p>
                    </div>
                    <ArrowRight size={15} className="text-nodo-warn-tx shrink-0" />
                  </button>
                )}
              </div>
            )}

            {/* Te compraron por fuera del catálogo — el caso más común del negocio real. */}
            <button onClick={() => { haptic.tap(); setShowManualSale(true); }}
              className="nodo-card p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform">
              <div className="w-11 h-11 rounded-2xl bg-nodo-primary-soft flex items-center justify-center text-nodo-primary shrink-0">
                <UserPlus size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-nodo-ink">Anotar una venta</p>
                <p className="text-[11px] font-semibold text-nodo-sub">Te compraron por WhatsApp o en persona</p>
              </div>
              <ArrowRight size={16} className="text-nodo-dim shrink-0" />
            </button>

            {/* Accesos */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <QuickCard icon={<Bell size={18} />} label="Reservas" value={reservations.filter(r => r.is_active && r.status !== 'cancelada').length} onClick={() => setShowReservas(true)} />
              <QuickCard icon={<Users size={18} />} label="Clientes" value={new Set(reservations.map(r => r.client_phone)).size} onClick={() => setShowClients(true)} />
              <QuickCard icon={<Package size={18} />} label="Catálogo" value={catalogItems.filter(i => i.is_published).length} onClick={() => { if (settings) share(); }} />
              <QuickCard icon={<Ticket size={18} />} label="Cupones" value={activeCoupons} onClick={() => setShowCoupons(true)} />
            </div>

            {/* Catálogo Amazon (evergreen) */}
            <div className="flex items-center justify-between">
              <p className="nodo-section-label !mb-0">Catálogo Amazon ({catalogItems.length})</p>
              <div className="flex items-center gap-3">
                {catalogItems.length > 0 && manage !== 'catalog' && (
                  <button onClick={() => { haptic.tap(); setManage('catalog'); }}
                    className="text-xs font-bold text-nodo-sub flex items-center gap-1 active:scale-95 transition-transform">
                    <ListChecks size={13} /> Editar
                  </button>
                )}
                <button onClick={() => { haptic.tap(); setCreateListing('catalog'); }}
                  className="text-xs font-black text-nodo-primary flex items-center gap-1 active:scale-95">
                  <Plus size={14} /> Agregar
                </button>
              </div>
            </div>
            {catalogItems.length === 0 ? (
              <div className="nodo-empty-state py-10">
                <Link2 size={34} className="text-nodo-dim mb-2" />
                <p className="text-sm font-bold text-nodo-ink">Tu catálogo está vacío</p>
                <p className="text-xs text-nodo-sub mt-1">Pegá un link de Amazon y mostralo por unos días</p>
              </div>
            ) : manage === 'catalog' ? (
              <ManageList rows={catalogAll} ghosts={ghosts} now={now} selected={selected}
                reservedCount={reservedCount} onToggle={toggleSelected}
                onDelete={id => requestDelete([id])} registerOpen={registerOpenSwipe} />
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {catalogItems.map(it => (
                  <CatalogItemCard key={it.id} item={it} now={now}
                    onTogglePublish={async () => {
                      await svc.update(it.id, { is_published: !it.is_published }); await load();
                    }} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Barra del modo Editar. z-[55]: sobre el BottomNav (50), bajo el BottomSheet (60). */}
      {manage && (
        <div className="fixed left-3 right-3 lg:left-auto lg:right-6 lg:w-[420px] z-[55] liquid-glass rounded-[26px] p-2.5"
          style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}>
          {quickPicks.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-2 -mb-0.5" style={{ scrollbarWidth: 'none' }}>
              {quickPicks.map(p => {
                const on = p.ids.every(id => selected.has(id));
                return (
                  <button key={p.key}
                    onClick={() => {
                      haptic.tap();
                      setSelected(s => {
                        const n = new Set(s);
                        p.ids.forEach(id => on ? n.delete(id) : n.add(id));
                        return n;
                      });
                    }}
                    className={`shrink-0 h-9 px-3.5 rounded-full text-[12px] font-black active:scale-95 transition-transform
                      ${on ? 'bg-nodo-primary text-nodo-on-primary' : 'bg-nodo-inset text-nodo-sub'}`}>
                    {p.label} <span className="tabular-nums opacity-70">{p.ids.length}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="flex-1 pl-1.5 text-[12px] font-bold text-nodo-sub tabular-nums">
              {selected.size ? `${selected.size} seleccionado${selected.size > 1 ? 's' : ''}` : 'Tocá para elegir'}
            </span>
            <button onClick={() => { haptic.tap(); setManage(null); }}
              className="h-11 px-4 rounded-full bg-nodo-inset text-nodo-ink text-[13px] font-black active:scale-95 transition-transform">
              Listo
            </button>
            <button onClick={() => requestDelete([...selected])} disabled={!selected.size}
              className="h-11 px-5 rounded-full bg-nodo-danger-tx text-white text-[13px] font-black flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-30">
              <Trash2 size={15} /> Quitar {selected.size || ''}
            </button>
          </div>
        </div>
      )}

      {/* El sheet sólo aparece cuando tiene algo que decir que el Deshacer no puede decir:
          QUÉ estás por romper. Si nadie apartó nada, el undo alcanza y no se pregunta. */}
      <BottomSheet open={!!riskAsk} onClose={() => setRiskAsk(null)} title="Ojo con estos"
        footer={riskAsk ? (
          <div className="flex flex-col gap-2">
            {riskAsk.safe.length > 0 && (
              <button onClick={() => commitDelete(riskAsk.safe)} className="nodo-btn-primary">
                Quitar los {riskAsk.safe.length} sin apartados
              </button>
            )}
            <button onClick={() => commitDelete(riskAsk.all)} className="nodo-btn-danger">
              Quitar los {riskAsk.all.length} igual
            </button>
          </div>
        ) : null}>
        {riskAsk && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-nodo-sub">
              {riskAsk.risky.length === 1 ? 'Un cliente ya apartó' : 'Hay clientes que ya apartaron'} esto.
              Si lo quitás desaparece de tu catálogo, pero el apartado y la plata siguen en Reservas.
            </p>
            {riskAsk.risky.map(it => (
              <div key={it.id} className="flex items-center gap-3 p-2.5 rounded-2xl bg-nodo-warn-bg">
                <Flame size={15} className="text-nodo-warn-tx shrink-0" />
                <p className="flex-1 text-[13px] font-bold text-nodo-warn-tx line-clamp-1">{it.title}</p>
                <span className="text-[11px] font-black text-nodo-warn-tx tabular-nums">
                  {reservedCount.get(it.id) ?? 0}
                </span>
              </div>
            ))}
          </div>
        )}
      </BottomSheet>

      {/* FAB contextual: publicar en vivo cuando la tienda está abierta */}
      {storeLive && !manage && (
        <button onClick={() => { haptic.tap(); setCreateListing('live'); }}
          className="fixed bottom-24 right-5 z-40 h-16 pl-5 pr-6 rounded-full bg-nodo-primary text-nodo-on-primary flex items-center gap-2 font-black active:scale-90 transition-transform"
          style={{ boxShadow: 'var(--nodo-shadow-fab)' }}>
          <Plus size={26} strokeWidth={2.6} /> Publicar
        </button>
      )}

      {/* Sheets */}
      {calcConfig && createListing && settings && (
        <CreateSheet
          listing={createListing}
          open={!!createListing}
          onClose={() => setCreateListing(null)}
          config={calcConfig}
          onCreated={async () => { setCreateListing(null); await load(); haptic.done(); flash('ok', '¡Publicado! 🎉'); }}
          onError={(m) => flash('err', m)}
        />
      )}
      <OpenStoreSheet open={showOpen} onClose={() => setShowOpen(false)} busy={busy} onOpen={openStore}
        currentBanner={settings?.store_banner_url} />
      <ReservasSheet open={showReservas} onClose={() => setShowReservas(false)}
        reservations={reservations} items={items} whatsapp={settings?.whatsapp_number}
        onChanged={load} flash={flash}
        onFixCost={() => { setShowReservas(false); setShowCostFix(true); }} />
      {settings && calc && (
        <SettingsSheet open={showSettings} onClose={() => setShowSettings(false)}
          settings={settings} calc={calc}
          onSaved={async () => { await load(); flash('ok', 'Guardado'); }}
          onError={(m) => flash('err', m)} />
      )}
      <ClientsSheet open={showClients} onClose={() => setShowClients(false)}
        reservations={reservations} flash={flash} />
      <CouponsSheet open={showCoupons} onClose={() => setShowCoupons(false)}
        coupons={coupons} markupPct={calc?.default_markup_pct ?? 30}
        publicUrl={publicUrl} totalRedeemed={couponRedeemed}
        onChanged={load} flash={flash} />
      {calcConfig && (
        <CostFixSheet open={showCostFix} onClose={() => setShowCostFix(false)}
          items={costlessItems} config={calcConfig} onSaved={load} onError={(m) => flash('err', m)} />
      )}
      <SaleHistorySheet open={showHistory} onClose={() => setShowHistory(false)} flash={flash} />
      <ManualSaleSheet open={showManualSale} onClose={() => setShowManualSale(false)}
        items={items.filter(i => i.is_active)}
        onSaved={load} onError={(m) => flash('err', m)} />
      {saleResult && (
        <SaleResultModal data={saleResult}
          onClose={() => setSaleResult(null)}
          onNewSale={() => { setSaleResult(null); setShowOpen(true); }} />
      )}
    </>
  );
}

// ── Hero en vivo: reloj gigante ─────────────────────────────────────────────────
// Lleva la misma foto que ve el cliente: es la única forma que tiene el dueño de ver qué
// subió sin abrir el link público, y confirma de un vistazo que la venta está viva.
function LiveHero({ storeName, bannerUrl, closesMs, now, items, reserving, onClose, onShare, busy }: {
  storeName?: string | null; bannerUrl?: string | null; closesMs: number | null; now: number;
  items: number; reserving: number; onClose: () => void; onShare: () => void; busy: boolean;
}) {
  const clock = closesMs != null ? fmtClock(closesMs - now) : null;
  const urgent = clock?.urgent ?? false;
  const photo = !!bannerUrl;
  const skin = (photo
    ? { '--sc-fg': '#FFFFFF', '--sc-fg-2': 'rgba(255,255,255,0.74)',
        '--sc-chip': 'rgba(0,0,0,0.42)', '--sc-btn-fg': '#111111' }
    : { '--sc-fg': 'var(--nodo-on-primary)', '--sc-fg-2': 'var(--nodo-on-primary-2, rgba(255,255,255,0.74))',
        '--sc-chip': 'var(--nodo-veil, rgba(255,255,255,0.14))', '--sc-btn-fg': 'var(--nodo-primary)' }
  ) as React.CSSProperties;

  return (
    <div className="nodo-card-hero-primary relative overflow-hidden p-5" style={skin}>
      {photo && (<>
        <img src={bannerUrl!} alt="" aria-hidden="true" decoding="async"
          className="s-hero-photo absolute inset-0 w-full h-full object-cover object-[center_35%]" />
        <div className="s-hero-scrim absolute inset-0 pointer-events-none" />
      </>)}

      <div className="relative" style={{ color: 'var(--sc-fg)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className={`flex items-center gap-2 ${photo ? 'h-8 pl-2.5 pr-3 rounded-full backdrop-blur-sm' : ''}`}
            style={photo ? { background: 'var(--sc-chip)' } : undefined}>
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
            </span>
            <span className="text-[12px] font-black uppercase tracking-[0.14em]">En vivo{storeName ? ` · ${storeName}` : ''}</span>
          </div>
          <button onClick={onShare} aria-label="Compartir mi tienda"
            className="h-9 w-9 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: 'var(--sc-chip)' }}>
            <Share2 size={16} />
          </button>
        </div>

        {clock ? (
          <div className="mt-3 flex items-end gap-3">
            <span className={`font-black tabular-nums tracking-tighter leading-none text-[clamp(42px,13.5vw,56px)] lg:text-[68px]
              ${urgent ? 's-clock-urgent' : ''}`}>
              {clock.big}
            </span>
            <span className="text-sm font-bold mb-2" style={{ color: 'var(--sc-fg-2)' }}>{clock.small}</span>
          </div>
        ) : (
          <p className="mt-3 text-[40px] font-black leading-none flex items-center gap-2"><Radio size={30} /> Sin límite</p>
        )}

        <div className="mt-4 flex items-center gap-4">
          <StatMini icon={<Package size={14} />} label="publicados" value={items} />
          <StatMini icon={<Flame size={14} />} label="apartados" value={reserving} />
          <div className="flex-1" />
          <button onClick={onClose} disabled={busy}
            className="h-11 px-5 rounded-full font-black text-sm active:scale-95 transition-transform disabled:opacity-40 flex items-center gap-1.5"
            style={{ background: 'var(--sc-fg)', color: 'var(--sc-btn-fg)' }}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : '🏁'} Cerrar venta
          </button>
        </div>
      </div>
    </div>
  );
}

function StatMini({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ color: 'var(--sc-fg-2)' }}>{icon}</span>
      <span className="text-lg font-black tabular-nums">{value}</span>
      <span className="text-[11px] font-semibold" style={{ color: 'var(--sc-fg-2)' }}>{label}</span>
    </div>
  );
}

function QuickCard({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="nodo-card p-3 flex flex-col gap-1 items-start active:scale-[0.97] transition-transform">
      <span className="text-nodo-primary">{icon}</span>
      <span className="text-2xl font-black text-nodo-ink tabular-nums leading-none">{value}</span>
      <span className="text-[10px] font-semibold text-nodo-sub uppercase tracking-wide">{label}</span>
    </button>
  );
}

// ── Tarjetas de ítem ─────────────────────────────────────────────────────────────
// ── Modo Editar: filas para limpiar el catálogo ─────────────────────────────────
// Fila de 72px, tap en cualquier parte para seleccionar. El swipe es el atajo para el
// "este me sobra" de a uno; el borrado real de tanda sale de los chips de la barra.
const SWIPE_OPEN = 88;     // ancho de la capa "Quitar"
const SWIPE_COMMIT = 132;  // pasado esto, soltar borra directo
const SWIPE_LOCK = 8;      // px de intención antes de decidir eje

// `commitOnSwipe=false` para las filas cuyo borrado abre un sheet de confirmación: al
// soltar, el navegador todavía tiene un click pendiente de ese mismo gesto, y lo despacha
// contra el elemento que esté abajo EN ESE MOMENTO — el backdrop recién montado. El sheet
// se cerraba solo y no se borraba nada. Esas filas se piden con el botón «Quitar».
function useSwipeDelete(onDelete: () => void, registerOpen: (close: () => void) => void,
                        commitOnSwipe = true) {
  const rowRef = useRef<HTMLDivElement>(null);
  const st = useRef({ x0: 0, y0: 0, dx: 0, lock: null as null | 'x' | 'y', open: false, armed: false });

  const settle = useCallback((to: number, ms = 220) => {
    const el = rowRef.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.style.transition = reduce ? 'transform 120ms linear' : `transform ${ms}ms cubic-bezier(.22,1,.36,1)`;
    el.style.transform = `translate3d(${to}px,0,0)`;
    el.style.willChange = '';
    st.current.open = to !== 0;
  }, []);

  const close = useCallback(() => settle(0, 180), [settle]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = rowRef.current;
    if (!el) return;
    st.current = { x0: e.clientX, y0: e.clientY, dx: 0, lock: null, open: st.current.open, armed: false };
    el.style.transition = 'none';
    el.style.willChange = 'transform';
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = st.current, el = rowRef.current;
    if (!el) return;
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0;

    if (s.lock === null) {
      // El 1.5 sesga a favor del scroll: en la duda gana el gesto vertical, que el
      // usuario hace cincuenta veces más seguido que el swipe.
      if (Math.abs(dy) > SWIPE_LOCK && Math.abs(dy) >= Math.abs(dx)) { s.lock = 'y'; return; }
      if (Math.abs(dx) > SWIPE_LOCK && Math.abs(dx) > Math.abs(dy) * 1.5) {
        s.lock = 'x';
        el.setPointerCapture(e.pointerId);   // sólo capturamos cuando ya ganamos el eje
        registerOpen(close);
      } else return;
    }
    if (s.lock === 'y') return;              // nunca capturado → el scroll nativo sigue vivo

    const base = s.open ? -SWIPE_OPEN : 0;
    let x = Math.min(0, base + dx);
    if (x < -SWIPE_OPEN) x = -(SWIPE_OPEN + (Math.abs(x) - SWIPE_OPEN) * 0.35);   // rubber band
    s.dx = x;
    el.style.transform = `translate3d(${x}px,0,0)`;

    // Haptic al CRUZAR el umbral, no al soltar: es lo que lo hace sentir nativo.
    if (!s.armed && Math.abs(x) >= SWIPE_COMMIT) { s.armed = true; haptic.confirm(); }
    else if (s.armed && Math.abs(x) < SWIPE_COMMIT) { s.armed = false; haptic.tap(); }
  };

  const onPointerUp = () => {
    const s = st.current;
    if (s.lock !== 'x') { s.lock = null; return; }
    s.lock = null;
    if (Math.abs(s.dx) >= SWIPE_COMMIT) {
      if (commitOnSwipe) { settle(-window.innerWidth, 180); onDelete(); return; }
      settle(-SWIPE_OPEN); return;
    }
    settle(Math.abs(s.dx) >= SWIPE_OPEN * 0.5 ? -SWIPE_OPEN : 0);
  };

  return { rowRef, onPointerDown, onPointerMove, onPointerUp, close, isOpen: () => st.current.open };
}

function ManageList({ rows, ghosts, now, selected, reservedCount, onToggle, onDelete, registerOpen }: {
  rows: ShopperCatalogItem[]; ghosts: Set<string>; now: number; selected: Set<string>;
  reservedCount: Map<string, number>; onToggle: (id: string) => void;
  onDelete: (id: string) => void; registerOpen: (close: () => void) => void;
}) {
  return (
    <div>
      {rows.map(it => (
        <div key={it.id} className="nodo-row-slot" data-out={ghosts.has(it.id) ? '1' : undefined}>
          <div>
            <ManageRow item={it} now={now} selected={selected.has(it.id)}
              reserved={reservedCount.get(it.id) ?? 0}
              onToggle={() => onToggle(it.id)} onDelete={() => onDelete(it.id)}
              registerOpen={registerOpen} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ManageRow({ item, now, selected, reserved, onToggle, onDelete, registerOpen }: {
  item: ShopperCatalogItem; now: number; selected: boolean; reserved: number;
  onToggle: () => void; onDelete: () => void; registerOpen: (close: () => void) => void;
}) {
  const { rowRef, onPointerDown, onPointerMove, onPointerUp, isOpen } = useSwipeDelete(onDelete, registerOpen);
  const expMs = toMs(item.expires_at);
  const daysLeft = expMs != null ? Math.ceil((expMs - now) / 86400000) : null;
  const expired = daysLeft != null && daysLeft <= 0;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-nodo-danger-tx">
      {/* Capa revelada por el swipe — estática, no anima */}
      <button onClick={onDelete} tabIndex={-1} aria-hidden="true"
        className="absolute inset-y-0 right-0 w-[88px] flex flex-col items-center justify-center gap-0.5 text-[color:var(--nodo-on-danger)]">
        <Trash2 size={18} />
        <span className="text-[10px] font-black uppercase tracking-wide">Quitar</span>
      </button>

      <div ref={rowRef}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onClick={() => { if (isOpen()) return; haptic.tap(); onToggle(); }}
        role="button" aria-pressed={selected}
        className={`relative h-[72px] px-3 flex items-center gap-3 select-none border rounded-2xl
          ${selected ? 'bg-nodo-primary-soft border-nodo-primary' : 'bg-nodo-card border-nodo-line'}`}
        style={{ touchAction: 'pan-y' }}>

        <span className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors duration-150
          ${selected ? 'bg-nodo-primary border-nodo-primary text-nodo-on-primary' : 'border-nodo-line-s text-transparent'}`}>
          <Check size={14} strokeWidth={3.5} />
        </span>

        <div className="shrink-0 w-12 h-12 rounded-xl bg-nodo-inset overflow-hidden">
          {item.image_url
            ? <img src={item.image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-nodo-dim"><Package size={18} /></div>}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-nodo-ink leading-tight line-clamp-1">{item.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-bold tabular-nums">
            {item.price_gtq != null && <span className="text-nodo-ink">{fmtGTQ(item.price_gtq)}</span>}
            <span className={item.is_published ? 'text-nodo-success-tx' : 'text-nodo-dim'}>
              · {item.is_published ? 'Publicado' : 'Oculto'}
            </span>
            {expired && <span className="text-nodo-danger-tx">· Vencido</span>}
          </div>
        </div>

        {reserved > 0 && (
          <span className="shrink-0 flex items-center gap-1 px-2 h-6 rounded-full bg-nodo-warn-bg text-nodo-warn-tx text-[10px] font-black">
            <Flame size={10} /> {reserved}
          </span>
        )}
      </div>
    </div>
  );
}

function LiveItemCard({ item }: { item: ShopperCatalogItem }) {
  const reserved = Math.max(0, item.stock_total - item.stock_available);
  const soldOut = !item.is_made_to_order && item.stock_available <= 0;
  return (
    <div className="nodo-card overflow-hidden flex flex-col">
      <div className="relative aspect-square bg-nodo-inset">
        {item.image_url
          ? <img src={item.image_url} alt={item.title} loading="lazy" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-nodo-dim"><Package size={28} /></div>}
        <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-black ${soldOut ? 'bg-nodo-ink text-nodo-canvas' : 'bg-nodo-primary text-nodo-on-primary'}`}>
          {soldOut ? 'AGOTADO' : item.is_made_to_order ? 'Por encargo' : `quedan ${item.stock_available}`}
        </span>
      </div>
      <div className="p-2.5 flex flex-col gap-1 flex-1">
        <p className="text-[13px] font-bold text-nodo-ink leading-tight line-clamp-2">{item.title}</p>
        {item.price_gtq != null && <p className="text-sm font-black text-nodo-ink tabular-nums">{fmtGTQ(item.price_gtq)}</p>}
        {reserved > 0 && (
          <p className="mt-auto text-[11px] font-black text-nodo-primary flex items-center gap-1">
            <Flame size={12} /> {reserved} apartado{reserved !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}

function CatalogItemCard({ item, now, onTogglePublish }: {
  item: ShopperCatalogItem; now: number; onTogglePublish: () => void;
}) {
  const expMs = toMs(item.expires_at);
  const daysLeft = expMs != null ? Math.ceil((expMs - now) / 86400000) : null;
  const expired = daysLeft != null && daysLeft <= 0;
  return (
    <div className="nodo-card overflow-hidden flex flex-col">
      <div className="relative aspect-square bg-nodo-inset">
        {item.image_url
          ? <img src={item.image_url} alt={item.title} loading="lazy" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-nodo-dim"><Package size={28} /></div>}
        {item.is_offer && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-nodo-danger-tx text-white text-[10px] font-black">🔥 Oferta</span>
        )}
      </div>
      <div className="p-2.5 flex flex-col gap-1 flex-1">
        <p className="text-[13px] font-bold text-nodo-ink leading-tight line-clamp-2">{item.title}</p>
        {item.price_gtq != null && <p className="text-sm font-black text-nodo-ink tabular-nums">{fmtGTQ(item.price_gtq)}</p>}
        {daysLeft != null && (
          <p className={`text-[10px] font-bold ${expired ? 'text-nodo-danger-tx' : 'text-nodo-sub'}`}>
            {expired ? 'Vencido' : `vence en ${daysLeft}d`}
          </p>
        )}
        <button onClick={onTogglePublish}
          className={`mt-auto text-[11px] font-bold px-2 py-1 rounded-lg ${item.is_published
            ? 'bg-nodo-success-bg text-nodo-success-tx' : 'bg-nodo-inset text-nodo-sub'}`}>
          {item.is_published ? 'Publicado' : 'Oculto'}
        </button>
      </div>
    </div>
  );
}

// ── Abrir tienda ─────────────────────────────────────────────────────────────────
// Tiendas recientes: a partir de la segunda venta, escribir el nombre desaparece.
// Es lo que le devuelve al dueño los toques que le cuesta la foto.
const STORES_KEY = 'nodo_shopper_recent_stores';
const recentStores = (): string[] => {
  try { return (JSON.parse(localStorage.getItem(STORES_KEY) || '[]') as string[]).slice(0, 3); }
  catch { return []; }
};
const rememberStore = (n: string) => {
  if (!n.trim()) return;
  try {
    localStorage.setItem(STORES_KEY, JSON.stringify(
      [n, ...recentStores().filter(s => s.toLowerCase() !== n.toLowerCase())].slice(0, 3)));
  } catch { /* Safari privado */ }
};

function OpenStoreSheet({ open, onClose, busy, onOpen, currentBanner }: {
  open: boolean; onClose: () => void; busy: boolean; currentBanner?: string | null;
  onOpen: (storeName: string, minutes: number | null, bannerUrl: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState<number | null>(120);
  const [banner, setBanner] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const DURATIONS: { m: number | null; label: string }[] = [
    { m: 60, label: '1 hora' }, { m: 120, label: '2 horas' },
    { m: 180, label: '3 horas' }, { m: null, label: 'Sin reloj' },
  ];
  useEffect(() => {
    if (open) {
      setName(''); setMinutes(120); setBanner(currentBanner ?? null);
      setPhotoBusy(false); setRecent(recentStores());
    }
  }, [open, currentBanner]);

  const onBanner = async (f: File | null) => {
    if (!f) return;
    setPhotoBusy(true);
    try {
      // Más chica y más comprimida que la foto de un producto (720/0.7): ésta va scrimeada
      // detrás de texto gigante, así que la blandura no se ve — pero los bytes se pagan en
      // CADA espectador y en cada rotación de `v`, no una sola vez.
      setBanner(await fileToResizedDataUrl(f, {
        maxSize: 800, quality: 0.5, maxBytes: 120_000, photo: true,
      }));
    } catch { /* la foto es opcional: no bloquea abrir */ }
    finally { setPhotoBusy(false); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Abrir venta en vivo"
      footer={
        // photoBusy bloquea: fileToResizedDataUrl decodifica en el main thread y tocar
        // ABRIR con el encode en vuelo abriría la venta sin foto.
        <button onClick={() => { rememberStore(name); onOpen(name, minutes, banner); }} disabled={busy || photoBusy}
          className="w-full h-14 rounded-2xl bg-nodo-primary text-nodo-on-primary font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Radio size={18} />} ABRIR 🔴 EN VIVO
        </button>
      }>
      <div className="flex flex-col gap-4">
        <div>
          <label className="nodo-label">¿En qué tienda estás comprando?</label>
          {recent.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2">
              {recent.map(s => (
                <button key={s} onClick={() => { haptic.tap(); setName(s); }}
                  className={`rounded-full px-3.5 py-2 text-sm font-bold active:scale-95 transition-transform border
                    ${name === s ? 'bg-nodo-primary text-nodo-on-primary border-transparent' : 'bg-nodo-inset text-nodo-ink border-nodo-line'}`}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <input value={name} onChange={e => setName(e.target.value)} placeholder="ej. Costco, Amazon, Ross…" className="nodo-input" />
        </div>
        <div>
          <label className="nodo-label">¿Cuánto tiempo la dejás abierta?</label>
          <div className="grid grid-cols-4 gap-2">
            {DURATIONS.map(d => (
              <button key={d.label} onClick={() => { haptic.tap(); setMinutes(d.m); }}
                className={`h-12 rounded-2xl text-xs font-black active:scale-95 transition-transform ${minutes === d.m ? 'bg-nodo-primary text-nodo-on-primary' : 'bg-nodo-inset text-nodo-sub border border-nodo-line'}`}>
                {d.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-nodo-sub mt-2">
            {minutes ? `Tus clientes ven un reloj de ${minutes / 60}h. Al llegar a cero se cierra sola.` : 'Sin reloj: queda abierta hasta que vos la cerrés.'}
          </p>
        </div>

        {/* Última y opcional: la foto no puede meterse entre el dueño y el botón de abrir. */}
        <div>
          <label className="nodo-label">Foto de la tienda (opcional)</label>
          <button onClick={() => camRef.current?.click()} disabled={photoBusy}
            className="relative w-full h-32 rounded-2xl overflow-hidden bg-nodo-inset border-2 border-dashed border-nodo-line flex items-center justify-center active:scale-[0.98] transition-transform">
            {photoBusy ? <Loader2 size={20} className="animate-spin text-nodo-sub" />
              : banner ? (<>
                  <img src={banner} className="absolute inset-0 w-full h-full object-cover object-[center_35%]" alt="" />
                  <span className="relative px-3 py-1.5 rounded-full text-xs font-black flex items-center gap-1 text-white" style={{ background: 'rgba(0,0,0,.5)' }}>
                    <Camera size={12} /> Cambiar
                  </span>
                </>)
              : <span className="flex flex-col items-center gap-1 text-nodo-sub">
                  <Camera size={22} />
                  <span className="text-xs font-bold">Tomale una foto a la tienda</span>
                  <span className="text-[10px] text-nodo-dim">Tus clientes la ven de fondo</span>
                </span>}
          </button>
          <div className="flex items-center justify-center gap-3 mt-1.5">
            <button onClick={() => galRef.current?.click()} className="text-[11px] font-bold text-nodo-sub underline">
              Elegir de galería
            </button>
            {banner && (
              <button onClick={() => setBanner(null)} className="text-[11px] font-bold text-nodo-sub underline">
                Quitar foto
              </button>
            )}
          </div>
          {/* capture: la foto es del ahora y está parada adentro de la tienda → cámara
              directo, sin el selector del OS. En desktop el atributo se ignora. */}
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
            onChange={e => onBanner(e.target.files?.[0] || null)} />
          <input ref={galRef} type="file" accept="image/*" hidden
            onChange={e => onBanner(e.target.files?.[0] || null)} />
        </div>
      </div>
    </BottomSheet>
  );
}

// ── Alta de producto (foto → precio → cantidad → publicar) ──────────────────────
type CreateMode = 'amazon' | 'foto' | 'manual';

// Todo lo que Amazon reparte como enlace de producto: dominio largo (amazon.com,
// amazon.com.mx), los cortos de compartir (a.co, amzn.to) o el ASIN pelado.
const isAmazonLink = (s: string) =>
  /(?:amazon\.[a-z.]+|amzn\.[a-z]+|a\.co)\//i.test(s) || /^[A-Z0-9]{10}$/.test(s.trim());

/**
 * El número por el que existe la pantalla: cuánto le queda si lo vende a ese precio.
 * Antes era una línea de 11px debajo del input — el dato de la decisión era el más
 * chico de todo el panel. Reserva su alto siempre: si apareciera y desapareciera
 * mientras el dueño teclea, el contenido saltaría bajo el pulgar.
 */
function Verdict({ cost, sale, qty, goalPct }: {
  cost: number; sale: number; qty: number; goalPct: number;
}) {
  const ready = cost > 0 && sale > 0;
  const profit = round2(sale - cost);
  const marginPct = ready && sale > 0 ? (profit / sale) * 100 : 0;

  let skin = 'bg-nodo-inset border-nodo-line text-nodo-dim';
  let label = 'TE QUEDA';
  let detail = cost <= 0
    ? 'Poné cuánto te costó y a cuánto lo vendés.'
    : 'Ponele precio y te digo cuánto ganás.';
  let warn = false;

  if (ready) {
    if (profit <= 0) {
      skin = 'bg-nodo-danger-bg border-nodo-danger-bd text-nodo-danger-ink';
      label = 'ESTÁS PERDIENDO'; warn = true;
      detail = `Lo vendés más barato de lo que te costó (${fmtGTQ(cost)}).`;
    } else if (marginPct < 15) {
      skin = 'bg-nodo-warn-bg border-nodo-warn-bd text-nodo-warn-ink';
      label = 'TE QUEDA POQUITO'; warn = true;
      detail = `${fmtGTQ(sale)} − ${fmtGTQ(cost)} de costo. Con cualquier descuento quedás en cero.`;
    } else {
      skin = 'bg-nodo-success-bg border-nodo-success-bd text-nodo-success-ink';
      label = 'TE QUEDA LIMPIO';
      // La resta a la vista: el número grande es exactamente lo que escribió menos lo
      // que le costó, y verlo escrito evita tener que confiar en la cuenta.
      detail = `${fmtGTQ(sale)} − ${fmtGTQ(cost)} · ${Math.round(marginPct)}% de margen`
        + (qty > 1 ? ` · los ${qty}: ${fmtGTQ(profit * qty)}` : '');
    }
  }

  return (
    <div role="status" aria-live="polite"
      className={`mt-3 min-h-[89px] rounded-nodo-sm border p-3 ${skin}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.12em] flex items-center gap-1.5">
        {warn && <AlertTriangle size={14} className="shrink-0" />}
        {label}
        {ready && profit > 0 && marginPct >= goalPct && (
          <span className="ml-auto px-2 py-0.5 rounded-full bg-nodo-success-tx text-[9px] font-black"
            style={{ color: 'var(--nodo-on-success)' }}>
            🔥 Arriba de tu meta
          </span>
        )}
      </p>
      <p className="text-[30px] font-black tabular-nums tracking-tight leading-none mt-0.5">
        {ready ? `${profit < 0 ? '−' : ''}${fmtGTQ(Math.abs(profit))}` : '—'}
      </p>
      <p className="text-[11px] font-bold mt-1">{detail}</p>
    </div>
  );
}

function CreateSheet({ listing, open, onClose, config, onCreated, onError }: {
  listing: ShopperListing; open: boolean; onClose: () => void; config: CalcConfig;
  onCreated: () => void; onError: (m: string) => void;
}) {
  const isLive = listing === 'live';
  const [mode, setMode] = useState<CreateMode>(isLive ? 'foto' : 'amazon');
  const [amazonUrl, setAmazonUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const scrapingRef = useRef(false);   // el blur del input y el click del botón llegan juntos
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [amazonMeta, setAmazonMeta] = useState<{ url?: string; asin?: string }>({});

  const [priceUsd, setPriceUsd] = useState('');
  const [taxPct, setTaxPct] = useState(String(config.taxRate));
  const [applyTax, setApplyTax] = useState(true);
  const [priceGtq, setPriceGtq] = useState('');
  const [qty, setQty] = useState(1);
  const [inHand, setInHand] = useState(isLive);      // en vivo siempre es en mano
  const [days, setDays] = useState(3);               // catálogo: días disponible
  const [isOffer, setIsOffer] = useState(false);
  const [compareAt, setCompareAt] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setMode(isLive ? 'foto' : 'amazon'); setAmazonUrl(''); setTitle(''); setDescription(''); setCategory('');
    setImageUrl(null); setAmazonMeta({}); setPriceUsd(''); setTaxPct(String(config.taxRate));
    setApplyTax(true); setPriceGtq('');
    setQty(1); setInHand(isLive); setDays(3); setIsOffer(false); setCompareAt('');
  };
  useEffect(() => { if (open) reset(); /* eslint-disable-next-line */ }, [open, listing]);

  // El dueño compra en Estados Unidos, en dólares, y vende acá en quetzales. Antes la
  // conversión existía sólo en el modo Amazon y en foto/manual se pedía el costo "en Q":
  // parado en la tienda con el precio en dólares enfrente, escribía 100 y el sistema
  // guardaba Q100 en vez de Q829 — para siempre, porque ese número es la única fuente
  // de costo del módulo. La moneda ahora es explícita y la cuenta es la misma en los
  // tres modos; sólo el flete distingue al que se pidió por Amazon para este viaje.
  const brokenFx = !(config.exchangeRate > 0);

  // Sin flete: el costo es el precio pagado en USA más su impuesto, pasado a quetzales.
  // El prorrateo de maleta/caja existe en el motor, pero pedir peso o medidas mientras
  // se publica en vivo cuesta más de lo que aporta hasta que haya una maleta cargada.
  const result = useMemo(() => calculate(config, {
    priceUsd: num(priceUsd),
    weightLbs: 0, dims: { l: 0, w: 0, h: 0 },
    taxPct: applyTax ? num(taxPct) : 0,
    profitMode: 'markup', markupPct: config.defaultMarkupPct, fixedSaleGtq: 0,
  }), [config, priceUsd, taxPct, applyTax]);

  // Lo que se guarda es el número verde, nunca lo tecleado.
  const costFinal = result.totalCostGtq;
  const saleGtq = num(priceGtq);
  const profit = costFinal > 0 && saleGtq > 0 ? round2(saleGtq - costFinal) : null;

  // Los precios se sugieren desde el precio que deja TU ganancia, no desde el costo:
  // sugerirlos desde el costo proponía vender casi al costo (Q899.99 sobre Q898) y el
  // primero se autocargaba en el campo, así que el default del formulario era ese.
  const suggestions = useMemo(
    () => (costFinal > 0 ? suggestPrices(costFinal * (1 + Math.max(0, config.defaultMarkupPct) / 100)) : []),
    [costFinal, config.defaultMarkupPct],
  );

  const doScrape = useCallback(async (url: string) => {
    const raw = url.trim();
    if (!raw || scrapingRef.current) return;
    // El botón «Compartir» de la app de Amazon da un a.co/d/…, muchas veces con texto
    // alrededor. Antes se exigía la palabra "amazon" y esos links se descartaban en
    // silencio: el dueño pegaba y tocaba buscar sin que pasara absolutamente nada.
    if (!isAmazonLink(raw)) {
      onError('Ese enlace no parece de Amazon. Pegá el link del producto.');
      return;
    }
    scrapingRef.current = true;
    setScraping(true);
    try {
      const p = await shopperAmazonService.scrape(raw);
      if (p.name) setTitle(p.name);
      if (p.description) setDescription(p.description);
      if (p.image_url) setImageUrl(p.image_url);
      if (p.price_usd != null) setPriceUsd(String(p.price_usd));
      setAmazonMeta({ url: p.url, asin: p.asin });
    } catch (e) {
      onError(errMsg(e) ?? 'No se pudo leer ese enlace de Amazon.');
    } finally {
      scrapingRef.current = false;
      setScraping(false);
    }
  }, [onError]);

  const onPhoto = async (f: File | null) => {
    if (!f) return;
    try {
      // El tope de bytes no es cosmético: la foto viaja como data URI dentro del JSON
      // del producto, y el request entero tiene que caber en el límite de body del proxy.
      setImageUrl(await fileToResizedDataUrl(f, {
        maxSize: 720, quality: 0.7, maxBytes: 120_000, photo: true,
      }));
    } catch {
      onError('No se pudo procesar la foto.');
    }
  };

  // Publicar sin costo es publicar a ciegas: el módulo entero existe para decirle al
  // dueño cuánto ganó, y sin este dato los reportes le imputan un costo supuesto y le
  // muestran una utilidad que es aritmética del supuesto, no plata medida.
  const canSave = title.trim().length > 0 && saleGtq > 0 && costFinal > 0;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const madeToOrder = isLive ? false : !inHand;
      await svc.create({
        title: title.trim(),
        description: description || null,
        category: category.trim() || null,
        price_gtq: saleGtq,
        // El costo en dólares es el hecho que tecleó: sin él, cambiar el tipo de cambio
        // en Ajustes reescribiría la historia de lo que pagó.
        price_usd: num(priceUsd) || null,
        is_made_to_order: madeToOrder,
        stock_total: madeToOrder ? 1 : Math.max(1, qty),
        is_published: true,
        is_offer: isOffer,
        compare_at_price_gtq: isOffer && num(compareAt) > 0 ? num(compareAt) : null,
        listing,
        expires_at: !isLive ? new Date(Date.now() + days * 86400000).toISOString() : null,
        amazon_url: amazonMeta.url || null,
        amazon_asin: amazonMeta.asin || null,
        image_url: imageUrl,
        source: mode,
        // Siempre snapshot, nunca un número suelto: guarda de dónde salió el costo
        // (tax, tipo de cambio, flete) para que el reporte siga siendo auditable
        // aunque mañana cambien los ajustes.
        calc: toSnapshot(config, result, false),
      });
      reset();
      onCreated();
    } catch (e) {
      // 413 = el proxy cortó el request por tamaño; 422 con una foto pasada de tope es
      // el mismo problema visto por el backend. Lo único que puede pesar así es la foto,
      // y sin decirlo el dueño reintenta el mismo producto para siempre.
      const status = (e as { response?: { status?: number } })?.response?.status;
      const heavyPhoto = status === 413
        || (status === 422 && (imageUrl?.length ?? 0) > 250_000);
      onError(heavyPhoto
        ? 'La foto pesa demasiado. Probá con otra o publicá sin foto.'
        : errMsg(e) ?? 'No se pudo publicar el producto.');
    } finally {
      setSaving(false);
    }
  };

  const showQty = isLive || inHand;

  // El footer es lo único que se ve siempre: que cargue el número de la decisión vale
  // más que cualquier otro centímetro del panel. Y leer "Perdés Q129" justo antes de
  // tocar frena mejor que un botón muerto — vender a pérdida a veces es a propósito.
  const ctaHint = costFinal <= 0 ? 'Falta cuánto te costó'
    : saleGtq <= 0 ? 'Falta el precio de venta'
    : profit != null && profit < 0 ? `⚠️ Perdés ${fmtGTQ(Math.abs(profit))}`
    : profit != null ? `Ganás ${fmtGTQ(profit)}` : null;

  return (
    <BottomSheet open={open} onClose={onClose} title={isLive ? 'Publicar en vivo ⚡' : 'Agregar al catálogo'}
      footer={
        <button onClick={save} disabled={!canSave || saving}
          className="w-full h-14 rounded-2xl bg-nodo-primary text-nodo-on-primary font-black active:scale-[0.97] transition-transform disabled:opacity-30 flex flex-col items-center justify-center leading-none gap-0.5">
          <span className="flex items-center gap-2 text-[15px] tracking-wide">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
            {isLive ? 'PUBLICAR A LA VENTA' : 'PUBLICAR EN CATÁLOGO'}
          </span>
          {ctaHint && <span className="text-[11px] font-bold tabular-nums">{ctaHint}</span>}
        </button>
      }>
      <div className="flex flex-col gap-4">
        <SegmentedControl<CreateMode>
          options={[
            { value: 'foto',   label: 'Foto',   icon: <Camera size={14} /> },
            { value: 'amazon', label: 'Amazon', icon: <Link2 size={14} /> },
            { value: 'manual', label: 'Manual', icon: <PencilLine size={14} /> },
          ]}
          value={mode} onChange={setMode} />

        {mode === 'amazon' && (
          <div className="flex gap-2">
            <input value={amazonUrl}
              onChange={e => setAmazonUrl(e.target.value)}
              onBlur={() => amazonUrl && doScrape(amazonUrl)}
              placeholder="Pega el link de Amazon…" className="nodo-input flex-1" inputMode="url" />
            <button onClick={() => doScrape(amazonUrl)} disabled={scraping || !amazonUrl}
              className="h-12 px-4 rounded-2xl bg-nodo-ink text-nodo-canvas font-bold active:scale-95 transition-transform disabled:opacity-40 flex items-center gap-1.5">
              {scraping ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            </button>
          </div>
        )}

        {/* Con la foto ya tomada el recuadro grande no informa nada y empuja la cuenta
            fuera de pantalla justo cuando importa: se encoge a una miniatura. */}
        {mode === 'foto' && (imageUrl ? (
          <div className="flex items-center gap-3">
            <img src={imageUrl} className="w-24 h-24 rounded-2xl object-cover shrink-0" alt="" />
            <button onClick={() => fileRef.current?.click()}
              className="nodo-btn-secondary !h-11 flex items-center gap-2">
              <Camera size={16} /> Cambiar foto
            </button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()}
            className="h-44 rounded-2xl border-2 border-dashed border-nodo-line bg-nodo-inset flex flex-col items-center justify-center gap-2 text-nodo-sub active:scale-[0.98] transition-transform overflow-hidden">
            <Camera size={30} /><span className="text-sm font-bold">Tomar o subir foto</span><span className="text-[11px] text-nodo-dim">Cámara o galería del teléfono</span>
          </button>
        ))}
        {/* Sin `capture`: el teléfono ofrece cámara O galería (subir una foto existente). */}
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={e => onPhoto(e.target.files?.[0] || null)} />

        {(mode !== 'amazon' || title) && (
          <>
            {mode === 'amazon' && imageUrl && (
              <img src={imageUrl} className="w-24 h-24 rounded-xl object-cover mx-auto" alt="" />
            )}
            <div>
              <label className="nodo-label">Nombre</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nombre del producto" className="nodo-input" />
            </div>
            {/* En vivo un producto dura lo que dura la venta: nadie lo filtra por
                categoría, y son 89px que la cuenta necesita más. */}
            {!isLive && (
              <div>
                <label className="nodo-label">Categoría (opcional)</label>
                <input value={category} onChange={e => setCategory(e.target.value)} placeholder="ej. Belleza, Tecnología" className="nodo-input" />
              </div>
            )}

            {/* ── La cuenta ─────────────────────────────────────────────────────
                Lo que pagaste va en dólares, y el costo en quetzales aparece en
                verde apenas soltás el número: es el que hay que restarle al precio
                de venta, y verlo debajo del campo lo deja claro sin explicarlo. */}
            <div className="nodo-card p-4">
              <label className="nodo-label">
                {mode === 'amazon' ? '¿Cuánto cuesta allá? (dólares)' : '¿Cuánto te costó? (dólares)'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-black text-nodo-ink pointer-events-none">$</span>
                <input value={priceUsd} onChange={e => setPriceUsd(e.target.value)} disabled={scraping}
                  inputMode="decimal" placeholder="0.00" className="nodo-input-number nodo-input-prefixed" />
              </div>

              {/* El costo real, en la moneda en la que vende. */}
              {costFinal > 0 && !scraping && (
                <p aria-live="polite"
                  className="text-[26px] font-black tabular-nums tracking-tight leading-none text-nodo-success-tx mt-2">
                  {fmtGTQ(costFinal)}
                  <span className="text-[11px] font-bold text-nodo-sub ml-2 tracking-normal">
                    te cuesta{applyTax ? ' con impuesto' : ''}
                  </span>
                </p>
              )}

              {brokenFx ? (
                <p className="text-[11px] font-bold text-nodo-warn-tx mt-2">
                  Falta el tipo de cambio en Ajustes: sin eso no puedo pasarlo a quetzales.
                </p>
              ) : (
                <div className="flex items-center gap-2 mt-2">
                  <button type="button" role="switch" aria-checked={applyTax}
                    onClick={() => { haptic.tap(); setApplyTax(v => !v); }}
                    className={`flex items-center gap-2 h-9 pl-1 pr-3 rounded-full border transition-colors ${applyTax ? 'bg-nodo-primary-soft border-nodo-primary' : 'bg-nodo-inset border-nodo-line'}`}>
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${applyTax ? 'bg-nodo-primary text-nodo-on-primary' : 'bg-nodo-card text-nodo-dim'}`}>
                      {applyTax ? <Check size={14} /> : <X size={14} />}
                    </span>
                    <span className={`text-xs font-bold ${applyTax ? 'text-nodo-ink' : 'text-nodo-sub'}`}>Sumar impuesto</span>
                  </button>
                  {/* El impuesto es del estado donde compró, no del dueño: New Hampshire
                      cobra 0 y California 9.5. Se edita donde se lee y se guarda con el ítem. */}
                  {applyTax && (
                    <div className="flex items-center gap-1">
                      <input value={taxPct} onChange={e => setTaxPct(e.target.value)} inputMode="decimal"
                        aria-label="Impuesto de esta compra en porcentaje"
                        className="w-12 h-9 px-1 text-center rounded-xl bg-nodo-inset border border-nodo-line text-nodo-ink font-bold tabular-nums" />
                      <span className="text-xs font-bold text-nodo-sub">%</span>
                    </div>
                  )}
                  <span className="text-[11px] font-semibold text-nodo-dim ml-auto tabular-nums">
                    $1 = {fmtGTQ(config.exchangeRate)}
                  </span>
                </div>
              )}

              <label className="nodo-label mt-4 block">¿A cuánto lo vendés? (quetzales)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-black text-nodo-ink pointer-events-none">Q</span>
                <input value={priceGtq} onChange={e => setPriceGtq(e.target.value)}
                  inputMode="decimal" placeholder="0.00" className="nodo-input-number nodo-input-prefixed" />
              </div>

              {/* Se ofrecen mientras no hay precio, y no se autocompleta ninguno: llenar
                  el campo solo hacía publicar una cifra que el dueño nunca eligió. */}
              {saleGtq <= 0 && suggestions.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {suggestions.map(s => (
                    <button key={s} onClick={() => { haptic.tap(); setPriceGtq(String(s)); }}
                      className="px-3 h-11 rounded-xl text-sm font-black tabular-nums bg-nodo-inset border border-nodo-line text-nodo-ink active:scale-95 transition-transform">
                      {fmtGTQ(s)}
                    </button>
                  ))}
                </div>
              )}

              <Verdict cost={costFinal} sale={saleGtq} qty={showQty ? qty : 1}
                goalPct={config.defaultMarkupPct} />
            </div>

            {/* Cantidad / disponibilidad */}
            {!isLive && (
              <div className="flex items-center gap-2 flex-wrap">
                <TogglePill active={inHand} onClick={() => setInHand(v => !v)} label={inHand ? '📦 Tengo en mano' : '🛒 Por encargo'} />
                <TogglePill active={isOffer} onClick={() => setIsOffer(v => !v)} label="🔥 Oferta" />
              </div>
            )}
            {isLive && (
              <div className="flex items-center gap-2 flex-wrap">
                <TogglePill active={isOffer} onClick={() => setIsOffer(v => !v)} label="🔥 Oferta" />
              </div>
            )}

            {showQty && (
              <div className="flex items-center justify-between rounded-nodo-md border border-nodo-line p-3 bg-nodo-inset">
                <div>
                  <p className="text-sm font-black text-nodo-ink">¿Cuántas tenés?</p>
                  <p className="text-[11px] text-nodo-sub">Cuando se aparten todas, se marca agotado</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-xl bg-nodo-card border border-nodo-line flex items-center justify-center text-nodo-ink active:scale-90 transition-transform">
                    <Minus size={16} />
                  </button>
                  <span className="w-10 text-center text-lg font-black text-nodo-ink tabular-nums">{qty}</span>
                  <button onClick={() => setQty(q => q + 1)}
                    className="w-10 h-10 rounded-xl bg-nodo-primary flex items-center justify-center text-nodo-on-primary active:scale-90 transition-transform">
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            )}

            {!isLive && (
              <div>
                <label className="nodo-label">¿Por cuántos días lo mostrás?</label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 3, 7, 14].map(d => (
                    <button key={d} onClick={() => { haptic.tap(); setDays(d); }}
                      className={`h-11 rounded-2xl text-xs font-black active:scale-95 transition-transform ${days === d ? 'bg-nodo-primary text-nodo-on-primary' : 'bg-nodo-inset text-nodo-sub border border-nodo-line'}`}>
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isOffer && (
              <div>
                <label className="nodo-label">Precio de antes (sale tachado)</label>
                <input value={compareAt} onChange={e => setCompareAt(e.target.value)} inputMode="decimal" placeholder="0.00" className="nodo-input-number" />
              </div>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}

// ── Registrar una venta a mano ─────────────────────────────────────────────────
// "Alguien me escribió por otro lado y le vendí". Sin esto esa venta no existe para
// el sistema: ni descuenta stock, ni cuenta en "Cómo te fue", ni el cliente puede
// seguir su pedido. El estado arranca en "Confirmado" porque el caso normal es que
// la venta YA está cerrada cuando el dueño la teclea.
function ManualSaleSheet({ open, onClose, items, onSaved, onError }: {
  open: boolean; onClose: () => void; items: ShopperCatalogItem[];
  onSaved: () => Promise<void>; onError: (m: string) => void;
}) {
  const [itemId, setItemId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [qty, setQty] = useState(1);
  const [status, setStatus] = useState<ShopperResStatus>('confirmada');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) { setItemId(''); setName(''); setPhone(''); setQty(1); setStatus('confirmada'); setSearch(''); }
  }, [open]);

  const sellable = useMemo(
    () => items.filter(i => i.is_active).filter(i =>
      !search.trim() || i.title.toLowerCase().includes(search.trim().toLowerCase())),
    [items, search],
  );
  const picked = items.find(i => i.id === itemId) || null;
  const valid = !!picked && name.trim().length > 0 && phone.replace(/\D/g, '').length >= 8 && qty >= 1;

  const save = async () => {
    if (!valid || !picked) return;
    setSaving(true);
    try {
      await svc.createManualSale({
        catalog_item_id: picked.id, client_name: name.trim(), client_phone: phone.trim(),
        quantity: qty, status,
      });
      await onSaved();
      haptic.done();
      onClose();
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      onError(typeof d === 'string' ? d : 'No se pudo registrar la venta.');
    } finally { setSaving(false); }
  };

  const STEPS: { v: ShopperResStatus; label: string }[] = [
    { v: 'confirmada', label: 'Se lo aparté' },
    { v: 'comprada', label: 'Ya lo compré' },
    { v: 'entregada', label: 'Ya lo entregué' },
  ];

  return (
    <BottomSheet open={open} onClose={onClose} title="Registrar una venta"
      footer={
        <button onClick={save} disabled={!valid || saving}
          className="w-full h-14 rounded-2xl bg-nodo-primary text-nodo-on-primary font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2">
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} GUARDAR VENTA
        </button>
      }>
      <div className="flex flex-col gap-4">
        <p className="text-sm font-semibold text-nodo-sub">
          ¿Te compraron por WhatsApp o en persona? Anotalo acá para que descuente del
          inventario y te cuente en tus ganancias.
        </p>

        <div>
          <label className="nodo-label">¿Qué producto?</label>
          {items.length === 0 ? (
            <p className="text-xs font-bold text-nodo-warn-tx">Primero publicá un producto.</p>
          ) : (
            <>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar producto…" className="nodo-input mb-2" />
              <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto">
                {sellable.map(i => (
                  <button key={i.id} onClick={() => { haptic.tap(); setItemId(i.id); }}
                    className={`flex items-center gap-2.5 p-2 rounded-2xl border text-left active:scale-[0.99] transition-transform
                      ${itemId === i.id ? 'border-nodo-primary bg-nodo-primary-soft' : 'border-nodo-line bg-nodo-inset'}`}>
                    {i.image_url
                      ? <img src={i.image_url} className="w-9 h-9 rounded-lg object-cover shrink-0" alt="" />
                      : <div className="w-9 h-9 rounded-lg bg-nodo-card flex items-center justify-center text-nodo-dim shrink-0"><Package size={14} /></div>}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-nodo-ink truncate">{i.title}</p>
                      <p className="text-[11px] font-bold text-nodo-sub tabular-nums">
                        {i.price_gtq != null ? fmtGTQ(i.price_gtq) : 'sin precio'}
                        {!i.is_made_to_order && ` · quedan ${i.stock_available}`}
                      </p>
                    </div>
                    {itemId === i.id && <Check size={16} className="text-nodo-primary shrink-0" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="nodo-label">¿Quién te compró?</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre" className="nodo-input" />
          </div>
          <div>
            <label className="nodo-label">Su WhatsApp</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="5512 3456" className="nodo-input" inputMode="tel" />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-nodo-md border border-nodo-line p-3 bg-nodo-inset">
          <p className="text-sm font-black text-nodo-ink">¿Cuántos se llevó?</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setQty(q => Math.max(1, q - 1))}
              className="w-10 h-10 rounded-xl bg-nodo-card border border-nodo-line flex items-center justify-center text-nodo-ink active:scale-90 transition-transform">
              <Minus size={16} />
            </button>
            <span className="w-10 text-center text-lg font-black text-nodo-ink tabular-nums">{qty}</span>
            <button onClick={() => setQty(q => q + 1)}
              className="w-10 h-10 rounded-xl bg-nodo-primary flex items-center justify-center text-nodo-on-primary active:scale-90 transition-transform">
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div>
          <label className="nodo-label">¿En qué va?</label>
          <div className="grid grid-cols-3 gap-2">
            {STEPS.map(s => (
              <button key={s.v} onClick={() => { haptic.tap(); setStatus(s.v); }}
                className={`h-12 rounded-2xl text-[11px] font-black px-1 active:scale-95 transition-transform ${status === s.v ? 'bg-nodo-primary text-nodo-on-primary' : 'bg-nodo-inset text-nodo-sub border border-nodo-line'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {picked && picked.price_gtq != null && (
          <div className="rounded-2xl bg-nodo-primary-soft p-3 flex items-center justify-between">
            <span className="text-xs font-bold text-nodo-sub">Total de esta venta</span>
            <span className="text-lg font-black text-nodo-ink tabular-nums">{fmtGTQ(picked.price_gtq * qty)}</span>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

// ── Histórico de ventas en vivo ────────────────────────────────────────────────
function SaleHistorySheet({ open, onClose, flash }: {
  open: boolean; onClose: () => void; flash: (k: 'ok' | 'err', m: string) => void;
}) {
  const [rows, setRows] = useState<ShopperStoreSession[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await svc.listStoreSessions()); }
    catch { setRows([]); flash('err', 'No se pudo cargar el histórico.'); }
  }, [flash]);
  useEffect(() => { if (open) { setRows(null); void load(); } }, [open, load]);

  const remove = async (s: ShopperStoreSession) => {
    if (!confirm('¿Quitar esta venta de la lista? Tus pedidos y tu dinero no se tocan.')) return;
    setBusy(s.id);
    try { await svc.deleteStoreSession(s.id); await load(); flash('ok', 'Quitada de la lista'); }
    catch { flash('err', 'No se pudo quitar.'); }
    finally { setBusy(null); }
  };

  const fmtDay = (iso: string) => {
    const ms = toMs(iso);
    return ms == null ? '' : new Date(ms).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const fmtSpan = (s: ShopperStoreSession) => {
    const a = toMs(s.opened_at), b = toMs(s.closed_at);
    if (a == null) return '';
    const t = (ms: number) => new Date(ms).toLocaleTimeString('es-GT', { hour: 'numeric', minute: '2-digit' });
    return b == null ? `${t(a)} · en curso` : `${t(a)} – ${t(b)}`;
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Tus ventas anteriores">
      <div className="flex flex-col gap-3">
        {rows == null && <div className="nodo-spinner-container"><Loader2 className="w-8 h-8 animate-spin text-nodo-sub" /></div>}
        {rows?.length === 0 && (
          <div className="nodo-empty-state py-10">
            <History size={30} className="text-nodo-dim mb-2" />
            <p className="text-sm font-bold text-nodo-ink">Todavía no cerraste ninguna venta</p>
            <p className="text-xs text-nodo-sub mt-1">Cuando abrás y cerrés una, queda guardada acá</p>
          </div>
        )}
        {rows?.map(s => {
          const live = s.closed_at == null;
          return (
            <div key={s.id} className="nodo-card overflow-hidden">
              {s.banner_url && (
                <div className="h-20 w-full relative">
                  <img src={s.banner_url} className="w-full h-full object-cover" alt="" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                </div>
              )}
              <div className="p-3 flex flex-col gap-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-nodo-ink truncate">
                      {s.store_name || 'Venta en vivo'} {live && '🔴'}
                    </p>
                    <p className="text-[11px] font-semibold text-nodo-sub">{fmtDay(s.opened_at)} · {fmtSpan(s)}</p>
                  </div>
                  {!live && (
                    <button onClick={() => remove(s)} disabled={busy === s.id}
                      className="w-8 h-8 rounded-lg bg-nodo-inset text-nodo-sub flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40 shrink-0">
                      {busy === s.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  )}
                </div>

                {s.reservations === 0 ? (
                  <p className="text-[12px] font-semibold text-nodo-dim">Nadie apartó nada esta vez.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-nodo-success-bg p-2.5">
                        <p className="text-[9px] font-bold text-nodo-success-tx/80 uppercase tracking-wide">Ya ganaste</p>
                        <p className="text-base font-black text-nodo-success-tx tabular-nums leading-tight">{fmtGTQ(s.delivered_profit_gtq)}</p>
                        <p className="text-[10px] font-bold text-nodo-success-tx/70 tabular-nums">
                          {s.delivered_units} entregado{s.delivered_units === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="rounded-xl bg-nodo-inset p-2.5">
                        <p className="text-[9px] font-bold text-nodo-sub uppercase tracking-wide">Te apartaron</p>
                        <p className="text-base font-black text-nodo-ink tabular-nums leading-tight">{fmtGTQ(s.revenue_gtq)}</p>
                        <p className="text-[10px] font-bold text-nodo-sub tabular-nums">
                          {s.units} prod. · {s.clients} {s.clients === 1 ? 'persona' : 'personas'}
                        </p>
                      </div>
                    </div>
                    {s.top_title && (
                      <p className="text-[11px] font-semibold text-nodo-sub truncate">
                        🏆 Lo más pedido: <span className="font-black text-nodo-ink">{s.top_title}</span> ({s.top_units})
                      </p>
                    )}
                    {s.cancelled_lines > 0 && (
                      <p className="text-[11px] font-semibold text-nodo-dim">
                        {s.cancelled_lines} pedido{s.cancelled_lines === 1 ? '' : 's'} se cayó
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
}

// ── Arreglar costos faltantes ──────────────────────────────────────────────────
// El "N sin costo real" de antes era un diagnóstico sin cura. Esto es la cura: la
// lista corta de productos que rompen el número, con un campo cada uno. Guarda de a
// uno (no todo-o-nada): arreglar 3 de 5 ya deja el reporte más cerca de la verdad.
function CostFixSheet({ open, onClose, items, config, onSaved, onError }: {
  open: boolean; onClose: () => void; items: ShopperCatalogItem[]; config: CalcConfig;
  onSaved: () => Promise<void>; onError: (m: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // Reparar el costo con la misma ambigüedad de moneda que lo rompió no repara nada.
  const [ccy, setCcy] = useState<CostCurrency>('usd');
  const brokenFx = !(config.exchangeRate > 0);
  const inUsd = ccy === 'usd' && !brokenFx;
  // El costo que ya está cargado se precarga: si eran dólares, alcanza con cambiar el
  // selector y guardar. Volver a teclear un número que la pantalla ya sabe es la clase
  // de fricción por la que estos siete quedaron mal durante un mes.
  useEffect(() => {
    if (!open) return;
    setCcy(brokenFx ? 'gtq' : 'usd');
    setDrafts(Object.fromEntries(
      items.filter(i => i.calc_total_cost_gtq != null)
        .map(i => [i.id, String(i.calc_total_cost_gtq)]),
    ));
  }, [open, brokenFx, items]);

  const costOf = (raw: string): number => {
    const v = num(raw);
    if (v <= 0) return 0;
    return inUsd
      ? calculate(config, {
          priceUsd: v, weightLbs: 0, dims: { l: 0, w: 0, h: 0 },
          profitMode: 'markup', markupPct: 0, fixedSaleGtq: 0,
        }).totalCostGtq
      : round2(v);
  };

  const save = async (it: ShopperCatalogItem) => {
    const raw = drafts[it.id] ?? '';
    const cost = costOf(raw);
    if (cost <= 0) return;
    setBusy(it.id);
    try {
      const result = calculate(config, {
        priceUsd: num(raw), weightLbs: 0, dims: { l: 0, w: 0, h: 0 },
        profitMode: 'markup', markupPct: 0, fixedSaleGtq: 0,
      });
      await svc.update(it.id, {
        price_usd: inUsd ? num(raw) : null,
        calc: inUsd ? toSnapshot(config, result, false) : directSnapshot(config, cost),
      });
      await onSaved();
      haptic.done();
    } catch {
      onError('No se pudo guardar el costo.');
    } finally { setBusy(null); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="¿Qué te costaron?">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-nodo-sub">
          De estos productos no sabemos en qué moneda pagaste, así que su ganancia puede
          estar inflada. Decinos si fue en dólares o en quetzales y los números se
          vuelven exactos.
        </p>
        {items.length > 0 && !brokenFx && (
          <div>
            <label className="nodo-label">¿En qué los pagaste?</label>
            <SegmentedControl<CostCurrency>
              options={[
                { value: 'usd', label: `$ En Estados Unidos` },
                { value: 'gtq', label: 'Q Acá' },
              ]}
              value={ccy} onChange={setCcy} />
            {inUsd && (
              <p className="text-[11px] font-semibold text-nodo-sub mt-1.5">
                Le sumo {config.taxRate}% de impuesto y lo paso a quetzales a {fmtGTQ(config.exchangeRate)}.
              </p>
            )}
          </div>
        )}
        {items.length === 0 && (
          <div className="nodo-empty-state py-10">
            <Check size={30} className="text-nodo-success-tx mb-2" />
            <p className="text-sm font-bold text-nodo-ink">Todo tiene su costo ✓</p>
          </div>
        )}
        {items.map(it => {
          const draft = drafts[it.id] ?? '';
          const cost = costOf(draft);
          const price = it.price_gtq ?? 0;
          const profit = round2(price - cost);
          return (
            <div key={it.id} className="nodo-card p-3 flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                {it.image_url
                  ? <img src={it.image_url} className="w-12 h-12 rounded-xl object-cover shrink-0" alt="" />
                  : <div className="w-12 h-12 rounded-xl bg-nodo-inset flex items-center justify-center text-nodo-dim shrink-0"><Package size={18} /></div>}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-nodo-ink line-clamp-2 leading-tight">{it.title}</p>
                  <p className="text-[11px] font-bold text-nodo-sub tabular-nums">
                    Lo vendés a {fmtGTQ(price)}
                    {it.calc_total_cost_gtq != null && ` · tenías cargado ${it.calc_total_cost_gtq}`}
                  </p>
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <label className="nodo-label">Te costó</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-black text-nodo-ink pointer-events-none">
                      {inUsd ? '$' : 'Q'}
                    </span>
                    <input value={draft} inputMode="decimal" placeholder="0.00" className="nodo-input-number nodo-input-prefixed"
                      onChange={e => setDrafts(d => ({ ...d, [it.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') void save(it); }} />
                  </div>
                </div>
                <button onClick={() => save(it)} disabled={cost <= 0 || busy === it.id}
                  className="h-12 px-4 rounded-2xl bg-nodo-primary text-nodo-on-primary font-black active:scale-95 transition-transform disabled:opacity-30 flex items-center gap-1.5 shrink-0">
                  {busy === it.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                </button>
              </div>
              {cost > 0 && price > 0 && (
                <p className={`text-[11px] font-bold tabular-nums ${profit >= 0 ? 'text-nodo-success-tx' : 'text-nodo-danger-tx'}`}>
                  {inUsd && <span className="text-nodo-sub font-semibold">Te cuesta {fmtGTQ(cost)} · </span>}
                  {profit >= 0
                    ? `Ganás ${fmtGTQ(profit)} por cada uno`
                    : `⚠️ Perdés ${fmtGTQ(Math.abs(profit))} por cada uno`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
}

function TogglePill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-2 rounded-xl text-xs font-bold active:scale-95 transition-transform ${active ? 'bg-nodo-primary text-nodo-on-primary' : 'bg-nodo-inset text-nodo-sub border border-nodo-line'}`}>
      {label}
    </button>
  );
}

// Mensaje de WhatsApp para confirmar un apartado con el cliente (detalle corto + link).
function waConfirmLink(phone: string | null | undefined, r: ShopperReservation): string {
  const digits = (phone || '').replace(/\D/g, '');
  const total = r.item_price_gtq ? ` — ${fmtGTQ(r.item_price_gtq * r.quantity)}` : '';
  const link = orderLink(r.order_token);
  const lines = [
    `Hola ${r.client_name} 👋`,
    'Te confirmo tu apartado:',
    `• ${r.quantity}× ${r.item_title ?? 'tu producto'}${total}`,
  ];
  if (link) lines.push('', `Mirá y confirmá tu pedido acá:`, link);
  return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join('\n'))}`;
}

// ── Reservas (máquina de estados) ──────────────────────────────────────────────
// Una reserva cerrada ya no espera nada de nadie: se va con el swipe y el Deshacer.
// Las vivas y las entregadas paran en una confirmación — quitar una viva deja al
// cliente esperando algo que el dueño dejó de ver, y quitar una entregada saca plata
// ya cobrada de "Cómo te fue".
const isClosedRes = (r: ShopperReservation) =>
  r.status === 'cancelada' || r.status === 'no_disponible';

function ReservasSheet({ open, onClose, reservations, items, whatsapp, onChanged, flash, onFixCost }: {
  open: boolean; onClose: () => void; reservations: ShopperReservation[];
  items: ShopperCatalogItem[]; whatsapp?: string | null;
  onChanged: () => Promise<void>; flash: (k: 'ok' | 'err', m: string, undo?: () => void) => void;
  onFixCost: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [zoom, setZoom] = useState<{ src: string; title?: string | null } | null>(null);
  const [ask, setAsk] = useState<ShopperReservation | null>(null);
  // Mismo trato que el modo Editar del catálogo: la fila se va en pantalla y el DELETE
  // sale 6s después. El backend no tiene restore, así que el Deshacer sólo puede vivir
  // en la ventana previa a que el request salga.
  const [ghosts, setGhosts] = useState<Set<string>>(() => new Set());
  const pending = useRef<{ ids: string[]; timer: ReturnType<typeof setTimeout> } | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // `active` se renderiza ENTERA — con fantasmas incluidos — porque `nodo-row-slot`
  // necesita la fila montada para animarle la salida y para que Deshacer la devuelva.
  // `visible` es lo que ya no cuenta: alimenta el conteo, el vacío y "Limpiar cerradas".
  const active = reservations.filter(r => r.is_active);
  const visible = active.filter(r => !ghosts.has(r.id));
  const closedIds = visible.filter(isClosedRes).map(r => r.id);
  // Fallback: la reserva ya trae su propio `item_cost_gtq`; el mapa sólo cubre las
  // reservas viejas que un cliente tenga cacheadas antes de recargar.
  const costById = useMemo(
    () => new Map(items.map(i => [i.id, i.calc_total_cost_gtq ?? null])),
    [items],
  );

  const openSwipe = useRef<(() => void) | null>(null);
  const registerOpen = useCallback((close: () => void) => {
    if (openSwipe.current && openSwipe.current !== close) openSwipe.current();
    openSwipe.current = close;
  }, []);

  const move = async (r: ShopperReservation, status: string) => {
    setBusy(r.id);
    try { await svc.updateReservation(r.id, { status }); await onChanged(); }
    catch { flash('err', 'No se pudo actualizar la reserva.'); }
    finally { setBusy(null); }
  };

  const flushDelete = useCallback(async () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    // De a 4, como el borrado del catálogo: una tanda entera en paralelo pega contra
    // el rate-limit desde el celular.
    const fails: string[] = [];
    for (let i = 0; i < p.ids.length; i += 4) {
      const chunk = p.ids.slice(i, i + 4);
      const r = await Promise.allSettled(chunk.map(id => svc.deleteReservation(id)));
      r.forEach((x, k) => { if (x.status === 'rejected') fails.push(chunk[k]); });
    }
    if (!alive.current) return;
    // Recargar ANTES de soltar el fantasma: al revés hay una ventana en la que la línea
    // ya borrada sigue en `reservations` y nada la tapa, así que reaparece y parpadea.
    await onChanged();
    setGhosts(prev => { const n = new Set(prev); p.ids.forEach(id => n.delete(id)); return n; });
    if (fails.length) flash('err', `No se pudo quitar ${fails.length}. Siguen en tu bandeja.`);
  }, [onChanged, flash]);

  // Cerrar el panel o mandar la app a background confirma lo pendiente: el dueño ya
  // decidió. Si iOS mata la pestaña antes, la reserva simplemente sigue viva.
  useEffect(() => { if (!open) { openSwipe.current = null; void flushDelete(); } }, [open, flushDelete]);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flushDelete(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); void flushDelete(); };
  }, [flushDelete]);

  const commitDelete = useCallback((ids: string[], msg: string) => {
    if (!ids.length) return;
    void flushDelete();                     // nunca dos lotes en vuelo
    setGhosts(prev => new Set([...prev, ...ids]));
    setAsk(null);
    haptic.confirm();
    const timer = setTimeout(() => { void flushDelete(); }, 6000);
    pending.current = { ids, timer };
    flash('ok', msg, () => {
      clearTimeout(timer);
      pending.current = null;
      setGhosts(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
      haptic.tap();
      flash('ok', 'Listo, sigue en tu bandeja');
    });
  }, [flushDelete, flash]);

  // La fila que pide confirmación quedó deslizada: si el dueño dice «Dejarla» hay que
  // devolverla a su lugar, o se queda corrida y parece borrada sin estarlo.
  const askRow = useRef<(() => void) | null>(null);
  const requestDelete = useCallback((r: ShopperReservation, closeRow: () => void) => {
    if (isClosedRes(r)) { commitDelete([r.id], 'Reserva quitada'); return; }
    haptic.reject();
    askRow.current = closeRow;
    setAsk(r);
  }, [commitDelete]);
  const dismissAsk = useCallback(() => {
    askRow.current?.(); askRow.current = null; setAsk(null);
  }, []);

  const askSale = ask?.item_price_gtq != null ? ask.item_price_gtq * ask.quantity : null;

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title="Reservas">
        {zoom && <ImageLightbox src={zoom.src} title={zoom.title} onClose={() => setZoom(null)} />}
        {visible.length === 0 ? (
          <div className="nodo-empty-state py-10"><Bell size={30} className="text-nodo-dim mb-2" /><p className="text-sm font-bold text-nodo-ink">Todavía nadie te apartó nada</p></div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="nodo-section-label !mb-0">
                {visible.length} en tu bandeja
                <span className="ml-1.5 font-semibold normal-case tracking-normal text-nodo-sub">
                  deslizá para quitar
                </span>
              </p>
              {closedIds.length > 0 && (
                <button
                  onClick={() => commitDelete(
                    closedIds,
                    closedIds.length === 1 ? 'Reserva quitada' : `${closedIds.length} reservas quitadas`,
                  )}
                  className="shrink-0 text-[11px] font-black text-nodo-danger-tx flex items-center gap-1 active:scale-95 transition-transform">
                  <Trash2 size={12} /> Limpiar {closedIds.length} cerrada{closedIds.length === 1 ? '' : 's'}
                </button>
              )}
            </div>
            <div>
              {active.map(r => (
                <div key={r.id} className="nodo-row-slot" data-out={ghosts.has(r.id) ? '1' : undefined}>
                  <div>
                    <ReservaRow
                      r={r} unitCost={r.item_cost_gtq ?? costById.get(r.catalog_item_id) ?? null}
                      whatsapp={whatsapp} busy={busy === r.id}
                      onMove={move} onZoom={setZoom} onFixCost={onFixCost}
                      onDelete={requestDelete} registerOpen={registerOpen} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </BottomSheet>

      {/* Confirmación de las delicadas: lo que se pierde, dicho con nombre y apellido.
          La salida segura es la que se ve; quitar es texto. En una confirmación
          destructiva el bloque sólido tiene que ser el "no". */}
      <BottomSheet open={!!ask} onClose={dismissAsk} title="Ojo con esta"
        footer={ask ? (
          <div className="flex flex-col gap-2">
            <button onClick={dismissAsk} className="nodo-btn-primary">
              Dejarla
            </button>
            <button onClick={() => commitDelete([ask.id], 'Reserva quitada')}
              className="h-12 w-full rounded-2xl text-sm font-black text-nodo-danger-tx active:scale-95 transition-transform">
              Quitarla igual
            </button>
          </div>
        ) : null}>
        {ask && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-nodo-sub">
              {ask.status === 'entregada'
                ? `Esta ya se la entregaste a ${ask.client_name}. Si la quitás, esa venta sale de «Cómo te fue» y la unidad vuelve a tu inventario. Sirve para borrar algo que cargaste por error, no para archivar una venta de verdad.`
                : `${ask.client_name} está esperando este producto. Si la quitás desaparece de tu bandeja y también del pedido que ${ask.client_name} ve, y la unidad vuelve a quedar disponible. Avisale antes por WhatsApp.`}
            </p>
            <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-nodo-warn-bg">
              <AlertTriangle size={15} className="text-nodo-warn-tx shrink-0" />
              <p className="flex-1 text-[13px] font-bold text-nodo-warn-tx line-clamp-1">
                {ask.quantity}× {ask.item_title}
              </p>
              {askSale != null && (
                <span className="text-[11px] font-black text-nodo-warn-tx tabular-nums">{fmtGTQ(askSale)}</span>
              )}
            </div>
            {whatsapp && ask.status !== 'entregada' && (
              <a href={waConfirmLink(ask.client_phone, ask)} target="_blank" rel="noopener"
                className="h-11 rounded-2xl bg-nodo-success-bg text-nodo-success-tx text-sm font-black flex items-center justify-center gap-2 active:scale-95 transition-transform">
                <MessageCircle size={16} /> Avisarle por WhatsApp
              </a>
            )}
          </div>
        )}
      </BottomSheet>
    </>
  );
}

// Fila de reserva: el gesto del correo. Deslizar revela «Quitar». Una reserva cerrada se
// va con el gesto; una viva o entregada sólo queda abierta y se confirma con el botón.
// El tap con el swipe abierto cierra en vez de disparar la acción de abajo — si no, el
// dedo que va a cerrar termina cambiando un estado.
function ReservaRow({ r, unitCost, whatsapp, busy, onMove, onZoom, onDelete, onFixCost, registerOpen }: {
  r: ShopperReservation; unitCost: number | null; whatsapp?: string | null; busy: boolean;
  onMove: (r: ShopperReservation, status: string) => void;
  onZoom: (z: { src: string; title?: string | null }) => void;
  onDelete: (r: ShopperReservation, closeRow: () => void) => void;
  onFixCost: () => void;
  registerOpen: (close: () => void) => void;
}) {
  const { rowRef, onPointerDown, onPointerMove, onPointerUp, close, isOpen } =
    useSwipeDelete(() => onDelete(r, close), registerOpen, isClosedRes(r));
  const meta = RES_META[r.status];
  const idx = FLOW.indexOf(r.status);
  const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;
  const sale = r.item_price_gtq != null ? r.item_price_gtq * r.quantity : null;
  const cost = unitCost != null ? unitCost * r.quantity : null;

  return (
    <div className="relative overflow-hidden rounded-[20px] bg-nodo-danger-tx">
      {/* Capa revelada por el swipe — estática, no anima */}
      <button onClick={() => onDelete(r, close)} aria-label="Quitar de la bandeja"
        className="absolute inset-y-0 right-0 w-[88px] flex flex-col items-center justify-center gap-0.5 text-[color:var(--nodo-on-danger)]">
        <Trash2 size={18} />
        <span className="text-[10px] font-black uppercase tracking-wide">Quitar</span>
      </button>

      <div ref={rowRef}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onClickCapture={e => { if (isOpen()) { e.preventDefault(); e.stopPropagation(); close(); } }}
        className="relative bg-nodo-card border border-nodo-line rounded-[20px] shadow-sm p-3 flex flex-col gap-2.5 select-none"
        style={{ touchAction: 'pan-y' }}>
        <div className="flex items-center gap-3">
          {r.item_image_url
            ? <button onClick={() => onZoom({ src: r.item_image_url!, title: r.item_title })}
                className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 active:scale-95 transition-transform group">
                <img src={r.item_image_url} className="w-full h-full object-cover" alt="" draggable={false} />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-active:bg-black/25 transition-colors">
                  <Maximize2 size={13} className="text-white opacity-0 group-active:opacity-100" />
                </span>
              </button>
            : <div className="w-12 h-12 rounded-xl bg-nodo-inset flex items-center justify-center text-nodo-dim shrink-0"><Package size={18} /></div>}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-nodo-ink truncate">{r.item_title}</p>
            {/* Más de una unidad cambia lo que hay que comprar y lo que hay que cobrar:
                se marca, no se deduce de un "2u" gris del mismo tamaño que el nombre. */}
            <p className="text-xs text-nodo-sub truncate flex items-center gap-1.5">
              <span className="truncate">{r.client_name}</span>
              {r.quantity > 1 && (
                <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-nodo-ink text-nodo-canvas font-black text-[10px] tabular-nums">
                  ×{r.quantity}
                </span>
              )}
            </p>
            {sale != null && (
              <p className="text-[11px] font-bold tabular-nums mt-0.5">
                <span className="text-nodo-ink">Venta {fmtGTQ(sale)}</span>
                {cost != null
                  ? <span className="text-nodo-sub"> · Costo {fmtGTQ(cost)}</span>
                  : <>
                      {' · '}
                      {/* Antes era un reproche sin salida. Ahora es la puerta al arreglo. */}
                      <button onClick={onFixCost}
                        className="text-nodo-warn-tx underline underline-offset-2 active:scale-95 transition-transform">
                        poner lo que costó
                      </button>
                    </>}
              </p>
            )}
          </div>
          <span className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-black ${meta.cls}`}>{meta.emoji} {meta.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {r.item_amazon_url && (
            <a href={r.item_amazon_url} target="_blank" rel="noopener" draggable={false}
              className="h-9 px-3 rounded-xl bg-nodo-pastel-yellow text-amber-700 dark:text-amber-300 text-xs font-black flex items-center gap-1 active:scale-95">
              <Tag size={13} /> Comprar
            </a>
          )}
          {whatsapp && (
            <a href={waConfirmLink(r.client_phone, r)} target="_blank" rel="noopener" draggable={false}
              className="h-9 px-3 rounded-xl bg-nodo-success-bg text-nodo-success-tx text-xs font-black flex items-center gap-1 active:scale-95">
              <MessageCircle size={15} /> Confirmar
            </a>
          )}
          <div className="flex-1" />
          {!['entregada', 'cancelada', 'no_disponible'].includes(r.status) && (
            <button onClick={() => onMove(r, 'cancelada')} disabled={busy}
              className="h-9 px-3 rounded-xl bg-nodo-inset text-nodo-sub text-xs font-bold active:scale-95 disabled:opacity-40">
              <X size={14} />
            </button>
          )}
          {next && (
            <button onClick={() => onMove(r, next)} disabled={busy}
              className="h-9 px-3 rounded-xl bg-nodo-primary text-nodo-on-primary text-xs font-black flex items-center gap-1 active:scale-95 disabled:opacity-40">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <>{RES_META[next].emoji} {RES_META[next].label} <ArrowRight size={13} /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ajustes (calculadora + catálogo) ───────────────────────────────────────────
function SettingsSheet({ open, onClose, settings, calc, onSaved, onError }: {
  open: boolean; onClose: () => void; settings: ShopperCatalogSettings; calc: ShopperCalcSettings;
  onSaved: () => Promise<void>; onError: (m: string) => void;
}) {
  const [tab, setTab] = useState<'calc' | 'negocio'>('calc');
  const [saving, setSaving] = useState(false);

  const [freight, setFreight] = useState<FreightMode>(calc.freight_mode);
  const [exchange, setExchange] = useState(String(calc.exchange_rate));
  const [tax, setTax] = useState(String(calc.tax_rate));
  const [markup, setMarkup] = useState(String(calc.default_markup_pct));
  const [scCost, setScCost] = useState(calc.suitcase_cost_usd != null ? String(calc.suitcase_cost_usd) : '');
  const [scCap, setScCap] = useState(calc.suitcase_capacity_lbs != null ? String(calc.suitcase_capacity_lbs) : '');
  const [boxCost, setBoxCost] = useState(calc.box_cost_usd != null ? String(calc.box_cost_usd) : '');
  const [boxL, setBoxL] = useState(calc.box_length_in != null ? String(calc.box_length_in) : '');
  const [boxW, setBoxW] = useState(calc.box_width_in != null ? String(calc.box_width_in) : '');
  const [boxH, setBoxH] = useState(calc.box_height_in != null ? String(calc.box_height_in) : '');

  const [biz, setBiz] = useState(settings.business_name || '');
  const [wa, setWa] = useState(settings.whatsapp_number || '');
  const [dmin, setDmin] = useState(String(settings.delivery_days_min));
  const [dmax, setDmax] = useState(String(settings.delivery_days_max));
  const [bankName, setBankName] = useState(settings.bank_name || '');
  const [bankNum, setBankNum] = useState(settings.bank_account_number || '');
  const [bankHolder, setBankHolder] = useState(settings.bank_account_holder || '');

  const save = async () => {
    setSaving(true);
    try {
      await svc.updateCalcSettings({
        freight_mode: freight, exchange_rate: num(exchange), tax_rate: num(tax), default_markup_pct: num(markup),
        suitcase_cost_usd: num(scCost) || null, suitcase_capacity_lbs: num(scCap) || null,
        box_cost_usd: num(boxCost) || null, box_length_in: num(boxL) || null,
        box_width_in: num(boxW) || null, box_height_in: num(boxH) || null,
      });
      await svc.updateSettings({
        business_name: biz || null, whatsapp_number: wa || null,
        delivery_days_min: parseInt(dmin) || 0, delivery_days_max: parseInt(dmax) || 0,
        bank_name: bankName || null, bank_account_number: bankNum || null, bank_account_holder: bankHolder || null,
      });
      await onSaved(); onClose();
    } catch {
      onError('No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Ajustes"
      footer={
        <button onClick={save} disabled={saving}
          className="w-full h-14 rounded-2xl bg-nodo-primary text-nodo-on-primary font-black active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2">
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} GUARDAR
        </button>
      }>
      <div className="flex flex-col gap-4">
        <SegmentedControl<'calc' | 'negocio'>
          options={[
            { value: 'calc', label: 'Calculadora', icon: <Sparkles size={14} /> },
            { value: 'negocio', label: 'Negocio', icon: <Store size={14} /> },
          ]}
          value={tab} onChange={setTab} />

        {tab === 'calc' ? (
          <>
            <SegmentedControl<FreightMode>
              options={[
                { value: 'maleta', label: 'Por peso', icon: <Package size={14} /> },
                { value: 'caja', label: 'Por tamaño', icon: <Box size={14} /> },
              ]}
              value={freight} onChange={setFreight} />
            {freight === 'maleta' ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="¿Cuánto pagaste por la maleta? ($)" value={scCost} onChange={setScCost} />
                <Field label="¿Cuántas libras te caben?" value={scCap} onChange={setScCap} />
              </div>
            ) : (
              <>
                <Field label="¿Cuánto pagaste por la caja? ($)" value={boxCost} onChange={setBoxCost} />
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Largo (in)" value={boxL} onChange={setBoxL} />
                  <Field label="Ancho (in)" value={boxW} onChange={setBoxW} />
                  <Field label="Alto (in)" value={boxH} onChange={setBoxH} />
                </div>
              </>
            )}
            <div className="grid grid-cols-3 gap-3">
              <Field label="Dólar a quetzal" value={exchange} onChange={setExchange} />
              <Field label="Impuesto USA (%)" value={tax} onChange={setTax} />
              <Field label="Tu ganancia (%)" value={markup} onChange={setMarkup} />
            </div>
          </>
        ) : (
          <>
            <div><label className="nodo-label">Nombre del negocio</label><input value={biz} onChange={e => setBiz(e.target.value)} className="nodo-input" /></div>
            <div><label className="nodo-label">WhatsApp</label><input value={wa} onChange={e => setWa(e.target.value)} className="nodo-input" inputMode="tel" /></div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Entrego desde (días)" value={dmin} onChange={setDmin} />
              <Field label="Entrego hasta (días)" value={dmax} onChange={setDmax} />
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div><label className="nodo-label">Banco</label><input value={bankName} onChange={e => setBankName(e.target.value)} className="nodo-input" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="nodo-label">Cuenta</label><input value={bankNum} onChange={e => setBankNum(e.target.value)} className="nodo-input" /></div>
                <div><label className="nodo-label">A nombre de</label><input value={bankHolder} onChange={e => setBankHolder(e.target.value)} className="nodo-input" /></div>
              </div>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="nodo-label">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} inputMode="decimal" className="nodo-input-number" />
    </div>
  );
}

// ── Clientes (derivados de reservas) ───────────────────────────────────────────
interface ClientGroup {
  key: string; name: string; phone: string; total: number;
  orderToken: string | null; reservations: ShopperReservation[];
}

function ClientsSheet({ open, onClose, reservations, flash }: {
  open: boolean; onClose: () => void; reservations: ShopperReservation[];
  flash: (k: 'ok' | 'err', m: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [zoom, setZoom] = useState<{ src: string; title?: string | null } | null>(null);

  const clients = useMemo<ClientGroup[]>(() => {
    const map = new Map<string, ClientGroup>();
    for (const r of reservations) {
      if (!r.is_active) continue;
      const key = (r.client_phone || '').replace(/\D/g, '') || r.client_name;
      const c = map.get(key) || { key, name: r.client_name, phone: r.client_phone, total: 0, orderToken: null, reservations: [] };
      c.reservations.push(r);
      c.total += (r.item_price_gtq || 0) * r.quantity;
      if (!c.orderToken && r.order_token) c.orderToken = r.order_token;
      map.set(key, c);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [reservations]);

  const shareOrder = async (c: ClientGroup) => {
    const link = orderLink(c.orderToken);
    if (!link) { flash('err', 'Este cliente todavía no tiene un pedido para compartir.'); return; }
    haptic.tap();
    const ok = await navigator.share?.({ title: 'Tu pedido', text: `Hola ${c.name}, consultá tu pedido acá:`, url: link }).then(() => true).catch(() => false);
    if (!ok) { await navigator.clipboard?.writeText(link); flash('ok', 'Enlace del pedido copiado'); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Clientes">
      {zoom && <ImageLightbox src={zoom.src} title={zoom.title} onClose={() => setZoom(null)} />}
      <div className="flex flex-col gap-2">
        {clients.length === 0 && (
          <div className="nodo-empty-state py-10"><Users size={30} className="text-nodo-dim mb-2" /><p className="text-sm font-bold text-nodo-ink">Todavía no tenés clientes</p></div>
        )}
        {clients.map(c => {
          const isOpen = expanded === c.key;
          return (
            <div key={c.key} className="nodo-card p-3 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-nodo-primary-soft flex items-center justify-center text-nodo-primary font-black shrink-0">
                  {c.name.slice(0, 1).toUpperCase()}
                </div>
                <button onClick={() => setExpanded(isOpen ? null : c.key)}
                  className="min-w-0 flex-1 flex items-center gap-2 text-left active:scale-[0.99] transition-transform">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-nodo-ink truncate">{c.name}</p>
                    <p className="text-xs text-nodo-sub tabular-nums">{c.reservations.length} reserva(s) · {fmtGTQ(c.total)}</p>
                  </div>
                  <ChevronDown size={16} className={`text-nodo-sub shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                <button onClick={() => shareOrder(c)} title="Compartir su link de pedido"
                  className="w-9 h-9 rounded-xl bg-nodo-inset text-nodo-ink flex items-center justify-center active:scale-90 transition-transform shrink-0">
                  <Link2 size={16} />
                </button>
                {c.phone && (
                  <a href={`https://wa.me/${c.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener"
                    className="w-9 h-9 rounded-xl bg-nodo-success-bg text-nodo-success-tx flex items-center justify-center active:scale-90 shrink-0">
                    <MessageCircle size={16} />
                  </a>
                )}
              </div>

              {isOpen && (
                <div className="flex flex-col gap-2 pt-2 border-t border-nodo-line">
                  {c.reservations.map(r => {
                    const meta = RES_META[r.status];
                    return (
                      <div key={r.id} className="flex items-center gap-2.5">
                        {r.item_image_url
                          ? <button onClick={() => setZoom({ src: r.item_image_url!, title: r.item_title })}
                              className="w-10 h-10 rounded-lg overflow-hidden shrink-0 active:scale-95 transition-transform">
                              <img src={r.item_image_url} className="w-full h-full object-cover" alt="" />
                            </button>
                          : <div className="w-10 h-10 rounded-lg bg-nodo-inset flex items-center justify-center text-nodo-dim shrink-0"><Package size={15} /></div>}
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold text-nodo-ink truncate">{r.item_title}</p>
                          <p className="text-[11px] text-nodo-sub tabular-nums">{r.quantity}u{r.item_price_gtq ? ` · ${fmtGTQ(r.item_price_gtq * r.quantity)}` : ''}</p>
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 rounded-md text-[9px] font-black ${meta.cls}`}>{meta.emoji} {meta.label}</span>
                      </div>
                    );
                  })}
                  {orderLink(c.orderToken) && (
                    <button onClick={() => shareOrder(c)}
                      className="mt-1 h-9 rounded-xl bg-nodo-primary-soft text-nodo-primary text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
                      <Share2 size={13} /> Compartir su link de pedido
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
}

// ── Cupones de descuento ───────────────────────────────────────────────────────
const _CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // base32 Crockford, sin I/L/O/U

function genCode(n = 8): string {
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < n; i++) s += _CODE_ALPHABET[buf[i] % _CODE_ALPHABET.length];
  return s;
}

function fmtCode(code: string): string {
  const c = (code || '').toUpperCase();
  if (c.length <= 4) return c;
  const mid = Math.ceil(c.length / 2);
  return `${c.slice(0, mid)}-${c.slice(mid)}`;
}

function couponValueLabel(c: ShopperCoupon): string {
  return c.discount_type === 'percent' ? `−${c.percent_off ?? 0}%` : `−${fmtGTQ(c.amount_off_gtq ?? 0)}`;
}

function fmtDay(iso?: string | null): string | null {
  const ms = toMs(iso);
  if (ms == null) return null;
  return new Date(ms).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' });
}

// Impacto de margen de un cupón % sobre una venta típica (ganancia = markup sobre costo).
function couponMargin(type: CouponDiscountType, percent: number, markupPct: number) {
  const m = Math.max(0, markupPct) / 100;
  const costRatio = m > 0 ? 1 / (1 + m) : 1;        // costo como fracción del precio
  const origMargin = 1 - costRatio;                  // ganancia por Q1 de venta, sin cupón
  if (type !== 'percent') return null;
  const p = Math.min(100, Math.max(0, percent)) / 100;
  const remain = (1 - p) - costRatio;                // ganancia por Q1 tras el cupón
  const ratio = origMargin > 0 ? remain / origMargin : (p > 0 ? -1 : 1);
  return { give: p * 100, keep: remain * 100, ratio, belowCost: remain < -1e-9 };
}

const USE_OPTS: { v: number | null; label: string }[] = [
  { v: 1, label: '1 uso' }, { v: 10, label: '10 usos' }, { v: null, label: 'Ilimitado' },
];
const EXP_OPTS: { d: number | null; label: string }[] = [
  { d: 7, label: '7 días' }, { d: 15, label: '15 días' }, { d: 30, label: '30 días' }, { d: null, label: 'Sin límite' },
];

function CouponsSheet({ open, onClose, coupons, markupPct, publicUrl, totalRedeemed, onChanged, flash }: {
  open: boolean; onClose: () => void; coupons: ShopperCoupon[];
  markupPct: number; publicUrl: string; totalRedeemed: number;
  onChanged: () => Promise<void>; flash: (k: 'ok' | 'err', m: string) => void;
}) {
  const [view, setView] = useState<'list' | 'create'>('list');
  const [type, setType] = useState<CouponDiscountType>('percent');
  const [percent, setPercent] = useState(15);
  const [fixed, setFixed] = useState('');
  const [uses, setUses] = useState<number | null>(1);
  const [adv, setAdv] = useState(false);
  const [minSub, setMinSub] = useState('');
  const [maxDisc, setMaxDisc] = useState('');
  const [perClient, setPerClient] = useState(1);
  const [expDays, setExpDays] = useState<number | null>(15);
  const [code, setCode] = useState(() => genCode());
  const [saving, setSaving] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const resetCreate = () => {
    setType('percent'); setPercent(15); setFixed(''); setUses(1); setAdv(false);
    setMinSub(''); setMaxDisc(''); setPerClient(1); setExpDays(15); setCode(genCode());
  };
  useEffect(() => {
    if (open) { setView(coupons.length ? 'list' : 'create'); resetCreate(); }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [open]);

  const impact = useMemo(() => couponMargin(type, percent, markupPct), [type, percent, markupPct]);
  const activeN = coupons.filter(c => c.is_active).length;

  const submit = async () => {
    if (type === 'percent' && !(percent > 0 && percent <= 100)) { flash('err', 'El porcentaje debe estar entre 1 y 100.'); return; }
    if (type === 'fixed' && !(num(fixed) > 0)) { flash('err', 'Poné un monto de descuento mayor a 0.'); return; }
    const norm = code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (norm.length < 3) { flash('err', 'El código debe tener al menos 3 caracteres.'); return; }
    if (impact?.belowCost && !confirm('Con este descuento casi no te queda ganancia (el sistema igual nunca vende bajo tu costo). ¿Crear el cupón de todos modos?')) return;

    setSaving(true);
    try {
      const input: ShopperCouponInput = {
        code: norm,
        discount_type: type,
        percent_off: type === 'percent' ? percent : null,
        amount_off_gtq: type === 'fixed' ? num(fixed) : null,
        max_discount_gtq: type === 'percent' && num(maxDisc) > 0 ? num(maxDisc) : null,
        min_subtotal_gtq: num(minSub) > 0 ? num(minSub) : null,
        max_redemptions: uses,
        per_customer_limit: Math.max(1, perClient),
        expires_at: expDays ? new Date(Date.now() + expDays * 86400000).toISOString() : null,
      };
      await svc.createCoupon(input);
      haptic.done();
      flash('ok', '¡Cupón creado! 🎟️');
      await onChanged();
      resetCreate();
      setView('list');
    } catch (e) {
      flash('err', errMsg(e) || 'No se pudo crear el cupón.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (c: ShopperCoupon) => {
    setRowBusy(c.id);
    try { await svc.updateCoupon(c.id, { is_active: !c.is_active }); haptic.tap(); await onChanged(); }
    catch { flash('err', 'No se pudo actualizar.'); }
    finally { setRowBusy(null); }
  };
  const shareCoupon = async (c: ShopperCoupon) => {
    haptic.tap();
    const url = `${publicUrl}?cupon=${encodeURIComponent(c.code)}`;
    const ok = await navigator.share?.({ title: 'Tu cupón', text: `🎟️ Usá el código ${fmtCode(c.code)} para tu descuento`, url }).then(() => true).catch(() => false);
    if (!ok) { await navigator.clipboard?.writeText(url); flash('ok', 'Enlace del cupón copiado'); }
  };
  const del = async (c: ShopperCoupon) => {
    if (!confirm(`¿Eliminar el cupón ${fmtCode(c.code)}?`)) return;
    setRowBusy(c.id);
    try { await svc.deleteCoupon(c.id); haptic.confirm(); await onChanged(); }
    catch (e) { flash('err', errMsg(e) || 'No se pudo eliminar.'); }
    finally { setRowBusy(null); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={view === 'create' ? 'Nuevo cupón 🎟️' : 'Cupones'}
      footer={view === 'create' ? (
        <button onClick={submit} disabled={saving}
          className="w-full h-14 rounded-2xl bg-nodo-primary text-nodo-on-primary font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2">
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Ticket size={18} />} CREAR CUPÓN
        </button>
      ) : (
        <button onClick={() => { haptic.tap(); resetCreate(); setView('create'); }}
          className="w-full h-14 rounded-2xl bg-nodo-primary text-nodo-on-primary font-black text-base active:scale-[0.97] transition-transform flex items-center justify-center gap-2">
          <Plus size={18} /> NUEVO CUPÓN
        </button>
      )}>
      {view === 'list' ? (
        <div className="flex flex-col gap-3">
          {coupons.length > 0 && (
            <div className="rounded-nodo-md p-4 bg-nodo-primary-soft flex items-center gap-3">
              <Ticket size={22} className="text-nodo-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-black text-nodo-ink">{activeN} activo{activeN !== 1 ? 's' : ''} · {totalRedeemed} canjeado{totalRedeemed !== 1 ? 's' : ''}</p>
                <p className="text-[11px] text-nodo-sub">Compartí el código y tus clientes lo canjean en su pedido.</p>
              </div>
            </div>
          )}
          {coupons.length === 0 ? (
            <div className="nodo-empty-state py-10">
              <Ticket size={34} className="text-nodo-dim mb-2" />
              <p className="text-sm font-bold text-nodo-ink">Sin cupones todavía</p>
              <p className="text-xs text-nodo-sub mt-1">Creá uno y empujá más reservas sin regalar tu margen.</p>
            </div>
          ) : coupons.map(c => (
            <div key={c.id} className={`nodo-card p-3 flex flex-col gap-2 ${!c.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-11 h-11 rounded-xl bg-nodo-primary-soft flex items-center justify-center shrink-0">
                  <Ticket size={18} className="text-nodo-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-black text-nodo-ink tracking-wider truncate">{fmtCode(c.code)}</p>
                  <p className="text-[11px] text-nodo-sub tabular-nums">
                    {couponValueLabel(c)} · usado {c.redeemed_count}{c.max_redemptions != null ? `/${c.max_redemptions}` : ''}
                    {fmtDay(c.expires_at) ? ` · vence ${fmtDay(c.expires_at)}` : ''}
                  </p>
                </div>
                {c.could_go_below_cost && (
                  <span className="shrink-0 text-nodo-warn-tx" title="Descuento alto para tu margen"><AlertTriangle size={15} /></span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggle(c)} disabled={rowBusy === c.id}
                  className={`h-9 px-3 rounded-xl text-xs font-black flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-40 ${c.is_active ? 'bg-nodo-success-bg text-nodo-success-tx' : 'bg-nodo-inset text-nodo-sub'}`}>
                  <Power size={13} /> {c.is_active ? 'Activo' : 'Pausado'}
                </button>
                <div className="flex-1" />
                <button onClick={() => shareCoupon(c)}
                  className="h-9 w-9 rounded-xl bg-nodo-inset text-nodo-ink flex items-center justify-center active:scale-90 transition-transform"><Share2 size={15} /></button>
                <button onClick={() => del(c)} disabled={rowBusy === c.id}
                  className="h-9 w-9 rounded-xl bg-nodo-inset text-nodo-danger-tx flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {coupons.length > 0 && (
            <button onClick={() => setView('list')} className="self-start text-xs font-black text-nodo-sub flex items-center gap-1 active:scale-95">
              <ArrowRight size={13} className="rotate-180" /> Volver a mis cupones
            </button>
          )}

          <SegmentedControl<CouponDiscountType>
            options={[
              { value: 'percent', label: 'Porcentaje', icon: <span className="font-black">%</span> },
              { value: 'fixed', label: 'Monto (Q)', icon: <Tag size={14} /> },
            ]}
            value={type} onChange={setType} />

          {type === 'percent' ? (
            <div>
              <label className="nodo-label">¿Cuánto descuento?</label>
              <div className="flex items-center gap-3">
                <input type="range" min={1} max={90} value={percent}
                  onChange={e => setPercent(parseInt(e.target.value))}
                  className="flex-1 h-2" style={{ accentColor: 'var(--nodo-primary)' }} />
                <div className="w-16 h-11 rounded-xl bg-nodo-card border border-nodo-line flex items-center justify-center text-lg font-black text-nodo-ink tabular-nums shrink-0">{percent}%</div>
              </div>
            </div>
          ) : (
            <div>
              <label className="nodo-label">Monto de descuento (Q)</label>
              <input value={fixed} onChange={e => setFixed(e.target.value)} inputMode="decimal" placeholder="0.00" className="nodo-input-number" />
            </div>
          )}

          {/* Impacto de margen en vivo (máquina de recompensa honesta) */}
          {type === 'percent' && impact && (
            <div className={`rounded-2xl p-4 flex flex-col gap-3 border ${impact.belowCost ? 'bg-nodo-danger-bg border-nodo-danger-bd' : 'bg-nodo-inset border-nodo-line'}`}>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold text-nodo-sub uppercase tracking-wider">De cada Q100</p>
                  <p className="text-2xl font-black text-nodo-ink tabular-nums leading-none mt-0.5">regalás Q{impact.give.toFixed(0)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-nodo-sub uppercase tracking-wider">Te queda</p>
                  <p className={`text-2xl font-black tabular-nums leading-none mt-0.5 ${impact.belowCost ? 'text-nodo-danger-tx' : 'text-nodo-success-tx'}`}>Q{impact.keep.toFixed(0)}</p>
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-nodo-raised overflow-hidden">
                <div className={`h-full rounded-full origin-left transition-transform duration-300 ${impact.ratio > 0.5 ? 'bg-nodo-success-tx' : impact.ratio > 0 ? 'bg-nodo-warn-tx' : 'bg-nodo-danger-tx'}`}
                  style={{ transform: `scaleX(${Math.max(0.02, Math.min(1, impact.ratio))})` }} />
              </div>
              {impact.belowCost ? (
                <p className="text-xs font-bold text-nodo-danger-tx flex items-start gap-1.5">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" /> Bajo tu costo. El sistema recorta el descuento para que nunca pierdas, pero casi no queda ganancia.
                </p>
              ) : (
                <p className="text-[11px] text-nodo-sub">Estimado con tu ganancia típica de {markupPct}%. En cada pedido el sistema nunca deja el total bajo tu costo.</p>
              )}
            </div>
          )}
          {type === 'fixed' && (
            <p className="text-[11px] text-nodo-sub -mt-2">El sistema ajusta el descuento en cada pedido para no dejar nunca el total bajo tu costo ✓</p>
          )}

          {/* Usos */}
          <div>
            <label className="nodo-label">¿Cuántas veces se puede usar?</label>
            <div className="grid grid-cols-3 gap-2">
              {USE_OPTS.map(o => (
                <button key={o.label} onClick={() => { haptic.tap(); setUses(o.v); }}
                  className={`h-11 rounded-2xl text-xs font-black active:scale-95 transition-transform ${uses === o.v ? 'bg-nodo-primary text-nodo-on-primary' : 'bg-nodo-inset text-nodo-sub border border-nodo-line'}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-nodo-sub mt-1.5">
              {uses === 1 ? 'Un solo canje en total — ideal para un regalo único.' : uses == null ? 'Sin límite de canjes.' : `Hasta ${uses} canjes en total.`}
            </p>
          </div>

          {/* Código */}
          <div>
            <label className="nodo-label">Código del cupón</label>
            <div className="flex gap-2">
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={24}
                className="nodo-input flex-1 font-mono tracking-widest uppercase" />
              <button onClick={() => { haptic.tap(); setCode(genCode()); }}
                className="h-12 w-12 rounded-2xl bg-nodo-inset border border-nodo-line flex items-center justify-center text-nodo-ink active:scale-90 transition-transform shrink-0">
                <Dices size={18} />
              </button>
            </div>
            <p className="text-[11px] text-nodo-sub mt-1.5">Tus clientes lo escriben o lo reciben en el link.</p>
          </div>

          {/* Avanzado */}
          <button onClick={() => setAdv(v => !v)} className="flex items-center justify-between w-full text-left active:scale-[0.99] transition-transform">
            <span className="nodo-section-label !mb-0">Opciones avanzadas</span>
            <ChevronDown size={16} className={`text-nodo-sub transition-transform ${adv ? 'rotate-180' : ''}`} />
          </button>
          {adv && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="nodo-label">Compra mínima (Q)</label>
                  <input value={minSub} onChange={e => setMinSub(e.target.value)} inputMode="decimal" placeholder="Sin mínimo" className="nodo-input-number" />
                </div>
                {type === 'percent' && (
                  <div>
                    <label className="nodo-label">Tope de descuento (Q)</label>
                    <input value={maxDisc} onChange={e => setMaxDisc(e.target.value)} inputMode="decimal" placeholder="Sin tope" className="nodo-input-number" />
                  </div>
                )}
              </div>
              <div>
                <label className="nodo-label">Vence en</label>
                <div className="grid grid-cols-4 gap-2">
                  {EXP_OPTS.map(o => (
                    <button key={o.label} onClick={() => { haptic.tap(); setExpDays(o.d); }}
                      className={`h-11 rounded-2xl text-xs font-black active:scale-95 transition-transform ${expDays === o.d ? 'bg-nodo-primary text-nodo-on-primary' : 'bg-nodo-inset text-nodo-sub border border-nodo-line'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-nodo-md border border-nodo-line p-3 bg-nodo-inset">
                <div>
                  <p className="text-sm font-black text-nodo-ink">Usos por cliente</p>
                  <p className="text-[11px] text-nodo-sub">Cuántas veces lo puede canjear una misma persona</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPerClient(q => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-xl bg-nodo-card border border-nodo-line flex items-center justify-center text-nodo-ink active:scale-90 transition-transform"><Minus size={14} /></button>
                  <span className="w-8 text-center text-sm font-black text-nodo-ink tabular-nums">{perClient}</span>
                  <button onClick={() => setPerClient(q => q + 1)}
                    className="w-9 h-9 rounded-xl bg-nodo-ink flex items-center justify-center text-nodo-canvas active:scale-90 transition-transform"><Plus size={14} /></button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

// Extrae el detail de un error de axios (mensajes de negocio del backend).
function errMsg(e: unknown): string | null {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : null;
}
