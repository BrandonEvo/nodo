import { useCallback, useEffect, useState } from 'react';
import { Check, Clock, CreditCard, Loader2, PackageCheck, ShoppingBag, XCircle } from 'lucide-react';
import { ventasService, type PublicOrder, type StoreOrderStatus } from '@/services/ventas.service';
import { brandTheme } from '@/lib/utils';

interface Props {
  token: string;
}

const money = (n: number) => `Q${n.toFixed(2)}`;

const DEAD_STATUSES: StoreOrderStatus[] = ['rechazado', 'expirado', 'cancelado'];

const STATUS_INFO: Record<StoreOrderStatus, { label: string; sub: string }> = {
  solicitado: { label: 'Esperando confirmación', sub: 'El negocio apartó tu pedido y lo confirmará en breve' },
  apartado:   { label: 'Pedido confirmado',      sub: 'Tu pedido está apartado — pasa a recogerlo' },
  entregado:  { label: 'Pedido entregado',       sub: '¡Gracias por tu compra!' },
  rechazado:  { label: 'Pedido rechazado',       sub: 'El negocio no pudo tomar tu pedido' },
  expirado:   { label: 'Pedido expirado',        sub: 'El tiempo de apartado venció — vuelve a pedir' },
  cancelado:  { label: 'Pedido cancelado',       sub: 'Este pedido fue cancelado' },
};

function useCountdown(expiresAt: string | null, active: boolean) {
  const [left, setLeft] = useState<string | null>(null);
  useEffect(() => {
    if (!active || !expiresAt) { setLeft(null); return; }
    const tick = () => {
      const ms = new Date(expiresAt + 'Z').getTime() - Date.now();
      if (ms <= 0) { setLeft('0:00'); return; }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setLeft(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, active]);
  return left;
}

export function StoreOrderPage({ token }: Props) {
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await ventasService.getPublicOrder(token);
      setOrder(data);
      setError(null);
    } catch {
      setError('Pedido no encontrado o link inválido.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  const countdown = useCountdown(order?.expires_at ?? null, order?.status === 'solicitado');

  const handlePay = async () => {
    if (paying) return;
    setPaying(true);
    setPayError(null);
    try {
      const updated = await ventasService.payPublicOrder(token);
      setOrder(updated);
    } catch (err: any) {
      setPayError(err?.response?.data?.detail ?? 'No se pudo procesar el pago.');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-6">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <XCircle className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-gray-700 font-semibold text-center">{error}</p>
      </div>
    );
  }

  const brand = brandTheme(order.business_color);
  const dead = DEAD_STATUSES.includes(order.status);
  const info = STATUS_INFO[order.status];
  const canPay = !order.paid && !dead;

  const STEPS: { key: StoreOrderStatus; label: string; icon: typeof Check }[] = [
    { key: 'solicitado', label: 'Solicitado',  icon: ShoppingBag },
    { key: 'apartado',   label: 'Confirmado',  icon: Check },
    { key: 'entregado',  label: 'Entregado',   icon: PackageCheck },
  ];
  const stepIdx = order.status === 'solicitado' ? 0 : order.status === 'apartado' ? 1 : order.status === 'entregado' ? 2 : -1;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header con branding */}
      <div className="px-6 pt-12 pb-10" style={{ background: brand.gradient, color: brand.onBrand }}>
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-6">
            {order.business_logo_url && (
              <img
                src={order.business_logo_url}
                alt={order.business_name ?? ''}
                className="w-10 h-10 rounded-xl object-contain bg-white/90 p-1 shadow-sm shrink-0"
              />
            )}
            <span className="text-base font-black tracking-tight">{order.business_name ?? 'Tienda'}</span>
          </div>

          <p className="text-sm font-medium uppercase tracking-wide" style={{ opacity: 0.75 }}>
            Tu código de pedido
          </p>
          <p className="text-[52px] font-black tabular-nums tracking-tight leading-none mt-1">
            {order.short_code}
          </p>
          <p className="text-xs mt-2" style={{ opacity: 0.7 }}>
            Menciona este código al recoger tu pedido
          </p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 -mt-5 flex flex-col gap-3 pb-10">
        {/* Estado */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${dead ? 'bg-red-50' : 'bg-emerald-50'}`}>
              {dead
                ? <XCircle className="w-5 h-5 text-red-400" />
                : order.status === 'entregado'
                ? <PackageCheck className="w-5 h-5 text-emerald-500" />
                : <Clock className="w-5 h-5 text-emerald-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-black ${dead ? 'text-red-500' : 'text-gray-900'}`}>{info.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{info.sub}</p>
            </div>
            {countdown && (
              <div className="bg-amber-50 text-amber-600 rounded-xl px-3 py-1.5 text-sm font-black tabular-nums shrink-0">
                {countdown}
              </div>
            )}
          </div>

          {/* Mini timeline */}
          {!dead && (
            <div className="flex items-center mt-5">
              {STEPS.map((step, idx) => {
                const done = idx <= stepIdx;
                const Icon = step.icon;
                return (
                  <div key={step.key} className="flex-1 flex flex-col items-center relative">
                    {idx > 0 && (
                      <div className={`absolute top-3.5 right-1/2 w-full h-0.5 ${idx <= stepIdx ? 'bg-emerald-400' : 'bg-gray-100'}`} />
                    )}
                    <div className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center ${done ? 'bg-emerald-400' : 'bg-gray-100'}`}>
                      <Icon size={14} className={done ? 'text-white' : 'text-gray-300'} />
                    </div>
                    <p className={`text-[10px] font-bold mt-1.5 ${done ? 'text-emerald-500' : 'text-gray-300'}`}>
                      {step.label}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Items */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Tu pedido</p>
          <div className="flex flex-col gap-2.5">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-gray-700 flex-1 min-w-0">
                  <span className="text-gray-400 tabular-nums">{item.qty}×</span> {item.product_name}
                </p>
                <p className="text-sm font-bold text-gray-900 tabular-nums shrink-0">
                  {money(item.qty * item.unit_price)}
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 mt-4 pt-3">
            <p className="text-sm font-black text-gray-900">Total</p>
            <p className="text-lg font-black text-gray-900 tabular-nums">{money(order.total)}</p>
          </div>
        </div>

        {/* Pago */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
          {order.paid ? (
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <Check className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-black text-emerald-600">Pedido pagado</p>
                <p className="text-xs text-gray-400 mt-0.5">No necesitas pagar al recoger</p>
              </div>
            </div>
          ) : canPay ? (
            <>
              <button
                onClick={handlePay}
                disabled={paying}
                className="w-full h-14 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-50 shadow-lg"
                style={{ background: brand.base, color: brand.onBrand }}
              >
                {paying ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
                PAGAR {money(order.total)}
              </button>
              {payError && <p className="text-xs font-semibold text-red-500 mt-2 text-center">{payError}</p>}
              <p className="text-[11px] text-gray-400 text-center mt-3">
                También puedes pagar en efectivo al recoger.
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-400 text-center">Este pedido ya no admite pago.</p>
          )}
        </div>

        <div className="text-center py-4">
          <p className="text-xs text-gray-400">
            Powered by <span className="font-semibold text-gray-500">Nodo</span>
          </p>
        </div>
      </div>
    </div>
  );
}
