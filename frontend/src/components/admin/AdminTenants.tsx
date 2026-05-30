import { useState, useEffect } from "react";
import { Plus, Building2, Package, Pencil, PowerOff, Trash2, ShieldAlert, Loader2, Check, CreditCard, LayoutGrid } from "lucide-react";
import { resolveModuleIcon } from "@/lib/module-icons";
import { useToast } from "@/components/ui/Toaster";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { tenantsService, type Tenant } from "@/services/tenants.service";
import { subscriptionsService, type SubscriptionPlan } from "@/services/subscriptions.service";
import { modulesService, type ModuleRead } from "@/services/modules.service";

export function AdminTenants() {
  const toast = useToast();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [masterPassword, setMasterPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [planTenant, setPlanTenant] = useState<Tenant | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);

  const [modulesTenant, setModulesTenant] = useState<Tenant | null>(null);
  const [allModules, setAllModules] = useState<ModuleRead[]>([]);
  const [activeModuleIds, setActiveModuleIds] = useState<Set<string>>(new Set());
  const [loadingModules, setLoadingModules] = useState(false);
  const [savingModules, setSavingModules] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tenantsList, plansList] = await Promise.all([
        tenantsService.list(),
        subscriptionsService.list().catch(() => []),
      ]);
      setTenants(tenantsList);
      setPlans(plansList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openCreate = () => {
    setEditingTenant(null);
    setTenantName("");
    setFormOpen(true);
  };

  const openEdit = (t: Tenant) => {
    setEditingTenant(t);
    setTenantName(t.name);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingTenant(null);
    setTenantName("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantName.trim()) return;
    setSaving(true);
    try {
      if (editingTenant) {
        await tenantsService.update(editingTenant.id, { name: tenantName.trim() });
        toast.success("Empresa actualizada");
      } else {
        await tenantsService.create({ name: tenantName.trim() });
        toast.success("Empresa registrada");
      }
      closeForm();
      await loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = (t: Tenant) => {
    toast.confirm(
      "¿Desactivar esta empresa?",
      async () => {
        try {
          await tenantsService.update(t.id, { is_active: false });
          toast.warning("Empresa desactivada");
          await loadData();
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Error al desactivar");
        }
      },
      { description: "Sus usuarios no podrán iniciar sesión.", confirmLabel: "Desactivar" }
    );
  };

  const handleReactivate = async (t: Tenant) => {
    try {
      await tenantsService.update(t.id, { is_active: true });
      toast.success("Empresa reactivada");
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
      await tenantsService.hardDelete(deleteTarget.id, masterPassword);
      setDeleteTarget(null);
      setMasterPassword("");
      toast.success("Empresa destruida permanentemente");
      await loadData();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || e.message || "Error al destruir");
    } finally {
      setDeleting(false);
    }
  };

  const openPlanSheet = (t: Tenant) => {
    setPlanTenant(t);
    setSelectedPlanId(t.plan_id || null);
  };

  const savePlan = async () => {
    if (!planTenant || !selectedPlanId) return;
    setSavingPlan(true);
    try {
      await tenantsService.setTenantPlan(planTenant.id, selectedPlanId);
      setPlanTenant(null);
      toast.success("Plan asignado");
      await loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al asignar plan");
    } finally {
      setSavingPlan(false);
    }
  };

  const openModules = async (t: Tenant) => {
    setModulesTenant(t);
    setLoadingModules(true);
    try {
      const [mods, active] = await Promise.all([
        modulesService.list(),
        tenantsService.getTenantSubscriptions(t.id),
      ]);
      setAllModules(mods.filter(m => m.is_active));
      setActiveModuleIds(new Set(active));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al cargar módulos");
    } finally {
      setLoadingModules(false);
    }
  };

  const toggleModule = (id: string) => {
    setActiveModuleIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const saveModules = async () => {
    if (!modulesTenant) return;
    setSavingModules(true);
    try {
      await tenantsService.setTenantSubscriptions(modulesTenant.id, Array.from(activeModuleIds));
      setModulesTenant(null);
      toast.success("Módulos actualizados");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al guardar módulos");
    } finally {
      setSavingModules(false);
    }
  };

  const isProtected = (t: Tenant) => !!t.is_system;

  return (
    <>
      <div className="flex flex-col flex-1 overflow-hidden gap-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-[28px] font-black text-nodo-ink leading-tight">Empresas</h1>
            <p className="text-nodo-sub text-sm font-medium mt-0.5">Clientes e inquilinos del ecosistema.</p>
          </div>
          <button
            onClick={openCreate}
            className="h-11 px-5 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-sm flex items-center gap-2 active:scale-[0.97] transition-transform shadow-lg shrink-0"
          >
            <Plus size={16} />
            Nueva
          </button>
        </div>

        {/* KPI row */}
        {!loading && (
          <div className="grid grid-cols-3 gap-3 shrink-0">
            {[
              { label: 'Total',     value: tenants.length,                                     accent: '#69E7A8', pastel: '#69E7A81a', icon: Building2  },
              { label: 'Activas',   value: tenants.filter(t => t.is_active !== false).length,  accent: '#a78bfa', pastel: '#a78bfa1a', icon: Package    },
              { label: 'Inactivas', value: tenants.filter(t => t.is_active === false).length,  accent: '#94a3b8', pastel: '#94a3b81a', icon: PowerOff   },
            ].map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className="flex flex-col gap-3 p-4 rounded-[20px]" style={{ backgroundColor: c.pastel }}>
                  <div className="w-9 h-9 rounded-[11px] flex items-center justify-center" style={{ background: `${c.accent}22` }}>
                    <Icon size={16} style={{ color: c.accent }} strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-nodo-ink tabular-nums leading-none">{c.value}</p>
                    <p className="text-[10px] font-semibold text-nodo-sub mt-1 leading-tight">{c.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
            </div>
          ) : tenants.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-4">
              <Building2 size={32} className="text-nodo-dim mb-2" />
              <p className="text-sm font-bold text-nodo-dim">No hay empresas registradas.</p>
            </div>
          ) : (
            <div className="bg-nodo-card rounded-3xl border border-nodo-line overflow-hidden shadow-sm divide-y divide-nodo-line">
              {tenants.map((t) => {
                const inactive = t.is_active === false;
                const protected_ = isProtected(t);
                const currentPlan = plans.find(p => p.id === t.plan_id);

                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-nodo-inset ${inactive ? "opacity-50" : ""}`}
                  >
                    {/* Avatar */}
                    <div className={`w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center text-lg font-black border border-nodo-line ${inactive ? "bg-nodo-inset text-nodo-dim" : "bg-nodo-inset text-nodo-ink"}`}>
                      {t.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-bold leading-tight truncate ${inactive ? "text-nodo-sub" : "text-nodo-ink"}`}>
                          {t.name}
                        </p>
                        {protected_ && (
                          <span className="text-[10px] font-black uppercase tracking-widest text-[#69E7A8] bg-[#69E7A8]/10 px-2 py-0.5 rounded-full">
                            Sistema
                          </span>
                        )}
                        {inactive && (
                          <span className="text-[10px] font-black uppercase tracking-widest text-nodo-dim bg-nodo-inset px-2 py-0.5 rounded-full">
                            Inactiva
                          </span>
                        )}
                      </div>
                      {currentPlan ? (
                        <p className="text-xs text-nodo-sub mt-0.5 flex items-center gap-1">
                          <CreditCard size={10} />
                          {currentPlan.name} · {currentPlan.price === 0 ? "Gratis" : `${currentPlan.currency} ${currentPlan.price}`}
                        </p>
                      ) : (
                        <p className="text-xs text-nodo-dim mt-0.5">Sin plan asignado</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openModules(t)}
                        className="p-2 text-nodo-dim hover:text-nodo-ink hover:bg-nodo-raised rounded-full transition-colors"
                        title="Gestionar módulos"
                      >
                        <LayoutGrid size={15} />
                      </button>
                      <button
                        onClick={() => openPlanSheet(t)}
                        disabled={inactive}
                        className="p-2 text-nodo-dim hover:text-nodo-ink hover:bg-nodo-raised rounded-full transition-colors disabled:opacity-30"
                        title="Asignar plan"
                      >
                        <Package size={15} />
                      </button>

                      {!protected_ && (
                        <>
                          <button
                            onClick={() => openEdit(t)}
                            className="p-2 text-nodo-dim hover:text-nodo-ink hover:bg-nodo-raised rounded-full transition-colors"
                            title="Editar"
                          >
                            <Pencil size={15} />
                          </button>

                          {!inactive ? (
                            <button
                              onClick={() => handleDeactivate(t)}
                              className="p-2 text-nodo-warn-tx hover:bg-nodo-warn-bg rounded-full transition-colors"
                              title="Desactivar"
                            >
                              <PowerOff size={15} />
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleReactivate(t)}
                                className="p-2 text-nodo-success-tx hover:bg-nodo-success-bg rounded-full transition-colors"
                                title="Reactivar"
                              >
                                <PowerOff size={15} />
                              </button>
                              <button
                                onClick={() => { setDeleteTarget(t); setMasterPassword(""); }}
                                className="p-2 text-nodo-danger-tx hover:bg-nodo-danger-bg rounded-full transition-colors"
                                title="Destruir"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </>
                      )}

                      {protected_ && (
                        <div className="p-2 text-nodo-dim" title="Empresa protegida del sistema">
                          <ShieldAlert size={15} />
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
        title={editingTenant ? "Editar Empresa" : "Nueva Empresa"}
        footer={
          <button
            form="tenant-form"
            type="submit"
            disabled={saving || !tenantName.trim()}
            className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {editingTenant ? "GUARDAR CAMBIOS" : "REGISTRAR EMPRESA"}
          </button>
        }
      >
        <form id="tenant-form" onSubmit={handleSave} className="flex flex-col gap-5">
          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
              Nombre de la Empresa
            </label>
            <input
              type="text"
              placeholder="Ej. Panadería La Luna"
              value={tenantName}
              onChange={e => setTenantName(e.target.value)}
              required
              disabled={saving}
              className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim disabled:opacity-50"
            />
          </div>
        </form>
      </BottomSheet>

      {/* Plan BottomSheet */}
      <BottomSheet
        open={!!planTenant}
        onClose={() => setPlanTenant(null)}
        title="Plan de Suscripción"
        footer={
          <button
            onClick={savePlan}
            disabled={savingPlan || !selectedPlanId || selectedPlanId === planTenant?.plan_id}
            className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {savingPlan ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {selectedPlanId === planTenant?.plan_id ? "PLAN ACTUAL" : "ASIGNAR PLAN"}
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          {planTenant && (
            <p className="text-xs font-bold text-nodo-dim uppercase tracking-wider">{planTenant.name}</p>
          )}

          {plans.length === 0 ? (
            <p className="text-sm text-nodo-dim text-center py-6">No hay planes disponibles.</p>
          ) : (
            <div className="bg-nodo-inset rounded-2xl border border-nodo-line overflow-hidden">
              {plans.filter(p => p.is_active).map((p, i, arr) => {
                const selected = selectedPlanId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlanId(p.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-nodo-raised ${i < arr.length - 1 ? "border-b border-nodo-line" : ""} ${selected ? "bg-nodo-raised" : ""}`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${selected ? "bg-nodo-ink border-nodo-ink" : "border-nodo-line-s"}`}>
                      {selected && <Check size={11} className="text-nodo-canvas" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-nodo-ink">{p.name}</p>
                      <p className="text-xs text-nodo-sub mt-0.5">{p.module_ids.length} módulos</p>
                    </div>
                    <span className="text-sm font-black text-nodo-ink tabular-nums shrink-0">
                      {p.price === 0 ? "Gratis" : `${p.currency} ${p.price}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Modules BottomSheet */}
      <BottomSheet
        open={!!modulesTenant}
        onClose={() => setModulesTenant(null)}
        title="Módulos Activos"
        footer={
          <button
            onClick={saveModules}
            disabled={savingModules || loadingModules}
            className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {savingModules ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            GUARDAR MÓDULOS
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          {modulesTenant && (
            <p className="text-xs font-bold text-nodo-dim uppercase tracking-wider">{modulesTenant.name}</p>
          )}

          {loadingModules ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-7 h-7 animate-spin text-nodo-sub" />
            </div>
          ) : allModules.length === 0 ? (
            <p className="text-sm text-nodo-dim text-center py-6">No hay módulos disponibles.</p>
          ) : (
            <div className="bg-nodo-inset rounded-2xl border border-nodo-line overflow-hidden">
              {allModules.map((mod, i) => {
                const active = activeModuleIds.has(mod.id);
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => toggleModule(mod.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-nodo-raised ${i < allModules.length - 1 ? "border-b border-nodo-line" : ""} ${active ? "bg-nodo-raised" : ""}`}
                  >
                    {(() => {
                      const ModIcon = resolveModuleIcon(mod.icon);
                      return (
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${active ? "bg-nodo-ink" : "bg-nodo-raised"}`}>
                          <ModIcon size={16} className={active ? "text-nodo-canvas" : "text-nodo-sub"} strokeWidth={1.8} />
                        </div>
                      );
                    })()}
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-bold text-nodo-ink">{mod.name}</p>
                      <p className="text-[10px] text-nodo-dim uppercase tracking-wider font-mono">{mod.code}</p>
                    </div>
                    <div className={`relative w-[44px] h-[26px] rounded-full transition-colors duration-200 shrink-0 ${active ? "bg-[#30D158]" : "bg-nodo-line"}`}>
                      <span className={`absolute top-[2px] left-[2px] w-[22px] h-[22px] bg-nodo-canvas rounded-full shadow-sm transition-transform duration-200 ${active ? "translate-x-[18px]" : "translate-x-0"}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
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
              form="hard-delete-tenant-form"
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
        <form id="hard-delete-tenant-form" onSubmit={handleHardDelete} className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <div className="w-14 h-14 bg-nodo-danger-bg rounded-2xl flex items-center justify-center">
              <ShieldAlert size={28} className="text-nodo-danger-tx" />
            </div>
            <div>
              <p className="font-black text-nodo-ink text-base">{deleteTarget?.name}</p>
              <p className="text-sm text-nodo-sub mt-1">
                Eliminará la empresa con todos sus empleados, roles, suscripciones y membresías.{" "}
                <span className="font-black text-nodo-danger-tx">Irreversible.</span>
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
