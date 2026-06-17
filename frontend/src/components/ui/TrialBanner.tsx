import { Clock, AlertTriangle, Lock } from 'lucide-react';

interface TrialBannerProps {
  accessState?: 'active' | 'trialing' | 'grace' | 'locked' | null;
  trialDaysRemaining?: number | null;
  graceDaysRemaining?: number | null;
}

const dayWord = (n: number) => (n === 1 ? 'día' : 'días');

/**
 * Contador de prueba como gancho de venta. Refleja el access_state que calcula
 * el backend (core/trial.py), así banner y enforcement nunca se desincronizan.
 * No renderiza nada si el tenant tiene acceso pleno.
 */
export function TrialBanner({ accessState, trialDaysRemaining, graceDaysRemaining }: TrialBannerProps) {
  if (!accessState || accessState === 'active') return null;

  if (accessState === 'trialing') {
    const n = trialDaysRemaining ?? 0;
    const urgent = n <= 3;
    const cls = urgent
      ? 'bg-nodo-warn-bg border-nodo-warn-bd text-nodo-warn-tx'
      : 'bg-nodo-primary-soft border-nodo-line text-nodo-ink';
    const Icon = urgent ? AlertTriangle : Clock;
    return (
      <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${cls}`}>
        <Icon size={18} className="shrink-0" />
        <p className="flex-1 min-w-0 text-sm">
          <span className="font-black">Prueba gratis · {n} {dayWord(n)} {n === 1 ? 'restante' : 'restantes'}</span>
          <span className="opacity-80"> — suscríbete a un plan para no perder acceso.</span>
        </p>
      </div>
    );
  }

  if (accessState === 'grace') {
    const g = graceDaysRemaining ?? 0;
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border bg-nodo-warn-bg border-nodo-warn-bd text-nodo-warn-tx">
        <AlertTriangle size={18} className="shrink-0" />
        <p className="flex-1 min-w-0 text-sm">
          <span className="font-black">Tu prueba venció · modo solo lectura</span>
          <span className="opacity-80"> — te {g === 1 ? 'queda' : 'quedan'} {g} {dayWord(g)} de gracia. Suscríbete para volver a guardar cambios.</span>
        </p>
      </div>
    );
  }

  // locked
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border bg-nodo-danger-bg border-nodo-danger-bd text-nodo-danger-tx">
      <Lock size={18} className="shrink-0" />
      <p className="flex-1 min-w-0 text-sm">
        <span className="font-black">Tu prueba terminó</span>
        <span className="opacity-80"> — suscríbete a un plan para reactivar tus módulos. Tus datos siguen guardados.</span>
      </p>
    </div>
  );
}
