/**
 * Vista del cliente de su reserva (módulo Importaciones).
 * Adaptado de components/ShopperReservationPage.tsx, usando import_catalog.service.
 */
import { useState, useEffect } from 'react';
import {
  Loader2, ShoppingBag, Clock, Check, X, MessageCircle, AlertTriangle, ChevronLeft,
} from 'lucide-react';
import { importCatalogService, type PublicImportReservation } from '@/services/import_catalog.service';

interface Props { clientToken: string }

const fmt = (n: number) =>
  'Q' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function buildWhatsApp(phone: string, message: string) {
  const clean = phone.replace(/\D/g, '');
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

function useCountdown(expiresAt: string) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, diff));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const h = Math.floor(remaining / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  const s = Math.floor((remaining % 60_000) / 1000);
  const label = h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return { remaining, label };
}

const STATUS_META: Record<string, {
  icon: React.ReactNode; title: string; subtitle: string; bg: string;
}> = {
  pendiente: {
    icon: <Clock size={32} className="text-amber-600 dark:text-amber-400" />,
    title: 'Pendiente de confirmación',
    subtitle: 'Estamos revisando tu reserva. Te confirmaremos por WhatsApp muy pronto.',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
  confirmada: {
    icon: <Check size={32} className="text-emerald-500" />,
    title: '¡Reserva confirmada!',
    subtitle: 'El vendedor confirmó tu reserva. Coordina la entrega por WhatsApp.',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  completada: {
    icon: <Check size={32} className="text-blue-500" />,
    title: 'Compra completada',
    subtitle: '¡Gracias por tu compra! Esperamos que te haya encantado el producto.',
    bg: 'bg-blue-500/10 border-blue-500/20',
  },
  cancelada: {
    icon: <X size={32} className="text-rose-500" />,
    title: 'Reserva cancelada',
    subtitle: 'Esta reserva fue cancelada. Puedes volver al catálogo para ver otras opciones.',
    bg: 'bg-rose-500/10 border-rose-500/20',
  },
};

export function ImportReservationPage({ clientToken }: Props) {
  const [reservation, setReservation] = useState<PublicImportReservation | null>(null);
  const [loading, setLoading]         = useState(true);
  const [notFound, setNotFound]       = useState(false);

  useEffect(() => {
    importCatalogService.getClientReservation(clientToken)
      .then(res => {
        // El pedido acumulado es el destino canónico: si existe, redirigimos.
        if (res.order_token) { window.location.replace(`/mi-pedido/${res.order_token}`); return; }
        setReservation(res);
      })
      .catch(e => { if (e.response?.status === 404) setNotFound(true); })
      .finally(() => setLoading(false));
  }, [clientToken]);

  const { remaining, label } = useCountdown(reservation?.expires_at ?? new Date(0).toISOString());
  const expired = remaining === 0 && !!reservation;
  const isActive = reservation?.status === 'pendiente' || reservation?.status === 'confirmada';

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-nodo-canvas">
      <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
    </div>
  );

  if (notFound || !reservation) return (
    <div className="min-h-screen flex items-center justify-center bg-nodo-canvas p-6">
      <div className="text-center max-w-xs">
        <div className="w-16 h-16 rounded-3xl bg-nodo-inset flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={28} className="text-nodo-dim" />
        </div>
        <h1 className="text-xl font-black text-nodo-ink">Reserva no encontrada</h1>
        <p className="text-sm text-nodo-sub mt-2">El link puede estar vencido o ya no existe.</p>
      </div>
    </div>
  );

  const meta = STATUS_META[reservation.status] ?? STATUS_META['pendiente'];

  const handleWhatsApp = () => {
    if (!reservation.whatsapp_number) return;
    const price = reservation.item_price_gtq != null ? ` (${fmt(reservation.item_price_gtq)})` : '';
    const msg = `Hola! Soy ${reservation.client_name}, tengo una reserva de *${reservation.item_title}*${price}. ¿Puedes confirmarme?`;
    window.open(buildWhatsApp(reservation.whatsapp_number, msg), '_blank');
  };

  return (
    <div className="min-h-screen bg-nodo-canvas">
      <div className="sticky top-0 z-10 bg-nodo-canvas/80 backdrop-blur-sm border-b border-nodo-line px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => window.history.back()}
          className="w-9 h-9 rounded-xl bg-nodo-inset flex items-center justify-center active:scale-90 transition-transform"
        >
          <ChevronLeft size={18} className="text-nodo-ink" />
        </button>
        <div className="flex-1">
          <p className="font-black text-nodo-ink">Mi reserva</p>
          <p className="text-xs text-nodo-sub">{reservation.item_title}</p>
        </div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--nodo-primary)' }}>
          <ShoppingBag size={18} style={{ color: 'var(--nodo-on-primary)' }} />
        </div>
      </div>

      <div className="max-w-sm mx-auto px-4 py-6 space-y-4">
        <div className={`rounded-3xl border p-6 flex flex-col items-center text-center gap-3 ${meta.bg}`}>
          <div className="w-16 h-16 rounded-full bg-nodo-card flex items-center justify-center">{meta.icon}</div>
          <h2 className="text-xl font-black text-nodo-ink">{meta.title}</h2>
          <p className="text-sm text-nodo-sub leading-relaxed">{meta.subtitle}</p>
        </div>

        {isActive && !expired && (
          <div className="nodo-card p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <Clock size={22} className="text-amber-600 dark:text-amber-400 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-bold text-nodo-dim uppercase tracking-wider">Tiempo restante</p>
              <p className="text-2xl font-black tabular-nums text-amber-700 dark:text-amber-300">{label}</p>
            </div>
          </div>
        )}
        {isActive && expired && (
          <div className="nodo-card p-4 flex items-center gap-3 border-nodo-danger-bd">
            <AlertTriangle size={20} className="text-nodo-danger-tx shrink-0" />
            <p className="text-sm font-bold text-nodo-danger-tx">Tu reserva venció. Contacta al vendedor.</p>
          </div>
        )}

        <div className="nodo-card p-5 space-y-3">
          <p className="nodo-section-label">Detalle de tu reserva</p>
          {[
            { label: 'Producto',  value: reservation.item_title },
            { label: 'Cantidad',  value: String(reservation.quantity) },
            reservation.item_price_gtq != null ? { label: 'Precio',  value: fmt(reservation.item_price_gtq) } : null,
            reservation.deposit_amount != null ? { label: 'Depósito acordado', value: fmt(reservation.deposit_amount) } : null,
            { label: 'Tu nombre', value: reservation.client_name },
            {
              label: 'Creada el',
              value: new Date(reservation.created_at).toLocaleDateString('es-GT', {
                day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
              }),
            },
          ].filter(Boolean).map(row => (
            <div key={row!.label} className="flex justify-between items-start gap-2">
              <span className="text-xs font-semibold text-nodo-dim shrink-0">{row!.label}</span>
              <span className="text-sm font-bold text-nodo-ink text-right leading-snug">{row!.value}</span>
            </div>
          ))}
        </div>

        {reservation.whatsapp_number && isActive && (
          <button
            onClick={handleWhatsApp}
            className="w-full py-3.5 rounded-2xl bg-emerald-500 text-white text-sm font-black
                       flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
          >
            <MessageCircle size={16} /> Confirmar por WhatsApp
          </button>
        )}

        <p className="text-center text-[10px] text-nodo-dim pb-4">
          Powered by Nodo · Importaciones
        </p>
      </div>
    </div>
  );
}
