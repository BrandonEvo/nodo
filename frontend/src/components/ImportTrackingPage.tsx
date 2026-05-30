import { useEffect, useState } from 'react';
import { Loader2, Package2, Truck, CheckCircle2, ShoppingCart, Clock } from 'lucide-react';
import { importacionesService, type PublicCotizacion, type CotizacionStatus } from '@/services/importaciones.service';

// ── Pasos visibles al cliente (sin "pagado" — es info interna) ────────────────

const STEPS: Array<{
  key: CotizacionStatus;
  label: string;
  sub: string;
  icon: React.ReactNode;
  color: { ring: string; bg: string; text: string; light: string };
}> = [
  {
    key: 'pendiente',
    label: 'Cotizado',
    sub: 'Precio calculado y en revisión',
    icon: <Clock className="w-4 h-4" />,
    color: { ring: 'ring-blue-400', bg: 'bg-blue-500', text: 'text-blue-600', light: 'bg-blue-50' },
  },
  {
    key: 'comprado',
    label: 'Comprado',
    sub: 'Pedido realizado en origen',
    icon: <ShoppingCart className="w-4 h-4" />,
    color: { ring: 'ring-amber-400', bg: 'bg-amber-500', text: 'text-amber-600', light: 'bg-amber-50' },
  },
  {
    key: 'en_transito',
    label: 'En tránsito',
    sub: 'En camino hacia Guatemala',
    icon: <Truck className="w-4 h-4" />,
    color: { ring: 'ring-violet-400', bg: 'bg-violet-500', text: 'text-violet-600', light: 'bg-violet-50' },
  },
  {
    key: 'entregado',
    label: 'Entregado',
    sub: '¡Tu pedido llegó!',
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: { ring: 'ring-emerald-400', bg: 'bg-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-50' },
  },
];

function currentStepIndex(status: CotizacionStatus): number {
  // Map pagado → entregado visually, cancelado stays separate
  const visible = status === 'pagado' ? 'entregado' : status;
  return STEPS.findIndex(s => s.key === visible);
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('es-GT', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDateShort(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-GT', { day: 'numeric', month: 'long' });
}

const TS_FOR_STEP: Record<string, keyof PublicCotizacion> = {
  pendiente:   'created_at',
  comprado:    'comprado_at',
  en_transito: 'en_transito_at',
  entregado:   'entregado_at',
};

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props { token: string; }

export function ImportTrackingPage({ token }: Props) {
  const [data, setData]       = useState<PublicCotizacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    importacionesService.getPublicTracking(token)
      .then(res => setData(res.data))
      .catch(() => setError('Cotización no encontrada o link inválido.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-6">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <Package2 className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-gray-700 font-semibold text-center">{error}</p>
        <p className="text-gray-400 text-sm text-center">Este link puede ser incorrecto o haber expirado.</p>
      </div>
    );
  }

  const isCancelled = data.status === 'cancelado';
  const currentIdx  = currentStepIndex(data.status);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-700 via-slate-800 to-[#1a2540] px-6 pt-14 pb-8 text-white">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-2 mb-4 opacity-70">
            <Package2 className="w-4 h-4" />
            <span className="text-sm font-medium uppercase tracking-wide">Seguimiento de importación</span>
          </div>
          <h1 className="text-xl font-bold leading-snug mb-1 line-clamp-2">
            {data.product_name}
          </h1>
          {data.estimated_delivery && (
            <p className="text-white/60 text-xs mt-1">
              Entrega estimada: {fmtDateShort(data.estimated_delivery)}
            </p>
          )}
          {isCancelled ? (
            <div className="mt-4 inline-flex items-center gap-1.5 bg-red-500/30 rounded-full px-3 py-1.5 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              Cancelado
            </div>
          ) : (
            <div className="mt-4 inline-flex items-center gap-1.5 bg-white/20 backdrop-blur rounded-full px-3 py-1.5 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              {STEPS[currentIdx]?.label ?? 'En proceso'}
            </div>
          )}
        </div>
      </div>

      {/* Card */}
      <div className="max-w-md mx-auto px-4 -mt-4 pb-12">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">

          {isCancelled ? (
            <div className="text-center py-8">
              <p className="text-gray-500 font-semibold">Esta importación fue cancelada.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical connector */}
              <div className="absolute left-[22px] top-6 bottom-6 w-0.5 bg-gray-100" />

              <div className="space-y-0">
                {STEPS.map((step, idx) => {
                  const done    = idx <= currentIdx;
                  const current = idx === currentIdx;
                  const { color } = step;
                  const tsKey = TS_FOR_STEP[step.key];
                  const ts    = tsKey ? (data[tsKey] as string | null) : null;

                  return (
                    <div key={step.key} className="flex items-start gap-4 relative">
                      {/* Node */}
                      <div className="relative z-10 shrink-0 mt-3">
                        {current ? (
                          <div className="relative w-11 h-11 flex items-center justify-center">
                            <span className={`absolute inset-0 rounded-full ${color.bg} opacity-20 animate-ping`} />
                            <span className={`absolute inset-1.5 rounded-full ${color.bg} opacity-30`} />
                            <span className={`relative w-7 h-7 rounded-full ${color.bg} flex items-center justify-center shadow-md text-white`}>
                              {step.icon}
                            </span>
                          </div>
                        ) : done ? (
                          <div className="w-11 h-11 flex items-center justify-center">
                            <div className={`w-7 h-7 rounded-full ${color.bg} flex items-center justify-center shadow-sm text-white`}>
                              {step.icon}
                            </div>
                          </div>
                        ) : (
                          <div className="w-11 h-11 flex items-center justify-center">
                            <div className="w-7 h-7 rounded-full border-2 border-gray-200 bg-white flex items-center justify-center text-gray-300">
                              {step.icon}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className={`flex-1 py-3 min-w-0 ${idx < STEPS.length - 1 ? 'pb-5' : ''}`}>
                        <p className={`text-sm font-semibold leading-tight ${done ? color.text : 'text-gray-400'}`}>
                          {step.label}
                        </p>
                        <p className={`text-xs mt-0.5 ${done ? 'text-gray-500' : 'text-gray-300'}`}>
                          {current && ts ? fmtDate(ts) ?? step.sub : step.sub}
                        </p>
                        {/* Tracking number on en_transito */}
                        {current && step.key === 'en_transito' && data.tracking_number && (
                          <div className={`inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color.light} ${color.text}`}>
                            <Truck className="w-3 h-3" />
                            {data.tracking_number}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Entregado banner */}
          {(data.status === 'entregado' || data.status === 'pagado') && (
            <div className="mt-4 bg-emerald-50 rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">🎉</span>
              <div>
                <p className="text-sm font-semibold text-emerald-700">¡Tu pedido llegó!</p>
                {data.entregado_at && (
                  <p className="text-xs text-emerald-600">{fmtDate(data.entregado_at)}</p>
                )}
              </div>
            </div>
          )}

          {/* Tracking number standalone (if not in_transito but exists) */}
          {data.tracking_number && data.status !== 'en_transito' && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-2xl border border-gray-100">
              <Truck className="w-4 h-4 text-gray-400 shrink-0" />
              <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Tracking courier</p>
                <p className="text-sm font-semibold text-gray-700">{data.tracking_number}</p>
              </div>
            </div>
          )}
        </div>

        <div className="text-center py-8">
          <p className="text-xs text-gray-400">Powered by <span className="font-semibold text-gray-500">Nodo</span></p>
        </div>
      </div>
    </div>
  );
}
