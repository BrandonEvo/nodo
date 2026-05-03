import { useState, useEffect } from "react";
import { Plus, Shield, Search, Pencil, PowerOff, X, Trash2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tenantsService, type Tenant } from "@/services/tenants.service";

export function AdminRoles() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleCode, setNewRoleCode] = useState("");
  const [saving, setSaving] = useState(false);

  // Hard Delete State
  const [hardDeletingRoleId, setHardDeletingRoleId] = useState<string | null>(null);
  const [superAdminPassword, setSuperAdminPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadTenants = async () => {
    try {
      const list = await tenantsService.list();
      setTenants(list);
      if (list.length > 0) {
        setSelectedTenant(list[0].id);
      }
    } catch {
      setTenants([]);
    }
  };

  const loadRoles = async (tId: string) => {
    if (!tId) return;
    setLoading(true);
    try {
      const list = await tenantsService.listRoles(tId);
      setRoles(list);
    } catch {
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  useEffect(() => {
    if (selectedTenant) {
      loadRoles(selectedTenant);
      closeForm();
    }
  }, [selectedTenant]);

  const openForm = (role?: any) => {
    if (role) {
      setEditingRoleId(role.id);
      setNewRoleName(role.name);
      setNewRoleCode(role.code || "CUSTOM");
    } else {
      setEditingRoleId(null);
      setNewRoleName("");
      setNewRoleCode("");
    }
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingRoleId(null);
    setNewRoleName("");
    setNewRoleCode("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim() || (!editingRoleId && !newRoleCode.trim()) || !selectedTenant) return;
    setSaving(true);
    try {
      if (editingRoleId) {
        await tenantsService.updateRole(selectedTenant, editingRoleId, {
          name: newRoleName.trim()
        });
      } else {
        await tenantsService.createRole(selectedTenant, { 
           name: newRoleName.trim(), 
           code: newRoleCode.trim().toUpperCase() 
        });
      }
      closeForm();
      await loadRoles(selectedTenant);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al guardar rol");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (roleId: string) => {
    if (!selectedTenant) return;
    if (!confirm("¿Desactivar este rol? Quedará inactivo en la empresa.")) return;
    try {
      await tenantsService.deleteRole(selectedTenant, roleId);
      await loadRoles(selectedTenant);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al desactivar rol");
    }
  };

  const handleReactivate = async (roleId: string) => {
    if (!selectedTenant) return;
    try {
      await tenantsService.updateRole(selectedTenant, roleId, { is_active: true });
      await loadRoles(selectedTenant);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al reactivar rol");
    }
  };

  const handleHardDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hardDeletingRoleId || !superAdminPassword || !selectedTenant) return;
    setDeleting(true);
    try {
      await tenantsService.hardDeleteRole(selectedTenant, hardDeletingRoleId, superAdminPassword);
      setHardDeletingRoleId(null);
      setSuperAdminPassword("");
      await loadRoles(selectedTenant);
    } catch (e: any) {
      alert(e.response?.data?.detail || e.message || "Error al destruir el rol");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-[40px] p-10 shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden relative">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8 shrink-0">
        <div>
          <h2 className="text-2xl font-black text-[#111111] tracking-tight flex items-center gap-3">
            <Shield className="text-[#69E7A8] w-8 h-8" /> Configuración de Roles
          </h2>
          <p className="text-slate-500 text-sm mt-1">Define perfiles de acceso y aplícalos a los empleados de cada empresa.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select 
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              className="h-12 w-72 pl-10 pr-5 appearance-none rounded-full bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 outline-none focus-visible:ring-[#111111]/5"
            >
              {tenants.map(t => (
                 <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <Button
            onClick={() => openForm()}
            disabled={!selectedTenant}
            className="h-12 rounded-full bg-[#111111] hover:bg-[#333333] text-white font-bold px-6 transition-all disabled:opacity-50"
          >
            <Plus size={18} className="mr-2" /> CREAR ROL
          </Button>
        </div>
      </div>

      {selectedTenant ? (
         <>
           <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
             {loading ? (
                 <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#111111]"></div>
                 </div>
             ) : roles.length === 0 ? (
               <div className="text-center py-16">
                 <Shield className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                 <p className="text-slate-500 font-medium">Esta empresa no tiene roles personalizados.</p>
               </div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
                 {roles.map((r) => (
                   <div key={r.id} className={`p-5 bg-white border border-slate-100 rounded-[24px] shadow-sm flex flex-col justify-between transition-opacity ${r.is_active === false ? 'bg-slate-50 opacity-60' : 'hover:border-slate-300'}`}>
                      <div className="flex justify-between items-start">
                         <div>
                            <h4 className={`font-bold text-lg ${r.is_active === false ? 'text-slate-500' : 'text-[#111111]'}`}>{r.name}</h4>
                            <span className="inline-block mt-2 font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                              {r.code || "CUSTOM"}
                            </span>
                         </div>
                         <div className="flex flex-col gap-1 items-end">
                           <button 
                             onClick={() => openForm(r)}
                             className="p-1.5 text-slate-400 hover:text-[#111111] hover:bg-slate-100 rounded-full transition"
                             title="Editar rol"
                           >
                              <Pencil size={18} />
                           </button>
                           {r.is_active !== false ? (
                             <button 
                               onClick={() => handleDelete(r.id)}
                               className="p-1.5 text-orange-400 hover:text-white hover:bg-orange-500 rounded-full transition"
                               title="Inactivar rol"
                             >
                                <PowerOff size={18} />
                             </button>
                           ) : (
                             <>
                               <button 
                                 onClick={() => handleReactivate(r.id)}
                                 className="p-1.5 text-green-500 hover:text-white hover:bg-green-500 rounded-full transition bg-green-50"
                                 title="Reactivar rol"
                               >
                                  <PowerOff size={18} />
                               </button>
                               <button 
                                 onClick={() => setHardDeletingRoleId(r.id)}
                                 className="p-1.5 text-red-500 hover:text-white hover:bg-red-600 rounded-full transition bg-red-50 mt-1"
                                 title="Destruir Permanente"
                               >
                                  <Trash2 size={18} />
                               </button>
                             </>
                           )}
                         </div>
                      </div>
                      {r.is_active === false && (
                        <div className="mt-4">
                          <span className="bg-slate-200 text-slate-500 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase">
                             Inactivo
                          </span>
                        </div>
                      )}
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
                       <h3 className="text-xl font-black text-[#111111]">{editingRoleId ? "Editar Rol" : "Nuevo Rol"}</h3>
                       <button onClick={closeForm} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                          <X size={20} />
                       </button>
                    </div>

                    <form onSubmit={handleSave} className="flex-1 overflow-y-auto flex flex-col gap-6 pr-2 custom-scrollbar">
                       <div>
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">Nombre del Rol</label>
                          <Input 
                            placeholder="Ej. Gerente de Ventas" 
                            value={newRoleName} 
                            onChange={(e) => setNewRoleName(e.target.value)} 
                            className="h-12 rounded-2xl bg-slate-50 border-slate-200 px-5 focus-visible:ring-[#111111]/5"
                            required
                            disabled={saving}
                          />
                       </div>
                       <div>
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">Identificador del Código</label>
                          <Input 
                            placeholder="Ej. GERENTE_VTAS" 
                            value={newRoleCode} 
                            onChange={(e) => setNewRoleCode(e.target.value)} 
                            className="h-12 rounded-2xl bg-slate-50 border-slate-200 px-5 focus-visible:ring-[#111111]/5 uppercase"
                            disabled={saving || !!editingRoleId}
                          />
                          {editingRoleId && <p className="text-[10px] text-slate-400 pl-2 mt-1">El identificador no puede modificarse tras su creación.</p>}
                       </div>

                       <div className="mt-auto pt-8">
                          <Button 
                            type="submit" 
                            disabled={saving || !newRoleName.trim() || (!editingRoleId && !newRoleCode.trim())}
                            className="w-full h-14 rounded-2xl bg-[#69E7A8] hover:bg-[#58C991] text-[#111111] font-black tracking-wide transition-all active:scale-[0.98]"
                          >
                            {editingRoleId ? "GUARDAR CAMBIOS" : "CREAR ROL"}
                          </Button>
                       </div>
                    </form>
                 </div>
              </div>
           )}

           {/* Modal Hard Delete PRO */}
           {hardDeletingRoleId && (
            <div className="absolute inset-0 bg-[#111111]/80 backdrop-blur-md z-30 flex items-center justify-center p-4">
               <form onSubmit={handleHardDelete} className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 text-center">
                 <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
                    <ShieldAlert size={32} />
                 </div>
                 <h3 className="text-2xl font-black text-[#111111] mb-2">Destrucción PRO</h3>
                 <p className="text-slate-500 text-sm mb-6">Esta acción purgará este rol de los clientes y la base de datos irreversiblemente. Confirma tu autorización.</p>
                 
                 <Input
                   type="password"
                   placeholder="Contraseña Maestra..."
                   value={superAdminPassword}
                   onChange={(e) => setSuperAdminPassword(e.target.value)}
                   className="h-14 rounded-2xl text-center font-bold tracking-widest mb-4 border-slate-200 bg-slate-50 focus-visible:ring-red-500/20 focus-visible:border-red-500"
                   autoFocus
                 />
                 
                 <div className="flex gap-2">
                   <Button type="button" variant="outline" onClick={() => setHardDeletingRoleId(null)} className="flex-1 h-12 rounded-xl text-slate-500 font-bold border-slate-200">
                     CANCELAR
                   </Button>
                   <Button type="submit" disabled={deleting || !superAdminPassword} className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold">
                     {deleting ? "PURGANDO..." : "DESTRUIR"}
                   </Button>
                 </div>
               </form>
            </div>
          )}
         </>
      ) : (
         <div className="flex-1 flex items-center justify-center">
            <p className="text-slate-400 font-medium">Selecciona una empresa para gestionar sus roles.</p>
         </div>
      )}
    </div>
  );
}
