import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Botón/contenido fijo en la parte inferior del sheet */
  footer?: ReactNode;
}

/**
 * En mobile (< sm): sheet que sube desde abajo, máx 92dvh.
 * En desktop (>= sm): drawer lateral desde la derecha, alto completo.
 * Ambos comparten el mismo backdrop y comportamiento de cierre.
 */
export function BottomSheet({ open, onClose, title, children, footer }: BottomSheetProps) {
  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Bloquear scroll del body mientras está abierto
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      {/* ── Desktop: drawer lateral desde la derecha ── */}
      <div
        className="hidden sm:flex absolute inset-y-0 right-0 w-full max-w-sm flex-col bg-nodo-card shadow-2xl animate-in slide-in-from-right duration-250"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-nodo-line">
          <h3 className="text-lg font-black text-nodo-ink">{title}</h3>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-nodo-inset transition-colors text-nodo-sub"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {children}
        </div>

        {footer && (
          <div className="px-6 py-5 border-t border-nodo-line">
            {footer}
          </div>
        )}
      </div>

      {/* ── Mobile: sheet desde abajo ── */}
      <div
        className="sm:hidden absolute inset-x-0 bottom-0 flex flex-col bg-nodo-card rounded-t-3xl shadow-2xl max-h-[92dvh] animate-in slide-in-from-bottom duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle visual */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-nodo-line-s" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0">
          <h3 className="text-lg font-black text-nodo-ink">{title}</h3>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-nodo-inset text-nodo-sub active:scale-95 transition-transform"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable content — min-h-0 necesario para flex en Safari iOS */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 min-h-0">
          {children}
        </div>

        {/* Footer fijo — paddingBottom aquí, no en el contenedor externo */}
        <div
          className="px-5 pt-3 shrink-0"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
        >
          {footer ?? <div />}
        </div>
      </div>
    </div>
  );
}
