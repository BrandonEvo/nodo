import { useState, useEffect } from "react";
import { Plus, Check, Tag, Pencil, PowerOff, Trash2, ShieldAlert, Loader2 } from "lucide-react";
import { resolveModuleIcon } from "@/lib/module-icons";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/Toaster";
import { subscriptionsService, type SubscriptionPlan } from "@/services/subscriptions.service";
import { modulesService, type ModuleRead } from "@/services/modules.service";

export function AdminSubscriptions() {
  const toast = useToast();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [modules, setModules] = useState<ModuleRead[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [masterPassword, setMasterPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    // Cada carga es independiente: un fallo al listar planes no debe dejar sin
    // módulos al formulario (ni al revés).
    const [plansList, modulesList] = await Promise.all([
      subscriptionsService.list().catch(() => [] as SubscriptionPlan[]),
      modulesService.list().catch(() => [] as ModuleRead[]),
    ]);
    setPlans(plansList);
    setModules(modulesList);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const openCreate = () => {
    setEditingPlanId(null);
    setName(""); setPrice(""); setSelectedModules([]);
    setFormOpen(true);
  };

  const openEdit = (plan: SubscriptionPlan) => {
    setEditingPlanId(plan.id);
    setName(plan.name);
    setPrice(plan.price.toString());
    setSelectedModules(plan.module_ids || []);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingPlanId(null);
    setName(""); setPrice(""); setSelectedModules([]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !price) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), price: Number(price), currency: "GTQ", module_ids: selectedModules };
      if (editingPlanId) {
        await subscriptionsService.update(editingPlanId, payload);
        toast.success("Plan actualizado");
      } else {
        await subscriptionsService.create(payload);
        toast.success("Plan creado");
      }
      closeForm();
      await loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al guardar el plan");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = (id: string) => {
    toast.confirm(
      "¿Desactivar este plan?",
      async () => {
        try {
          await subscriptionsService.delete(id);
          toast.warning("Plan desactivado");
          await loadData();
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Error al desactivar");
        }
      },
      { description: "Quedará en la base de datos en baja lógica.", confirmLabel: "Desactivar" }
    );
  };

  const handleReactivate = async (id: string) => {
    try {
      await subscriptionsService.update(id, { is_active: true });
      toast.success("Plan reactivado");
      await loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al reactivar");
    }
  };

  const handleHardDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTarget || !masterPassword) return;
    setDeleting(true);
    try {
      await subscriptionsService.hardDelete(deleteTarget, masterPassword);
      setDeleteTarget(null);
      setMasterPassword("");
      toast.success("Plan destruido permanentemente");
      await loadData();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || e.message || "Error al destruir el plan");
    } finally {
      setDeleting(false);
    }
  };

  const toggleModule = (id: string) => {
    setSelectedModules(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const formValid = name.trim().length > 0 && price.length > 0;

  const palette = [
    { bg: 'linear-gradient(140deg, #0a0f1e 0%, #0d1f2f 60%, #0a2b1a 100%)', accent: '#69E7A8' },
    { bg: 'linear-gradient(140deg, #0a0f1e 0%, #0d1a2f 60%, #0a1a3a 100%)', accent: '#60a5fa' },
    { bg: 'linear-gradient(140deg, #100a1e 0%, #1a0f2f 60%, #2a0a3a 100%)', accent: '#a78bfa' },
    { bg: 'linear-gradient(140deg, #1a0f0a 0%, #2a1a0a 60%, #2f1a05 100%)', accent: '#fb923c' },
  ];

  return (
    <>
      <div className="flex flex-col flex-1 overflow-hidden gap-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-[28px] font-black text-nodo-ink leading-tight">Planes</h1>
            <p className="text-nodo-sub text-sm font-medium mt-0.5">
              {loading ? '…' : `${plans.filter(p => p.is_active).length} activos · ${plans.length} total`}
            </p>
          </div>
          <button
            onClick={openCreate}
            className="h-11 px-5 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-sm flex items-center gap-2 active:scale-[0.97] transition-transform shadow-lg shrink-0"
          >
            <Plus size={16} />
            Nuevo plan
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
            </div>
          ) : plans.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-4">
              <Tag size={32} className="text-nodo-dim mb-2" />
              <p className="text-sm font-bold text-nodo-dim">No hay planes creados.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {plans.map((plan, idx) => {
                const inactive = !plan.is_active;
                const colors = palette[idx % palette.length];
                const planModules = (plan.module_ids || [])
                  .map(mid => modules.find(m => m.id === mid))
                  .filter((m): m is typeof modules[0] => !!m);

                return (
                  <div
                    key={plan.id}
                    className={`rounded-[24px] overflow-hidden shadow-md transition-opacity ${inactive ? 'opacity-55' : ''}`}
                  >
                    {/* Gradient header */}
                    <div className="relative p-6" style={{ background: colors.bg }}>
                      <div
                        className="absolute -right-10 -top-10 w-44 h-44 rounded-full pointer-events-none"
                        style={{ background: `radial-gradient(circle, ${colors.accent} 0%, transparent 70%)`, opacity: 0.13 }}
                      />

                      {/* Status + actions */}
                      <div className="flex items-center justify-between mb-5">
                        <span
                          className="px-2.5 py-1 rounded-full text-[9px] font-black tracking-widest uppercase"
                          style={plan.is_active
                            ? { background: `${colors.accent}22`, color: colors.accent }
                            : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)' }
                          }
                        >
                          {plan.is_active ? 'Activo' : 'Inactivo'}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(plan)}
                            className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/60 hover:text-white transition-colors active:scale-90"
                          >
                            <Pencil size={13} />
                          </button>
                          {plan.is_active ? (
                            <button
                              onClick={() => handleDeactivate(plan.id)}
                              className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/60 hover:text-white transition-colors active:scale-90"
                            >
                              <PowerOff size={13} />
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleReactivate(plan.id)}
                                className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/60 hover:text-white transition-colors active:scale-90"
                              >
                                <PowerOff size={13} />
                              </button>
                              <button
                                onClick={() => { setDeleteTarget(plan.id); setMasterPassword(""); }}
                                className="p-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors active:scale-90"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Name + price */}
                      <p className="text-white/50 text-sm font-semibold mb-1">{plan.name}</p>
                      <div className="flex items-end gap-2">
                        <span className="text-[44px] font-black text-white leading-none tabular-nums">Q{plan.price}</span>
                        <span className="text-white/30 text-sm font-medium pb-1.5">{plan.currency} / mes</span>
                      </div>
                    </div>

                    {/* Modules section */}
                    <div className="bg-nodo-inset p-5">
                      <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-3">
                        Módulos incluidos · {planModules.length}
                      </p>
                      {planModules.length === 0 ? (
                        <p className="text-xs text-nodo-dim italic">Sin módulos asignados</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {planModules.map(mod => {
                            const ModIcon = resolveModuleIcon(mod.icon);
                            return (
                              <span
                                key={mod.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-nodo-card rounded-xl text-xs font-semibold text-nodo-ink"
                              >
                                <ModIcon size={13} className="text-nodo-sub shrink-0" strokeWidth={2} />
                                {mod.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Form BottomSheet */}
      <BottomSheet
        open={formOpen}
        onClose={closeForm}
        title={editingPlanId ? "Editar Plan" : "Nuevo Plan"}
        footer={
          <button
            form="plan-form"
            type="submit"
            disabled={saving || !formValid}
            className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {saving
              ? <Loader2 size={18} className="animate-spin" />
              : <Check size={18} />
            }
            {editingPlanId ? "GUARDAR CAMBIOS" : "CREAR PLAN"}
          </button>
        }
      >
        <form id="plan-form" onSubmit={handleSave} className="flex flex-col gap-5">

          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
              Nombre del Plan
            </label>
            <input
              type="text"
              placeholder="Ej. Plan Pro"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              disabled={saving}
              className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
              Precio Mensual
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-nodo-sub font-bold text-sm select-none">Q</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={price}
                onChange={e => setPrice(e.target.value)}
                required
                disabled={saving}
                className="w-full h-12 pl-8 pr-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim disabled:opacity-50 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
              Módulos que incluye
            </label>
            <div className="bg-nodo-inset rounded-2xl border border-nodo-line overflow-hidden">
              {modules.filter(m => m.is_active).length === 0 ? (
                <p className="text-sm text-nodo-dim text-center py-6 px-4">No hay módulos activos disponibles.</p>
              ) : (
                modules.filter(m => m.is_active).map((m, i, arr) => {
                  const selected = selectedModules.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleModule(m.id)}
                      disabled={saving}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-nodo-raised ${i < arr.length - 1 ? "border-b border-nodo-line" : ""} ${selected ? "bg-nodo-raised" : ""}`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${selected ? "bg-nodo-ink border-nodo-ink" : "border-nodo-line-s"}`}>
                        {selected && <Check size={11} className="text-nodo-canvas" />}
                      </div>
                      <span className="flex items-center gap-2 text-sm font-semibold text-nodo-ink">
                        {(() => { const I = resolveModuleIcon(m.icon); return <I size={15} className="text-nodo-sub shrink-0" strokeWidth={2} />; })()}
                        {m.name}
                      </span>
                      <span className="ml-auto font-mono text-[10px] text-nodo-dim">{m.code}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

        </form>
      </BottomSheet>

      {/* Hard delete BottomSheet */}
      <BottomSheet
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setMasterPassword(""); }}
        title="Destrucción Permanente"
        footer={
          <div className="flex gap-3">
            <button
              onClick={() => { setDeleteTarget(null); setMasterPassword(""); }}
              className="flex-1 h-14 rounded-2xl border-2 border-nodo-line text-nodo-sub font-bold text-sm active:scale-[0.97] transition-transform hover:bg-nodo-inset"
            >
              Cancelar
            </button>
            <button
              form="hard-delete-plan-form"
              type="submit"
              disabled={deleting || !masterPassword}
              className="flex-1 h-14 rounded-2xl bg-nodo-danger-tx text-white font-bold text-sm active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2"
            >
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Destruir
            </button>
          </div>
        }
      >
        <form id="hard-delete-plan-form" onSubmit={handleHardDelete} className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="w-14 h-14 bg-nodo-danger-bg rounded-2xl flex items-center justify-center">
              <ShieldAlert size={28} className="text-nodo-danger-tx" />
            </div>
            <div className="text-center">
              <p className="font-black text-nodo-ink text-base">
                {plans.find(p => p.id === deleteTarget)?.name}
              </p>
              <p className="text-sm text-nodo-sub mt-1">
                Borrará el plan de la base de datos de manera irreversible.
              </p>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
              Contraseña Maestra
            </label>
            <input
              type="password"
              placeholder="Contraseña de superadmin..."
              value={masterPassword}
              onChange={e => setMasterPassword(e.target.value)}
              autoFocus
              className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-danger-bd rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-danger-tx outline-none transition-colors placeholder:text-nodo-dim text-center tracking-widest"
            />
          </div>
        </form>
      </BottomSheet>
    </>
  );
}
