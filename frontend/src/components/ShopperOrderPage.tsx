/**
 * Pedido del cliente. Seguimiento por producto, edición de cantidad / quitar mientras
 * esté pendiente, y salida cálida (reemplazo o descartar) cuando el shopper no
 * consiguió algo. Nada acá le habla al cliente de "maleta": es jerga del negocio.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2, Package, MessageCircle, Minus, Plus, Trash2, ShoppingBag, Plane,
  X, RefreshCw, Ticket, Check, Sparkles, ArrowRight, Info,
} from 'lucide-react';
import { haptic } from '@/utils/haptic';
import {
  shopperCatalogService as svc,
  type PublicShopperOrder, type PublicShopperOrderLine, type ShopperResStatus,
} from '@/services/shopper_catalog.service';
import { pendingCoupon, markCouponApplied, wasCouponApplied, normalizeCode } from '@/utils/shopperCoupon';

interface Props { orderToken: string; }

const fmtQ = (n: number) => 'Q' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// El backend serializa datetimes naive en UTC (sin 'Z'); forzar UTC al parsear.
const toMs = (iso?: string | null): number | null => {
  if (!iso) return null;
  const s = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
  return new Date(s).getTime();
};

function fmtCode(code: string): string {
  const c = (code || '').toUpperCase();
  if (c.length <= 4) return c;
  const mid = Math.ceil(c.length / 2);
  return `${c.slice(0, mid)}-${c.slice(mid)}`;
}

// Urgencia honesta: sólo por vencimiento, granularidad de día.
function couponExpiryNote(iso?: string | null): string | null {
  const ms = toMs(iso);
  if (ms == null) return null;
  const days = Math.ceil((ms - Date.now()) / 86400000);
  if (days <= 0) return 'vence hoy';
  if (days === 1) return 'vence mañana';
  return `válido hasta ${new Date(ms).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' })}`;
}

function errMsg(e: unknown): string | null {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : null;
}

// Los 5 pasos del pedido, en palabras que no hay que explicarle a nadie. `hint` es la
// respuesta a "¿y eso qué significa?" — el estado solo no se la contesta a un primerizo.
const STEPS: { key: ShopperResStatus; label: string; hint: string }[] = [
  { key: 'pendiente',  label: 'Apartado',   hint: 'Te lo guardamos. Falta confirmarlo.' },
  { key: 'confirmada', label: 'Confirmado', hint: 'Listo, va contigo en este viaje.' },
  { key: 'comprada',   label: 'Comprado',   hint: 'Ya lo compramos en la tienda.' },
  { key: 'en_camino',  label: 'En camino',  hint: 'Viene viajando hacia vos.' },
  { key: 'entregada',  label: 'Entregado',  hint: '¡Ya es tuyo! Gracias 🎉' },
];
const STEP_IDX: Record<string, number> = { pendiente: 0, confirmada: 1, comprada: 2, en_camino: 3, entregada: 4 };

export function ShopperOrderPage({ orderToken }: Props) {
  const [order, setOrder] = useState<PublicShopperOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const autoTried = useRef(false);

  const load = useCallback(async () => {
    try { setOrder(await svc.getOrder(orderToken)); }
    catch { setError('No encontramos este pedido.'); }
    finally { setLoading(false); }
  }, [orderToken]);
  useEffect(() => { void load(); }, [load]);

  // Aplica un pedido nuevo; celebra sólo si el cupón dejó un ahorro real.
  const applyResult = useCallback((updated: PublicShopperOrder, celebrateIt: boolean) => {
    setOrder(updated);
    if (celebrateIt && updated.coupon_discount_gtq > 0) {
      setCelebrate(true);
      haptic.done();
      setTimeout(() => setCelebrate(false), 1500);
    }
  }, []);

  // Auto-aplicación 0-toque: cupón recordado del link (…?cupon=CODE) → un intento por pedido.
  useEffect(() => {
    if (!order || autoTried.current) return;
    autoTried.current = true;
    if (order.coupon_code || wasCouponApplied(order.order_token)) return;
    const pend = pendingCoupon(order.catalog_token);
    if (!pend) return;
    markCouponApplied(order.order_token);
    (async () => {
      try {
        const updated = await svc.applyCoupon(order.order_token, pend);
        if (updated.coupon_discount_gtq > 0) applyResult(updated, true);
      } catch { /* silencioso: el cliente aún puede escribirlo a mano */ }
    })();
  }, [order, applyResult]);

  const theme = order?.theme_color;
  const rootStyle = theme ? ({ ['--nodo-primary' as any]: theme }) : undefined;

  // Un rechazo del backend (se agotó, el shopper ya lo confirmó) tiene que VERSE. Antes
  // se tragaba en silencio: el cliente tocaba «+», no pasaba nada, y volvía a tocar —
  // los 409 en fila del log son exactamente eso. Además recargamos: si el «+» estaba
  // habilitado con datos viejos, la pantalla tiene que ponerse al día sola.
  const act = async (fn: () => Promise<PublicShopperOrder>, id: string) => {
    setBusy(id);
    try { setOrder(await fn()); haptic.tap(); }
    catch (e) {
      haptic.reject();
      setNotice(errMsg(e) || 'No se pudo actualizar tu pedido. Probá de nuevo.');
      await load();
    }
    finally { setBusy(null); }
  };

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-nodo-canvas"><Loader2 className="w-8 h-8 animate-spin text-nodo-sub" /></div>;
  if (error || !order) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-nodo-canvas gap-3 px-6 text-center">
      <ShoppingBag size={44} className="text-nodo-dim" />
      <p className="text-lg font-black text-nodo-ink">{error}</p>
      {order?.catalog_token && <a href={`/catalogo/${order.catalog_token}`} className="text-sm font-bold text-nodo-primary underline">Ver el catálogo</a>}
    </div>
  );

  return (
    <div className="min-h-screen bg-nodo-canvas" style={rootStyle}>
      <style>{`
        @keyframes coupon-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-5px)} 40%{transform:translateX(5px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(3px)} }
        @keyframes coupon-gift { from{opacity:0;transform:scale(.92)} 60%{transform:scale(1.03)} to{opacity:1;transform:scale(1)} }
        @keyframes coupon-pop { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes coupon-fall { 0%{transform:translateY(-10vh) rotate(0);opacity:1} 100%{transform:translateY(110vh) rotate(720deg);opacity:0} }
        .coupon-shake { animation: coupon-shake .42s ease-in-out; }
        .coupon-gift  { animation: coupon-gift .4s cubic-bezier(.22,1,.36,1) both; }
        .coupon-pop   { animation: coupon-pop .3s ease-out both; }
        .ot-move      { transition: transform .8s cubic-bezier(.22,1,.36,1); will-change: transform; }
        @media (prefers-reduced-motion: reduce) {
          .coupon-shake, .coupon-gift, .coupon-pop { animation: none; }
          .ot-move { transition: none; }
        }
      `}</style>
      {notice && (
        <div className="fixed top-4 right-4 left-4 sm:left-auto z-[70] flex items-center gap-3 bg-nodo-warn-bg border border-nodo-warn-bd text-nodo-warn-tx text-sm font-bold px-4 py-3 rounded-2xl shadow-lg sm:max-w-xs">
          <Info size={16} className="shrink-0" />
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Cerrar"><X size={14} /></button>
        </div>
      )}
      {celebrate && (
        <div className="fixed inset-0 z-[65] pointer-events-none overflow-hidden">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="absolute w-2 h-3 rounded-sm" style={{
              left: `${(i * 6.5 + 4) % 100}%`,
              background: ['#f59e0b', '#3b82f6', '#ec4899', '#10b981', '#8b5cf6'][i % 5],
              animation: `coupon-fall ${0.9 + (i % 5) * 0.12}s ease-in forwards`,
              animationDelay: `${(i % 4) * 0.05}s`,
            }} />
          ))}
        </div>
      )}
      <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-4 pb-16">
        {/* Hero */}
        <div className="rounded-[28px] p-5 bg-nodo-primary text-nodo-on-primary" style={{ boxShadow: 'var(--nodo-shadow-hero)' }}>
          <div className="flex items-center gap-2 mb-1"><ShoppingBag size={18} /><span className="text-[11px] font-bold uppercase tracking-wider text-nodo-on-primary/90">Mi pedido</span></div>
          <p className="text-2xl font-black">Hola {order.client_name} 👋</p>
          <div className="flex items-center gap-3 mt-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-nodo-on-primary/70">Total a pagar</p>
              <p className="text-xl font-black tabular-nums">{fmtQ(order.total_gtq)}</p>
              {order.coupon_discount_gtq > 0 && (
                <p className="text-[11px] font-bold text-nodo-on-primary/60 line-through tabular-nums">{fmtQ(order.subtotal_gtq)}</p>
              )}
            </div>
            <div className="w-px h-8 bg-nodo-on-primary/20" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-nodo-on-primary/70">Productos</p>
              <p className="text-xl font-black tabular-nums">{order.total_items}</p>
            </div>
            {order.order_pin && (
              <>
                <div className="w-px h-8 bg-nodo-on-primary/20" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-nodo-on-primary/70">Tu clave 🔑</p>
                  <p className="text-xl font-black tabular-nums tracking-widest">{order.order_pin}</p>
                </div>
              </>
            )}
          </div>
          {order.order_pin && (
            <p className="text-[11px] font-semibold text-nodo-on-primary/70 mt-2">
              Guardá tu clave: con ella y tu WhatsApp volvés a ver tu pedido cuando quieras.
            </p>
          )}
        </div>

        {/* Cupón */}
        {order.lines.length > 0 && (
          <CouponStrip order={order} orderToken={orderToken} onOrder={applyResult} />
        )}

        {/* Líneas */}
        <div className="flex flex-col gap-3">
          {order.lines.map(l => (
            <OrderLine key={l.id} line={l} busy={busy === l.id} catalogToken={order.catalog_token}
              onQty={(q) => act(() => svc.updateOrderLine(orderToken, l.id, q), l.id)}
              onRemove={() => act(() => svc.deleteOrderLine(orderToken, l.id), l.id)}
              onSwap={(niid) => act(() => svc.swapOrderLine(orderToken, l.id, niid), l.id)}
              onDismiss={() => act(() => svc.dismissOrderLine(orderToken, l.id), l.id)} />
          ))}
        </div>

        {/* Pago */}
        {order.pay_info && (order.pay_info.bank_name || order.pay_info.bank_account_number) && (
          <div className="nodo-card p-4">
            <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-2">Dónde depositar</p>
            <div className="text-sm font-semibold text-nodo-ink space-y-0.5">
              {order.pay_info.bank_name && <p>{order.pay_info.bank_name}</p>}
              {order.pay_info.bank_account_number && <p className="tabular-nums">Cuenta: {order.pay_info.bank_account_number}</p>}
              {order.pay_info.bank_account_holder && <p className="text-nodo-sub">{order.pay_info.bank_account_holder}</p>}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {order.catalog_token && (
            <a href={`/catalogo/${order.catalog_token}`}
              className="flex-1 h-12 rounded-2xl bg-nodo-inset border border-nodo-line text-nodo-ink text-sm font-black flex items-center justify-center gap-2 active:scale-95">
              <Plus size={16} /> Agregar más
            </a>
          )}
          {order.whatsapp_number && (
            <a href={`https://wa.me/${order.whatsapp_number.replace(/\D/g, '')}`} target="_blank" rel="noopener"
              className="flex-1 h-12 rounded-2xl bg-nodo-success-bg text-nodo-success-tx text-sm font-black flex items-center justify-center gap-2 active:scale-95">
              <MessageCircle size={16} /> Escribinos
            </a>
          )}
        </div>
        <button onClick={load} className="text-xs font-bold text-nodo-sub flex items-center justify-center gap-1.5 py-2"><RefreshCw size={13} /> Ver si hay novedades</button>
      </div>
    </div>
  );
}

function OrderLine({ line, busy, catalogToken, onQty, onRemove, onSwap, onDismiss }: {
  line: PublicShopperOrderLine; busy: boolean; catalogToken?: string | null;
  onQty: (q: number) => void; onRemove: () => void; onSwap: (id: string) => void; onDismiss: () => void;
}) {
  const isOff = line.status === 'no_disponible' || line.status === 'cancelada';
  const stepIdx = STEP_IDX[line.status] ?? 0;

  // `stock_available` ya incluye lo que esta línea tiene apartado: es el techo REAL de
  // esta línea. Pieza única = el techo es 1, y ahí el «+» no es un botón deshabilitado
  // sino un botón que no debería existir: promete algo que no hay.
  const unique = line.stock_available <= 1 && !line.is_made_to_order;
  const atMax = line.quantity >= line.stock_available;
  const showStepper = line.editable && !unique;

  return (
    <div className={`nodo-card p-3 flex flex-col gap-3 ${isOff ? 'opacity-90' : ''}`}>
      <div className="flex items-center gap-3">
        {line.item_image_url ? <img src={line.item_image_url} className="w-14 h-14 rounded-xl object-cover shrink-0" alt="" />
          : <div className="w-14 h-14 rounded-xl bg-nodo-inset flex items-center justify-center text-nodo-dim shrink-0"><Package size={20} /></div>}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-nodo-ink line-clamp-2 leading-tight">{line.item_title}</p>
          {line.item_price_gtq != null && (
            <>
              <p className="text-sm font-black text-nodo-ink tabular-nums">{fmtQ(line.item_price_gtq * line.quantity)}</p>
              {/* Más de uno se dice con todas las letras: el total solo no delata que
                  son 2, y el cliente se entera al pagar. */}
              {line.quantity > 1 && (
                <p className="text-[11px] font-bold text-nodo-primary tabular-nums">
                  {line.quantity} unidades · {fmtQ(line.item_price_gtq)} c/u
                </p>
              )}
            </>
          )}
        </div>
        {showStepper ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => line.quantity > 1 ? onQty(line.quantity - 1) : onRemove()} disabled={busy}
              className="w-8 h-8 rounded-lg bg-nodo-inset border border-nodo-line flex items-center justify-center text-nodo-ink active:scale-90 disabled:opacity-40">
              {line.quantity > 1 ? <Minus size={13} /> : <Trash2 size={13} />}
            </button>
            <span className="w-6 text-center text-sm font-black text-nodo-ink tabular-nums">{line.quantity}</span>
            <button onClick={() => onQty(line.quantity + 1)} disabled={busy || atMax}
              className="w-8 h-8 rounded-lg bg-nodo-ink flex items-center justify-center text-nodo-canvas active:scale-90 disabled:opacity-40">
              <Plus size={13} />
            </button>
          </div>
        ) : line.editable ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="px-2 py-1 rounded-lg bg-nodo-pastel-lavender text-[10px] font-black text-violet-700 dark:text-violet-300">ÚNICO</span>
            <button onClick={onRemove} disabled={busy} aria-label="Quitar del pedido"
              className="w-8 h-8 rounded-lg bg-nodo-inset border border-nodo-line flex items-center justify-center text-nodo-ink active:scale-90 disabled:opacity-40">
              <Trash2 size={13} />
            </button>
          </div>
        ) : <span className="text-xs font-bold text-nodo-sub shrink-0">×{line.quantity}</span>}
      </div>

      {/* Por qué no podés sumar más. Sin esto el tope es un botón gris sin explicación
          y el cliente lo toca hasta que se cansa. */}
      {line.editable && atMax && (
        <div className="rounded-xl bg-nodo-inset px-3 py-2 flex items-center gap-2">
          <Info size={13} className="text-nodo-sub shrink-0" />
          <p className="text-[11px] font-semibold text-nodo-sub flex-1">
            {line.is_made_to_order
              ? `Máximo ${line.stock_available} por pedido de este producto.`
              : unique
                ? 'Es el único que hay. Ya es tuyo 🙌'
                : `Ya apartaste los ${line.stock_available} que quedaban.`}
            {!line.is_made_to_order && catalogToken && ' ¿Querés algo más? Buscalo en el catálogo.'}
          </p>
          {!line.is_made_to_order && catalogToken && (
            <a href={`/catalogo/${catalogToken}`} className="shrink-0 text-[11px] font-black text-nodo-primary flex items-center gap-0.5">
              Ver <ArrowRight size={11} />
            </a>
          )}
        </div>
      )}

      {!isOff && <OrderTrack stepIdx={stepIdx} />}

      {/* Off-ramp cálido */}
      {line.status === 'no_disponible' && !line.resolved_by_substitute && (
        <div className="rounded-2xl bg-nodo-inset border border-nodo-line p-3 flex flex-col gap-2">
          <p className="text-xs font-bold text-nodo-ink">😔 No lo conseguí esta vez</p>
          {line.resolution_note && <p className="text-xs text-nodo-sub">{line.resolution_note}</p>}
          {line.suggested_items.length > 0 && (
            <>
              <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wide">Te puede gustar</p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {line.suggested_items.map(s => (
                  <button key={s.id} onClick={() => onSwap(s.id)} disabled={busy}
                    className="shrink-0 w-24 flex flex-col gap-1 active:scale-95 disabled:opacity-40">
                    <div className="w-24 h-24 rounded-xl bg-nodo-card overflow-hidden">
                      {s.image_url ? <img src={s.image_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-nodo-dim"><Package size={18} /></div>}
                    </div>
                    <p className="text-[10px] font-bold text-nodo-ink line-clamp-2 leading-tight">{s.title}</p>
                    {s.price_gtq != null && <p className="text-[11px] font-black text-nodo-ink tabular-nums">{fmtQ(s.price_gtq)}</p>}
                    <span className="text-[10px] font-black text-nodo-primary flex items-center gap-0.5"><RefreshCw size={10} /> Cambiar</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <button onClick={onDismiss} disabled={busy} className="text-xs font-bold text-nodo-sub self-start flex items-center gap-1"><X size={12} /> Quitar del pedido</button>
        </div>
      )}
      {line.status === 'cancelada' && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-nodo-sub flex items-center gap-1">✖️ Cancelado</span>
          <button onClick={onDismiss} disabled={busy} className="text-xs font-bold text-nodo-sub flex items-center gap-1"><X size={12} /> Quitar</button>
        </div>
      )}
    </div>
  );
}

// ── Seguimiento: una sola línea y el avión avanzando sobre ella ────────────────
// Las 5 barras segmentadas de antes obligaban a contar cuadritos para saber dónde
// estabas. Una línea con una posición se lee de un vistazo, sin instrucciones.
//
// Todo el movimiento es `transform` (GPU): el riel se rellena con scaleX y el avión
// viaja con translateX. El truco del translateX en %: la capa del avión mide el ancho
// completo del riel, así que translateX(40%) la corre 40% del RIEL — un % sobre el
// tamaño del propio elemento, que es justo lo que necesitamos sin medir nada en JS.
function OrderTrack({ stepIdx }: { stepIdx: number }) {
  const last = STEPS.length - 1;
  const pct = (Math.min(stepIdx, last) / last) * 100;
  const step = STEPS[stepIdx];
  const delivered = stepIdx >= last;

  return (
    <div className="flex flex-col gap-2">
      {/* px-3.5 = radio del marcador: el avión en 0% y en 100% cae sobre la punta del
          riel y se ve entero, sin salirse de la tarjeta. */}
      <div className="px-3.5">
        <div className="relative h-7">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-nodo-inset" />
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-nodo-primary origin-left ot-move"
            style={{ transform: `scaleX(${pct / 100})` }} />
          <div className="absolute inset-0 ot-move" style={{ transform: `translateX(${pct}%)` }}>
            <div className={`absolute top-1/2 left-0 w-7 h-7 -translate-x-1/2 -translate-y-1/2 rounded-full
              flex items-center justify-center ${delivered ? 'bg-nodo-success-tx' : 'bg-nodo-primary'}`}>
              {delivered
                ? <Check size={14} className="text-white" strokeWidth={3} />
                : <Plane size={14} className="text-nodo-on-primary rotate-45" strokeWidth={2.5} />}
            </div>
          </div>
        </div>
      </div>
      <div className="text-center">
        <p className="text-[13px] font-black text-nodo-ink">{step?.label}</p>
        <p className="text-[11px] font-semibold text-nodo-sub">{step?.hint}</p>
      </div>
    </div>
  );
}

// ── Tira de cupón ──────────────────────────────────────────────────────────────
// IDLE colapsada → TYPING → aplicado (ahorro) / error (shake) / mínimo (upsell).
function CouponStrip({ order, orderToken, onOrder }: {
  order: PublicShopperOrder; orderToken: string;
  onOrder: (o: PublicShopperOrder, celebrate: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const applied = !!order.coupon_code && order.coupon_discount_gtq > 0;

  useEffect(() => { if (open) { const t = setTimeout(() => inputRef.current?.focus(), 60); return () => clearTimeout(t); } }, [open]);

  const doShake = () => { setShaking(true); haptic.reject(); setTimeout(() => setShaking(false), 440); };

  const apply = async () => {
    const c = normalizeCode(code);
    if (c.length < 3) { setErr('Escribí tu código.'); doShake(); return; }
    setBusy(true); setErr(null); setWarn(null);
    try {
      const updated = await svc.applyCoupon(orderToken, c);
      onOrder(updated, updated.coupon_discount_gtq > 0);
      setOpen(false); setCode('');
    } catch (e) {
      const msg = errMsg(e) || 'Este código no es válido o ya no está disponible.';
      // La compra mínima es la única excepción segura del backend → upsell honesto.
      if (/desde\s*Q/i.test(msg)) { setWarn(msg); setErr(null); } else { setErr(msg); setWarn(null); }
      doShake();
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const updated = await svc.removeCoupon(orderToken);
      markCouponApplied(orderToken);   // no volver a auto-aplicar tras quitarlo
      onOrder(updated, false);
      haptic.tap();
    } catch { /* mantiene estado */ } finally { setBusy(false); }
  };

  if (applied) {
    const note = couponExpiryNote(order.coupon_expires_at);
    return (
      <div className="coupon-gift rounded-2xl p-3.5 bg-nodo-success-bg border border-nodo-success-bd flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-nodo-success-tx/15 flex items-center justify-center shrink-0"><Ticket size={18} className="text-nodo-success-tx" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-nodo-success-tx tabular-nums">Ahorrás {fmtQ(order.coupon_discount_gtq)} 🎉</p>
          <p className="text-[11px] font-bold text-nodo-success-tx/80 truncate">Cupón {fmtCode(order.coupon_code!)}{note ? ` · ${note}` : ''}</p>
        </div>
        <button onClick={remove} disabled={busy} className="h-8 px-2.5 rounded-lg bg-nodo-card/60 text-nodo-success-tx text-xs font-black active:scale-90 transition-transform disabled:opacity-40 flex items-center gap-1">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} Quitar
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => { haptic.tap(); setOpen(true); }}
        className="rounded-2xl p-3.5 bg-nodo-card border border-dashed border-nodo-line-s flex items-center gap-3 text-left active:scale-[0.99] transition-transform">
        <div className="w-10 h-10 rounded-xl bg-nodo-primary-soft flex items-center justify-center shrink-0"><Ticket size={18} className="text-nodo-primary" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-nodo-ink">¿Tenés un cupón? 🎟️</p>
          <p className="text-[11px] text-nodo-sub">Tocá para escribir tu código y ahorrar</p>
        </div>
        <ArrowRight size={16} className="text-nodo-sub shrink-0" />
      </button>
    );
  }

  return (
    <div className={`rounded-2xl p-3.5 bg-nodo-card border flex flex-col gap-2 ${err ? 'border-nodo-danger-bd' : 'border-nodo-line-s'} ${shaking ? 'coupon-shake' : ''}`}>
      <div className="flex items-center gap-2">
        <input ref={inputRef} value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setErr(null); setWarn(null); }}
          onKeyDown={e => { if (e.key === 'Enter') void apply(); }}
          placeholder="TU-CÓDIGO" maxLength={24} autoCapitalize="characters" autoCorrect="off"
          className="nodo-input flex-1 font-mono tracking-widest uppercase" />
        <button onClick={apply} disabled={busy}
          className="h-12 px-4 rounded-2xl bg-nodo-primary text-nodo-on-primary font-black active:scale-95 transition-transform disabled:opacity-40 flex items-center gap-1.5 shrink-0">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Aplicar
        </button>
      </div>
      {err && <p className="text-[11px] font-bold text-nodo-danger-tx flex items-center gap-1"><X size={12} /> {err}</p>}
      {warn && <p className="text-[11px] font-bold text-nodo-warn-tx flex items-center gap-1"><Sparkles size={12} /> {warn}</p>}
      {!err && !warn && <button onClick={() => { setOpen(false); setCode(''); }} className="text-[11px] font-bold text-nodo-sub self-start">Cancelar</button>}
    </div>
  );
}
