import { useState, useEffect } from "react";
import { Plus, Building2, Package, Pencil, PowerOff, X, Trash2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tenantsService, type Tenant } from "@/services/tenants.service";
import { modulesService, type ModuleRead } from "@/services/modules.service";

export function AdminTenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State (Drawer)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  
  const [newTenantName, setNewTenantName] = useState("");
  const [saving, setSaving] = useState(false);

  // Hard Delete State
  const [hardDeletingTenantId, setHardDeletingTenantId] = useState<string | null>(null);
  const [superAdminPassword, setSuperAdminPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Módulos
  const [modules, setModules] = useState<ModuleRead[]>([]);
  const [modulesModalTenant, setModulesModalTenant] = useState<Tenant | null>(null);
  const [tenantAssignedIds, setTenantAssignedIds] = useState<string[]>([]);
  const [savingModules, setSavingModules] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tenantsList, modulesList] = await Promise.all([
        tenantsService.list(),
        modulesService.list().catch(() => [])
      ]);
      setTenants(tenantsList);
      setModules(modulesList);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
      } else {
        await tenantsService.create({ name: newTenantName.trim() });
      }
      closeForm();
      await loadData();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al guardar empresa");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Desactivar empresa? Sus usuarios no podrán iniciar sesión.")) return;
    try {
      await tenantsService.update(id, { is_active: false });
      await loadData();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al desactivar empresa");
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      await tenantsService.update(id, { is_active: true });
      await loadData();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al reactivar empresa");
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
      await loadData();
    } catch (e: any) {
      alert(e.response?.data?.detail || e.message || "Error al destruir la empresa");
    } finally {
      setDeleting(false);
    }
  };

  const openModulesModal = async (tenant: Tenant) => {
    setModulesModalTenant(tenant);
    try {
      const assigned = await modulesService.listByTenant(tenant.id);
      setTenantAssignedIds(assigned.map((m) => m.id));
    } catch {
      setTenantAssignedIds([]);
    }
  };

  const toggleModuleForTenant = (id: string) => {
    setTenantAssignedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const saveTenantModules = async () => {
    if (!modulesModalTenant) return;
    setSavingModules(true);
    try {
      await modulesService.setForTenant(modulesModalTenant.id, tenantAssignedIds);
      setModulesModalTenant(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al guardar módulos");
    } finally {
      setSavingModules(false);
    }
  };

  return (
    <div className="bg-white rounded-[40px] p-10 shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden relative">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8 shrink-0">
        <div>
          <h2 className="text-2xl font-black text-[#111111] tracking-tight flex items-center gap-3">
            <Building2 className="text-[#69E7A8] w-8 h-8" /> Control de Empresas
          </h2>
          <p className="text-slate-500 text-sm mt-1">Administra los clientes e inquilinos de tu SaaS.</p>
        </div>
        <Button
          onClick={() => openForm()}
          className="h-12 rounded-full bg-[#111111] hover:bg-[#333333] text-white font-bold px-6 transition-all"
        >
          <Plus size={18} className="mr-2" /> NUEVA EMPRESA
        </Button>
      </div>

      {error && <p className="text-red-500 text-sm mb-4 font-bold">{error}</p>}

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-40">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#111111]"></div>
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-20 bg-slate-50 rounded-[30px] border border-dashed border-slate-200">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No hay empresas registradas.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {tenants.map((t) => (
              <div key={t.id} className={`flex items-center justify-between p-6 bg-slate-50 rounded-[24px] transition-all border border-transparent hover:border-slate-100 group ${t.is_active === false ? 'opacity-60' : 'hover:bg-[#F8F9FA]'}`}>
                <div className="flex items-center gap-5">
                  <div className={`w-14 h-14 shadow-sm border border-slate-100 rounded-2xl flex items-center justify-center text-2xl font-black ${t.is_active === false ? 'text-slate-400 bg-slate-100' : 'text-[#111111] bg-white'}`}>
                    {t.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className={`font-bold text-lg leading-tight ${t.is_active === false ? 'text-slate-500' : 'text-[#111111]'}`}>{t.name}</h4>
                    {t.is_active === false && (
                      <span className="inline-block mt-1 font-bold text-[10px] tracking-widest px-2 py-0.5 rounded-md bg-slate-200 text-slate-500">
                        INACTIVA
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 opacity-80 group-hover:opacity-100 transition-opacity">
                   <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl h-10 text-xs font-bold border-slate-200 hover:bg-slate-100 hover:text-[#111111] disabled:opacity-50"
                      onClick={() => openModulesModal(t)}
                      disabled={!t.is_active}
                    >
                      <Package size={14} className="mr-2" />
                      MÓDULOS
                    </Button>
                   <div className="w-px h-8 bg-slate-200 mx-2 hidden md:block"></div>
                   
                   <div className="flex items-center gap-1">
                      <button 
                         onClick={() => openForm(t)}
                         className="p-1.5 text-slate-400 hover:text-[#111111] hover:bg-slate-200 rounded-full transition"
                         title="Editar empresa"
                      >
                         <Pencil size={18} />
                      </button>
                      
                      {t.is_active !== false ? (
                      <button 
                        onClick={() => handleDelete(t.id)}
                        className="p-1.5 text-orange-400 hover:text-white hover:bg-orange-500 rounded-full transition"
                        title="Inactivar empresa"
                      >
                         <PowerOff size={18} />
                      </button>
                    ) : (
                      <>
                        <button 
                          onClick={() => handleReactivate(t.id)}
                          className="p-1.5 text-green-500 hover:text-white hover:bg-green-500 rounded-full transition bg-green-50"
                          title="Reactivar empresa"
                        >
                           <PowerOff size={18} />
                        </button>
                        <button 
                          onClick={() => setHardDeletingTenantId(t.id)}
                          className="p-1.5 text-red-500 hover:text-white hover:bg-red-600 rounded-full transition bg-red-50"
                          title="Destruir Permanente"
                        >
                           <Trash2 size={18} />
                        </button>
                      </>
                    )}
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Formulario lateral / Modal superpuesto */}
      {isFormOpen && (
         <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex justify-end">
            <div className="w-full max-w-md h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col p-8 animate-in slide-in-from-right duration-300">
               <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-black text-[#111111]">{editingTenantId ? "Editar Empresa" : "Nueva Empresa"}</h3>
                  <button onClick={closeForm} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                     <X size={20} />
                  </button>
               </div>

               <form onSubmit={handleSave} className="flex-1 overflow-y-auto flex flex-col gap-6 pr-2 custom-scrollbar">
                  <div>
                     <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">Nombre de la Empresa</label>
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
                       {editingTenantId ? "GUARDAR CAMBIOS" : "REGISTRAR EMPRESA"}
                     </Button>
                  </div>
               </form>
            </div>
         </div>
      )}

      {/* Modal Hard Delete PRO */}
      {hardDeletingTenantId && (
        <div className="absolute inset-0 bg-[#111111]/80 backdrop-blur-md z-30 flex items-center justify-center p-4">
           <form onSubmit={handleHardDelete} className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 text-center">
             <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
                <ShieldAlert size={32} />
             </div>
             <h3 className="text-2xl font-black text-[#111111] mb-2">Destrucción Masiva PRO</h3>
             <p className="text-slate-500 text-sm mb-6">Esta operación destruirá a la EMPRESA y a todos sus empleados, roles, suscripciones y membresías. Es IRREVERSIBLE.</p>
             
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
                 CANCELAR
               </Button>
               <Button type="submit" disabled={deleting || !superAdminPassword} className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold">
                 {deleting ? "PURGANDO..." : "DESTRUIR ALL"}
               </Button>
             </div>
           </form>
        </div>
      )}

      {/* Modal Módulos (se mantiene igual, modificado el z-index para estar por encima de la tabla pero detrás del drawer si estuviera abierto) */}
      {modulesModalTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModulesModalTenant(null)}>
          <div className="bg-white rounded-[32px] shadow-2xl max-w-md w-full p-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <div>
                 <h3 className="text-xl font-black text-[#111111]">Módulos Habilitados</h3>
                 <p className="text-sm font-semibold text-slate-500 mt-1">{modulesModalTenant.name}</p>
              </div>
              <button onClick={() => setModulesModalTenant(null)} className="p-2 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto mb-8 pr-2 custom-scrollbar">
              {modules.length === 0 && <p className="text-sm text-slate-500">No hay módulos definidos en el sistema.</p>}
              {modules.map((m) => (
                <label key={m.id} className="flex items-center gap-4 cursor-pointer p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-transparent transition-colors">
                  <input
                    type="checkbox"
                    checked={tenantAssignedIds.includes(m.id)}
                    onChange={() => toggleModuleForTenant(m.id)}
                    className="w-5 h-5 accent-[#111111] rounded"
                  />
                  <div>
                    <p className="font-bold text-[#111111]">{m.name}</p>
                    <p className="text-xs font-mono font-semibold text-slate-400 mt-0.5">{m.code}</p>
                  </div>
                </label>
              ))}
            </div>
            <Button
              onClick={saveTenantModules}
              disabled={savingModules}
              className="w-full h-14 rounded-2xl bg-[#69E7A8] hover:bg-[#58C991] text-[#111111] font-black tracking-wide transition-all active:scale-[0.98]"
            >
              GUARDAR CAMBIOS
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
