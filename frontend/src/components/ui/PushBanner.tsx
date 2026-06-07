import { Bell, X } from 'lucide-react';

interface PushBannerProps {
  onAccept: () => void;
  onDismiss: () => void;
  subscribing: boolean;
}

export function PushBanner({ onAccept, onDismiss, subscribing }: PushBannerProps) {
  return (
    <div className="flex items-start gap-4 bg-nodo-card border border-nodo-line rounded-[20px] p-4 shadow-sm">
      <div className="w-10 h-10 shrink-0 rounded-xl bg-nodo-primary-soft flex items-center justify-center">
        <Bell size={18} className="text-nodo-primary" style={{ color: 'var(--nodo-primary)' }} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-nodo-ink leading-snug">
          Recibí alertas importantes
        </p>
        <p className="text-xs text-nodo-sub font-medium mt-0.5 leading-relaxed">
          Stock bajo, órdenes listas, actualizaciones de pedidos — directo en tu dispositivo.
        </p>

        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={onAccept}
            disabled={subscribing}
            className="h-9 px-4 rounded-xl bg-nodo-ink text-nodo-canvas text-xs font-bold active:scale-[0.97] transition-transform disabled:opacity-50 flex items-center gap-1.5"
          >
            <Bell size={13} />
            {subscribing ? 'Activando…' : 'Activar notificaciones'}
          </button>
          <button
            onClick={onDismiss}
            className="h-9 px-3 rounded-xl text-nodo-dim text-xs font-bold hover:bg-nodo-inset transition-colors"
          >
            Ahora no
          </button>
        </div>
      </div>

      <button
        onClick={onDismiss}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-nodo-dim hover:bg-nodo-inset transition-colors shrink-0"
        aria-label="Cerrar"
      >
        <X size={14} />
      </button>
    </div>
  );
}
