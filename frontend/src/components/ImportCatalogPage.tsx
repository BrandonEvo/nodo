/**
 * Catálogo público de Importaciones — "el juego de apartar antes que cierre el viaje".
 *
 * Diseño conclusión del panel (marketing + psicología + UX + tiempo):
 *  - Banner-misión: countdown REAL al cierre del próximo viaje + momentum del lote.
 *  - Tarjeta con gancho de venta (hook) legible; detalle al tocar (descripción 500ch).
 *  - Pedido acumulado por teléfono: 1er apartado pide datos; los siguientes son 1 toque.
 *  - Pill "Mi pedido" que crece como marcador; celebración en el primer apartado.
 *  - Cero contadores falsos: countdown, momentum y "apartado hace X" son datos reales.
 *
 * Sobre la escasez: la mayoría de los productos son POR ENCARGO (`is_made_to_order`),
 * o sea que no hay inventario que agotar. Ahí no se muestra ninguna señal de escasez,
 * porque cualquier "quedan N" o barra de progreso sería inventada. Sólo los ítems que
 * el negocio marcó con stock físico muestran "quedan N" / "última".
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Loader2, ShoppingBag, MessageCircle, Package, Clock, Check, X,
  AlertTriangle, Truck, Plus, Minus, ChevronRight, Sparkles, Zap,
  Flame, HelpCircle, Receipt, Users, ArrowUp,
} from 'lucide-react';
import {
  importCatalogService,
  LAST_CATALOG_KEY,
  type PublicImportCatalog,
  type PublicImportCatalogItem,
  type PublicImportReservation,
} from '@/services/import_catalog.service';
import { deriveFacets, availableFacets } from '@/apps/importaciones/facets';
import { haptic } from '@/utils/haptic';
import { themeStyle, PayInfoCard } from './importPublicShared';
import { ImportCatalogTour, type TourStep } from './ImportCatalogTour';

interface Props { token: string }

const TOUR_SEEN_KEY = 'nodo_import_tour_seen_v1';

const fmt = (n: number) =>
  'Q ' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtShort = (n: number) =>
  'Q' + n.toLocaleString('es-GT', { maximumFractionDigits: 0 });

function buildWhatsApp(phone: string, message: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}

// Similitud client-side para "Te puede gustar" (heurística, sin IA):
// misma categoría pesa fuerte + cercanía de precio. Espeja _similar_items del backend.
function scoreSimilar(base: PublicImportCatalogItem, other: PublicImportCatalogItem): number {
  if (other.id === base.id || other.stock_available <= 0) return -1;
  let s = 0;
  if (base.category && other.category && base.category === other.category) s += 0.5;
  const bp = base.price_gtq ?? 0, op = other.price_gtq ?? 0;
  if (bp > 0 && op > 0) {
    const diff = Math.abs(bp - op) / bp;
    s += Math.max(0, 0.4 * (1 - Math.min(1, diff)));
  }
  if (base.is_offer && other.is_offer) s += 0.05;
  return s;
}

/** Cliente recordado en el dispositivo → recompra de 1 toque. */
interface RememberedClient { name: string; phone: string; order_token?: string }
const clientKey = (token: string) => `nodo_import_client_${token}`;
const sessionReserveKey = (token: string) => `nodo_import_reserved_${token}`;

function loadClient(token: string): RememberedClient | null {
  try { const raw = localStorage.getItem(clientKey(token)); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function saveClient(token: string, c: RememberedClient) {
  try { localStorage.setItem(clientKey(token), JSON.stringify(c)); } catch { /* private mode */ }
}

// ─── Countdown al cierre del viaje ──────────────────────────────────────────────
type TripPhase = 'far' | 'near' | 'critical' | 'closed' | 'none';

function useTrip(closeAt?: string | null) {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    if (!closeAt) { setMs(null); return; }
    const tick = () => setMs(new Date(closeAt).getTime() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [closeAt]);

  if (!closeAt || ms === null) return { phase: 'none' as TripPhase, label: '', sub: '' };
  if (ms <= 0) return { phase: 'closed' as TripPhase, label: 'Cerrado', sub: 'En preparación 📦' };

  const days = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);

  const phase: TripPhase = ms <= 6 * 3_600_000 ? 'critical' : ms <= 48 * 3_600_000 ? 'near' : 'far';
  let label: string, sub: string;
  if (phase === 'far') { label = `${days}d ${h}h`; sub = 'para que cierre'; }
  else if (phase === 'near') { label = `${h}h ${String(m).padStart(2, '0')}m`; sub = '¡ya casi cierra!'; }
  else { label = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; sub = '¡última oportunidad de hoy!'; }
  return { phase, label, sub };
}

function timeAgo(iso?: string | null): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0 || diff > 86_400_000) return null;      // solo "reciente" (<24h) es prueba social útil
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h`;
}

function deliveryRangeLabel(minDays: number, maxDays: number) {
  const f = (n: number) => {
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.toLocaleDateString('es-GT', { day: 'numeric', month: 'short' });
  };
  return `${f(minDays)} – ${f(maxDays)}`;
}

// Liquid glass (iOS) — misma receta que la clase .liquid-glass de index.css.
const glassCard: React.CSSProperties = {
  background:
    'linear-gradient(178deg, var(--nodo-glass-highlight) 0%, transparent 34%),'
    + 'radial-gradient(120% 80% at 12% -15%, rgba(255,255,255,0.16) 0%, transparent 52%),'
    + 'var(--nodo-glass-bg-strong)',
  backdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
  WebkitBackdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
  border: '1px solid var(--nodo-glass-border)',
  boxShadow:
    'inset 0 1px 0 var(--nodo-glass-highlight),'
    + 'inset 0 -8px 24px -12px var(--nodo-glass-edge),'
    + 'var(--nodo-shadow-card)',
};

// ─── Confetti CSS puro (una sola vez por sesión) ────────────────────────────────
function Confetti() {
  const pieces = useMemo(
    () => Array.from({ length: 16 }, (_, i) => ({
      left: `${(i / 16) * 100 + Math.random() * 5}%`,
      delay: `${Math.random() * 120}ms`,
      color: ['#69E7A8', '#4158D0', '#FFC93C', '#FF6B6B', '#C084FC'][i % 5],
      rot: `${Math.random() * 360}deg`,
    })),
    [],
  );
  return (
    <div className="fixed inset-0 z-[95] pointer-events-none overflow-hidden">
      <style>{`@keyframes nodo-confetti-fall{0%{transform:translateY(-12vh) rotate(0);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}`}</style>
      {pieces.map((p, i) => (
        <span key={i} style={{
          position: 'absolute', top: 0, left: p.left, width: 9, height: 14,
          background: p.color, borderRadius: 2, transform: `rotate(${p.rot})`,
          animation: `nodo-confetti-fall 1100ms cubic-bezier(.2,.6,.4,1) ${p.delay} forwards`,
        }} />
      ))}
    </div>
  );
}

// ─── Momentum del lote ──────────────────────────────────────────────────────────
// Números absolutos, nunca porcentaje: no existe un "cupo" con denominador real.
// Bajo 3 personas no se muestra nada — "1 persona apartó" es prueba social negativa.
const MOMENTUM_MIN_PEOPLE = 3;

function Momentum({ people, units, dark = false }: { people: number; units: number; dark?: boolean }) {
  if (people < MOMENTUM_MIN_PEOPLE) return null;
  return (
    <div className={`flex items-center gap-1.5 text-[11px] font-bold ${dark ? 'opacity-90' : 'text-nodo-sub'}`}>
      <Users size={13} className="shrink-0" />
      <span>Ya apartaron {people} personas · {units} {units === 1 ? 'producto' : 'productos'}</span>
    </div>
  );
}

// ─── Banner-misión del viaje ────────────────────────────────────────────────────
function TripBanner({
  tripName, phase, label, sub, people, units, deliveryRange, tripLabel, originLabel,
}: {
  tripName?: string | null; phase: TripPhase; label: string; sub: string;
  people: number; units: number; deliveryRange: string; tripLabel: string; originLabel: string;
}) {
  if (phase === 'none') {
    // Sin corte programado: banner suave de entrega estimada.
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-3xl" style={glassCard}>
        <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 flex items-center justify-center shrink-0">
          <Truck size={18} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-widest">Entrega estimada</p>
          <p className="text-sm font-black text-nodo-ink">{deliveryRange}{originLabel ? ` · ${originLabel}` : ''}</p>
          <div className="mt-1"><Momentum people={people} units={units} /></div>
        </div>
      </div>
    );
  }

  const closed = phase === 'closed';
  const critical = phase === 'critical';

  return (
    <div
      className="relative overflow-hidden rounded-[28px] p-5 text-nodo-on-primary"
      style={{
        background: closed ? 'var(--nodo-inset)' : 'var(--nodo-iris)',
        boxShadow: closed ? 'none' : 'var(--nodo-shadow-fab)',
      }}
    >
      {!closed && (
        <div className="absolute -right-6 -top-8 opacity-20">
          <Package size={120} strokeWidth={1.2} />
        </div>
      )}
      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-black uppercase tracking-[0.18em] ${closed ? 'text-nodo-dim' : ''}`}>
            {critical ? '🔴 Cierra hoy' : closed ? `${tripLabel} cerrado` : `⏳ ${tripLabel}`}
          </span>
          {tripName && !closed && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/15">{tripName}</span>
          )}
        </div>

        {closed ? (
          <p className="text-xl font-black text-nodo-ink leading-tight">{sub}</p>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-[40px] leading-none font-black tabular-nums tracking-tighter">{label}</span>
              {critical && <Zap size={22} className="animate-pulse" />}
            </div>
            <p className="text-sm font-bold opacity-90 mt-0.5">{sub}</p>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Momentum people={people} units={units} dark />
              <div className="flex items-center gap-1.5 text-[11px] font-bold opacity-90">
                <Truck size={13} className="shrink-0" />
                <span>Llega {deliveryRange}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-3xl overflow-hidden" style={glassCard}>
      <div className="h-36 bg-nodo-inset animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-3 rounded-full bg-nodo-inset animate-pulse w-3/4" />
        <div className="h-3 rounded-full bg-nodo-inset animate-pulse w-1/2" />
        <div className="h-10 rounded-2xl bg-nodo-inset animate-pulse mt-2" />
      </div>
    </div>
  );
}

// ─── Tarjeta de producto ─────────────────────────────────────────────────────────
function ProductCard({
  item, oneTap, onReserve, onDetail, isSoldSection = false, tourId,
}: {
  item: PublicImportCatalogItem;
  oneTap: boolean;
  onReserve: (item: PublicImportCatalogItem) => void;
  onDetail: (item: PublicImportCatalogItem) => void;
  isSoldSection?: boolean;
  tourId?: string;
}) {
  const [imgErr, setImgErr] = useState(false);
  // Un ítem por encargo nunca se agota ni "queda poco": se compra al apartarlo.
  const mto = item.is_made_to_order;
  const isSold = !mto && item.stock_available <= 0;
  const low = !mto && !isSold && item.stock_available <= 3;
  const ago = timeAgo(item.last_reserved_at);
  const isOffer = item.is_offer && item.compare_at_price_gtq != null;

  return (
    <div
      className={`liquid-glass group rounded-3xl overflow-hidden flex flex-col transition-transform duration-150
                  ${isSoldSection ? 'opacity-45' : 'active:scale-[0.98]'}`}
    >
      {/* Zona táctil de detalle: imagen + textos */}
      <button
        type="button"
        onClick={() => !isSold && onDetail(item)}
        disabled={isSold}
        className="text-left flex flex-col flex-1 disabled:cursor-default"
      >
        <div className="relative overflow-hidden bg-white flex-shrink-0" style={{ height: 140 }}>
          {item.image_url && !imgErr ? (
            <img src={item.image_url} alt={item.title} onError={() => setImgErr(true)}
              className="w-full h-full object-contain p-2" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-nodo-inset">
              <Package size={34} className="text-nodo-dim" />
            </div>
          )}

          {ago && !isSold && (
            <div className="absolute top-2 left-2 text-[9px] font-bold px-2 py-0.5 rounded-full bg-black/55 text-white backdrop-blur-sm">
              apartado {ago}
            </div>
          )}
          {isOffer && !isSold && (
            <div className="absolute top-2 right-2 text-[9px] font-black px-2 py-0.5 rounded-full bg-rose-500 text-white">
              🔥 OFERTA
            </div>
          )}
          {low && (
            <div className="absolute bottom-2 left-2 text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500 text-white animate-pulse">
              {item.stock_available === 1 ? '🔴 última' : `🔥 quedan ${item.stock_available}`}
            </div>
          )}
          {isSold && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="text-white text-xs font-black px-3 py-1 rounded-full bg-black/60">VENDIDO ✓</span>
            </div>
          )}
          {item.description && !isSold && (
            <div className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-white/85 flex items-center justify-center shadow-sm">
              <ChevronRight size={14} className="text-nodo-ink" />
            </div>
          )}
        </div>

        <div className="px-3 pt-2.5 pb-1 flex flex-col gap-0.5 flex-1">
          <p className="text-[13px] font-bold text-nodo-ink leading-snug line-clamp-2">{item.title}</p>
          {item.hook && (
            <p className="text-[11px] text-nodo-sub font-medium leading-tight line-clamp-1">{item.hook}</p>
          )}
        </div>
      </button>

      <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
        {item.price_gtq != null && !isSold && (
          <div className="flex items-baseline gap-1.5">
            <p className="text-xl font-black text-nodo-ink tabular-nums leading-none">{fmt(item.price_gtq)}</p>
            {isOffer && (
              <p className="text-[11px] font-bold text-nodo-dim line-through tabular-nums">{fmt(item.compare_at_price_gtq!)}</p>
            )}
          </div>
        )}
        {!isSold && (
          <button
            data-tour={tourId}
            onClick={() => { haptic.tap(); onReserve(item); }}
            className="flex items-center justify-center gap-1.5 w-full rounded-2xl text-xs font-black text-white
                       active:scale-[0.96] transition-transform"
            style={{ background: 'var(--nodo-iris)', height: 44 }}
          >
            {oneTap ? <><Zap size={13} /> Apartar</> : <><ShoppingBag size={13} /> Apartar</>}
          </button>
        )}
      </div>
    </div>
  );
}

// Descripción con "ver más/menos": no abruma cuando quedó larga.
function DescriptionBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 150 || text.split('\n').length > 3;
  return (
    <div>
      <p className={`text-sm text-nodo-sub leading-relaxed whitespace-pre-line ${!expanded && long ? 'line-clamp-3' : ''}`}>{text}</p>
      {long && (
        <button onClick={() => { haptic.tap(); setExpanded(e => !e); }}
          className="text-xs font-black text-nodo-primary mt-1 active:scale-95 transition-transform">
          {expanded ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </div>
  );
}

// ─── Sheet de detalle (descripción completa) ────────────────────────────────────
function DetailSheet({
  item, oneTap, similar, onClose, onReserve, onPick,
}: {
  item: PublicImportCatalogItem; oneTap: boolean;
  similar: PublicImportCatalogItem[];
  onClose: () => void; onReserve: (i: PublicImportCatalogItem) => void;
  onPick: (i: PublicImportCatalogItem) => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const mto = item.is_made_to_order;
  const low = !mto && item.stock_available <= 3;
  const isOffer = item.is_offer && item.compare_at_price_gtq != null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-t-[32px] pb-[max(1.5rem,env(safe-area-inset-bottom))] overflow-hidden"
        style={glassCard}>
        <div className="flex justify-center pt-3 pb-2"><div className="w-10 h-1 rounded-full bg-nodo-line" /></div>
        <div className="relative h-52 bg-white mx-4 rounded-2xl overflow-hidden">
          {item.image_url && !imgErr ? (
            <img src={item.image_url} alt={item.title} onError={() => setImgErr(true)}
              className="w-full h-full object-contain p-3" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-nodo-inset">
              <Package size={40} className="text-nodo-dim" />
            </div>
          )}
        </div>

        <div className="px-5 pt-4 space-y-3">
          <div>
            <h2 className="text-lg font-black text-nodo-ink leading-tight">{item.title}</h2>
            {item.hook && <p className="text-sm text-nodo-primary font-bold mt-0.5">{item.hook}</p>}
          </div>

          {item.description && <DescriptionBlock text={item.description} />}

          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              {item.price_gtq != null && (
                <p className="text-2xl font-black text-nodo-ink tabular-nums">{fmt(item.price_gtq)}</p>
              )}
              {isOffer && (
                <p className="text-sm font-bold text-nodo-dim line-through tabular-nums">{fmt(item.compare_at_price_gtq!)}</p>
              )}
            </div>
            {low ? (
              <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-rose-500 text-white">
                {item.stock_available === 1 ? '🔴 Última unidad' : `🔥 Quedan ${item.stock_available}`}
              </span>
            ) : isOffer && (
              <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-rose-500 text-white">
                🔥 Oferta por tiempo limitado
              </span>
            )}
          </div>

          {mto && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-nodo-inset">
              <Package size={15} className="text-nodo-sub shrink-0" />
              <p className="text-xs text-nodo-sub font-medium leading-snug">
                Se pide a tu nombre y viene en el próximo envío.
              </p>
            </div>
          )}

          <button
            onClick={() => { haptic.tap(); onReserve(item); }}
            className="w-full rounded-2xl text-white font-black text-base flex items-center justify-center gap-2
                       active:scale-[0.97] transition-transform mt-1"
            style={{ background: 'var(--nodo-iris)', height: 54 }}
          >
            {oneTap ? <Zap size={18} /> : <ShoppingBag size={18} />}
            {oneTap ? 'Apartar en 1 toque' : 'Apartar'}
          </button>

          {similar.length > 0 && (
            <div className="pt-1">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles size={13} style={{ color: 'var(--nodo-primary)' }} />
                <p className="text-[11px] font-black text-nodo-ink uppercase tracking-widest">Te puede gustar</p>
              </div>
              <div className="flex gap-2.5 overflow-x-auto -mx-5 px-5 pb-1 scrollbar-none">
                {similar.map(s => (
                  <button key={s.id} onClick={() => { haptic.tap(); onPick(s); }}
                    className="shrink-0 w-24 rounded-2xl overflow-hidden text-left active:scale-[0.97] transition-transform"
                    style={glassCard}>
                    <div className="h-20 bg-white flex items-center justify-center">
                      {s.image_url
                        ? <img src={s.image_url} alt={s.title} className="w-full h-full object-contain p-1" loading="lazy" />
                        : <Package size={18} className="text-nodo-dim" />}
                    </div>
                    <div className="px-2 pt-1.5 pb-2">
                      <p className="text-[10px] font-bold text-nodo-ink leading-tight line-clamp-2">{s.title}</p>
                      {s.price_gtq != null && (
                        <p className="text-[12px] font-black text-nodo-ink tabular-nums mt-0.5">{fmt(s.price_gtq)}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sheet de datos (solo primera vez) ──────────────────────────────────────────
function ReserveSheet({
  item, token, src, onClose, onSuccess,
}: {
  item: PublicImportCatalogItem; token: string; src?: string | null;
  onClose: () => void; onSuccess: (r: PublicImportReservation, name: string, phone: string) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const max = Math.min(item.stock_available, 10);
  const ok = name.trim().length > 1 && phone.replace(/\D/g, '').length >= 8;

  const submit = async () => {
    if (!ok || saving) return;
    haptic.tap(); setSaving(true); setErr(null);
    try {
      const res = await importCatalogService.createReservation(token, item.id, {
        client_name: name.trim(), client_phone: phone.trim(), quantity: qty,
      }, src);
      haptic.confirm();
      onSuccess(res, name.trim(), phone.trim());
    } catch (e: unknown) {
      haptic.error();
      setErr((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'No se pudo apartar.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-t-[32px] pb-[max(1.5rem,env(safe-area-inset-bottom))]" style={glassCard}>
        <div className="flex justify-center pt-3 pb-4"><div className="w-10 h-1 rounded-full bg-nodo-line" /></div>
        <div className="px-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xl font-black text-nodo-ink leading-tight">Apartar</p>
              <p className="text-sm text-nodo-sub mt-0.5 line-clamp-1">{item.title}</p>
            </div>
            {item.price_gtq != null && (
              <p className="text-2xl font-black text-nodo-ink tabular-nums shrink-0">{fmt(item.price_gtq)}</p>
            )}
          </div>

          {err && (
            <div className="flex items-center gap-2 bg-nodo-danger-bg border border-nodo-danger-bd
                            text-nodo-danger-tx text-xs font-bold px-3 py-2.5 rounded-2xl">
              <AlertTriangle size={14} className="shrink-0" />
              <span className="flex-1">{err}</span>
              <button onClick={() => setErr(null)}><X size={12} /></button>
            </div>
          )}

          <div>
            <label className="nodo-label">Tu nombre</label>
            <input type="text" value={name} autoFocus
              onChange={e => setName(e.target.value)} placeholder="Ana García" className="nodo-input" />
          </div>
          <div>
            <label className="nodo-label">WhatsApp</label>
            <input type="tel" inputMode="tel" value={phone}
              onChange={e => setPhone(e.target.value)} placeholder="+502 5555-1234" className="nodo-input" />
          </div>

          {max > 1 && (
            <div>
              <label className="nodo-label">Cantidad</label>
              <div className="flex items-center gap-3 mt-1">
                <button onClick={() => { haptic.tap(); setQty(q => Math.max(1, q - 1)); }}
                  className="w-11 h-11 rounded-2xl bg-nodo-inset border border-nodo-line flex items-center justify-center active:scale-90 transition-transform">
                  <Minus size={18} className="text-nodo-ink" />
                </button>
                <span className="w-12 text-center text-xl font-black text-nodo-ink tabular-nums">{qty}</span>
                <button onClick={() => { haptic.tap(); setQty(q => Math.min(max, q + 1)); }}
                  className="w-11 h-11 rounded-2xl flex items-center justify-center active:scale-90 transition-transform"
                  style={{ background: 'var(--nodo-ink)' }}>
                  <Plus size={18} className="text-nodo-canvas" />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2.5 p-3 rounded-2xl"
            style={{ background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.22)' }}>
            <Clock size={15} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300 font-medium leading-relaxed">
              Guardamos tu lugar y precio por <strong>2 horas</strong>. Después lo confirmás por WhatsApp
              y podés seguir sumando al mismo pedido.
            </p>
          </div>

          <button onClick={submit} disabled={!ok || saving}
            className="w-full rounded-2xl font-black text-base flex items-center justify-center gap-2
                       active:scale-[0.97] transition-transform disabled:opacity-40"
            style={{ background: ok ? 'var(--nodo-iris)' : 'var(--nodo-inset)', color: ok ? 'white' : undefined, height: 54 }}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <ShoppingBag size={18} />}
            {saving ? 'Apartando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Celebración post-apartado ──────────────────────────────────────────────────
function ReservedToast({
  item, orderTotal, orderItems, onWhatsApp, onSeguir, onVerPedido,
}: {
  item: PublicImportReservation; orderTotal: number; orderItems: number;
  onWhatsApp: () => void; onSeguir: () => void; onVerPedido: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center px-4 py-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-sm rounded-[32px] overflow-hidden p-6 space-y-4" style={glassCard}>
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: 'var(--nodo-iris)' }}>
            <Check size={32} className="text-white" strokeWidth={3} />
          </div>
          <h2 className="text-2xl font-black text-nodo-ink">¡Apartado! 🎉</h2>
          <p className="text-sm text-nodo-sub leading-snug line-clamp-1">{item.item_title}</p>
        </div>

        {/* Marcador del pedido — bola de nieve */}
        <div className="rounded-2xl p-4 flex items-center justify-between"
          style={{ background: 'var(--nodo-primary-soft)' }}>
          <div>
            <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-widest">Tu pedido</p>
            <p className="text-sm font-black text-nodo-ink">{orderItems} {orderItems === 1 ? 'producto' : 'productos'}</p>
          </div>
          <p className="text-2xl font-black text-nodo-ink tabular-nums">{fmt(orderTotal)}</p>
        </div>

        {item.order_pin && (
          <div className="rounded-2xl px-4 py-2.5 flex items-center justify-between gap-2 bg-nodo-inset">
            <p className="text-[11px] font-bold text-nodo-sub leading-snug">
              Guarda tu código para consultar tu pedido con tu WhatsApp
            </p>
            <span className="text-lg font-black text-nodo-ink tabular-nums tracking-widest shrink-0">{item.order_pin}</span>
          </div>
        )}

        <button onClick={onSeguir}
          className="w-full rounded-2xl text-white font-black text-base flex items-center justify-center gap-2
                     active:scale-[0.97] transition-transform"
          style={{ background: 'var(--nodo-iris)', height: 52 }}>
          <Sparkles size={17} /> Seguir agregando
        </button>
        <div className="flex gap-2">
          <button onClick={onVerPedido}
            className="flex-1 h-12 rounded-2xl bg-nodo-inset text-nodo-ink font-bold text-sm
                       flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
            <ShoppingBag size={15} /> Mi pedido
          </button>
          {item.whatsapp_number && (
            <button onClick={onWhatsApp}
              className="flex-1 h-12 rounded-2xl bg-emerald-500 text-white font-black text-sm
                         flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
              <MessageCircle size={15} /> WhatsApp
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pill flotante "Mi pedido" ──────────────────────────────────────────────────
function OrderPill({ total, count, bump, onClick }: {
  total: number; count: number; bump: boolean; onClick: () => void;
}) {
  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-[60]"
      style={{ bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
      <button onClick={onClick}
        className={`flex items-center gap-2.5 pl-4 pr-3 h-13 rounded-full text-white shadow-lg
                    active:scale-95 transition-transform ${bump ? 'animate-[nodo-pill-bump_300ms_ease-out]' : ''}`}
        style={{ background: 'var(--nodo-ink)', height: 52 }}>
        <style>{`@keyframes nodo-pill-bump{0%{transform:scale(1)}40%{transform:scale(1.12)}100%{transform:scale(1)}}`}</style>
        <div className="relative">
          <ShoppingBag size={20} />
          <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-[10px] font-black flex items-center justify-center">
            {count}
          </span>
        </div>
        <div className="text-left leading-none">
          <p className="text-[9px] font-bold uppercase tracking-widest opacity-70">Mi pedido</p>
          <p className="text-sm font-black tabular-nums">{fmtShort(total)}</p>
        </div>
        <ChevronRight size={16} className="opacity-60" />
      </button>
    </div>
  );
}

// ─── Chips de facetas (filtro del catálogo, estilo Uber Eats) ───────────────────
// Sólo se listan las facetas que tienen productos: un chip "Medicina" que abre en
// vacío delata la taxonomía. Selección única — el catálogo es chico y cruzar dos
// facetas no aporta nada.
function FacetChips({ facets, value, onChange }: {
  facets: Array<{ id: string; label: string; emoji: string; count: number }>;
  value: string | null; onChange: (f: string | null) => void;
}) {
  if (facets.length === 0) return null;
  const chip = (active: boolean) =>
    `shrink-0 flex items-center gap-1.5 pl-3 pr-3.5 h-10 rounded-full text-[13px] font-black
     whitespace-nowrap transition-transform active:scale-95 ${
      active ? 'text-nodo-on-primary' : 'text-nodo-sub bg-nodo-inset'}`;
  return (
    <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-0.5 scrollbar-none">
      <button onClick={() => { haptic.tap(); onChange(null); }} className={chip(value === null)}
        style={value === null ? { background: 'var(--nodo-primary)' } : undefined}>
        Todo
      </button>
      {facets.map(f => (
        <button key={f.id} onClick={() => { haptic.tap(); onChange(value === f.id ? null : f.id); }}
          className={chip(value === f.id)}
          style={value === f.id ? { background: 'var(--nodo-primary)' } : undefined}>
          <span aria-hidden>{f.emoji}</span>
          {f.label}
          <span className={`text-[10px] tabular-nums ${value === f.id ? 'opacity-70' : 'text-nodo-dim'}`}>
            {f.count}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Botón "volver arriba" ──────────────────────────────────────────────────────
// Aparece al alejarse del inicio. Vive a la derecha para no chocar con la pill
// "Mi pedido", que está centrada abajo.
function ScrollTopButton({ visible, raised }: { visible: boolean; raised: boolean }) {
  return (
    <button
      onClick={() => { haptic.tap(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
      aria-label="Volver arriba"
      className={`fixed right-4 z-[60] w-12 h-12 rounded-full flex items-center justify-center
                  text-nodo-ink active:scale-90 transition-all duration-200
                  ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`}
      style={{
        ...glassCard,
        bottom: `calc(${raised ? 80 : 16}px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      <ArrowUp size={20} />
    </button>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────────
export function ImportCatalogPage({ token }: Props) {
  const [catalog, setCatalog] = useState<PublicImportCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showSold, setShowSold] = useState(false);
  const [activeFacet, setActiveFacet] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const [detailItem, setDetailItem] = useState<PublicImportCatalogItem | null>(null);
  const [reserveItem, setReserveItem] = useState<PublicImportCatalogItem | null>(null);
  const [celebrate, setCelebrate] = useState<PublicImportReservation | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [pillBump, setPillBump] = useState(false);

  const [client, setClient] = useState<RememberedClient | null>(() => loadClient(token));
  const [tourOpen, setTourOpen] = useState(false);
  // Pedido local acumulado en la sesión (para el marcador de la pill, sin refetch).
  const [order, setOrder] = useState<{ total: number; count: number }>({ total: 0, count: 0 });
  // Atribución de campaña del enlace/QR (?src=insta) — se guarda en la ficha al apartar.
  const attributionSrc = useMemo(() => new URLSearchParams(window.location.search).get('src'), []);

  const trip = useTrip(catalog?.trip_close_at);
  const deliveryRange = useMemo(
    () => catalog ? deliveryRangeLabel(catalog.delivery_days_min, catalog.delivery_days_max) : '',
    [catalog],
  );
  // Terminología configurable. trip_label vacío/null → "viaje". origin_label:
  // null → default; "" (vacío) → oculto (el negocio lo desactivó).
  const tripLabel = catalog?.trip_label?.trim() || 'viaje';
  const originLabel = catalog ? (catalog.origin_label ?? 'desde USA 🇺🇸') : '';

  const reload = useCallback(() => {
    importCatalogService.getPublic(token)
      .then(c => {
        setCatalog(c);
        // Deja rastro del negocio para que /mi-pedido sepa dónde buscar.
        try { localStorage.setItem(LAST_CATALOG_KEY, token); } catch { /* private mode */ }
      })
      .catch(e => { if (e.response?.status === 404) setNotFound(true); })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { reload(); }, [reload]);

  // El botón de subir aparece cuando ya te alejaste del inicio.
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Facetas por ítem: el clasificador corre una vez por carga, no en cada tick del
  // countdown (que re-renderiza la página entera cada segundo).
  const itemFacets = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const i of catalog?.items ?? []) m.set(i.id, deriveFacets(i));
    return m;
  }, [catalog]);

  const facetChips = useMemo(
    () => availableFacets((catalog?.items ?? []).filter(i => i.stock_available > 0)),
    [catalog],
  );

  // ── Tutorial guiado (comprador nuevo) ──
  const tourSteps: TourStep[] = useMemo(() => {
    const hasItems = !!catalog?.items.some(i => i.stock_available > 0);
    const tl = catalog?.trip_label?.trim() || 'viaje';
    const s: TourStep[] = [
      { emoji: '👋', title: '¡Hola! Bienvenido/a', body: `Aquí apartás lo que te gusta antes de que cierre el próximo ${tl}. Te muestro cómo funciona en unos pasos.` },
      { target: 'trip', emoji: '⏳', title: `El próximo ${tl}`, body: 'Mirá cuánto falta para que cierre. Todo lo que apartes entra en este pedido y te llega en pocos días.' },
    ];
    if (hasItems) s.push({ target: 'apartar', emoji: '🛍️', title: 'Apartá con un toque', body: 'Tocá «Apartar» en lo que quieras. Podés apartar varias cosas: se juntan en un mismo pedido.' });
    s.push({ emoji: '🧾', title: 'Tu pedido y tu PIN', body: 'Tus apartados se juntan en «Mi pedido». Guardá tu PIN de 4 dígitos: con él y tu WhatsApp consultás tu pedido cuando quieras.' });
    s.push({ target: 'help', emoji: '🎉', title: '¡Ya estás listo/a!', body: 'Cuando quieras volver a ver esta guía, tocá aquí. ¡A apartar!' });
    return s;
  }, [catalog]);

  // Auto-abre una sola vez para visitantes nuevos, tras cargar el catálogo.
  useEffect(() => {
    if (!catalog) return;
    try {
      if (localStorage.getItem(TOUR_SEEN_KEY)) return;
    } catch { return; }
    const t = setTimeout(() => setTourOpen(true), 700);
    return () => clearTimeout(t);
  }, [catalog]);

  const closeTour = useCallback(() => {
    setTourOpen(false);
    try { localStorage.setItem(TOUR_SEEN_KEY, '1'); } catch { /* almacenamiento bloqueado */ }
  }, []);
  const startTour = useCallback(() => { haptic.tap(); setTourOpen(true); }, []);

  const registerReserved = useCallback((res: PublicImportReservation) => {
    // Marcador local + persistencia de datos y order_token.
    setOrder(o => ({
      total: o.total + (res.item_price_gtq ?? 0) * res.quantity,
      count: o.count + res.quantity,
    }));
    setPillBump(true); setTimeout(() => setPillBump(false), 320);
    const c: RememberedClient = {
      name: res.client_name, phone: client?.phone ?? '',
      order_token: res.order_token ?? client?.order_token,
    };
    if (c.phone) { saveClient(token, c); setClient(c); }
    // Confetti solo la primera vez en la sesión.
    if (!sessionStorage.getItem(sessionReserveKey(token))) {
      sessionStorage.setItem(sessionReserveKey(token), '1');
      setConfetti(true); setTimeout(() => setConfetti(false), 1200);
    }
  }, [client, token]);

  // Reserva de 1 toque (cliente recordado). Fallback a sheet si algo falla.
  const oneTapReserve = useCallback(async (item: PublicImportCatalogItem) => {
    if (!client?.name || !client?.phone) { setReserveItem(item); return; }
    haptic.tap();
    try {
      const res = await importCatalogService.createReservation(token, item.id, {
        client_name: client.name, client_phone: client.phone, quantity: 1,
      }, attributionSrc);
      haptic.confirm();
      registerReserved(res);
      setCelebrate(res);
      setDetailItem(null);
      reload();
    } catch {
      haptic.error();
      setReserveItem(item);       // el stock cambió o hubo error → pedir de nuevo con feedback
    }
  }, [client, token, attributionSrc, registerReserved, reload]);

  const hasClient = !!(client?.name && client?.phone);

  const handleReserveClick = useCallback((item: PublicImportCatalogItem) => {
    setDetailItem(null);
    if (hasClient) void oneTapReserve(item);
    else setReserveItem(item);
  }, [hasClient, oneTapReserve]);

  const handleSheetSuccess = useCallback((res: PublicImportReservation, name: string, phone: string) => {
    const c: RememberedClient = { name, phone, order_token: res.order_token ?? undefined };
    saveClient(token, c); setClient(c);
    setReserveItem(null);
    registerReserved(res);
    setCelebrate(res);
    reload();
  }, [token, registerReserved, reload]);

  const goToOrder = useCallback(() => {
    const ot = client?.order_token ?? celebrate?.order_token;
    if (ot) window.location.href = `/mi-pedido/${ot}`;
  }, [client, celebrate]);

  // Pie del catálogo: si este navegador ya recuerda el pedido, entra directo;
  // si no, la página de consulta lo pide por WhatsApp + PIN, acotada a este catálogo.
  const lookupOrder = useCallback(() => {
    haptic.tap();
    const ot = client?.order_token ?? celebrate?.order_token;
    window.location.href = ot ? `/mi-pedido/${ot}` : `/mi-pedido?c=${token}`;
  }, [client, celebrate, token]);

  const handleWhatsApp = useCallback(() => {
    if (!celebrate || !catalog?.whatsapp_number) return;
    const ot = celebrate.order_token ?? client?.order_token;
    const link = ot ? `${window.location.origin}/mi-pedido/${ot}` : '';
    const msg = `¡Hola! Aparté *${celebrate.item_title}*`
      + (order.count > 1 ? ` y ya llevo ${order.count} productos en mi pedido` : '')
      + `. ${link ? `Mi pedido: ${link}` : ''}`;
    window.open(buildWhatsApp(catalog.whatsapp_number, msg), '_blank');
  }, [celebrate, catalog, client, order]);

  if (loading) {
    return (
      <div className="min-h-screen bg-nodo-canvas px-4 pt-16 space-y-4">
        <div className="h-24 rounded-3xl bg-nodo-inset animate-pulse" />
        <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (notFound || !catalog) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-nodo-canvas p-6">
        <div className="text-center max-w-xs space-y-3">
          <div className="w-16 h-16 rounded-3xl bg-nodo-inset flex items-center justify-center mx-auto">
            <ShoppingBag size={28} className="text-nodo-dim" />
          </div>
          <h1 className="text-xl font-black text-nodo-ink">Catálogo no encontrado</h1>
          <p className="text-sm text-nodo-sub">Este link ya no está disponible.</p>
        </div>
      </div>
    );
  }

  const inStock = catalog.items.filter(i => i.stock_available > 0);
  const available = activeFacet
    ? inStock.filter(i => itemFacets.get(i.id)?.includes(activeFacet))
    : inStock;
  const soldOut = catalog.items.filter(i => i.stock_available <= 0);
  const activeFacetLabel = facetChips.find(f => f.id === activeFacet)?.label ?? activeFacet;
  const showPill = order.count > 0 && !!(client?.order_token || celebrate?.order_token);
  const knownOrder = !!(client?.order_token || celebrate?.order_token);

  // "Los más apartados": demanda real en unidades apartadas, sin denominador
  // inventado. Si nadie apartó nada todavía, la sección simplemente no existe.
  const recommended = (!activeFacet && inStock.length >= 5)
    ? [...inStock]
        .map(i => ({
          i,
          demand: i.reserved_count
            + (timeAgo(i.last_reserved_at) ? 2 : 0)
            + (i.is_offer ? 1 : 0),
        }))
        .filter(x => x.demand > 0)
        .sort((a, b) => b.demand - a.demand)
        .slice(0, 6)
        .map(x => x.i)
    : [];

  // Sugerencias del detalle: primero "frecuentemente juntos" (co-ocurrencia real
  // que calcula el backend por order_token), y se rellena con similares por
  // categoría (heurística client-side). Todo sin IA.
  const detailSimilar = (() => {
    if (!detailItem) return [] as PublicImportCatalogItem[];
    const byId = new Map(inStock.map(o => [o.id, o]));
    const seen = new Set<string>([detailItem.id]);
    const out: PublicImportCatalogItem[] = [];
    for (const id of detailItem.bought_with ?? []) {
      const o = byId.get(id);
      if (o && !seen.has(id)) { seen.add(id); out.push(o); }
    }
    const rest = inStock
      .map(o => ({ o, s: scoreSimilar(detailItem, o) }))
      .filter(x => x.s > 0.15 && !seen.has(x.o.id))
      .sort((a, b) => b.s - a.s)
      .map(x => x.o);
    return [...out, ...rest].slice(0, 6);
  })();

  return (
    <div className="contents" style={themeStyle(catalog.theme_color)}>
      {confetti && <Confetti />}

      <div className="fixed inset-0 -z-10 pointer-events-none dark:opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 80% 40% at 50% -10%, rgba(105,231,168,0.14) 0%, transparent 70%),'
            + 'radial-gradient(ellipse 60% 40% at 80% 80%, rgba(65,88,208,0.08) 0%, transparent 60%)',
        }} />

      <div className="min-h-screen bg-nodo-canvas">
        {/* Header delgado */}
        <header className="sticky top-0 z-20 px-4 py-3"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 10px)',
            background: 'var(--nodo-glass-bg-strong)',
            backdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
            WebkitBackdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
            borderBottom: '1px solid var(--nodo-glass-border)',
          }}>
          <div className="flex items-center gap-3 max-w-lg mx-auto">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
              style={{ background: catalog.logo_url ? '#fff' : 'var(--nodo-iris)' }}>
              {catalog.logo_url
                ? <img src={catalog.logo_url} alt={catalog.business_name ?? ''} className="w-full h-full object-contain p-0.5" />
                : <ShoppingBag size={16} className="text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-nodo-ink truncate leading-tight text-sm">
                {catalog.business_name ?? 'Importaciones'}
              </p>
              <p className="text-[11px] text-nodo-sub font-medium">
                {available.length} {available.length === 1 ? 'disponible' : 'disponibles'}
              </p>
            </div>
            <button data-tour="help" onClick={startTour} aria-label="Ver tutorial"
              className="w-9 h-9 rounded-full bg-nodo-inset border border-nodo-line text-nodo-ink flex items-center justify-center active:scale-90 transition-transform shrink-0">
              <HelpCircle size={17} />
            </button>
            {catalog.whatsapp_number && (
              <a href={buildWhatsApp(catalog.whatsapp_number, '¡Hola! Vi tu catálogo y me interesa algo.')}
                target="_blank" rel="noopener noreferrer" onClick={() => haptic.tap()}
                className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center active:scale-90 transition-transform shrink-0">
                <MessageCircle size={16} />
              </a>
            )}
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 pb-28 space-y-4 pt-4">
          {/* Consultar pedido va arriba: el cliente que vuelve entra a ver lo suyo,
              no a scrollear el catálogo entero hasta el pie. */}
          <button onClick={lookupOrder}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl active:scale-[0.98] transition-transform text-left"
            style={{ background: 'var(--nodo-primary-soft)' }}>
            <div className="w-9 h-9 rounded-xl bg-nodo-card flex items-center justify-center shrink-0">
              <Receipt size={16} style={{ color: 'var(--nodo-primary)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-nodo-ink">
                {knownOrder ? 'Ver mi pedido' : 'Consulta tu pedido'}
              </p>
              <p className="text-[11px] text-nodo-sub font-medium">
                {knownOrder ? 'Revisá lo que llevás apartado' : 'Con tu WhatsApp y tu PIN de 4 dígitos'}
              </p>
            </div>
            <ChevronRight size={16} className="text-nodo-dim shrink-0" />
          </button>

          <div data-tour="trip">
            <TripBanner
              tripName={catalog.trip_name}
              phase={trip.phase} label={trip.label} sub={trip.sub}
              people={catalog.reserved_people} units={catalog.reserved_units}
              deliveryRange={deliveryRange}
              tripLabel={tripLabel} originLabel={originLabel}
            />
          </div>

          <FacetChips facets={facetChips} value={activeFacet} onChange={setActiveFacet} />

          {recommended.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Flame size={14} style={{ color: 'var(--nodo-primary)' }} />
                <p className="text-[11px] font-black text-nodo-ink uppercase tracking-widest">Los más apartados</p>
              </div>
              <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none">
                {recommended.map(item => {
                  const low = item.stock_available <= 3;
                  return (
                    <button key={item.id} onClick={() => { haptic.tap(); setDetailItem(item); }}
                      className="shrink-0 w-32 rounded-3xl overflow-hidden flex flex-col text-left active:scale-[0.98] transition-transform"
                      style={glassCard}>
                      <div className="relative h-24 bg-white flex items-center justify-center">
                        {item.image_url
                          ? <img src={item.image_url} alt={item.title} className="w-full h-full object-contain p-1.5" loading="lazy" />
                          : <Package size={24} className="text-nodo-dim" />}
                        {low && (
                          <span className="absolute bottom-1.5 left-1.5 text-[8px] font-black px-1.5 py-0.5 rounded-full bg-rose-500 text-white">
                            {item.stock_available === 1 ? '🔴 última' : `🔥 ${item.stock_available}`}
                          </span>
                        )}
                      </div>
                      <div className="px-2.5 pt-2 pb-2.5 flex flex-col gap-0.5">
                        <p className="text-[11px] font-bold text-nodo-ink leading-tight line-clamp-2">{item.title}</p>
                        {item.price_gtq != null && (
                          <p className="text-sm font-black text-nodo-ink tabular-nums">{fmt(item.price_gtq)}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {available.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {available.map((item, i) => (
                <ProductCard key={item.id} item={item} oneTap={hasClient}
                  onReserve={handleReserveClick} onDetail={setDetailItem}
                  tourId={i === 0 ? 'apartar' : undefined} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-16 text-center space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-nodo-inset flex items-center justify-center">
                <Package size={28} className="text-nodo-dim" />
              </div>
              <p className="text-sm font-bold text-nodo-dim">
                {activeFacet ? `Nada en "${activeFacetLabel}" por ahora` : 'Catálogo vacío por ahora'}
              </p>
              {activeFacet && (
                <button onClick={() => { haptic.tap(); setActiveFacet(null); }}
                  className="text-xs font-black text-nodo-ink px-4 h-9 rounded-full"
                  style={{ background: 'var(--nodo-primary-soft)' }}>
                  Ver todo el catálogo
                </button>
              )}
            </div>
          )}

          {soldOut.length > 0 && (
            <div className="space-y-3 pt-1">
              <button onClick={() => setShowSold(s => !s)}
                className="flex items-center gap-2 w-full text-left active:scale-[0.99] transition-transform">
                <Check size={13} className="text-nodo-dim" />
                <span className="text-[11px] font-bold text-nodo-dim uppercase tracking-widest">
                  Ya vendidos ({soldOut.length})
                </span>
                <ChevronRight size={14} className={`text-nodo-dim ml-auto transition-transform ${showSold ? 'rotate-90' : ''}`} />
              </button>
              {showSold && (
                <div className="grid grid-cols-2 gap-3">
                  {soldOut.map(item => (
                    <ProductCard key={item.id} item={item} oneTap={false}
                      onReserve={() => {}} onDetail={() => {}} isSoldSection />
                  ))}
                </div>
              )}
            </div>
          )}

          {catalog.pay_info && <PayInfoCard pay={catalog.pay_info} />}

          <p className="text-center text-[10px] text-nodo-dim pt-2">
            {catalog.business_name ? `${catalog.business_name} · ` : ''}Catálogo con Nodo
          </p>
        </div>
      </div>

      {showPill && (
        <OrderPill total={order.total} count={order.count} bump={pillBump} onClick={goToOrder} />
      )}

      <ScrollTopButton visible={showScrollTop} raised={showPill} />

      {detailItem && (
        <DetailSheet item={detailItem} oneTap={hasClient} similar={detailSimilar}
          onClose={() => setDetailItem(null)} onReserve={handleReserveClick}
          onPick={setDetailItem} />
      )}
      {reserveItem && (
        <ReserveSheet item={reserveItem} token={token} src={attributionSrc}
          onClose={() => setReserveItem(null)} onSuccess={handleSheetSuccess} />
      )}
      {celebrate && (
        <ReservedToast item={celebrate} orderTotal={order.total} orderItems={order.count}
          onWhatsApp={handleWhatsApp}
          onSeguir={() => setCelebrate(null)}
          onVerPedido={goToOrder} />
      )}

      {tourOpen && <ImportCatalogTour steps={tourSteps} onClose={closeTour} />}
    </div>
  );
}
