/**
 * Catálogo público del Personal Shopper — Crystal Glass redesign
 *
 * Zonas de calor:
 *  · El botón "Apartar" vive en la esquina inferior de cada card (pulgar nativo)
 *  · El header es sticky glass — el WhatsApp siempre a la vista
 *  · La sheet de reserva tiene el submit en el 80% inferior de la pantalla
 *  · Sin scroll horizontal — todo en columnas vertically scrollable
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Loader2, ShoppingBag, MessageCircle, ExternalLink, Package,
  Clock, Check, X, AlertTriangle, ChevronRight, Truck, Sparkles,
} from 'lucide-react';
import {
  shopperCatalogService,
  type PublicCatalog,
  type PublicCatalogItem,
  type PublicReservation,
} from '@/services/shopper_catalog.service';
import { haptic } from '@/utils/haptic';

interface Props { token: string }

const fmt = (n: number) =>
  'Q ' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function buildWhatsApp(phone: string, message: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(iso: string) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const tick = () => setMs(Math.max(0, new Date(iso).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [iso]);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const label = h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return { ms, label, expired: ms === 0 };
}

// ─── Delivery range ───────────────────────────────────────────────────────────

function useDeliveryRange(minDays = 5, maxDays = 7) {
  return useMemo(() => {
    const f = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return d.toLocaleDateString('es-GT', { day: 'numeric', month: 'short' });
    };
    return `${f(minDays)} – ${f(maxDays)}`;
  }, [minDays, maxDays]);
}

// ─── Glass helper style ───────────────────────────────────────────────────────

const glassCard: React.CSSProperties = {
  background: 'var(--nodo-glass-bg-strong)',
  backdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
  WebkitBackdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
  border: '1px solid var(--nodo-glass-border)',
  boxShadow: 'var(--nodo-shadow-card)',
};

const glassHeader: React.CSSProperties = {
  ...glassCard,
  boxShadow: '0 1px 0 var(--nodo-glass-edge)',
};

// ─── Scarcity badge ───────────────────────────────────────────────────────────

function ScarcityBadge({ n }: { n: number }) {
  if (n <= 0) return (
    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500 text-white">
      AGOTADO
    </span>
  );
  if (n === 1) return (
    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500/90 text-white animate-pulse">
      🔴 ÚLTIMA UNIDAD
    </span>
  );
  if (n === 2) return (
    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-500 text-white">
      🔥 Últimas 2
    </span>
  );
  if (n === 3) return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">
      ⚡ Solo 3
    </span>
  );
  if (n === 4) return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-nodo-inset text-nodo-sub">
      Solo 4 disponibles
    </span>
  );
  return null;
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-3xl overflow-hidden" style={glassCard}>
      <div className="h-40 bg-nodo-inset animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-3 rounded-full bg-nodo-inset animate-pulse w-3/4" />
        <div className="h-3 rounded-full bg-nodo-inset animate-pulse w-1/2" />
        <div className="h-9 rounded-2xl bg-nodo-inset animate-pulse mt-2" />
      </div>
    </div>
  );
}

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({
  item,
  onReserve,
  isSoldSection = false,
}: {
  item: PublicCatalogItem;
  onReserve: (item: PublicCatalogItem) => void;
  isSoldSection?: boolean;
}) {
  const [imgErr, setImgErr] = useState(false);
  const isSold   = item.stock_available <= 0;
  const isAmazon = !!item.amazon_url;
  const showScarcity = !isSold && item.stock_available <= 4;

  const handleReserve = () => {
    haptic.tap();
    onReserve(item);
  };

  return (
    <div
      className={`rounded-3xl overflow-hidden flex flex-col transition-all duration-200
                  active:scale-[0.97] ${isSoldSection ? 'opacity-50' : ''}`}
      style={glassCard}
    >
      {/* Imagen — zona informativa, NO interactiva */}
      <div className="relative overflow-hidden bg-nodo-inset flex-shrink-0" style={{ height: 156 }}>
        {item.image_url && !imgErr ? (
          <img
            src={item.image_url}
            alt={item.title}
            onError={() => setImgErr(true)}
            className="w-full h-full object-contain p-2 bg-white"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={36} className="text-nodo-dim" />
          </div>
        )}

        {/* Scarcity overlay — encima de la imagen */}
        {showScarcity && (
          <div className="absolute bottom-0 left-0 right-0 px-2 pb-2">
            <ScarcityBadge n={item.stock_available} />
          </div>
        )}

        {/* Sold overlay */}
        {isSold && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.38)' }}>
            <span className="text-white text-xs font-black px-3 py-1 rounded-full"
              style={{ background: 'rgba(0,0,0,0.55)' }}>
              VENDIDO ✓
            </span>
          </div>
        )}

        {/* Amazon badge */}
        {isAmazon && !isSold && (
          <div className="absolute top-2 right-2">
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-500 text-white">
              amazon
            </span>
          </div>
        )}
      </div>

      {/* Info + CTA — zona de calor del pulgar */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-[13px] font-bold text-nodo-ink leading-snug line-clamp-2 flex-1">
          {item.title}
        </p>

        {item.price_gtq != null && !isSold && (
          <p className="text-xl font-black text-nodo-ink tabular-nums leading-none">
            {fmt(item.price_gtq)}
          </p>
        )}

        {/* CTA — sticky al fondo de la card, siempre alcanzable */}
        {!isSold && (
          isAmazon ? (
            <a
              href={item.amazon_url!}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => haptic.tap()}
              className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-2xl
                         bg-amber-500 text-white text-xs font-black active:scale-95 transition-transform"
            >
              <ExternalLink size={11} /> Ver en Amazon
            </a>
          ) : (
            <button
              onClick={handleReserve}
              className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-2xl
                         text-xs font-black active:scale-95 transition-transform"
              style={{ background: 'var(--nodo-iris)', color: 'white' }}
            >
              <ShoppingBag size={11} /> Apartar
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ─── Reserve sheet ────────────────────────────────────────────────────────────

function ReserveSheet({
  item, publicToken, onClose, onSuccess,
}: {
  item: PublicCatalogItem;
  publicToken: string;
  onClose: () => void;
  onSuccess: (r: PublicReservation) => void;
}) {
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [qty, setQty]     = useState(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr]     = useState<string | null>(null);
  const max = Math.min(item.stock_available, 10);
  const ok  = name.trim().length > 1 && phone.trim().length >= 8;

  const submit = async () => {
    if (!ok || saving) return;
    haptic.tap();
    setSaving(true); setErr(null);
    try {
      const res = await shopperCatalogService.createReservation(publicToken, item.id, {
        client_name: name.trim(), client_phone: phone.trim(), quantity: qty,
      });
      haptic.confirm();
      onSuccess(res);
    } catch (e: unknown) {
      haptic.error();
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErr(d ?? 'No se pudo crear la reserva.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-t-[32px] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        style={glassCard}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-4">
          <div className="w-10 h-1 rounded-full bg-nodo-line" />
        </div>

        <div className="px-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xl font-black text-nodo-ink leading-tight">Apartar producto</p>
              <p className="text-sm text-nodo-sub mt-0.5 line-clamp-1">{item.title}</p>
            </div>
            {item.price_gtq != null && (
              <p className="text-2xl font-black text-nodo-ink tabular-nums shrink-0">
                {fmt(item.price_gtq)}
              </p>
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

          {/* Form */}
          <div>
            <label className="nodo-label">Tu nombre *</label>
            <input type="text" value={name} autoFocus
              onChange={e => setName(e.target.value)}
              placeholder="Ana García"
              className="nodo-input" />
          </div>

          <div>
            <label className="nodo-label">WhatsApp / Teléfono *</label>
            <input type="tel" value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+502 5555-1234"
              className="nodo-input" />
          </div>

          {max > 1 && (
            <div>
              <label className="nodo-label">Cantidad</label>
              <div className="flex items-center gap-3 mt-1">
                <button onClick={() => { haptic.tap(); setQty(q => Math.max(1, q - 1)); }}
                  className="w-10 h-10 rounded-xl bg-nodo-inset border border-nodo-line
                             flex items-center justify-center active:scale-90 transition-transform">
                  <span className="text-xl font-black text-nodo-ink">−</span>
                </button>
                <span className="w-10 text-center text-lg font-black text-nodo-ink tabular-nums">{qty}</span>
                <button onClick={() => { haptic.tap(); setQty(q => Math.min(max, q + 1)); }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center
                             active:scale-90 transition-transform"
                  style={{ background: 'var(--nodo-ink)' }}>
                  <span className="text-xl font-black text-nodo-canvas">+</span>
                </button>
              </div>
            </div>
          )}

          {/* Trust signal */}
          <div className="flex items-start gap-2.5 p-3 rounded-2xl border"
            style={{ background: 'rgba(245,158,11,0.07)', borderColor: 'rgba(245,158,11,0.25)' }}>
            <Clock size={15} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300 font-medium leading-relaxed">
              Tu reserva queda guardada por <strong>2 horas</strong>.
              El vendedor te confirmará por WhatsApp. Sin confirmación, el producto vuelve al catálogo.
            </p>
          </div>

          {/* Submit — zona de calor máxima */}
          <div className="flex gap-3 pb-1">
            <button onClick={onClose}
              className="h-14 px-5 rounded-2xl border-2 border-nodo-line text-nodo-ink font-bold text-sm
                         active:scale-95 transition-transform">
              Cancelar
            </button>
            <button onClick={submit} disabled={!ok || saving}
              className="flex-1 h-14 rounded-2xl font-black text-sm flex items-center justify-center gap-2
                         active:scale-[0.97] transition-transform disabled:opacity-40"
              style={{ background: ok ? 'var(--nodo-iris)' : 'var(--nodo-inset)', color: ok ? 'white' : undefined }}
            >
              {saving
                ? <Loader2 size={18} className="animate-spin" />
                : <ShoppingBag size={18} />
              }
              {saving ? 'Apartando…' : 'Confirmar reserva'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Reservation confirmation ─────────────────────────────────────────────────

function ReservationConfirmation({
  reservation, onWhatsApp, onClose,
}: {
  reservation: PublicReservation;
  onWhatsApp: () => void;
  onClose: () => void;
}) {
  const { label, expired } = useCountdown(reservation.expires_at);
  const isActive = reservation.status === 'pendiente' || reservation.status === 'confirmada';

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-4 py-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-sm rounded-[32px] overflow-hidden p-6 space-y-5" style={glassCard}>

        {/* Hero check */}
        <div className="flex flex-col items-center text-center gap-2 pt-1">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-1"
            style={{ background: 'var(--nodo-iris)' }}>
            <Check size={36} className="text-white" />
          </div>
          <h2 className="text-2xl font-black text-nodo-ink">¡Reserva lista!</h2>
          <p className="text-sm text-nodo-sub leading-relaxed">
            Guardamos tu lugar en el catálogo. El vendedor te confirmará pronto por WhatsApp.
          </p>
        </div>

        {/* Timer — urgency hook */}
        {isActive && !expired && (
          <div className="flex items-center gap-3 p-4 rounded-2xl border"
            style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.25)' }}>
            <Clock size={20} className="text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
            <div>
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Caduca en</p>
              <p className="text-2xl font-black tabular-nums text-amber-800 dark:text-amber-300">
                {label}
              </p>
            </div>
          </div>
        )}

        {/* Detalle compacto */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--nodo-glass-bg)' }}>
          {[
            { k: 'Producto',  v: reservation.item_title },
            { k: 'Cantidad',  v: String(reservation.quantity) },
            reservation.item_price_gtq != null
              ? { k: 'Precio', v: fmt(reservation.item_price_gtq) } : null,
          ].filter(Boolean).map(row => (
            <div key={row!.k}
              className="flex justify-between items-center px-4 py-2.5 border-b border-nodo-line last:border-0">
              <span className="text-xs font-semibold text-nodo-dim">{row!.k}</span>
              <span className="text-sm font-bold text-nodo-ink text-right max-w-[60%] leading-tight truncate">
                {row!.v}
              </span>
            </div>
          ))}
        </div>

        {/* Ver mi reserva */}
        <a href={`/mis-pedidos/${reservation.client_token}`}
          className="flex items-center justify-between w-full p-4 rounded-2xl
                     active:scale-[0.98] transition-transform"
          style={{ background: 'var(--nodo-glass-bg)', border: '1px solid var(--nodo-glass-edge)' }}>
          <div className="flex items-center gap-2.5">
            <Sparkles size={16} className="text-nodo-primary" />
            <span className="text-sm font-bold text-nodo-ink">Ver estado de mi reserva</span>
          </div>
          <ChevronRight size={16} className="text-nodo-dim" />
        </a>

        {/* CTAs */}
        {reservation.whatsapp_number && (
          <button onClick={() => { haptic.confirm(); onWhatsApp(); }}
            className="w-full py-3.5 rounded-2xl bg-emerald-500 text-white font-black text-sm
                       flex items-center justify-center gap-2 active:scale-[0.97] transition-transform">
            <MessageCircle size={16} /> Confirmar por WhatsApp
          </button>
        )}
        <button onClick={onClose}
          className="w-full py-3 rounded-2xl text-sm font-bold text-nodo-sub
                     active:scale-[0.97] transition-transform"
          style={{ background: 'var(--nodo-glass-bg)' }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ─── Página pública principal ─────────────────────────────────────────────────

export function ShopperCatalogPage({ token }: Props) {
  const [catalog, setCatalog]             = useState<PublicCatalog | null>(null);
  const [loading, setLoading]             = useState(true);
  const [notFound, setNotFound]           = useState(false);
  const [reservingItem, setReservingItem] = useState<PublicCatalogItem | null>(null);
  const [confirmation, setConfirmation]   = useState<PublicReservation | null>(null);
  const deliveryRange = useDeliveryRange();

  useEffect(() => {
    shopperCatalogService.getPublic(token)
      .then(setCatalog)
      .catch(e => { if (e.response?.status === 404) setNotFound(true); })
      .finally(() => setLoading(false));
  }, [token]);

  const handleSuccess = useCallback((res: PublicReservation) => {
    setReservingItem(null);
    setConfirmation(res);
  }, []);

  const handleWhatsApp = useCallback(() => {
    if (!confirmation || !catalog?.whatsapp_number) return;
    const price = confirmation.item_price_gtq != null ? ` por ${fmt(confirmation.item_price_gtq)}` : '';
    const msg = `Hola! Acabo de apartar *${confirmation.item_title}*${price}. `
      + `Mi reserva: ${window.location.origin}/mis-pedidos/${confirmation.client_token}`;
    window.open(buildWhatsApp(catalog.whatsapp_number, msg), '_blank');
  }, [confirmation, catalog]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-nodo-canvas px-4 pt-16 space-y-4">
        <div className="h-10 rounded-2xl bg-nodo-inset animate-pulse w-1/2 mx-auto" />
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

  const available = catalog.items.filter(i => i.stock_available > 0);
  const soldOut   = catalog.items.filter(i => i.stock_available <= 0);

  return (
    <>
      {/* ── Fondo degradado atmosférico ── */}
      <div className="fixed inset-0 -z-10 pointer-events-none dark:opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 80% 40% at 50% -10%, rgba(105,231,168,0.15) 0%, transparent 70%),' +
            'radial-gradient(ellipse 60% 40% at 80% 80%, rgba(65,88,208,0.08) 0%, transparent 60%)',
        }}
      />

      <div className="min-h-screen bg-nodo-canvas">
        {/* ── Header glass sticky ── */}
        <header className="sticky top-0 z-20 px-4 py-3"
          style={{ paddingTop: `calc(env(safe-area-inset-top) + 12px)`, ...glassHeader }}>
          <div className="flex items-center gap-3 max-w-lg mx-auto">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--nodo-iris)' }}>
              <ShoppingBag size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-nodo-ink truncate leading-tight">
                {catalog.business_name ?? 'Personal Shopper'}
              </p>
              <p className="text-[11px] text-nodo-sub font-medium">
                {available.length} {available.length === 1 ? 'producto disponible' : 'productos disponibles'}
              </p>
            </div>
            {catalog.whatsapp_number && (
              <a
                href={buildWhatsApp(catalog.whatsapp_number, '¡Hola! Vi tu catálogo y me interesa algo.')}
                target="_blank" rel="noopener noreferrer"
                onClick={() => haptic.tap()}
                className="h-9 px-3.5 rounded-full bg-emerald-500 text-white text-xs font-black
                           flex items-center gap-1.5 active:scale-95 transition-transform shrink-0"
              >
                <MessageCircle size={13} /> WhatsApp
              </a>
            )}
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 pb-10 space-y-5 pt-4">
          {/* ── Delivery promise banner ── */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{
            ...glassCard,
            border: '1px solid rgba(16,185,129,0.25)',
          }}>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/12 flex items-center justify-center shrink-0">
              <Truck size={16} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-widest">
                Entrega estimada
              </p>
              <p className="text-sm font-black text-nodo-ink">{deliveryRange}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                Personal
              </p>
              <p className="text-[10px] font-semibold text-nodo-dim">Shopper</p>
            </div>
          </div>

          {/* ── Productos disponibles ── */}
          {available.length > 0 ? (
            <>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-xs font-bold text-nodo-sub">
                  {available.length} disponibles ahora
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {available.map(item => (
                  <ProductCard key={item.id} item={item} onReserve={setReservingItem} />
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center py-16 text-center space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-nodo-inset flex items-center justify-center">
                <Package size={28} className="text-nodo-dim" />
              </div>
              <p className="text-sm font-bold text-nodo-dim">Catálogo vacío por ahora</p>
              <p className="text-xs text-nodo-dim">Vuelve pronto para ver los nuevos productos</p>
            </div>
          )}

          {/* ── Vendidos — prueba social ── */}
          {soldOut.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <Check size={12} className="text-nodo-dim" />
                <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-widest">
                  Vendidos · prueba de que el catálogo se mueve
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {soldOut.map(item => (
                  <ProductCard key={item.id} item={item} onReserve={() => {}} isSoldSection />
                ))}
              </div>
            </div>
          )}

          <p className="text-center text-[10px] text-nodo-dim pt-4">
            Powered by Nodo · Personal Shopper
          </p>
        </div>
      </div>

      {/* ── Sheets ── */}
      {reservingItem && (
        <ReserveSheet
          item={reservingItem}
          publicToken={token}
          onClose={() => setReservingItem(null)}
          onSuccess={handleSuccess}
        />
      )}
      {confirmation && (
        <ReservationConfirmation
          reservation={confirmation}
          onWhatsApp={handleWhatsApp}
          onClose={() => setConfirmation(null)}
        />
      )}
    </>
  );
}
