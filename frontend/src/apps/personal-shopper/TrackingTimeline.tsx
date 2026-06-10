import { useState } from 'react';
import { Check, ChevronRight, Loader2 } from 'lucide-react';
import {
  TRACKING_STEPS,
  type TrackingStatus,
  type ShopperOrder,
} from '@/services/personal_shopper.service';
import { personalShopperService } from '@/services/personal_shopper.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

const stepIndex = (s: TrackingStatus | null) =>
  s == null ? -1 : TRACKING_STEPS.findIndex(t => t.key === s);

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('es-GT', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Color per step ───────────────────────────────────────────────────────────

const STEP_COLORS = [
  { ring: 'ring-blue-400',    bg: 'bg-blue-500',    text: 'text-blue-600 dark:text-blue-400',    lightBg: 'bg-blue-50 dark:bg-blue-500/10'    },
  { ring: 'ring-indigo-400',  bg: 'bg-indigo-500',  text: 'text-indigo-600 dark:text-indigo-400',  lightBg: 'bg-indigo-50 dark:bg-indigo-500/10'  },
  { ring: 'ring-violet-400',  bg: 'bg-violet-500',  text: 'text-violet-600 dark:text-violet-400',  lightBg: 'bg-violet-50 dark:bg-violet-500/10'  },
  { ring: 'ring-amber-400',   bg: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-400',   lightBg: 'bg-amber-50 dark:bg-amber-500/10'   },
  { ring: 'ring-emerald-400', bg: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', lightBg: 'bg-emerald-50 dark:bg-emerald-500/10' },
];

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  order: ShopperOrder;
  onUpdate: (updated: ShopperOrder) => void;
  readOnly?: boolean;
}

export function TrackingTimeline({ order, onUpdate, readOnly = false }: Props) {
  const [saving, setSaving] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [expandNote, setExpandNote] = useState(false);

  const currentIdx = stepIndex(order.tracking_status);
  const isComplete = order.tracking_status === 'entregado';

  const handleAdvance = async (toKey: TrackingStatus) => {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await personalShopperService.update(order.id, {
        tracking_status: toKey,
        tracking_note: noteInput.trim() || null,
      });
      onUpdate(updated);
      setNoteInput('');
      setExpandNote(false);
    } finally {
      setSaving(false);
    }
  };

  const nextStep = TRACKING_STEPS[currentIdx + 1] ?? null;

  return (
    <div className="space-y-4">

      {/* ── Timeline ── */}
      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-[22px] top-6 bottom-6 w-0.5 bg-nodo-line" />

        <div className="space-y-0">
          {TRACKING_STEPS.map((step, idx) => {
            const color   = STEP_COLORS[idx];
            const done    = idx <= currentIdx;
            const current = idx === currentIdx;

            return (
              <div key={step.key} className="flex items-start gap-4 relative">
                {/* Node */}
                <div className="relative z-10 shrink-0 mt-3">
                  {current ? (
                    // Pulsing current node
                    <div className="relative w-11 h-11 flex items-center justify-center">
                      <span className={`absolute inset-0 rounded-full ${color.bg} opacity-20 animate-ping`} />
                      <span className={`absolute inset-1.5 rounded-full ${color.bg} opacity-30`} />
                      <span className={`relative w-7 h-7 rounded-full ${color.bg}
                                        flex items-center justify-center shadow-md`}>
                        <span className="text-white text-base leading-none">{step.emoji}</span>
                      </span>
                    </div>
                  ) : done ? (
                    // Completed node
                    <div className={`w-11 h-11 flex items-center justify-center`}>
                      <div className={`w-7 h-7 rounded-full ${color.bg}
                                       flex items-center justify-center shadow-sm`}>
                        <Check className="w-4 h-4 text-white" strokeWidth={3} />
                      </div>
                    </div>
                  ) : (
                    // Pending node
                    <div className="w-11 h-11 flex items-center justify-center">
                      <div className="w-7 h-7 rounded-full border-2 border-nodo-line-s
                                       bg-nodo-inset flex items-center justify-center">
                        <span className="text-xs opacity-40">{step.emoji}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className={`flex-1 py-3 min-w-0 ${idx < TRACKING_STEPS.length - 1 ? 'pb-5' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold leading-tight
                                     ${done ? `${color.text}` : 'text-nodo-dim'}`}>
                        {step.label}
                      </p>
                      <p className={`text-xs mt-0.5
                                     ${done ? 'text-nodo-sub' : 'text-nodo-dim/60'}`}>
                        {current && order.tracking_updated_at
                          ? fmtDate(order.tracking_updated_at) ?? step.sublabel
                          : step.sublabel}
                      </p>
                      {/* Note badge on current step */}
                      {current && order.tracking_note && (
                        <div className={`inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-1
                                         rounded-full text-xs font-medium
                                         ${color.lightBg} ${color.text}`}>
                          <span className="w-1 h-1 rounded-full bg-current opacity-60" />
                          {order.tracking_note}
                        </div>
                      )}
                    </div>
                    {/* Advance button — only shown on current step */}
                    {!readOnly && current && !isComplete && nextStep && (
                      <button
                        onClick={() => setExpandNote(v => !v)}
                        className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full
                                    text-xs font-semibold transition-all active:scale-95
                                    ${color.lightBg} ${color.text}`}
                      >
                        Avanzar
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Completed banner ── */}
      {isComplete && (
        <div className="bg-nodo-success-bg border border-nodo-success-bd rounded-2xl px-4 py-3
                        flex items-center gap-3">
          <span className="text-2xl">🎉</span>
          <div>
            <p className="text-sm font-semibold text-nodo-success-tx">
              Pedido completado
            </p>
            <p className="text-xs text-nodo-success-tx/80">
              El cliente recibió su pedido
              {order.tracking_updated_at ? ` · ${fmtDate(order.tracking_updated_at)}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* ── Advance panel ── */}
      {!readOnly && !isComplete && expandNote && nextStep && (
        <div className="bg-nodo-inset rounded-2xl p-4 space-y-3 border border-nodo-line">
          <p className="text-xs font-semibold text-nodo-sub uppercase tracking-wide">
            Avanzar a: <span className="normal-case font-bold text-nodo-ink">
              {nextStep.emoji} {nextStep.label}
            </span>
          </p>
          <input
            type="text"
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            placeholder="Nota opcional (ej. vuelo AM 504, llega jueves)"
            className="nodo-input !bg-nodo-card"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setExpandNote(false); setNoteInput(''); }}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold
                         bg-nodo-card text-nodo-sub border border-nodo-line
                         active:scale-[0.97] transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={() => handleAdvance(nextStep.key)}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold
                         active:scale-[0.97] disabled:opacity-50 transition-all
                         flex items-center justify-center gap-2 shadow-md"
              style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmar {nextStep.emoji}
            </button>
          </div>
        </div>
      )}

      {/* ── Start tracking button (no tracking yet) ── */}
      {!readOnly && order.tracking_status === null && (
        <button
          onClick={() => handleAdvance('comprado')}
          disabled={saving}
          className="w-full py-3.5 rounded-full text-sm font-bold shadow-lg
                     active:scale-[0.98] disabled:opacity-50 transition-all
                     flex items-center justify-center gap-2"
          style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
        >
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <span className="text-base">🛍️</span>}
          Marcar como comprado
        </button>
      )}
    </div>
  );
}

// ─── Mini tracking bar (para OrderCard) ──────────────────────────────────────

export function TrackingMiniBar({ status }: { status: TrackingStatus | null }) {
  if (!status) return null;
  const idx = stepIndex(status);
  const color = STEP_COLORS[idx] ?? STEP_COLORS[0];

  return (
    <div className="flex items-center gap-1.5 mt-2">
      {/* Progress dots */}
      <div className="flex items-center gap-1">
        {TRACKING_STEPS.map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all ${
              i < idx
                ? `w-1.5 h-1.5 ${color.bg} opacity-50`
                : i === idx
                  ? `w-2.5 h-2 ${color.bg}`
                  : 'w-1.5 h-1.5 bg-nodo-raised'
            }`}
          />
        ))}
      </div>
      {/* Label */}
      <span className={`text-[10px] font-semibold ${color.text}`}>
        {TRACKING_STEPS[idx]?.emoji} {TRACKING_STEPS[idx]?.label}
      </span>
    </div>
  );
}
