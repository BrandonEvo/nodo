import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Loader2, AlertTriangle, Check, X, Trash2, Search, Camera, Link2, PencilLine,
  Bell, Settings2, Share2, Package, Users, Tag, MessageCircle, Box, Sparkles, ArrowRight,
  Store, Radio, Zap, Clock, Flame, Minus, Play, ShoppingBag, Ticket, Dices, Power, ChevronDown,
  Maximize2,
} from 'lucide-react';
import type { AppProps } from '../index';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { haptic } from '@/utils/haptic';
import { fileToResizedDataUrl } from '@/utils/image';
import {
  shopperCatalogService as svc,
  type ShopperCatalogItem, type ShopperCatalogSettings, type ShopperCalcSettings,
  type ShopperReservation, type ShopperResStatus, type ShopperListing,
  type ShopperCoupon, type ShopperCouponInput, type CouponDiscountType,
  type ShopperStats,
} from '@/services/shopper_catalog.service';
import { shopperAmazonService } from '@/services/shopper_amazon.service';
import {
  calculate, toSnapshot, suggestPrices,
  fmtGTQ, fmtUSD, type CalcConfig, type FreightMode,
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

// Formatea el countdown de un drop: días si falta mucho, si no H:MM:SS / MM:SS.
function fmtClock(diffMs: number): { big: string; small: string; urgent: boolean } {
  if (diffMs <= 0) return { big: '0:00', small: 'cerrada', urgent: true };
  const s = Math.floor(diffMs / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return { big: `${d}d ${h}h`, small: 'para el cierre', urgent: false };
  if (h > 0) return { big: `${h}:${p(m)}:${p(sec)}`, small: 'para el cierre', urgent: false };
  return { big: `${m}:${p(sec)}`, small: 'para el cierre', urgent: m < 10 };
}

// Link al pedido acumulado del cliente ("En mi maleta") — acceso rápido para compartir.
const orderLink = (orderToken?: string | null): string | null =>
  orderToken ? `${window.location.origin}/mi-maleta/${orderToken}` : null;

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

// ── Resultado del drop (clímax al cerrar) ────────────────────────────────────────
type DropResultData = {
  units: number;
  reservations: number;
  clients: number;
  revenueGtq: number;
  topTitle: string | null;
  topUnits: number;
};

// Scope-drop: reservas vivas (no canceladas/no_disponible) creadas desde que abriste la
// tienda. Es el "potencial" del drop — plata apartada, aún no cobrada (por eso el copy).
function computeDropResult(
  reservations: ShopperReservation[], items: ShopperCatalogItem[], openedMs: number,
): DropResultData {
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

function DropResultModal({ data, onClose, onNewDrop }: {
  data: DropResultData; onClose: () => void; onNewDrop: () => void;
}) {
  const empty = data.reservations === 0;
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-5 animate-in fade-in duration-200">
      <div className="w-full max-w-sm nodo-card-hero p-6 text-center animate-in zoom-in-95 duration-300">
        <div className="text-5xl mb-2">{empty ? '🌱' : '🏁'}</div>
        <h2 className="text-[26px] font-black text-nodo-ink leading-tight">
          {empty ? 'Drop cerrado' : '¡Cerraste el drop!'}
        </h2>
        <p className="text-sm font-semibold text-nodo-sub mt-1">
          {empty
            ? 'Esta vez nadie apartó. Probá otro horario o avisá antes por WhatsApp.'
            : `${data.clients} cliente${data.clients === 1 ? '' : 's'} apartaron en tu tienda 🎉`}
        </p>

        {!empty && (
          <>
            <div className="mt-5 rounded-2xl bg-nodo-primary text-nodo-on-primary p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-nodo-on-primary/80">Apartado en el drop</p>
              <p className="text-[40px] font-black tabular-nums leading-none mt-1">{fmtGTQ(data.revenueGtq)}</p>
              <p className="text-[11px] font-bold text-nodo-on-primary/80 mt-1">
                {data.units} unidad{data.units === 1 ? '' : 'es'} · {data.reservations} reserva{data.reservations === 1 ? '' : 's'}
              </p>
            </div>
            {data.topTitle && (
              <div className="mt-2.5 rounded-2xl bg-nodo-inset p-3 text-left">
                <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">Lo más apartado</p>
                <p className="text-sm font-black text-nodo-ink line-clamp-1 mt-0.5">{data.topTitle}</p>
                <p className="text-[11px] font-bold text-nodo-sub tabular-nums">{data.topUnits} unidad{data.topUnits === 1 ? '' : 'es'}</p>
              </div>
            )}
            <p className="text-[11px] font-semibold text-nodo-dim mt-3">
              Confirmá y cobrá desde Reservas. Tu ganancia real vive en “Cómo te fue”.
            </p>
          </>
        )}

        <button onClick={() => { haptic.tap(); onNewDrop(); }}
          className="nodo-btn-primary mt-5">
          <Radio size={18} /> Abrir otro drop
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
  const [reservations, setReservations] = useState<ShopperReservation[]>([]);
  const [coupons, setCoupons] = useState<ShopperCoupon[]>([]);
  const [stats, setStats] = useState<ShopperStats | null>(null);
  const [dropResult, setDropResult] = useState<DropResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [createListing, setCreateListing] = useState<ShopperListing | null>(null);
  const [showOpen, setShowOpen] = useState(false);
  const [showReservas, setShowReservas] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showClients, setShowClients] = useState(false);
  const [showCoupons, setShowCoupons] = useState(false);

  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const flash = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 2600);
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
      flash('err', 'No se pudo cargar tu tienda.');
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

  // Ítems del drop actual = publicados 'live' durante esta sesión de tienda.
  const liveItems = useMemo(
    () => items.filter(i => i.listing === 'live' && i.is_published && i.is_active
      && (!openedMs || (toMs(i.published_at) ?? Infinity) >= openedMs - 5000)),
    [items, openedMs],
  );
  const catalogItems = useMemo(
    () => items.filter(i => i.listing === 'catalog' && i.is_active),
    [items],
  );

  const publicUrl = settings ? `${window.location.origin}/catalogo/${settings.public_token}` : '';
  const share = useCallback(async () => {
    haptic.tap();
    const ok = await navigator.share?.({ title: 'Mi tienda en vivo', url: publicUrl }).then(() => true).catch(() => false);
    if (!ok) { await navigator.clipboard?.writeText(publicUrl); flash('ok', 'Enlace copiado'); }
  }, [publicUrl, flash]);

  const openStore = useCallback(async (storeName: string, minutes: number | null) => {
    setBusy(true);
    try {
      const st = await svc.openStore({ store_name: storeName || null, minutes });
      setSettings(st); setShowOpen(false);
      haptic.done();
      flash('ok', '¡Tienda abierta! 🔴 En vivo');
    } catch {
      flash('err', 'No se pudo abrir la tienda.');
    } finally { setBusy(false); }
  }, [flash]);

  const closeStore = useCallback(async () => {
    if (!confirm('¿Cerrar la tienda? Ya no entran reservas nuevas. Las que ya hiciste quedan firmes.')) return;
    setBusy(true);
    // Snapshot de la ventana del drop ANTES de que settings pase a cerrado (openedMs se
    // deriva de settings). El resultado es scope-drop: reservas creadas desde que abriste.
    const opened = toMs(settings?.store_opened_at) ?? 0;
    try {
      const st = await svc.closeStore();
      setSettings(st);
      haptic.done();
      const result = computeDropResult(reservations, items, opened);
      setDropResult(result);   // clímax: pantalla "Resultado del drop"
      void load();             // refresca stats para el reporting de arriba
    } catch {
      flash('err', 'No se pudo cerrar la tienda.');
    } finally { setBusy(false); }
  }, [flash, settings, reservations, items, load]);

  return (
    <>
      {toast && (
        <div className={`fixed top-4 right-4 z-[70] flex items-center gap-3 text-sm font-bold px-4 py-3 rounded-2xl shadow-lg max-w-xs
          ${toast.kind === 'ok' ? 'bg-nodo-success-bg border border-nodo-success-bd text-nodo-success-tx'
                                : 'bg-nodo-danger-bg border border-nodo-danger-bd text-nodo-danger-tx'}`}>
          {toast.kind === 'ok' ? <Check size={16} /> : <AlertTriangle size={16} />}
          <span>{toast.msg}</span>
        </div>
      )}

      <div className="flex flex-col gap-5 pb-28">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-black text-nodo-ink leading-tight flex items-center gap-2">
              <ShoppingBag size={26} className="text-nodo-primary" /> Mi Tienda
            </h1>
            <p className="text-nodo-sub text-sm font-medium mt-0.5">
              {storeLive ? 'Estás en vivo — el reloj corre' : 'Abrí tu tienda o publicá en tu catálogo'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { haptic.tap(); setShowReservas(true); }}
              className="relative w-11 h-11 rounded-2xl bg-nodo-card border border-nodo-line flex items-center justify-center text-nodo-ink active:scale-90 transition-transform">
              <Bell size={18} />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-nodo-primary text-nodo-on-primary text-[10px] font-black flex items-center justify-center">{pendingCount}</span>
              )}
            </button>
            <button onClick={() => { haptic.tap(); setShowCoupons(true); }}
              className="relative w-11 h-11 rounded-2xl bg-nodo-card border border-nodo-line flex items-center justify-center text-nodo-ink active:scale-90 transition-transform">
              <Ticket size={18} />
              {activeCoupons > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-nodo-success-tx text-white text-[10px] font-black flex items-center justify-center">{activeCoupons}</span>
              )}
            </button>
            <button onClick={() => { haptic.tap(); setShowSettings(true); }}
              className="w-11 h-11 rounded-2xl bg-nodo-card border border-nodo-line flex items-center justify-center text-nodo-ink active:scale-90 transition-transform">
              <Settings2 size={18} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="nodo-spinner-container"><Loader2 className="w-8 h-8 animate-spin text-nodo-sub" /></div>
        ) : storeLive ? (
          /* ══════════ TIENDA EN VIVO ══════════ */
          <>
            <LiveHero
              storeName={settings?.store_name}
              closesMs={closesMs} now={now}
              items={liveItems.length}
              reserving={reservations.filter(r => r.is_active && r.status === 'pendiente').length}
              onClose={closeStore} onShare={share} busy={busy}
            />

            <div className="flex items-center justify-between">
              <p className="nodo-section-label !mb-0">En el drop ({liveItems.length})</p>
              {liveItems.length > 0 && (
                <button onClick={share} className="text-xs font-black text-nodo-primary flex items-center gap-1 active:scale-95">
                  <Share2 size={13} /> Compartir
                </button>
              )}
            </div>

            {liveItems.length === 0 ? (
              <div className="nodo-empty-state py-12">
                <Zap size={38} className="text-nodo-primary mb-3" />
                <p className="text-sm font-bold text-nodo-ink">Publicá lo primero</p>
                <p className="text-xs text-nodo-sub mt-1">Foto → precio → cantidad → listo</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {liveItems.map(it => (
                  <LiveItemCard key={it.id} item={it}
                    onDelete={async () => {
                      if (!confirm(`¿Quitar "${it.title}" del drop?`)) return;
                      await svc.remove(it.id); await load(); flash('ok', 'Quitado');
                    }} />
                ))}
              </div>
            )}
          </>
        ) : (
          /* ══════════ TIENDA CERRADA ══════════ */
          <>
            {timedOut && (
              <div className="nodo-card p-4 flex items-center gap-3 bg-nodo-warn-bg border-nodo-warn-bd">
                <Clock size={20} className="text-nodo-warn-tx shrink-0" />
                <p className="flex-1 text-sm font-bold text-nodo-warn-tx">Se acabó el tiempo del último drop.</p>
                <button onClick={closeStore} disabled={busy}
                  className="h-9 px-3 rounded-xl bg-nodo-warn-tx text-white text-xs font-black active:scale-95 disabled:opacity-40">
                  Cerrar
                </button>
              </div>
            )}

            {/* Hero: abrir tienda en vivo */}
            <button onClick={() => { haptic.tap(); setShowOpen(true); }}
              className="nodo-card-hero p-6 bg-nodo-primary text-nodo-on-primary text-left active:scale-[0.98] transition-transform"
              style={{ boxShadow: 'var(--nodo-shadow-hero)' }}>
              <div className="flex items-center gap-2 text-nodo-on-primary/90 mb-2">
                <Radio size={18} />
                <span className="text-[11px] font-black uppercase tracking-[0.14em]">Tienda en vivo</span>
              </div>
              <p className="text-[26px] font-black leading-tight">Abrir tienda 🔴</p>
              <p className="text-sm font-semibold text-nodo-on-primary/80 mt-1">
                Estás en la tienda ahora. Publicá rápido y dale a tus clientes un reloj para reservar.
              </p>
              <span className="inline-flex items-center gap-1.5 mt-4 h-11 px-5 rounded-full bg-nodo-on-primary text-nodo-primary font-black text-sm">
                <Play size={16} /> Empezar el drop
              </span>
            </button>

            {/* Cómo te fue — reporting honesto (endpoint /stats): realizado (plata de
                verdad) arriba, pipeline en firme/potencial abajo. Todo neteado de cupón. */}
            {hasStats && stats && (
              <div className="nodo-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="nodo-section-label !mb-0">Cómo te fue</p>
                  {assumedLines > 0 && (
                    <span className="text-[10px] font-bold text-nodo-warn-tx">{assumedLines} sin costo real</span>
                  )}
                </div>

                {/* Realizado — entregado, la única plata que cuenta */}
                <div className="rounded-2xl bg-nodo-success-bg p-3.5 mb-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-nodo-success-tx/80 uppercase tracking-wide">Realizado · entregado</p>
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
                        <span className="text-[11px] font-bold text-nodo-success-tx/70">ganancia neta</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-[11px] font-bold text-nodo-success-tx/80 tabular-nums">
                        <span>Vendido {fmtGTQ(stats.realized.net_revenue_gtq)}</span>
                        {stats.realized.coupon_gtq > 0 && <span>· −{fmtGTQ(stats.realized.coupon_gtq)} cupón</span>}
                        {stats.exchange_rate > 0 && <span>· {fmtUSD(stats.realized_profit_usd)}</span>}
                      </div>
                    </>
                  ) : (
                    <p className="text-[13px] font-bold text-nodo-success-tx/80 mt-1">
                      Se llena al marcar pedidos como entregados 🎉
                    </p>
                  )}
                </div>

                {/* Pipeline: en firme + potencial (neto de cupón) */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl bg-nodo-inset p-3">
                    <p className="text-[10px] font-bold text-nodo-sub uppercase tracking-wide">En firme</p>
                    <p className="text-lg font-black text-nodo-ink tabular-nums leading-tight">{fmtGTQ(stats.committed.net_revenue_gtq)}</p>
                    <p className="text-[10px] font-bold text-nodo-sub tabular-nums">{stats.committed.units} u · gana {fmtGTQ(stats.committed.profit_gtq)}</p>
                  </div>
                  <div className="rounded-2xl bg-nodo-inset p-3">
                    <p className="text-[10px] font-bold text-nodo-sub uppercase tracking-wide">Potencial</p>
                    <p className="text-lg font-black text-nodo-ink tabular-nums leading-tight">{fmtGTQ(stats.potential.net_revenue_gtq)}</p>
                    <p className="text-[10px] font-bold text-nodo-sub tabular-nums">{stats.potential.units} u · gana {fmtGTQ(stats.potential.profit_gtq)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Accesos */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <QuickCard icon={<Bell size={18} />} label="Reservas" value={reservations.filter(r => r.is_active && r.status !== 'cancelada').length} onClick={() => setShowReservas(true)} />
              <QuickCard icon={<Users size={18} />} label="Clientes" value={new Set(reservations.map(r => r.client_phone)).size} onClick={() => setShowClients(true)} />
              <QuickCard icon={<Package size={18} />} label="Catálogo" value={catalogItems.filter(i => i.is_published).length} onClick={() => { if (settings) share(); }} />
              <QuickCard icon={<Ticket size={18} />} label="Cupones" value={activeCoupons} onClick={() => setShowCoupons(true)} />
            </div>

            {/* Catálogo Amazon (evergreen) */}
            <div className="flex items-center justify-between">
              <p className="nodo-section-label !mb-0">Catálogo Amazon</p>
              <button onClick={() => { haptic.tap(); setCreateListing('catalog'); }}
                className="text-xs font-black text-nodo-primary flex items-center gap-1 active:scale-95">
                <Plus size={14} /> Agregar
              </button>
            </div>
            {catalogItems.length === 0 ? (
              <div className="nodo-empty-state py-10">
                <Link2 size={34} className="text-nodo-dim mb-2" />
                <p className="text-sm font-bold text-nodo-ink">Catálogo vacío</p>
                <p className="text-xs text-nodo-sub mt-1">Pegá un link de Amazon y publicalo por unos días</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {catalogItems.map(it => (
                  <CatalogItemCard key={it.id} item={it} now={now}
                    onDelete={async () => {
                      if (!confirm(`¿Quitar "${it.title}"?`)) return;
                      await svc.remove(it.id); await load(); flash('ok', 'Quitado');
                    }}
                    onTogglePublish={async () => {
                      await svc.update(it.id, { is_published: !it.is_published }); await load();
                    }} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB contextual: publicar en vivo cuando la tienda está abierta */}
      {storeLive && (
        <button onClick={() => { haptic.tap(); setCreateListing('live'); }}
          className="fixed bottom-24 right-5 z-40 h-16 pl-5 pr-6 rounded-full bg-nodo-primary text-nodo-on-primary flex items-center gap-2 font-black active:scale-90 transition-transform"
          style={{ boxShadow: 'var(--nodo-shadow-fab)' }}>
          <Plus size={26} strokeWidth={2.6} /> Publicar
        </button>
      )}

      {/* Sheets */}
      {calc && createListing && settings && (
        <CreateSheet
          listing={createListing}
          open={!!createListing}
          onClose={() => setCreateListing(null)}
          config={toConfig(calc)}
          onCreated={async () => { setCreateListing(null); await load(); haptic.done(); flash('ok', '¡Publicado! 🎉'); }}
          onError={(m) => flash('err', m)}
        />
      )}
      <OpenStoreSheet open={showOpen} onClose={() => setShowOpen(false)} busy={busy} onOpen={openStore} />
      <ReservasSheet open={showReservas} onClose={() => setShowReservas(false)}
        reservations={reservations} items={items} whatsapp={settings?.whatsapp_number}
        onChanged={load} onError={(m) => flash('err', m)} />
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
      {dropResult && (
        <DropResultModal data={dropResult}
          onClose={() => setDropResult(null)}
          onNewDrop={() => { setDropResult(null); setShowOpen(true); }} />
      )}
    </>
  );
}

// ── Hero en vivo: reloj gigante ─────────────────────────────────────────────────
function LiveHero({ storeName, closesMs, now, items, reserving, onClose, onShare, busy }: {
  storeName?: string | null; closesMs: number | null; now: number;
  items: number; reserving: number; onClose: () => void; onShare: () => void; busy: boolean;
}) {
  const clock = closesMs != null ? fmtClock(closesMs - now) : null;
  const urgent = clock?.urgent ?? false;
  return (
    <div className="nodo-card-hero p-5 bg-nodo-primary text-nodo-on-primary" style={{ boxShadow: 'var(--nodo-shadow-hero)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 motion-safe:animate-ping" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
          <span className="text-[12px] font-black uppercase tracking-[0.14em]">En vivo{storeName ? ` · ${storeName}` : ''}</span>
        </div>
        <button onClick={onShare} className="h-9 w-9 rounded-xl bg-nodo-on-primary/15 flex items-center justify-center active:scale-90 transition-transform">
          <Share2 size={16} />
        </button>
      </div>

      {clock ? (
        <div className="mt-3 flex items-end gap-3">
          <span className={`font-black tabular-nums tracking-tighter leading-none ${urgent ? 'text-red-200 motion-safe:animate-pulse' : ''} text-[56px] lg:text-[68px]`}>
            {clock.big}
          </span>
          <span className="text-sm font-bold text-nodo-on-primary/70 mb-2">{clock.small}</span>
        </div>
      ) : (
        <p className="mt-3 text-[40px] font-black leading-none flex items-center gap-2"><Radio size={30} /> Sin límite</p>
      )}

      <div className="mt-4 flex items-center gap-4">
        <StatMini icon={<Package size={14} />} label="productos" value={items} />
        <StatMini icon={<Flame size={14} />} label="reservando" value={reserving} />
        <div className="flex-1" />
        <button onClick={onClose} disabled={busy}
          className="h-11 px-5 rounded-full bg-nodo-on-primary text-nodo-primary font-black text-sm active:scale-95 transition-transform disabled:opacity-40 flex items-center gap-1.5">
          {busy ? <Loader2 size={16} className="animate-spin" /> : '🏁'} Cerrar tienda
        </button>
      </div>
    </div>
  );
}

function StatMini({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-nodo-on-primary/80">{icon}</span>
      <span className="text-lg font-black tabular-nums">{value}</span>
      <span className="text-[11px] font-semibold text-nodo-on-primary/70">{label}</span>
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
function LiveItemCard({ item, onDelete }: { item: ShopperCatalogItem; onDelete: () => void }) {
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
        <button onClick={onDelete}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center active:scale-90">
          <Trash2 size={13} />
        </button>
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

function CatalogItemCard({ item, now, onDelete, onTogglePublish }: {
  item: ShopperCatalogItem; now: number; onDelete: () => void; onTogglePublish: () => void;
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
        <button onClick={onDelete}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center active:scale-90">
          <Trash2 size={13} />
        </button>
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
function OpenStoreSheet({ open, onClose, busy, onOpen }: {
  open: boolean; onClose: () => void; busy: boolean;
  onOpen: (storeName: string, minutes: number | null) => void;
}) {
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState<number | null>(120);
  const DURATIONS: { m: number | null; label: string }[] = [
    { m: 60, label: '1 hora' }, { m: 120, label: '2 horas' },
    { m: 180, label: '3 horas' }, { m: null, label: 'A mano' },
  ];
  useEffect(() => { if (open) { setName(''); setMinutes(120); } }, [open]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Abrir tienda en vivo"
      footer={
        <button onClick={() => onOpen(name, minutes)} disabled={busy}
          className="w-full h-14 rounded-2xl bg-nodo-primary text-nodo-on-primary font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Radio size={18} />} ABRIR 🔴 EN VIVO
        </button>
      }>
      <div className="flex flex-col gap-4">
        <div>
          <label className="nodo-label">¿En qué tienda estás?</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="ej. Costco, Amazon, Ross…" className="nodo-input" />
        </div>
        <div>
          <label className="nodo-label">¿Cuánto dura el drop?</label>
          <div className="grid grid-cols-4 gap-2">
            {DURATIONS.map(d => (
              <button key={d.label} onClick={() => { haptic.tap(); setMinutes(d.m); }}
                className={`h-12 rounded-2xl text-xs font-black active:scale-95 transition-transform ${minutes === d.m ? 'bg-nodo-primary text-nodo-on-primary' : 'bg-nodo-inset text-nodo-sub border border-nodo-line'}`}>
                {d.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-nodo-sub mt-2">
            {minutes ? `El reloj corre ${minutes / 60}h y al llegar a cero se cierra sola.` : 'Sin reloj: la cerrás vos a mano cuando termines.'}
          </p>
        </div>
      </div>
    </BottomSheet>
  );
}

// ── Alta de producto (foto → precio → cantidad → publicar) ──────────────────────
type CreateMode = 'amazon' | 'foto' | 'manual';

function CreateSheet({ listing, open, onClose, config, onCreated, onError }: {
  listing: ShopperListing; open: boolean; onClose: () => void; config: CalcConfig;
  onCreated: () => void; onError: (m: string) => void;
}) {
  const isLive = listing === 'live';
  const [mode, setMode] = useState<CreateMode>(isLive ? 'foto' : 'amazon');
  const [amazonUrl, setAmazonUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [amazonMeta, setAmazonMeta] = useState<{ url?: string; asin?: string }>({});

  const [priceUsd, setPriceUsd] = useState('');
  const [weight, setWeight] = useState('1');
  const [dimL, setDimL] = useState(''); const [dimW, setDimW] = useState(''); const [dimH, setDimH] = useState('');
  const [priceGtq, setPriceGtq] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const [costGtq, setCostGtq] = useState('');        // costo manual (modo manual)
  const [qty, setQty] = useState(1);
  const [inHand, setInHand] = useState(isLive);      // en vivo siempre es en mano
  const [days, setDays] = useState(3);               // catálogo: días disponible
  const [isOffer, setIsOffer] = useState(false);
  const [compareAt, setCompareAt] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setMode(isLive ? 'foto' : 'amazon'); setAmazonUrl(''); setTitle(''); setDescription(''); setCategory('');
    setImageUrl(null); setAmazonMeta({}); setPriceUsd(''); setWeight('1');
    setDimL(''); setDimW(''); setDimH(''); setPriceGtq(''); setPriceTouched(false); setCostGtq('');
    setQty(1); setInHand(isLive); setDays(3); setIsOffer(false); setCompareAt('');
  };
  useEffect(() => { if (open) reset(); /* eslint-disable-next-line */ }, [open, listing]);

  const result = useMemo(() => calculate(config, {
    priceUsd: num(priceUsd), weightLbs: num(weight),
    dims: { l: num(dimL), w: num(dimW), h: num(dimH) },
    profitMode: 'markup', markupPct: config.defaultMarkupPct, fixedSaleGtq: 0,
  }), [config, priceUsd, weight, dimL, dimW, dimH]);
  const suggestions = useMemo(() => suggestPrices(result.totalCostGtq), [result.totalCostGtq]);

  useEffect(() => {
    if (!priceTouched && suggestions.length > 0) setPriceGtq(String(suggestions[0]));
  }, [suggestions, priceTouched]);

  const doScrape = useCallback(async (url: string) => {
    if (!/amazon|amzn|\/dp\/|\/gp\//i.test(url)) return;
    setScraping(true);
    try {
      const p = await shopperAmazonService.scrape(url);
      if (p.name) setTitle(p.name);
      if (p.description) setDescription(p.description);
      if (p.image_url) setImageUrl(p.image_url);
      if (p.price_usd != null) { setPriceUsd(String(p.price_usd)); setPriceTouched(false); }
      setAmazonMeta({ url: p.url, asin: p.asin });
    } catch {
      onError('No se pudo leer ese enlace de Amazon.');
    } finally {
      setScraping(false);
    }
  }, [onError]);

  const onPhoto = async (f: File | null) => {
    if (!f) return;
    try {
      const dataUrl = await fileToResizedDataUrl(f, { maxSize: 720, quality: 0.7 });
      setImageUrl(dataUrl);
    } catch {
      onError('No se pudo procesar la foto.');
    }
  };

  const canSave = title.trim().length > 0 && num(priceGtq) > 0;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const usesCalc = mode !== 'manual' && num(priceUsd) > 0;
      const madeToOrder = isLive ? false : !inHand;
      await svc.create({
        title: title.trim(),
        description: description || null,
        category: category.trim() || null,
        price_gtq: num(priceGtq),
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
        cost_gtq: mode === 'manual' && num(costGtq) > 0 ? num(costGtq) : null,
        calc: usesCalc ? toSnapshot(config, result) : null,
      });
      reset();
      onCreated();
    } catch {
      onError('No se pudo publicar el producto.');
    } finally {
      setSaving(false);
    }
  };

  const isCaja = config.freightMode === 'caja';
  const showQty = isLive || inHand;

  return (
    <BottomSheet open={open} onClose={onClose} title={isLive ? 'Publicar en vivo ⚡' : 'Agregar al catálogo'}
      footer={
        <button onClick={save} disabled={!canSave || saving}
          className="w-full h-14 rounded-2xl bg-nodo-primary text-nodo-on-primary font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2">
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
          {isLive ? 'PUBLICAR AL DROP' : 'PUBLICAR EN CATÁLOGO'}
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

        {mode === 'foto' && (
          <button onClick={() => fileRef.current?.click()}
            className="h-44 rounded-2xl border-2 border-dashed border-nodo-line bg-nodo-inset flex flex-col items-center justify-center gap-2 text-nodo-sub active:scale-[0.98] transition-transform overflow-hidden">
            {imageUrl ? <img src={imageUrl} className="w-full h-full object-cover" alt="" />
              : <><Camera size={30} /><span className="text-sm font-bold">Tomar o subir foto</span><span className="text-[11px] text-nodo-dim">Cámara o galería del teléfono</span></>}
          </button>
        )}
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
            <div>
              <label className="nodo-label">Categoría (opcional)</label>
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="ej. Belleza, Tecnología" className="nodo-input" />
            </div>

            {mode !== 'manual' && (
              <div className="nodo-card p-4 bg-nodo-inset flex flex-col gap-3">
                <p className="nodo-section-label !mb-0 flex items-center gap-1.5">
                  <Sparkles size={12} /> Calculadora ({isCaja ? 'caja' : 'maleta'})
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="nodo-label">Precio USA ($)</label>
                    <input value={priceUsd} onChange={e => { setPriceUsd(e.target.value); setPriceTouched(false); }}
                      inputMode="decimal" placeholder="0.00" className="nodo-input-number" />
                  </div>
                  {!isCaja ? (
                    <div>
                      <label className="nodo-label">Peso (lb)</label>
                      <input value={weight} onChange={e => setWeight(e.target.value)} inputMode="decimal" className="nodo-input-number" />
                    </div>
                  ) : (
                    <div>
                      <label className="nodo-label">Medidas ({config.dimUnit})</label>
                      <div className="flex gap-1">
                        <input value={dimL} onChange={e => setDimL(e.target.value)} placeholder="L" inputMode="decimal" className="nodo-input-number !px-2" />
                        <input value={dimW} onChange={e => setDimW(e.target.value)} placeholder="A" inputMode="decimal" className="nodo-input-number !px-2" />
                        <input value={dimH} onChange={e => setDimH(e.target.value)} placeholder="H" inputMode="decimal" className="nodo-input-number !px-2" />
                      </div>
                    </div>
                  )}
                </div>
                {num(priceUsd) > 0 && (
                  <div className="flex items-center justify-between text-xs font-semibold text-nodo-sub">
                    <span>Flete {fmtUSD(result.shippingUsd)} + tax {fmtUSD(result.taxUsd)}</span>
                    <span className="text-nodo-ink font-black">Costo {fmtGTQ(result.totalCostGtq)}</span>
                  </div>
                )}
                {suggestions.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {suggestions.map(s => (
                      <button key={s} onClick={() => { setPriceGtq(String(s)); setPriceTouched(true); }}
                        className={`px-3 py-1.5 rounded-xl text-sm font-black tabular-nums active:scale-95 transition-transform ${num(priceGtq) === s ? 'bg-nodo-primary text-nodo-on-primary' : 'bg-nodo-card border border-nodo-line text-nodo-ink'}`}>
                        {fmtGTQ(s)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Costo manual: sin calculadora, capturarlo para margen y ganancias */}
            {mode === 'manual' && (
              <div>
                <label className="nodo-label">Costo (lo que te costó) (Q)</label>
                <input value={costGtq} onChange={e => setCostGtq(e.target.value)}
                  inputMode="decimal" placeholder="0.00" className="nodo-input-number" />
                <p className="text-[11px] text-nodo-sub mt-1">Para calcular tu ganancia. Queda privado.</p>
              </div>
            )}

            <div>
              <label className="nodo-label">Precio de venta (Q)</label>
              <input value={priceGtq} onChange={e => { setPriceGtq(e.target.value); setPriceTouched(true); }}
                inputMode="decimal" placeholder="0.00" className="nodo-input-number" />
              {(() => {
                const cost = mode === 'manual' ? num(costGtq) : result.totalCostGtq;
                if (!(num(priceGtq) > 0 && cost > 0)) return null;
                const profit = num(priceGtq) - cost;
                return (
                  <p className={`text-[11px] font-semibold mt-1 tabular-nums ${profit >= 0 ? 'text-nodo-success-tx' : 'text-nodo-danger-tx'}`}>
                    {profit >= 0 ? 'Ganancia' : 'Pérdida'} {fmtGTQ(Math.abs(profit))}
                    {config.exchangeRate > 0 ? ` · ${fmtUSD(Math.abs(profit) / config.exchangeRate)}` : ''}
                  </p>
                );
              })()}
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
              <div className="flex items-center justify-between nodo-card p-3 bg-nodo-inset">
                <div>
                  <p className="text-sm font-black text-nodo-ink">¿Cuántas tenés?</p>
                  <p className="text-[11px] text-nodo-sub">Se acaban cuando se reservan todas</p>
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
                <label className="nodo-label">Disponible por</label>
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
                <label className="nodo-label">Precio normal (tachado)</label>
                <input value={compareAt} onChange={e => setCompareAt(e.target.value)} inputMode="decimal" placeholder="0.00" className="nodo-input-number" />
              </div>
            )}
          </>
        )}
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
function ReservasSheet({ open, onClose, reservations, items, whatsapp, onChanged, onError }: {
  open: boolean; onClose: () => void; reservations: ShopperReservation[];
  items: ShopperCatalogItem[]; whatsapp?: string | null;
  onChanged: () => Promise<void>; onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [zoom, setZoom] = useState<{ src: string; title?: string | null } | null>(null);
  const active = reservations.filter(r => r.is_active);
  const costById = useMemo(
    () => new Map(items.map(i => [i.id, i.calc_total_cost_gtq ?? null])),
    [items],
  );

  const move = async (r: ShopperReservation, status: string) => {
    setBusy(r.id);
    try { await svc.updateReservation(r.id, { status }); await onChanged(); }
    catch { onError('No se pudo actualizar la reserva.'); }
    finally { setBusy(null); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Reservas">
      {zoom && <ImageLightbox src={zoom.src} title={zoom.title} onClose={() => setZoom(null)} />}
      <div className="flex flex-col gap-3">
        {active.length === 0 && (
          <div className="nodo-empty-state py-10"><Bell size={30} className="text-nodo-dim mb-2" /><p className="text-sm font-bold text-nodo-dim">Aún no hay reservas</p></div>
        )}
        {active.map(r => {
          const meta = RES_META[r.status];
          const idx = FLOW.indexOf(r.status);
          const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;
          const unitCost = costById.get(r.catalog_item_id) ?? null;
          const sale = r.item_price_gtq != null ? r.item_price_gtq * r.quantity : null;
          const cost = unitCost != null ? unitCost * r.quantity : null;
          return (
            <div key={r.id} className="nodo-card p-3 flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                {r.item_image_url
                  ? <button onClick={() => setZoom({ src: r.item_image_url!, title: r.item_title })}
                      className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 active:scale-95 transition-transform group">
                      <img src={r.item_image_url} className="w-full h-full object-cover" alt="" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-active:bg-black/25 transition-colors">
                        <Maximize2 size={13} className="text-white opacity-0 group-active:opacity-100" />
                      </span>
                    </button>
                  : <div className="w-12 h-12 rounded-xl bg-nodo-inset flex items-center justify-center text-nodo-dim shrink-0"><Package size={18} /></div>}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-nodo-ink truncate">{r.item_title}</p>
                  <p className="text-xs text-nodo-sub truncate">{r.client_name} · {r.quantity}u</p>
                  {sale != null && (
                    <p className="text-[11px] font-bold tabular-nums mt-0.5">
                      <span className="text-nodo-ink">Venta {fmtGTQ(sale)}</span>
                      {cost != null
                        ? <span className="text-nodo-sub"> · Costo {fmtGTQ(cost)}</span>
                        : <span className="text-nodo-warn-tx"> · sin costo</span>}
                    </p>
                  )}
                </div>
                <span className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-black ${meta.cls}`}>{meta.emoji} {meta.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {r.item_amazon_url && (
                  <a href={r.item_amazon_url} target="_blank" rel="noopener"
                    className="h-9 px-3 rounded-xl bg-nodo-pastel-yellow text-amber-700 dark:text-amber-300 text-xs font-black flex items-center gap-1 active:scale-95">
                    <Tag size={13} /> Comprar
                  </a>
                )}
                {whatsapp && (
                  <a href={waConfirmLink(r.client_phone, r)} target="_blank" rel="noopener"
                    className="h-9 px-3 rounded-xl bg-nodo-success-bg text-nodo-success-tx text-xs font-black flex items-center gap-1 active:scale-95">
                    <MessageCircle size={15} /> Confirmar
                  </a>
                )}
                <div className="flex-1" />
                {!['entregada', 'cancelada', 'no_disponible'].includes(r.status) && (
                  <button onClick={() => move(r, 'cancelada')} disabled={busy === r.id}
                    className="h-9 px-3 rounded-xl bg-nodo-inset text-nodo-sub text-xs font-bold active:scale-95 disabled:opacity-40">
                    <X size={14} />
                  </button>
                )}
                {next && (
                  <button onClick={() => move(r, next)} disabled={busy === r.id}
                    className="h-9 px-3 rounded-xl bg-nodo-primary text-nodo-on-primary text-xs font-black flex items-center gap-1 active:scale-95 disabled:opacity-40">
                    {busy === r.id ? <Loader2 size={14} className="animate-spin" /> : <>{RES_META[next].emoji} {RES_META[next].label} <ArrowRight size={13} /></>}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </BottomSheet>
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
                { value: 'maleta', label: 'Maleta (peso)', icon: <Package size={14} /> },
                { value: 'caja', label: 'Caja (volumen)', icon: <Box size={14} /> },
              ]}
              value={freight} onChange={setFreight} />
            {freight === 'maleta' ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Precio maleta ($)" value={scCost} onChange={setScCost} />
                <Field label="Libras disponibles" value={scCap} onChange={setScCap} />
              </div>
            ) : (
              <>
                <Field label="Precio caja ($)" value={boxCost} onChange={setBoxCost} />
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Largo (in)" value={boxL} onChange={setBoxL} />
                  <Field label="Ancho (in)" value={boxW} onChange={setBoxW} />
                  <Field label="Alto (in)" value={boxH} onChange={setBoxH} />
                </div>
              </>
            )}
            <div className="grid grid-cols-3 gap-3">
              <Field label="Tipo cambio" value={exchange} onChange={setExchange} />
              <Field label="Tax (%)" value={tax} onChange={setTax} />
              <Field label="Ganancia (%)" value={markup} onChange={setMarkup} />
            </div>
          </>
        ) : (
          <>
            <div><label className="nodo-label">Nombre del negocio</label><input value={biz} onChange={e => setBiz(e.target.value)} className="nodo-input" /></div>
            <div><label className="nodo-label">WhatsApp</label><input value={wa} onChange={e => setWa(e.target.value)} className="nodo-input" inputMode="tel" /></div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Entrega mín. (días)" value={dmin} onChange={setDmin} />
              <Field label="Entrega máx. (días)" value={dmax} onChange={setDmax} />
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
          <div className="nodo-empty-state py-10"><Users size={30} className="text-nodo-dim mb-2" /><p className="text-sm font-bold text-nodo-dim">Aún sin clientes</p></div>
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
            <div className="nodo-card p-4 bg-nodo-primary-soft border-none flex items-center gap-3">
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
              <div className="h-2.5 rounded-full bg-nodo-line overflow-hidden">
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
              <div className="flex items-center justify-between nodo-card p-3 bg-nodo-inset">
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
