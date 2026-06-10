import { useState, useEffect } from 'react';
import { ArrowRight, CheckCircle2, Loader2, AlertCircle, Check } from 'lucide-react';
import { useToast } from '@/components/ui/Toaster';
import { onboardingService, type PublicPlan } from '@/services/onboarding.service';
import { resolveModuleIcon } from '@/lib/module-icons';

interface OnboardingModalProps {
  userEmail: string;
  tenantName?: string | null;
  onComplete: () => void;
}

type Step = 'welcome' | 'plans' | 'payment' | 'done';

// ── Dot progress indicator ────────────────────────────────────────────────────
const STEPS: Step[] = ['welcome', 'plans', 'payment', 'done'];

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

// ── Simulated payment sheet ───────────────────────────────────────────────────
function PaymentSheet({
  plan,
  paying,
  onPay,
}: {
  plan: PublicPlan;
  paying: boolean;
  onPay: () => void;
}) {
  return (
    <div className="flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-400">
      <StepDots current="payment" />

      {/* Order summary */}
      <div className="mx-1 mb-5 rounded-2xl bg-nodo-inset border border-nodo-line overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b border-nodo-line">
          <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1">Resumen de suscripción</p>
          <div className="flex items-end justify-between">
            <p className="text-base font-black text-nodo-ink">{plan.name}</p>
            <p className="text-base font-black text-nodo-ink tabular-nums">
              {plan.currency} {plan.price.toLocaleString('es-GT', { minimumFractionDigits: 2 })}
              <span className="text-xs font-medium text-nodo-sub">/mes</span>
            </p>
          </div>
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-1.5">
          {plan.modules.map(m => {
            const Icon = resolveModuleIcon(m.icon);
            return (
              <span
                key={m.id}
                className="flex items-center gap-1 px-2.5 py-1 bg-nodo-card rounded-xl text-[11px] font-semibold text-nodo-ink"
              >
                <Icon size={11} className="text-nodo-sub shrink-0" strokeWidth={2} />
                {m.name}
              </span>
            );
          })}
        </div>
      </div>

      {/* Payment buttons */}
      <div className="flex flex-col gap-3 px-1">
        {/* Google Pay */}
        <button
          onClick={onPay}
          disabled={paying}
          className="w-full h-14 rounded-2xl bg-[#1a1a1a] text-white font-bold text-base flex items-center justify-center gap-3 active:scale-[0.97] transition-transform disabled:opacity-50 shadow-lg"
        >
          {paying ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              {/* Google Pay wordmark simulation */}
              <svg viewBox="0 0 41 17" className="h-5" fill="none">
                <path d="M19.8 8.5c0 2.5-1.9 4.3-4.3 4.3s-4.3-1.8-4.3-4.3 1.9-4.3 4.3-4.3 4.3 1.8 4.3 4.3z" fill="#4285F4"/>
                <path d="M11.2 8.5c0-2.5 1.9-4.3 4.3-4.3V2.7c-3.2 0-5.8 2.6-5.8 5.8s2.6 5.8 5.8 5.8v-1.5c-2.4 0-4.3-1.8-4.3-4.3z" fill="#34A853"/>
                <path d="M15.5 4.2c1.2 0 2.2.4 3 1.2l1.1-1.1C18.5 3.2 17.1 2.7 15.5 2.7v1.5z" fill="#EA4335"/>
                <path d="M15.5 12.8c1.6 0 3-.5 4.1-1.6l-1.1-1.1c-.8.8-1.8 1.2-3 1.2v1.5z" fill="#FBBC05"/>
                <text x="22" y="13" fontSize="11" fontFamily="Arial" fontWeight="700" fill="white">Pay</text>
              </svg>
              <span className="text-sm">Pagar con Google</span>
            </>
          )}
        </button>

        {/* Apple Pay */}
        <button
          onClick={onPay}
          disabled={paying}
          className="w-full h-14 rounded-2xl bg-[#000000] text-white font-bold text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-50 shadow-lg"
        >
          {paying ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              {/* Apple logo */}
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <span className="text-sm font-medium" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>Pay</span>
            </>
          )}
        </button>
      </div>

      <p className="text-center text-[10px] text-nodo-dim font-medium mt-4">
        Puedes cancelar en cualquier momento desde tu panel de configuración
      </p>
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
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    setLoadingPlans(true);
    onboardingService.listPlans()
      .then(p => { setPlans(p); if (p.length === 1) setSelectedPlan(p[0]); })
      .catch(() => setPlansError(true))
      .finally(() => setLoadingPlans(false));
  }, []);

  const handlePay = async () => {
    if (!selectedPlan) return;
    setPaying(true);
    // Simular procesamiento de pago (1.5s)
    await new Promise(r => setTimeout(r, 1500));
    try {
      await onboardingService.selectPlan({
        planId: selectedPlan.id,
        companyName: companyName.trim() || undefined,
      });
      setStep('done');
      setTimeout(onComplete, 1500);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al procesar el pago. Intenta de nuevo.');
      setPaying(false);
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
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#69E7A8] to-[#4BD48E] flex items-center justify-center shadow-lg shadow-[#69E7A8]/20">
                  <span className="text-2xl">🥖</span>
                </div>
              </div>

              <h1 className="text-[26px] font-black text-nodo-ink tracking-tight text-center mb-2">
                ¡Bienvenido a Nodo!
              </h1>
              <p className="text-nodo-sub text-sm font-medium text-center leading-relaxed mb-6 max-w-xs mx-auto">
                Configura tu espacio de trabajo en segundos.
              </p>

              <div className="mb-6">
                <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
                  Nombre de tu empresa
                </label>
                <input
                  type="text"
                  placeholder="Ej. Panadería La Luna"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  autoFocus
                  className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim"
                />
              </div>

              <button
                onClick={() => setStep('plans')}
                disabled={!companyName.trim()}
                className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2 shadow-lg"
              >
                Ver planes
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
                  Elige tu plan
                </h2>
                <p className="text-nodo-sub text-xs font-medium text-center">
                  Acceso inmediato tras confirmar el pago
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
                    <p className="text-xs text-nodo-dim">Contacta a soporte de Nodo.</p>
                  </div>
                )}

                {!loadingPlans && !plansError && plans.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                    <AlertCircle size={28} className="text-nodo-dim" />
                    <p className="text-sm font-bold text-nodo-dim">Sin planes disponibles.</p>
                    <p className="text-xs text-nodo-dim">El equipo de Nodo te contactará para configurar tu acceso.</p>
                  </div>
                )}

                {plans.map(plan => {
                  const active = selectedPlan?.id === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlan(plan)}
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
                  onClick={() => setStep('payment')}
                  disabled={!selectedPlan}
                  className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2 shadow-lg"
                >
                  Continuar al pago
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* ── PAYMENT ── */}
          {step === 'payment' && selectedPlan && (
            <div className="p-7 sm:p-10">
              <PaymentSheet plan={selectedPlan} paying={paying} onPay={handlePay} />
            </div>
          )}

          {/* ── DONE ── */}
          {step === 'done' && (
            <div className="p-7 sm:p-10 text-center animate-in fade-in zoom-in-95 duration-400">
              <StepDots current="done" />
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-nodo-success-bg mb-5 mx-auto">
                <CheckCircle2 className="w-9 h-9 text-nodo-success-tx" />
              </div>
              <h2 className="text-2xl font-black text-nodo-ink tracking-tight mb-2">¡Todo listo!</h2>
              <p className="text-nodo-sub text-sm font-medium">
                {selectedPlan?.name} activado. Entrando a tu panel...
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
