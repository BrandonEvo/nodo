import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

/**
 * Reloj dual: hora de Guatemala (la que cuenta para las ventas) + hora del
 * servidor (UTC, lo que se persiste). Guatemala se muestra como principal;
 * UTC como referencia tenue. Todo client-side — el navegador conoce el UTC real
 * y `Intl` resuelve America/Guatemala sin depender del huso del dispositivo.
 */
function timeIn(tz: string, d: Date): string {
  return new Intl.DateTimeFormat('es-GT', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
  }).format(d);
}

export function DualClock({ className = '' }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`inline-flex items-center gap-2.5 rounded-full bg-nodo-inset border border-nodo-line px-3 h-9 ${className}`}>
      <Clock size={13} className="text-nodo-sub shrink-0" />
      <span className="flex items-baseline gap-1">
        <span className="text-[9px] font-bold text-nodo-dim uppercase tracking-wider">GT</span>
        <span className="text-sm font-black text-nodo-ink tabular-nums leading-none">{timeIn('America/Guatemala', now)}</span>
      </span>
      <span className="w-px h-3.5 bg-nodo-line shrink-0" />
      <span className="flex items-baseline gap-1">
        <span className="text-[9px] font-bold text-nodo-dim uppercase tracking-wider">UTC</span>
        <span className="text-sm font-semibold text-nodo-sub tabular-nums leading-none">{timeIn('UTC', now)}</span>
      </span>
    </div>
  );
}
