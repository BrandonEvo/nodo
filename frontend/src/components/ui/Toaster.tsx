import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X, AlertCircle } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ConfirmState {
  message: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
  confirm: (message: string, onConfirm: () => void, options?: { description?: string; confirmLabel?: string }) => void;
}

// ── Context ────────────────────────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

// ── Styles per type ────────────────────────────────────────────────────────────
const TOAST_META: Record<ToastType, { icon: React.ElementType; bar: string; iconColor: string }> = {
  success: { icon: CheckCircle2, bar: 'border-[#69E7A8]',  iconColor: 'text-[#2ea86b]' },
  error:   { icon: XCircle,      bar: 'border-red-400',    iconColor: 'text-red-500'   },
  warning: { icon: AlertTriangle, bar: 'border-amber-400', iconColor: 'text-amber-500' },
  info:    { icon: Info,          bar: 'border-blue-400',  iconColor: 'text-blue-500'  },
};

// ── Provider ───────────────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const add = useCallback((message: string, type: ToastType) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), 4500);
  }, [dismiss]);

  const ctx: ToastContextValue = {
    success: (msg) => add(msg, 'success'),
    error:   (msg) => add(msg, 'error'),
    warning: (msg) => add(msg, 'warning'),
    info:    (msg) => add(msg, 'info'),
    confirm: (message, onConfirm, options) =>
      setConfirmState({ message, onConfirm, description: options?.description, confirmLabel: options?.confirmLabel }),
  };

  const handleConfirm = () => {
    confirmState?.onConfirm();
    setConfirmState(null);
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}

      {/* ── Toast stack (bottom on mobile, top-right on desktop) ── */}
      <div
        aria-live="polite"
        className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:top-4 sm:bottom-auto z-[9999] flex flex-col gap-2 pointer-events-none sm:max-w-sm"
      >
        {toasts.map(t => {
          const { icon: Icon, bar, iconColor } = TOAST_META[t.type];
          return (
            <div
              key={t.id}
              role="alert"
              className={`bg-white border border-gray-100 border-l-4 ${bar} rounded-2xl px-5 py-4 shadow-xl shadow-black/8 flex items-start gap-3 pointer-events-auto animate-in slide-in-from-bottom-2 sm:slide-in-from-right-4 fade-in duration-300`}
            >
              <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${iconColor}`} />
              <p className="text-sm font-semibold text-[#111111] flex-1 leading-snug">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 p-0.5 rounded text-gray-300 hover:text-gray-500 transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Confirm dialog ── */}
      {confirmState && (
        <div
          className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-4 bg-[#111111]/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setConfirmState(null)}
        >
          <div
            className="bg-white rounded-[28px] p-7 w-full max-w-sm shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <AlertCircle className="w-7 h-7 text-amber-500" />
            </div>
            <h3 className="text-lg font-black text-[#111111] text-center leading-snug">
              {confirmState.message}
            </h3>
            {confirmState.description && (
              <p className="text-sm text-gray-400 text-center mt-2 leading-relaxed">
                {confirmState.description}
              </p>
            )}
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setConfirmState(null)}
                className="flex-1 h-12 rounded-xl border-2 border-gray-200 text-gray-500 font-bold text-sm hover:bg-gray-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 h-12 rounded-xl bg-[#111111] text-white font-bold text-sm hover:bg-black transition-all active:scale-[0.97]"
              >
                {confirmState.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
