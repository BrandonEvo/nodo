import { useState, useEffect } from 'react';
import { ArrowRight, Clock, Loader2, AlertCircle, Check, Sparkles } from 'lucide-react';
import { useToast } from '@/components/ui/Toaster';
import { onboardingService, type PublicPlan } from '@/services/onboarding.service';
import { resolveModuleIcon } from '@/lib/module-icons';

interface OnboardingModalProps {
  userEmail: string;
  tenantName?: string | null;
  onComplete: () => void;
}

type Step = 'welcome' | 'plans' | 'done';

// ── Dot progress indicator ────────────────────────────────────────────────────
const STEPS: Step[] = ['welcome', 'plans', 'done'];

function StepDots({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {STEPS.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i < idx
              ? 'w-4 bg-nodo-primary'
              : i === idx
              ? 'w-8 bg-nodo-ink'
              : 'w-4 bg-nodo-line'
          }`}
        />
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function OnboardingModal({ userEmail: _userEmail, tenantName, onComplete }: OnboardingModalProps) {
  const toast = useToast();
  const [step, setStep] = useState<Step>('welcome');
  const [companyName, setCompanyName] = useState(tenantName ?? '');
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [plansError, setPlansError] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PublicPlan | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoadingPlans(true);
    onboardingService.listPlans()
      .then(p => { setPlans(p); if (p.length === 1) setSelectedPlan(p[0]); })
      .catch(() => setPlansError(true))
      .finally(() => setLoadingPlans(false));
  }, []);

  // El plan elegido es una señal de interés, no una compra: el acceso lo habilita
  // el equipo desde el panel. Por eso acá no se cobra ni se activa nada.
  const handleFinish = async () => {
    setSaving(true);
    try {
      await onboardingService.complete({
        companyName: companyName.trim() || undefined,
        planId: selectedPlan?.id,
      });
      setStep('done');
      setTimeout(onComplete, 2400);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'No se pudo terminar el registro. Intenta de nuevo.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center backdrop-blur-xl bg-black/50">
      {/* Ambient glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-nodo-primary-softer rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-blue-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg sm:mx-4 sm:mb-0 mb-0">
        <div className="bg-nodo-card sm:border border-nodo-line sm:rounded-[28px] rounded-t-[28px] shadow-2xl overflow-hidden">

          {/* ── WELCOME ── */}
          {step === 'welcome' && (
            <div className="p-7 sm:p-10 animate-in fade-in zoom-in-95 duration-400">
              <StepDots current="welcome" />

              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-nodo-primary flex items-center justify-center shadow-lg">
                  <Sparkles className="w-7 h-7 text-nodo-on-primary" strokeWidth={2.5} />
                </div>
              </div>

              <h1 className="text-[26px] font-black text-nodo-ink tracking-tight text-center mb-2">
                ¡Bienvenido a Nodo!
              </h1>
              <p className="text-nodo-sub text-sm font-medium text-center leading-relaxed mb-6 max-w-xs mx-auto">
                Configura tu espacio de trabajo en segundos.
              </p>

              <div className="mb-6">
                <label className="nodo-label">
                  Nombre de tu empresa
                </label>
                <input
                  type="text"
                  placeholder="Ej. Tienda La Luna"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  autoFocus
                  className="nodo-input"
                />
              </div>

              <button
                onClick={() => setStep('plans')}
                disabled={!companyName.trim()}
                className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2 shadow-lg"
              >
                Continuar
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* ── PLANS ── */}
          {step === 'plans' && (
            <div className="flex flex-col animate-in fade-in slide-in-from-right-4 duration-400 min-h-0">
              <div className="p-7 sm:p-10 pb-4">
                <StepDots current="plans" />
                <h2 className="text-[22px] font-black text-nodo-ink tracking-tight text-center mb-1">
                  ¿Qué plan te sirve?
                </h2>
                <p className="text-nodo-sub text-xs font-medium text-center">
                  Marca el que te interese. Revisamos tu registro y habilitamos tu acceso.
                </p>
              </div>

              <div className="overflow-y-auto px-5 sm:px-8 pb-5 flex flex-col gap-3 max-h-[40vh]">
                {loadingPlans && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-7 h-7 animate-spin text-nodo-sub" />
                  </div>
                )}

                {plansError && (
                  <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                    <AlertCircle size={28} className="text-nodo-dim" />
                    <p className="text-sm font-bold text-nodo-dim">No se pudieron cargar los planes.</p>
                    <p className="text-xs text-nodo-dim">Puedes continuar: te ayudamos a elegirlo después.</p>
                  </div>
                )}

                {!loadingPlans && !plansError && plans.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                    <AlertCircle size={28} className="text-nodo-dim" />
                    <p className="text-sm font-bold text-nodo-dim">Sin planes disponibles.</p>
                    <p className="text-xs text-nodo-dim">Te contactamos para configurar tu acceso.</p>
                  </div>
                )}

                {plans.map(plan => {
                  const active = selectedPlan?.id === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlan(active ? null : plan)}
                      className={`w-full text-left rounded-[20px] border-2 p-4 transition-all active:scale-[0.98] ${
                        active
                          ? 'border-nodo-ink bg-nodo-raised'
                          : 'border-nodo-line bg-nodo-inset hover:bg-nodo-raised hover:border-nodo-line-s'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${active ? 'bg-nodo-ink border-nodo-ink' : 'border-nodo-line-s'}`}>
                            {active && <Check size={11} className="text-nodo-canvas" />}
                          </div>
                          <p className="text-sm font-black text-nodo-ink">{plan.name}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base font-black text-nodo-ink tabular-nums leading-none">
                            {plan.currency} {plan.price.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
                          </p>
                          <p className="text-[10px] text-nodo-dim font-medium">/mes</p>
                        </div>
                      </div>

                      {/* Modules as chips */}
                      <div className="flex flex-wrap gap-1.5">
                        {plan.modules.map(m => {
                          const Icon = resolveModuleIcon(m.icon);
                          return (
                            <span
                              key={m.id}
                              className="flex items-center gap-1 px-2 py-1 bg-nodo-card rounded-xl text-[10px] font-semibold text-nodo-ink"
                            >
                              <Icon size={10} className="text-nodo-sub shrink-0" strokeWidth={2} />
                              {m.name}
                            </span>
                          );
                        })}
                        {plan.modules.length === 0 && (
                          <span className="text-[10px] text-nodo-dim italic">Sin módulos asignados</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="px-5 sm:px-8 pt-3 pb-7 sm:pb-10">
                <button
                  onClick={handleFinish}
                  disabled={saving}
                  className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2 shadow-lg"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Terminar registro <ArrowRight className="w-5 h-5" /></>}
                </button>
                <p className="text-center text-[10px] text-nodo-dim font-medium mt-3">
                  No se cobra nada ahora. Te confirmamos antes de activar cualquier plan.
                </p>
              </div>
            </div>
          )}

          {/* ── DONE ── */}
          {step === 'done' && (
            <div className="p-7 sm:p-10 text-center animate-in fade-in zoom-in-95 duration-400">
              <StepDots current="done" />
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-nodo-primary-soft mb-5 mx-auto">
                <Clock className="w-9 h-9 text-nodo-ink" />
              </div>
              <h2 className="text-2xl font-black text-nodo-ink tracking-tight mb-2">Cuenta creada</h2>
              <p className="text-nodo-sub text-sm font-medium max-w-xs mx-auto leading-relaxed">
                Estamos revisando tu registro. Te habilitamos los módulos y te avisamos por correo.
              </p>
            </div>
          )}

        </div>

        <p className="text-center text-[10px] text-white/30 font-bold tracking-widest uppercase mt-3 pb-2">
          Nodo © 2026
        </p>
      </div>
    </div>
  );
}
