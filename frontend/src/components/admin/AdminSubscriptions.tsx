import { useState, useEffect } from "react";
import { Plus, CreditCard, Check, Tag, Pencil, PowerOff, Trash2, ShieldAlert, Loader2 } from "lucide-react";
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
    try {
      const [plansList, modulesList] = await Promise.all([
        subscriptionsService.list(),
        modulesService.list().catch(() => []),
      ]);
      setPlans(plansList);
      setModules(modulesList);
    } finally {
      setLoading(false);
    }
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

  return (
    <>
      <div className="flex flex-col flex-1 overflow-hidden gap-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-[28px] font-black text-nodo-ink leading-tight">Planes de Suscripción</h1>
            <p className="text-nodo-sub text-sm font-medium mt-0.5">Configura qué módulos incluye cada plan.</p>
          </div>
          <button
            onClick={openCreate}
            className="h-11 px-5 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-sm flex items-center gap-2 active:scale-[0.97] transition-transform shadow-lg shrink-0"
          >
            <Plus size={16} />
            Crear
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
              {plans.map(plan => {
                const inactive = !plan.is_active;
                return (
                  <div
                    key={plan.id}
                    className={`bg-nodo-card border border-nodo-line rounded-3xl p-6 shadow-sm flex flex-col gap-5 relative transition-opacity ${inactive ? "opacity-50" : ""}`}
                  >
                    {/* Actions */}
                    <div className="absolute top-4 right-4 flex items-center gap-1">
                      <button
                        onClick={() => openEdit(plan)}
                        className="p-2 text-nodo-dim hover:text-nodo-ink hover:bg-nodo-raised rounded-full transition-colors"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      {plan.is_active ? (
                        <button
                          onClick={() => handleDeactivate(plan.id)}
                          className="p-2 text-nodo-warn-tx hover:bg-nodo-warn-bg rounded-full transition-colors"
                          title="Desactivar"
                        >
                          <PowerOff size={15} />
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleReactivate(plan.id)}
                            className="p-2 text-nodo-success-tx hover:bg-nodo-success-bg rounded-full transition-colors"
                            title="Reactivar"
                          >
                            <PowerOff size={15} />
                          </button>
                          <button
                            onClick={() => { setDeleteTarget(plan.id); setMasterPassword(""); }}
                            className="p-2 text-nodo-danger-tx hover:bg-nodo-danger-bg rounded-full transition-colors"
                            title="Destruir"
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Plan header */}
                    <div className="pr-24">
                      <h3 className="text-xl font-black text-nodo-ink leading-tight">{plan.name}</h3>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-3xl font-black text-nodo-ink tabular-nums">Q{plan.price}</span>
                        <span className="text-sm font-bold text-nodo-dim">{plan.currency} / mes</span>
                      </div>
                    </div>

                    {/* Status badge */}
                    <div>
                      {plan.is_active ? (
                        <span className="bg-nodo-success-bg text-nodo-success-tx px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase">
                          Activo
                        </span>
                      ) : (
                        <span className="bg-nodo-inset text-nodo-dim px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase">
                          Inactivo
                        </span>
                      )}
                    </div>

                    {/* Modules */}
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-3">
                        Módulos Incluidos
                      </p>
                      {!plan.module_ids?.length ? (
                        <p className="text-sm text-nodo-dim italic">Sin módulos asignados</p>
                      ) : (
                        <ul className="space-y-2">
                          {plan.module_ids.map(mid => {
                            const mod = modules.find(m => m.id === mid);
                            return (
                              <li key={mid} className="flex items-center gap-3">
                                <div className="w-5 h-5 rounded-full bg-nodo-success-bg flex items-center justify-center shrink-0">
                                  <Check size={11} className="text-nodo-success-tx" />
                                </div>
                                <span className="text-sm font-semibold text-nodo-ink">
                                  {mod ? (
                                    <span className="flex items-center gap-1.5">
                                      {mod.icon && <span>{mod.icon}</span>}
                                      {mod.name}
                                    </span>
                                  ) : mid}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
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
                        {m.icon && <span>{m.icon}</span>}
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
