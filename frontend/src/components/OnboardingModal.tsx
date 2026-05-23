import { useState } from 'react';
import { Building2, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toaster';
import { onboardingService } from '@/services/onboarding.service';

interface OnboardingModalProps {
  userEmail: string;
  onComplete: () => void;
}

export function OnboardingModal({ userEmail, onComplete }: OnboardingModalProps) {
  const toast = useToast();
  const [companyName, setCompanyName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'welcome' | 'form' | 'success'>('welcome');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;

    setIsLoading(true);
    try {
      await onboardingService.complete(companyName.trim());
      setStep('success');
      setTimeout(() => {
        onComplete();
      }, 1500);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al completar el onboarding');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-xl bg-black/40">
      {/* Partículas decorativas */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#69E7A8]/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative w-full max-w-lg mx-4">
        {/* Card principal */}
        <div className="bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden">

          {/* ── STEP 1: BIENVENIDA ── */}
          {step === 'welcome' && (
            <div className="p-8 sm:p-12 text-center animate-in fade-in zoom-in-95 duration-500">
              {/* Logo */}
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-[#69E7A8] to-[#4BD48E] mb-8 shadow-lg shadow-[#69E7A8]/25">
                <Sparkles className="w-10 h-10 text-[#111111]" />
              </div>

              <h1 className="text-3xl font-black text-[#111111] tracking-tight mb-3">
                ¡Bienvenido a Nodo!
              </h1>
              <p className="text-gray-500 font-medium text-sm leading-relaxed max-w-sm mx-auto mb-8">
                Estás a un paso de configurar tu espacio de trabajo. Solo necesitamos el nombre real de tu empresa.
              </p>

              {/* Indicador de pasos */}
              <div className="flex items-center justify-center gap-2 mb-8">
                <div className="w-8 h-1.5 rounded-full bg-[#111111]" />
                <div className="w-8 h-1.5 rounded-full bg-gray-200" />
                <div className="w-8 h-1.5 rounded-full bg-gray-200" />
              </div>

              <button
                onClick={() => setStep('form')}
                className="inline-flex items-center gap-2 px-8 py-4 bg-[#111111] text-white font-bold text-base rounded-2xl shadow-lg hover:bg-black transition-all duration-200 active:scale-[0.97] hover:shadow-xl"
              >
                Comenzar
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* ── STEP 2: FORMULARIO ── */}
          {step === 'form' && (
            <div className="p-8 sm:p-12 animate-in fade-in slide-in-from-right-4 duration-400">
              {/* Header */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#69E7A8]/10 mb-4">
                  <Building2 className="w-7 h-7 text-[#69E7A8]" />
                </div>
                <h2 className="text-2xl font-black text-[#111111] tracking-tight mb-2">
                  Tu Empresa
                </h2>
                <p className="text-gray-400 text-sm font-medium">
                  ¿Cómo se llama tu organización?
                </p>
              </div>

              {/* Indicador de pasos */}
              <div className="flex items-center justify-center gap-2 mb-8">
                <div className="w-8 h-1.5 rounded-full bg-[#69E7A8]" />
                <div className="w-8 h-1.5 rounded-full bg-[#111111]" />
                <div className="w-8 h-1.5 rounded-full bg-gray-200" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-2">
                    Nombre de la Empresa
                  </label>
                  <div className="relative group">
                    <input
                      type="text"
                      placeholder="Ej: Acme Corporation"
                      required
                      autoFocus
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full h-14 pl-14 pr-4 rounded-2xl border-2 border-gray-200 bg-white text-base font-medium focus:ring-2 focus:ring-[#111111]/10 focus:border-[#111111] transition-all shadow-sm outline-none"
                    />
                    <Building2 className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#111111] w-5 h-5 transition-colors" />
                  </div>
                </div>

                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-xs text-gray-400 font-medium">
                    <span className="font-bold text-gray-500">Administrador:</span> {userEmail}
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !companyName.trim()}
                  className="w-full h-14 bg-[#111111] hover:bg-black text-white font-bold text-base rounded-2xl shadow-lg transition-all duration-200 active:scale-[0.97] hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Configurando...
                    </>
                  ) : (
                    <>
                      Finalizar Configuración
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* ── STEP 3: ÉXITO ── */}
          {step === 'success' && (
            <div className="p-8 sm:p-12 text-center animate-in fade-in zoom-in-95 duration-500">
              {/* Indicador de pasos */}
              <div className="flex items-center justify-center gap-2 mb-8">
                <div className="w-8 h-1.5 rounded-full bg-[#69E7A8]" />
                <div className="w-8 h-1.5 rounded-full bg-[#69E7A8]" />
                <div className="w-8 h-1.5 rounded-full bg-[#69E7A8]" />
              </div>

              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#69E7A8]/10 mb-6">
                <CheckCircle2 className="w-10 h-10 text-[#69E7A8]" />
              </div>

              <h2 className="text-2xl font-black text-[#111111] tracking-tight mb-2">
                ¡Todo listo!
              </h2>
              <p className="text-gray-400 text-sm font-medium">
                Tu espacio de trabajo <span className="font-bold text-[#111111]">{companyName}</span> está configurado.
              </p>
            </div>
          )}

        </div>

        {/* Footer fuera del card */}
        <p className="text-center text-[10px] text-white/40 font-bold tracking-widest uppercase mt-6">
          Nodo Enterprise Framework
        </p>
      </div>
    </div>
  );
}
