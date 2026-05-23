import { useState, useEffect } from "react";
import { Plus, CreditCard, Check, X, Tag, Pencil, PowerOff, Trash2, ShieldAlert } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/Toaster";
import { subscriptionsService, type SubscriptionPlan } from "@/services/subscriptions.service";
import { modulesService, type ModuleRead } from "@/services/modules.service";

export function AdminSubscriptions() {
  const toast = useToast();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [modules, setModules] = useState<ModuleRead[]>([]);
  const [loading, setLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [hardDeletingId, setHardDeletingId] = useState<string | null>(null);
  const [superAdminPassword, setSuperAdminPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [plansList, modulesList] = await Promise.all([
        subscriptionsService.list(),
        modulesService.list().catch(() => [])
      ]);
      setPlans(plansList);
      setModules(modulesList);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openForm = (plan?: SubscriptionPlan) => {
    if (plan) {
      setEditingPlanId(plan.id);
      setName(plan.name);
      setPrice(plan.price.toString());
      setSelectedModules(plan.module_ids || []);
    } else {
      setEditingPlanId(null);
      setName(""); setPrice(""); setSelectedModules([]);
    }
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
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
        toast.success("Plan actualizado correctamente");
      } else {
        await subscriptionsService.create(payload);
        toast.success("Plan creado correctamente");
      }
      closeForm();
      await loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al guardar el plan");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    toast.confirm(
      "¿Desactivar este plan?",
      async () => {
        try {
          await subscriptionsService.delete(id);
          toast.warning("Plan desactivado");
          await loadData();
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Error al desactivar el plan");
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
      toast.error(e instanceof Error ? e.message : "Error al reactivar el plan");
    }
  };

  const handleHardDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hardDeletingId || !superAdminPassword) return;
    setDeleting(true);
    try {
      await subscriptionsService.hardDelete(hardDeletingId, superAdminPassword);
      setHardDeletingId(null);
      setSuperAdminPassword("");
      toast.success("Plan destruido permanentemente");
      await loadData();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || e.message || "Error al destruir el plan");
    } finally {
      setDeleting(false);
    }
  };

  const toggleModule = (id: string) => {
    setSelectedModules(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  return (
    <div className="bg-white rounded-2xl sm:rounded-[40px] p-4 sm:p-6 lg:p-10 shadow-sm border border-slate-100 flex flex-col flex-1 overflow-hidden relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8 shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#111111] tracking-tight flex items-center gap-3">
            <CreditCard className="text-[#69E7A8] w-7 h-7 shrink-0" /> Suscripciones y Planes
          </h2>
          <p className="text-slate-500 text-sm mt-1">Configura qué módulos están incluidos en cada plan.</p>
        </div>
        <Button
          onClick={() => openForm()}
          className="h-11 sm:h-12 rounded-full bg-[#111111] hover:bg-[#333333] text-white font-bold px-5 sm:px-6 transition-all self-start sm:self-auto shrink-0"
        >
          <Plus size={16} className="mr-2" /> Crear Plan
        </Button>
      </div>

      {/* Plans grid */}
      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Spinner size="lg" />
          </div>
        ) : plans.length === 0 ? (
          <EmptyState icon={<Tag className="w-6 h-6" />} title="No hay planes creados." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {plans.map(plan => (
              <div
                key={plan.id}
                className={`border border-slate-200 rounded-[28px] sm:rounded-[32px] p-6 sm:p-8 relative flex flex-col transition-colors ${!plan.is_active ? 'bg-slate-50' : 'hover:border-[#111111]/20'}`}
              >
                {/* Action buttons */}
                <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-1">
                  <button onClick={() => openForm(plan)} className="p-2 text-slate-400 hover:text-[#111111] hover:bg-slate-100 rounded-full transition" title="Editar plan">
                    <Pencil size={16} />
                  </button>
                  {plan.is_active ? (
                    <button onClick={() => handleDelete(plan.id)} className="p-2 text-orange-400 hover:text-white hover:bg-orange-500 rounded-full transition" title="Inactivar">
                      <PowerOff size={16} />
                    </button>
                  ) : (
                    <>
                      <button onClick={() => handleReactivate(plan.id)} className="p-2 text-green-500 hover:text-white hover:bg-green-500 rounded-full transition bg-green-50" title="Reactivar">
                        <PowerOff size={16} />
                      </button>
                      <button onClick={() => setHardDeletingId(plan.id)} className="p-2 text-red-500 hover:text-white hover:bg-red-600 rounded-full transition bg-red-50" title="Destruir">
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>

                {/* Price header */}
                <div className="mb-5 pr-24">
                  <h3 className={`text-xl sm:text-2xl font-black ${!plan.is_active ? 'text-slate-400' : 'text-[#111111]'}`}>
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className={`text-2xl sm:text-3xl font-black ${!plan.is_active ? 'text-slate-300' : ''}`}>
                      Q{plan.price}
                    </span>
                    <span className="text-sm font-bold text-slate-400">{plan.currency} / mes</span>
                  </div>
                </div>

                {/* Status */}
                <div className="mb-5">
                  {plan.is_active ? (
                    <span className="bg-[#69E7A8]/20 text-[#111111] px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase">Activo</span>
                  ) : (
                    <span className="bg-slate-200 text-slate-500 px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase">Inactivo</span>
                  )}
                </div>

                {/* Modules list */}
                <div className={`flex-1 ${!plan.is_active ? 'opacity-50' : ''}`}>
                  <p className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-3">Módulos Incluidos</p>
                  {!plan.module_ids?.length ? (
                    <p className="text-sm text-slate-500 italic">No hay módulos asignados</p>
                  ) : (
                    <ul className="space-y-2">
                      {plan.module_ids.map(mid => {
                        const mod = modules.find(m => m.id === mid);
                        return (
                          <li key={mid} className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                            <Check size={15} className={plan.is_active ? "text-[#69E7A8] shrink-0" : "text-slate-300 shrink-0"} />
                            {mod ? mod.name : mid}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hard delete modal */}
      {hardDeletingId && (
        <div className="absolute inset-0 bg-[#111111]/80 backdrop-blur-md z-30 flex items-center justify-center p-4">
          <form onSubmit={handleHardDelete} className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
              <ShieldAlert size={32} />
            </div>
            <h3 className="text-2xl font-black text-[#111111] mb-2">Destrucción PRO</h3>
            <p className="text-slate-500 text-sm mb-6">Borrará el plan de la base de datos de manera irreversible. Requiere autorización maestra.</p>
            <Input type="password" placeholder="Contraseña Maestra..." value={superAdminPassword} onChange={(e) => setSuperAdminPassword(e.target.value)} className="h-14 rounded-2xl text-center font-bold tracking-widest mb-4 border-slate-200 bg-slate-50 focus-visible:ring-red-500/20 focus-visible:border-red-500" autoFocus />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setHardDeletingId(null)} className="flex-1 h-12 rounded-xl text-slate-500 font-bold border-slate-200">Cancelar</Button>
              <Button type="submit" disabled={deleting || !superAdminPassword} className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold">
                {deleting ? "Purgando..." : "Destruir"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Form drawer */}
      {isFormOpen && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex justify-end">
          <div className="w-full max-w-md h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col p-6 sm:p-8 animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-[#111111]">{editingPlanId ? "Editar Plan" : "Nuevo Plan"}</h3>
              <button onClick={closeForm} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto flex flex-col gap-6 pr-2 custom-scrollbar">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">Nombre del Plan</label>
                <Input placeholder="Ej. Plan Pro" value={name} onChange={e => setName(e.target.value)} className="h-12 rounded-2xl bg-slate-50 border-slate-200 px-5 focus-visible:ring-[#111111]/5" required />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">Precio Mensual</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">Q</span>
                  <Input type="number" min="0" placeholder="0.00" value={price} onChange={e => setPrice(e.target.value)} className="h-12 rounded-2xl bg-slate-50 border-slate-200 pl-8 pr-5 focus-visible:ring-[#111111]/5" required />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">Módulos que incluye</label>
                <div className="bg-slate-50 p-4 rounded-[24px] border border-slate-100 space-y-2">
                  {modules.length === 0 ? (
                    <p className="text-xs text-slate-500 px-2 py-4 text-center">No hay módulos disponibles.</p>
                  ) : (
                    modules.map(m => (
                      <label key={m.id} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white rounded-xl transition-colors">
                        <input type="checkbox" checked={selectedModules.includes(m.id)} onChange={() => toggleModule(m.id)} className="w-5 h-5 accent-[#111111] rounded" />
                        <p className="font-bold text-sm text-[#111111]">{m.name}</p>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div className="mt-auto pt-8">
                <Button type="submit" disabled={saving || !name.trim() || !price} className="w-full h-14 rounded-2xl bg-[#69E7A8] hover:bg-[#58C991] text-[#111111] font-black tracking-wide transition-all active:scale-[0.98]">
                  {saving
                    ? <div className="w-5 h-5 border-2 border-[#111111]/30 border-t-[#111111] rounded-full animate-spin" />
                    : editingPlanId ? "Guardar Cambios" : "Crear Plan"
                  }
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
