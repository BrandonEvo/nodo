import { useEffect, useState } from 'react';
import { Check, Package, Loader2 } from 'lucide-react';
import {
  TRACKING_STEPS,
  type TrackingStatus,
  type PublicTrackingData,
  personalShopperService,
} from '@/services/personal_shopper.service';
import { brandTheme } from '@/lib/utils';

const STEP_COLORS = [
  { bg: 'bg-blue-500',    text: 'text-blue-600',    lightBg: 'bg-blue-50'    },
  { bg: 'bg-indigo-500',  text: 'text-indigo-600',  lightBg: 'bg-indigo-50'  },
  { bg: 'bg-violet-500',  text: 'text-violet-600',  lightBg: 'bg-violet-50'  },
  { bg: 'bg-amber-500',   text: 'text-amber-600',   lightBg: 'bg-amber-50'   },
  { bg: 'bg-emerald-500', text: 'text-emerald-600', lightBg: 'bg-emerald-50' },
];

const STATUS_LABELS: Record<string, string> = {
  pendiente:  'Pendiente',
  cotizado:   'Cotizado',
  aprobado:   'Aprobado',
  en_proceso: 'En proceso',
  entregado:  'Entregado',
  cancelado:  'Cancelado',
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('es-GT', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });
}

function stepIndex(s: TrackingStatus | null) {
  if (!s) return -1;
  return TRACKING_STEPS.findIndex(t => t.key === s);
}

interface Props {
  token: string;
}

export function PublicTrackingPage({ token }: Props) {
  const [data, setData] = useState<PublicTrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    personalShopperService.getPublicTracking(token)
      .then(setData)
      .catch(() => setError('Pedido no encontrado o link inválido.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-6">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <span className="text-3xl">❌</span>
        </div>
        <p className="text-gray-700 font-semibold text-center">{error}</p>
        <p className="text-gray-400 text-sm text-center">
          Este link puede haber expirado o ser incorrecto.
        </p>
      </div>
    );
  }

  const currentIdx = stepIndex(data.tracking_status);
  const isComplete = data.tracking_status === 'entregado';
  const hasTracking = data.tracking_status !== null;
  const brand = brandTheme(data.business_color);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header — personalizado con el branding del negocio */}
      <div className="px-6 pt-14 pb-8" style={{ background: brand.gradient, color: brand.onBrand }}>
        <div className="max-w-md mx-auto">
          {(data.business_logo_url || data.business_name) && (
            <div className="flex items-center gap-3 mb-5">
              {data.business_logo_url && (
                <img
                  src={data.business_logo_url}
                  alt={data.business_name ?? ''}
                  className="w-10 h-10 rounded-xl object-contain bg-white/90 p-1 shadow-sm shrink-0"
                />
              )}
              {data.business_name && (
                <span className="text-base font-black tracking-tight leading-tight">{data.business_name}</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 mb-4" style={{ opacity: 0.8 }}>
            <Package className="w-4 h-4" />
            <span className="text-sm font-medium uppercase tracking-wide">Seguimiento de pedido</span>
          </div>
          <h1 className="text-xl font-bold leading-snug mb-1 line-clamp-2">
            {data.product_description}
          </h1>
          <p className="text-sm" style={{ opacity: 0.7 }}>
            {data.quantity} {data.unit}
          </p>
          {data.delivery_date && (
            <p className="text-xs mt-1" style={{ opacity: 0.6 }}>
              Entrega estimada: {new Date(data.delivery_date).toLocaleDateString('es-GT', { day: 'numeric', month: 'long' })}
            </p>
          )}
          {/* Status pill */}
          <div
            className="mt-4 inline-flex items-center gap-1.5 backdrop-blur rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ background: brand.overlay }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: brand.onBrand }} />
            {STATUS_LABELS[data.status] ?? data.status}
          </div>
        </div>
      </div>

      {/* Timeline card */}
      <div className="max-w-md mx-auto px-4 -mt-4">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">

          {!hasTracking ? (
            <div className="text-center py-8">
              <span className="text-4xl">⏳</span>
              <p className="text-gray-500 mt-3 text-sm font-medium">
                Tu pedido aún está siendo procesado.
              </p>
              <p className="text-gray-400 text-xs mt-1">
                Te avisaremos cuando esté en camino.
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical connector */}
              <div className="absolute left-[22px] top-6 bottom-6 w-0.5 bg-gray-100" />

              <div className="space-y-0">
                {TRACKING_STEPS.map((step, idx) => {
                  const color   = STEP_COLORS[idx];
                  const done    = idx <= currentIdx;
                  const current = idx === currentIdx;

                  return (
                    <div key={step.key} className="flex items-start gap-4 relative">
                      <div className="relative z-10 shrink-0 mt-3">
                        {current ? (
                          <div className="relative w-11 h-11 flex items-center justify-center">
                            <span className={`absolute inset-0 rounded-full ${color.bg} opacity-20 animate-ping`} />
                            <span className={`absolute inset-1.5 rounded-full ${color.bg} opacity-30`} />
                            <span className={`relative w-7 h-7 rounded-full ${color.bg} flex items-center justify-center shadow-md`}>
                              <span className="text-white text-base leading-none">{step.emoji}</span>
                            </span>
                          </div>
                        ) : done ? (
                          <div className="w-11 h-11 flex items-center justify-center">
                            <div className={`w-7 h-7 rounded-full ${color.bg} flex items-center justify-center shadow-sm`}>
                              <Check className="w-4 h-4 text-white" strokeWidth={3} />
                            </div>
                          </div>
                        ) : (
                          <div className="w-11 h-11 flex items-center justify-center">
                            <div className="w-7 h-7 rounded-full border-2 border-gray-200 bg-white flex items-center justify-center">
                              <span className="text-xs opacity-30">{step.emoji}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className={`flex-1 py-3 min-w-0 ${idx < TRACKING_STEPS.length - 1 ? 'pb-5' : ''}`}>
                        <p className={`text-sm font-semibold leading-tight
                                       ${done ? color.text : 'text-gray-400'}`}>
                          {step.label}
                        </p>
                        <p className={`text-xs mt-0.5
                                       ${done ? 'text-gray-500' : 'text-gray-300'}`}>
                          {current && data.tracking_updated_at
                            ? fmtDate(data.tracking_updated_at) ?? step.sublabel
                            : step.sublabel}
                        </p>
                        {current && data.tracking_note && (
                          <div className={`inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-1
                                           rounded-full text-xs font-medium
                                           ${color.lightBg} ${color.text}`}>
                            <span className="w-1 h-1 rounded-full bg-current opacity-60" />
                            {data.tracking_note}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isComplete && (
            <div className="mt-4 bg-emerald-50 rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">🎉</span>
              <div>
                <p className="text-sm font-semibold text-emerald-700">¡Pedido entregado!</p>
                <p className="text-xs text-emerald-600">
                  Gracias por tu compra
                  {data.tracking_updated_at ? ` · ${fmtDate(data.tracking_updated_at)}` : ''}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer branding */}
        <div className="text-center py-8">
          <p className="text-xs text-gray-400">
            Powered by{' '}
            <span className="font-semibold text-gray-500">Nodo</span>
          </p>
        </div>
      </div>
    </div>
  );
}
