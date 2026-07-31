import { useEffect, useState } from 'react';
import { Check, Clock, Lock, AlertTriangle, Loader2, Sparkles, Package, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useToast } from '@/components/ui/Toaster';
import { billingService, type BillingMe, type BillingPlan } from '@/services/billing.service';

const fmtPrice = (price: number, currency: string) =>
  currency === 'GTQ' ? `Q${price.toFixed(0)}` : `${currency} ${price.toFixed(0)}`;

export function SubscriptionScreen() {
  const toast = useToast();
  const [me, setMe] = useState<BillingMe | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<BillingPlan | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [m, p] = await Promise.all([billingService.me(), billingService.listPlans()]);
      setMe(m);
      setPlans(p);
    } catch {
      toast.error('No se pudo cargar tu suscripción');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRequest = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await billingService.request(target.id, note.trim() || undefined);
      setTarget(null);
      setNote('');
      toast.success('Solicitud enviada');
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'No se pudo enviar la solicitud');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    try {
      await billingService.cancelRequest();
      toast.success('Solicitud cancelada');
      await load();
    } catch {
      toast.error('No se pudo cancelar');
    }
  };

  if (loading) {
    return (
      <div className="nodo-spinner-container">
        <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
      </div>
    );
  }

  const state = me?.access_state;
  const pending = me?.pending_request;

  return (
    <>
      <div className="flex flex-col gap-6 pb-6 max-w-3xl mx-auto">

        {/* Estado actual */}
        <StatusCard me={me} />

        {/* Solicitud pendiente */}
        {pending && (
          <div className="nodo-card p-5 flex items-start gap-3 bg-nodo-warn-bg border-nodo-warn-bd">
            <Clock size={18} className="text-nodo-warn-tx shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-nodo-ink">Solicitud enviada · {pending.plan_name}</p>
              <p className="text-xs text-nodo-sub mt-0.5">
                Te contactaremos para confirmar el pago. Al confirmarlo, tu plan se activa.
              </p>
            </div>
            <button
              onClick={handleCancel}
              className="text-[11px] font-bold text-nodo-dim hover:text-nodo-danger-tx transition-colors flex items-center gap-1 shrink-0"
            >
              <X size={12} /> Cancelar
            </button>
          </div>
        )}

        {/* Planes */}
        <div>
          <p className="nodo-section-label">Planes disponibles</p>
          {plans.length === 0 ? (
            <div className="nodo-empty-state">
              <Package size={32} className="text-nodo-dim mb-2" />
              <p className="text-sm font-bold text-nodo-dim">No hay planes disponibles aún.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {plans.map((plan) => {
                const isCurrent = me?.current_plan_id === plan.id && state === 'active';
                const isRequested = pending?.plan_id === plan.id;
                return (
                  <div key={plan.id} className="nodo-card p-5 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-lg font-black text-nodo-ink">{plan.name}</p>
                      {isCurrent && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-nodo-success-bg text-nodo-success-tx shrink-0">
                          Actual
                        </span>
                      )}
                    </div>
                    <p className="text-[28px] font-black text-nodo-ink tabular-nums leading-none">
                      {fmtPrice(plan.price, plan.currency)}
                      <span className="text-xs font-semibold text-nodo-sub"> /mes</span>
                    </p>
                    <p className="text-xs text-nodo-sub flex items-center gap-1.5">
                      <Package size={13} /> {plan.module_ids.length} {plan.module_ids.length === 1 ? 'módulo' : 'módulos'}
                    </p>
                    <button
                      onClick={() => { setTarget(plan); setNote(''); }}
                      disabled={isCurrent || isRequested}
                      className="mt-1 h-11 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-sm active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2"
                    >
                      {isCurrent ? 'Plan actual' : isRequested ? 'Solicitado' : (<><Sparkles size={15} /> Solicitar</>)}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <BottomSheet
        open={!!target}
        onClose={() => setTarget(null)}
        title="Confirmar suscripción"
        footer={
          <button
            onClick={handleRequest}
            disabled={saving}
            className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            ENVIAR SOLICITUD
          </button>
        }
      >
        {target && (
          <div className="flex flex-col gap-4">
            <div className="nodo-card p-4 flex items-center justify-between bg-nodo-inset">
              <span className="font-black text-nodo-ink">{target.name}</span>
              <span className="font-black text-nodo-ink tabular-nums">{fmtPrice(target.price, target.currency)} /mes</span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-nodo-sub">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <p>
                Al enviar la solicitud te contactamos para coordinar el <span className="font-bold text-nodo-ink">pago</span>.
                En cuanto lo confirmemos, tu plan queda activo. Tus datos siguen guardados mientras tanto.
              </p>
            </div>
            <div>
              <label className="nodo-label">Nota (opcional)</label>
              <textarea
                className="nodo-textarea"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. forma de pago preferida, dudas…"
              />
            </div>
          </div>
        )}
      </BottomSheet>
    </>
  );
}

function StatusCard({ me }: { me: BillingMe | null }) {
  const state = me?.access_state;

  if (state === 'active') {
    return (
      <div className="nodo-card-hero p-6 flex items-center gap-4 bg-nodo-success-bg border-nodo-success-bd">
        <div className="w-12 h-12 rounded-2xl bg-nodo-success-tx/15 flex items-center justify-center shrink-0">
          <Check size={24} className="text-nodo-success-tx" />
        </div>
        <div>
          <p className="text-[10px] font-bold text-nodo-sub uppercase tracking-wider">Plan activo</p>
          <p className="text-xl font-black text-nodo-ink">{me?.current_plan_name ?? 'Suscripción activa'}</p>
        </div>
      </div>
    );
  }

  if (state === 'trialing') {
    const n = me?.trial_days_remaining ?? 0;
    return (
      <div className="nodo-card-hero p-6 flex items-center gap-4 bg-nodo-primary-soft">
        <div className="w-12 h-12 rounded-2xl bg-nodo-ink/10 flex items-center justify-center shrink-0">
          <Clock size={24} className="text-nodo-ink" />
        </div>
        <div>
          <p className="text-[10px] font-bold text-nodo-sub uppercase tracking-wider">Prueba gratis</p>
          <p className="text-xl font-black text-nodo-ink">{n} {n === 1 ? 'día restante' : 'días restantes'}</p>
          <p className="text-xs text-nodo-sub mt-0.5">Suscríbete a un plan para no perder acceso.</p>
        </div>
      </div>
    );
  }

  if (state === 'grace') {
    const g = me?.grace_days_remaining ?? 0;
    return (
      <div className="nodo-card-hero p-6 flex items-center gap-4 bg-nodo-warn-bg border-nodo-warn-bd">
        <div className="w-12 h-12 rounded-2xl bg-nodo-warn-tx/15 flex items-center justify-center shrink-0">
          <AlertTriangle size={24} className="text-nodo-warn-tx" />
        </div>
        <div>
          <p className="text-[10px] font-bold text-nodo-sub uppercase tracking-wider">Prueba vencida · solo lectura</p>
          <p className="text-xl font-black text-nodo-ink">{g} {g === 1 ? 'día' : 'días'} de gracia</p>
          <p className="text-xs text-nodo-sub mt-0.5">Suscríbete para volver a guardar cambios.</p>
        </div>
      </div>
    );
  }

  if (state === 'locked') {
    return (
      <div className="nodo-card-hero p-6 flex items-center gap-4 bg-nodo-danger-bg border-nodo-danger-bd">
        <div className="w-12 h-12 rounded-2xl bg-nodo-danger-tx/15 flex items-center justify-center shrink-0">
          <Lock size={24} className="text-nodo-danger-tx" />
        </div>
        <div>
          <p className="text-[10px] font-bold text-nodo-sub uppercase tracking-wider">Prueba terminada</p>
          <p className="text-xl font-black text-nodo-ink">Suscríbete para reactivar</p>
          <p className="text-xs text-nodo-sub mt-0.5">Tus datos siguen guardados.</p>
        </div>
      </div>
    );
  }

  // Sin trial / estado neutro
  return (
    <div className="nodo-card-hero p-6 flex items-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-nodo-inset flex items-center justify-center shrink-0">
        <Sparkles size={24} className="text-nodo-ink" />
      </div>
      <div>
        <p className="text-[10px] font-bold text-nodo-sub uppercase tracking-wider">Tu plan</p>
        <p className="text-xl font-black text-nodo-ink">{me?.current_plan_name ?? 'Elige un plan'}</p>
      </div>
    </div>
  );
}
