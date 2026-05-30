import { useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toaster';
import { onboardingService } from '@/services/onboarding.service';

interface OnboardingModalProps {
  userEmail: string;
  tenantName?: string | null;
  onComplete: () => void;
}

interface ModuleOption {
  code: string;
  icon: string;
  name: string;
  description: string;
  default: boolean;
}

const MODULE_OPTIONS: ModuleOption[] = [
  { code: 'bodega',           icon: '📦', name: 'Bodega',          description: 'Control de inventario y stock',        default: true  },
  { code: 'recetas',          icon: '📋', name: 'Recetas',          description: 'Fórmulas y costos de producción',      default: true  },
  { code: 'cocina',           icon: '🔥', name: 'Producción',       description: 'Órdenes de trabajo y hornadas',        default: true  },
  { code: 'mostrador',        icon: '🏪', name: 'Mostrador',        description: 'Punto de venta y tickets',             default: true  },
  { code: 'cierre',           icon: '🔒', name: 'Cierre de Caja',   description: 'Arqueo y cuadre diario',               default: true  },
  { code: 'gastos',           icon: '💸', name: 'Gastos',           description: 'Control de gastos operativos',         default: false },
  { code: 'reportes',         icon: '📊', name: 'Reportes',         description: 'P&L mensual y análisis',               default: false },
  { code: 'calc',             icon: '🧮', name: 'Calculadora',      description: 'Simulador de precios y márgenes',      default: false },
  { code: 'importaciones',    icon: '🌎', name: 'Importaciones',    description: 'Cotizaciones y seguimiento de compras',default: false },
  { code: 'personal-shopper', icon: '🛍️', name: 'Personal Shopper', description: 'Pedidos y tracking de clientes',       default: false },
  { code: 'autos',            icon: '🚗', name: 'Vehículos',        description: 'Cálculo de importación de autos',      default: false },
];

type Step = 'welcome' | 'modules' | 'done';

export function OnboardingModal({ userEmail: _userEmail, tenantName, onComplete }: OnboardingModalProps) {
  const toast = useToast();
  const [step, setStep]     = useState<Step>('welcome');
  const [selected, setSelected] = useState<Set<string>>(
    new Set(MODULE_OPTIONS.filter(m => m.default).map(m => m.code))
  );
  const [saving, setSaving] = useState(false);

  const toggle = (code: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      await onboardingService.complete({ moduleCodes: Array.from(selected) });
      setStep('done');
      setTimeout(onComplete, 1400);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const companyDisplay = tenantName || 'tu empresa';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-xl bg-black/40">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#69E7A8]/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative w-full max-w-lg mx-4 max-h-[92dvh] flex flex-col">
        <div className="bg-nodo-card border border-nodo-line rounded-3xl shadow-2xl overflow-hidden flex flex-col">

          {/* ── BIENVENIDA ── */}
          {step === 'welcome' && (
            <div className="p-8 sm:p-12 text-center animate-in fade-in zoom-in-95 duration-500">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-[#69E7A8] to-[#4BD48E] mb-8 shadow-lg shadow-[#69E7A8]/25">
                <span className="text-3xl">🥖</span>
              </div>
              <h1 className="text-3xl font-black text-nodo-ink tracking-tight mb-3">
                ¡Bienvenido a Nodo!
              </h1>
              <p className="text-nodo-sub font-medium text-sm leading-relaxed max-w-sm mx-auto mb-2">
                <span className="font-bold text-nodo-ink">{companyDisplay}</span> ya está creada.
              </p>
              <p className="text-nodo-sub font-medium text-sm leading-relaxed max-w-sm mx-auto mb-8">
                Elige los módulos que vas a usar y en segundos tendrás todo listo.
              </p>

              <div className="flex items-center justify-center gap-2 mb-8">
                <div className="w-8 h-1.5 rounded-full bg-nodo-ink" />
                <div className="w-8 h-1.5 rounded-full bg-nodo-line" />
                <div className="w-8 h-1.5 rounded-full bg-nodo-line" />
              </div>

              <button
                onClick={() => setStep('modules')}
                className="inline-flex items-center gap-2 px-8 py-4 bg-nodo-ink text-nodo-canvas font-bold text-base rounded-2xl shadow-lg active:scale-[0.97] transition-transform"
              >
                Elegir módulos
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* ── SELECCIÓN DE MÓDULOS ── */}
          {step === 'modules' && (
            <div className="flex flex-col animate-in fade-in slide-in-from-right-4 duration-400 min-h-0">
              {/* Header fijo */}
              <div className="p-6 pb-4 border-b border-nodo-line">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <div className="w-8 h-1.5 rounded-full bg-[#69E7A8]" />
                  <div className="w-8 h-1.5 rounded-full bg-nodo-ink" />
                  <div className="w-8 h-1.5 rounded-full bg-nodo-line" />
                </div>
                <h2 className="text-xl font-black text-nodo-ink text-center tracking-tight">
                  ¿Qué áreas vas a gestionar?
                </h2>
                <p className="text-nodo-sub text-xs font-medium text-center mt-1">
                  Puedes activar más módulos después
                </p>
              </div>

              {/* Lista scrollable */}
              <div className="overflow-y-auto flex-1 p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {MODULE_OPTIONS.map(mod => {
                  const active = selected.has(mod.code);
                  return (
                    <button
                      key={mod.code}
                      type="button"
                      onClick={() => toggle(mod.code)}
                      className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition-all active:scale-[0.97] ${
                        active
                          ? 'border-nodo-ink bg-nodo-raised'
                          : 'border-nodo-line bg-nodo-inset hover:bg-nodo-raised'
                      }`}
                    >
                      <span className="text-xl shrink-0 w-8 text-center">{mod.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-nodo-ink truncate">{mod.name}</p>
                        <p className="text-xs text-nodo-dim truncate">{mod.description}</p>
                      </div>
                      {active && (
                        <div className="w-5 h-5 rounded-full bg-nodo-ink flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5 text-nodo-canvas" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Footer fijo */}
              <div className="p-4 border-t border-nodo-line">
                <button
                  onClick={handleComplete}
                  disabled={saving || selected.size === 0}
                  className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2 shadow-lg"
                >
                  {saving
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <CheckCircle2 className="w-5 h-5" />}
                  {saving ? 'Configurando...' : `ACTIVAR ${selected.size} MÓDULO${selected.size !== 1 ? 'S' : ''}`}
                </button>
              </div>
            </div>
          )}

          {/* ── ÉXITO ── */}
          {step === 'done' && (
            <div className="p-8 sm:p-12 text-center animate-in fade-in zoom-in-95 duration-500">
              <div className="flex items-center justify-center gap-2 mb-8">
                <div className="w-8 h-1.5 rounded-full bg-[#69E7A8]" />
                <div className="w-8 h-1.5 rounded-full bg-[#69E7A8]" />
                <div className="w-8 h-1.5 rounded-full bg-[#69E7A8]" />
              </div>
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-nodo-success-bg mb-6">
                <CheckCircle2 className="w-10 h-10 text-nodo-success-tx" />
              </div>
              <h2 className="text-2xl font-black text-nodo-ink tracking-tight mb-2">¡Todo listo!</h2>
              <p className="text-nodo-sub text-sm font-medium">
                {selected.size} módulo{selected.size !== 1 ? 's' : ''} activado{selected.size !== 1 ? 's' : ''}. Entrando a tu panel...
              </p>
            </div>
          )}

        </div>

        <p className="text-center text-[10px] text-white/40 font-bold tracking-widest uppercase mt-4">
          Nodo Enterprise Framework
        </p>
      </div>
    </div>
  );
}
