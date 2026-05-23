import { useState, useEffect } from "react";
import { Plus, Building2, Package, Pencil, PowerOff, X, Trash2, ShieldAlert } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/Toaster";
import { tenantsService, type Tenant } from "@/services/tenants.service";
import { subscriptionsService, type SubscriptionPlan as SubscriptionPlanRead } from "@/services/subscriptions.service";

export function AdminTenants() {
  const toast = useToast();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [newTenantName, setNewTenantName] = useState("");
  const [saving, setSaving] = useState(false);

  const [hardDeletingTenantId, setHardDeletingTenantId] = useState<string | null>(null);
  const [superAdminPassword, setSuperAdminPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [plans, setPlans] = useState<SubscriptionPlanRead[]>([]);
  const [planModalTenant, setPlanModalTenant] = useState<Tenant | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tenantsList, plansList] = await Promise.all([
        tenantsService.list(),
        subscriptionsService.list().catch(() => [])
      ]);
      setTenants(tenantsList);
      setPlans(plansList);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openForm = (tenant?: Tenant) => {
    if (tenant) {
      setEditingTenantId(tenant.id);
      setNewTenantName(tenant.name);
    } else {
      setEditingTenantId(null);
      setNewTenantName("");
    }
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingTenantId(null);
    setNewTenantName("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim()) return;
    setSaving(true);
    try {
      if (editingTenantId) {
        await tenantsService.update(editingTenantId, { name: newTenantName.trim() });
        toast.success("Empresa actualizada correctamente");
      } else {
        await tenantsService.create({ name: newTenantName.trim() });
        toast.success("Empresa registrada correctamente");
      }
      closeForm();
      await loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al guardar empresa");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    toast.confirm(
      "¿Desactivar esta empresa?",
      async () => {
        try {
          await tenantsService.update(id, { is_active: false });
          toast.warning("Empresa desactivada");
          await loadData();
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Error al desactivar empresa");
        }
      },
      { description: "Sus usuarios no podrán iniciar sesión.", confirmLabel: "Desactivar" }
    );
  };

  const handleReactivate = async (id: string) => {
    try {
      await tenantsService.update(id, { is_active: true });
      toast.success("Empresa reactivada");
      await loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al reactivar empresa");
    }
  };

  const handleHardDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hardDeletingTenantId || !superAdminPassword) return;
    setDeleting(true);
    try {
      await tenantsService.hardDelete(hardDeletingTenantId, superAdminPassword);
      setHardDeletingTenantId(null);
      setSuperAdminPassword("");
      toast.success("Empresa destruida permanentemente");
      await loadData();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || e.message || "Error al destruir la empresa");
    } finally {
      setDeleting(false);
    }
  };

  const openPlanModal = (tenant: Tenant) => {
    setPlanModalTenant(tenant);
    setSelectedPlanId(tenant.plan_id || null);
  };

  const saveTenantPlan = async () => {
    if (!planModalTenant || !selectedPlanId) return;
    setSavingPlan(true);
    try {
      await tenantsService.setTenantPlan(planModalTenant.id, selectedPlanId);
      setPlanModalTenant(null);
      toast.success("Plan asignado correctamente");
      await loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al asignar plan");
    } finally {
      setSavingPlan(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl sm:rounded-[40px] p-4 sm:p-6 lg:p-10 shadow-sm border border-slate-100 flex flex-col flex-1 overflow-hidden relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8 shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#111111] tracking-tight flex items-center gap-3">
            <Building2 className="text-[#69E7A8] w-7 h-7 shrink-0" /> Control de Empresas
          </h2>
          <p className="text-slate-500 text-sm mt-1">Administra los clientes e inquilinos de tu SaaS.</p>
        </div>
        <Button
          onClick={() => openForm()}
          className="h-11 sm:h-12 rounded-full bg-[#111111] hover:bg-[#333333] text-white font-bold px-5 sm:px-6 transition-all self-start sm:self-auto shrink-0"
        >
          <Plus size={16} className="mr-2" /> Nueva Empresa
        </Button>
      </div>

      {error && <p className="text-red-500 text-sm mb-4 font-bold">{error}</p>}

      {/* List */}
      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Spinner size="lg" />
          </div>
        ) : tenants.length === 0 ? (
          <EmptyState icon={<Building2 className="w-6 h-6" />} title="No hay empresas registradas." />
        ) : (
          <div className="grid gap-3">
            {tenants.map((t) => (
              <div
                key={t.id}
                className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6 bg-slate-50 rounded-[20px] sm:rounded-[24px] transition-all border border-transparent hover:border-slate-100 group ${t.is_active === false ? 'opacity-60' : 'hover:bg-[#F8F9FA]'}`}
              >
                {/* Identity */}
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 shrink-0 shadow-sm border border-slate-100 rounded-2xl flex items-center justify-center text-xl sm:text-2xl font-black ${t.is_active === false ? 'text-slate-400 bg-slate-100' : 'text-[#111111] bg-white'}`}>
                    {t.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className={`font-bold text-base sm:text-lg leading-tight ${t.is_active === false ? 'text-slate-500' : 'text-[#111111]'}`}>
                      {t.name}
                    </h4>
                    {t.is_active === false && (
                      <span className="inline-block mt-1 font-bold text-[10px] tracking-widest px-2 py-0.5 rounded-md bg-slate-200 text-slate-500">
                        INACTIVA
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 sm:gap-4 pl-16 sm:pl-0">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 sm:h-10 rounded-xl text-xs font-bold border-slate-200 hover:bg-slate-100 hover:text-[#111111] disabled:opacity-50 px-3"
                    onClick={() => openPlanModal(t)}
                    disabled={!t.is_active}
                  >
                    <Package size={14} className="sm:mr-1.5" />
                    <span className="hidden sm:inline">Suscripción</span>
                  </Button>

                  <div className="w-px h-7 bg-slate-200 hidden sm:block" />

                  <div className="flex items-center gap-1">
                    {t.name === "Nodo Principal" ? (
                      <div className="p-1.5 text-slate-300" title="Empresa protegida del sistema">
                        <ShieldAlert size={18} />
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => openForm(t)}
                          className="p-1.5 text-slate-400 hover:text-[#111111] hover:bg-slate-200 rounded-full transition"
                          title="Editar empresa"
                        >
                          <Pencil size={16} />
                        </button>
                        {t.is_active !== false ? (
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="p-1.5 text-orange-400 hover:text-white hover:bg-orange-500 rounded-full transition"
                            title="Inactivar empresa"
                          >
                            <PowerOff size={16} />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleReactivate(t.id)}
                              className="p-1.5 text-green-500 hover:text-white hover:bg-green-500 rounded-full transition bg-green-50"
                              title="Reactivar empresa"
                            >
                              <PowerOff size={16} />
                            </button>
                            <button
                              onClick={() => setHardDeletingTenantId(t.id)}
                              className="p-1.5 text-red-500 hover:text-white hover:bg-red-600 rounded-full transition bg-red-50"
                              title="Destruir Permanente"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form drawer */}
      {isFormOpen && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex justify-end">
          <div className="w-full max-w-md h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col p-6 sm:p-8 animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-[#111111]">
                {editingTenantId ? "Editar Empresa" : "Nueva Empresa"}
              </h3>
              <button onClick={closeForm} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto flex flex-col gap-6 pr-2 custom-scrollbar">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">
                  Nombre de la Empresa
                </label>
                <Input
                  placeholder="Ej. Acme Corp"
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                  className="h-12 rounded-2xl bg-slate-50 border-slate-200 px-5 focus-visible:ring-[#111111]/5"
                  required
                  disabled={saving}
                />
              </div>
              <div className="mt-auto pt-8">
                <Button
                  type="submit"
                  disabled={saving || !newTenantName.trim()}
                  className="w-full h-14 rounded-2xl bg-[#69E7A8] hover:bg-[#58C991] text-[#111111] font-black tracking-wide transition-all active:scale-[0.98]"
                >
                  {saving
                    ? <div className="w-5 h-5 border-2 border-[#111111]/30 border-t-[#111111] rounded-full animate-spin" />
                    : editingTenantId ? "Guardar Cambios" : "Registrar Empresa"
                  }
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hard delete modal */}
      {hardDeletingTenantId && (
        <div className="absolute inset-0 bg-[#111111]/80 backdrop-blur-md z-30 flex items-center justify-center p-4">
          <form onSubmit={handleHardDelete} className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
              <ShieldAlert size={32} />
            </div>
            <h3 className="text-2xl font-black text-[#111111] mb-2">Destrucción Masiva PRO</h3>
            <p className="text-slate-500 text-sm mb-6">
              Eliminará la empresa con todos sus empleados, roles, suscripciones y membresías. Es IRREVERSIBLE.
            </p>
            <Input
              type="password"
              placeholder="Contraseña Maestra..."
              value={superAdminPassword}
              onChange={(e) => setSuperAdminPassword(e.target.value)}
              className="h-14 rounded-2xl text-center font-bold tracking-widest mb-4 border-slate-200 bg-slate-50 focus-visible:ring-red-500/20 focus-visible:border-red-500"
              autoFocus
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setHardDeletingTenantId(null)} className="flex-1 h-12 rounded-xl text-slate-500 font-bold border-slate-200">
                Cancelar
              </Button>
              <Button type="submit" disabled={deleting || !superAdminPassword} className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold">
                {deleting ? "Purgando..." : "Destruir"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Plan modal */}
      {planModalTenant && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setPlanModalTenant(null)}>
          <div className="bg-white rounded-[32px] shadow-2xl max-w-md w-full p-6 sm:p-8 animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-black text-[#111111]">Plan de Suscripción</h3>
                <p className="text-sm font-semibold text-slate-500 mt-1">{planModalTenant.name}</p>
              </div>
              <button onClick={() => setPlanModalTenant(null)} className="p-2 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3 max-h-[40vh] overflow-y-auto mb-6 pr-1 custom-scrollbar">
              {plans.length === 0 && <p className="text-sm text-slate-500">No hay planes definidos en el sistema.</p>}
              {plans.map((p) => (
                <label key={p.id} className={`flex items-start gap-4 cursor-pointer p-4 rounded-2xl border-2 transition-all ${selectedPlanId === p.id ? 'border-[#111111] bg-slate-50 shadow-sm' : 'border-transparent bg-slate-50/50 hover:bg-slate-50'}`}>
                  <input
                    type="radio"
                    name="plan_selection"
                    checked={selectedPlanId === p.id}
                    onChange={() => setSelectedPlanId(p.id)}
                    className="w-5 h-5 mt-0.5 accent-[#111111]"
                  />
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <p className="font-bold text-[#111111] text-base">{p.name}</p>
                      <p className="font-black text-[#111111]">{p.price === 0 ? "GRATIS" : `${p.currency} ${p.price}`}</p>
                    </div>
                    <p className="text-xs font-semibold text-slate-500 mt-1">{p.module_ids.length} Módulos incluidos</p>
                  </div>
                </label>
              ))}
            </div>
            <Button
              onClick={saveTenantPlan}
              disabled={savingPlan || !selectedPlanId || selectedPlanId === planModalTenant.plan_id}
              className="w-full h-14 rounded-2xl bg-[#69E7A8] hover:bg-[#58C991] text-[#111111] font-black tracking-wide transition-all active:scale-[0.98]"
            >
              {savingPlan
                ? <div className="w-5 h-5 border-2 border-[#111111]/30 border-t-[#111111] rounded-full animate-spin" />
                : selectedPlanId === planModalTenant.plan_id ? "Plan Actual" : "Asignar Plan"
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
