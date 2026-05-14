import { useState, useEffect } from "react";
import { Plus, Users, Search, Edit2, Trash2, PowerOff, Shield, User as UserIcon, CheckCircle2, XCircle, X, Save, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tenantsService, type Tenant, type TenantUser } from "@/services/tenants.service";
import { modulesService, type ModuleRead } from "@/services/modules.service";

export function AdminUsers() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("all");
  
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Formulario
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<TenantUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Módulos
  const [tenantModules, setTenantModules] = useState<ModuleRead[]>([]);
  const [userModules, setUserModules] = useState<Set<string>>(new Set());

  // Hard Delete State
  const [hardDeletingUserId, setHardDeletingUserId] = useState<string | null>(null);
  const [hardDeletingUserTenantId, setHardDeletingUserTenantId] = useState<string | null>(null);
  const [superAdminPassword, setSuperAdminPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadTenants = async () => {
    try {
      const list = await tenantsService.list();
      setTenants(list);
    } catch {
      setTenants([]);
    }
  };

  const loadUsersForTenant = async (tId: string) => {
    try {
      let list: TenantUser[] = [];
      if (tId === "all") {
        const promises = tenants.map(t => tenantsService.listUsers(t.id).catch(() => []));
        const results = await Promise.all(promises);
        list = results.flat();
      } else {
        list = await tenantsService.listUsers(tId);
      }
      setUsers(list);
    } catch {
      setUsers([]);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  useEffect(() => {
    if (tenants.length > 0 || selectedTenant === "all") {
       setLoading(true);
       loadUsersForTenant(selectedTenant).finally(() => setLoading(false));
    }
  }, [selectedTenant, tenants]);

  // Cargar roles y módulos cuando se selecciona una empresa en el formulario
  useEffect(() => {
    if (!tenantId) {
      setRoleId("");
      setTenantModules([]);
      setUserModules(new Set());
    } else {
      modulesService.listByTenant(tenantId).then(setTenantModules).catch(() => setTenantModules([]));

      if (selectedUser && selectedUser.member_type === 'employee') {
        tenantsService.getUserModules(tenantId, selectedUser.id)
          .then(mods => setUserModules(new Set(mods)))
          .catch(() => setUserModules(new Set()));
      } else {
        setUserModules(new Set());
      }
    }
  }, [tenantId, selectedUser]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !tenantId) return;
    if (!selectedUser && !password) return;
    
    setSaving(true);
    try {
      const payload: any = {
        email: email.trim(),
        is_superuser: isSuperuser,
        is_active: isActive,
        member_type: roleId, // roleId was renamed to member_type in state logic
      };
      if (password) payload.password = password;

      let finalUserId = "";
      if (selectedUser) {
        await tenantsService.updateUser(selectedUser.id, payload);
        finalUserId = selectedUser.id;
      } else {
        const newUser = await tenantsService.createUser(tenantId, payload);
        finalUserId = newUser.id;
      }
      
      if (roleId === 'employee') {
        await tenantsService.updateUserModules(tenantId, finalUserId, Array.from(userModules));
      }
      
      closeForm();
      await loadUsersForTenant(selectedTenant);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al guardar usuario");
    } finally {
      setSaving(false);
    }
  };

  const openFormForEdit = (u: TenantUser) => {
    setSelectedUser(u);
    setEmail(u.email);
    setPassword("");
    setTenantId(u.tenant_id);
    setRoleId(u.member_type || "employee");
    setIsSuperuser(u.is_superuser);
    setIsActive(u.is_active);
    setIsFormOpen(true);
  };

  const handleDelete = async (uId: string) => {
    if (!confirm("¿Desactivar/Eliminar este usuario? Perderá acceso sin ser destruido.")) return;
    try {
      await tenantsService.deleteUser(uId);
      await loadUsersForTenant(selectedTenant);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al desactivar");
    }
  }

  const handleReactivate = async (uId: string) => {
    try {
      await tenantsService.updateUser(uId, { is_active: true });
      await loadUsersForTenant(selectedTenant);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al reactivar usuario");
    }
  };

  const handleHardDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hardDeletingUserId || !hardDeletingUserTenantId || !superAdminPassword) return;
    setDeleting(true);
    try {
      await tenantsService.hardDeleteUser(hardDeletingUserTenantId, hardDeletingUserId, superAdminPassword);
      setHardDeletingUserId(null);
      setHardDeletingUserTenantId(null);
      setSuperAdminPassword("");
      await loadUsersForTenant(selectedTenant);
    } catch (e: any) {
      alert(e.response?.data?.detail || e.message || "Error al destruir el usuario");
    } finally {
      setDeleting(false);
    }
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setSelectedUser(null);
    setEmail("");
    setPassword("");
    setTenantId(selectedTenant !== "all" ? selectedTenant : "");
    setRoleId("");
    setUserModules(new Set());
    setIsSuperuser(false);
    setIsActive(true);
  };

  const getTenantName = (tId: string) => {
     return tenants.find(t => t.id === tId)?.name || "Desconocida";
  }

  return (
    <div className="bg-white rounded-[40px] p-10 shadow-sm border border-slate-100 flex flex-col flex-1 overflow-hidden relative">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8 shrink-0">
        <div>
          <h2 className="text-2xl font-black text-[#111111] tracking-tight flex items-center gap-3">
            <Users className="text-[#69E7A8] w-8 h-8" /> Usuarios y Empleados
          </h2>
          <p className="text-slate-500 text-sm mt-1">Directorio global de todas las cuentas con acceso al sistema.</p>
        </div>
        
        <div className="flex items-center gap-4">
           {/* Selector de Tenant */}
           <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select 
                value={selectedTenant}
                onChange={(e) => setSelectedTenant(e.target.value)}
                className="h-12 w-64 pl-10 pr-5 appearance-none rounded-full bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 outline-none focus-visible:ring-[#111111]/5"
              >
                 <option value="all">Todas las empresas</option>
                 {tenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                 ))}
              </select>
           </div>

           <Button
             onClick={() => {
                closeForm();
                setIsFormOpen(true);
             }}
             className="h-12 rounded-full bg-[#111111] hover:bg-[#333333] text-white font-bold px-6 transition-all"
           >
             <Plus size={18} className="mr-2" /> AÑADIR USUARIO
           </Button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto custom-scrollbar">
        {loading ? (
           <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#111111]"></div>
           </div>
        ) : users.length === 0 ? (
           <div className="text-center py-20 bg-slate-50 rounded-[30px] border border-dashed border-slate-200 mx-1">
              <UserIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No hay usuarios registrados.</p>
           </div>
        ) : (
           <table className="w-full text-left border-collapse min-w-[750px]">
             <thead>
               <tr className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                 <th className="pb-4 pl-4 font-bold">Usuario</th>
                 <th className="pb-4 font-bold">Empresa (Tenant)</th>
                 <th className="pb-4 font-bold">Privilegios</th>
                 <th className="pb-4 font-bold">Estado</th>
                 <th className="pb-4 text-right pr-4 font-bold">Acciones</th>
               </tr>
             </thead>
             <tbody>
               {users.map((u) => (
                 <tr key={u.id} className={`border-b border-slate-50 transition-colors group ${u.is_active === false ? 'bg-slate-50/50 opacity-60' : 'hover:bg-slate-50/80'}`}>
                   <td className="py-4 pl-4 flex items-center gap-4">
                     <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black ${u.is_active === false ? 'bg-slate-200 text-slate-500' : 'bg-slate-100 text-[#111111]'}`}>
                       {u.email.charAt(0).toUpperCase()}
                     </div>
                     <span className={`font-bold ${u.is_active === false ? 'text-slate-500' : 'text-[#111111]'}`}>{u.email}</span>
                   </td>
                   <td className="py-4 text-sm font-semibold text-slate-600">
                     {getTenantName(u.tenant_id)}
                   </td>
                   <td className="py-4">
                     {u.is_superuser ? (
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${u.is_active === false ? 'bg-slate-300 text-slate-500' : 'bg-[#111111] text-white'}`}>
                          <Shield size={12} className={u.is_active === false ? "text-slate-400" : "text-[#69E7A8]"} /> SISTEMA SÚPER ADMIN
                        </span>
                     ) : u.member_type === 'owner' ? (
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${u.is_active === false ? 'bg-amber-100/50 text-amber-600/50' : 'bg-amber-100 text-amber-700'}`}>
                          PROPIETARIO
                        </span>
                     ) : (
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${u.is_active === false ? 'bg-slate-200 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                          EMPLEADO
                        </span>
                     )}
                   </td>
                   <td className="py-4">
                     {u.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-[#69E7A8] text-xs font-black tracking-widest uppercase">
                          <CheckCircle2 size={16} /> ACTIVO
                        </span>
                     ) : (
                        <span className="inline-flex items-center gap-1.5 text-slate-400 text-xs font-black tracking-widest uppercase">
                          <XCircle size={16} /> INACTIVO
                        </span>
                     )}
                   </td>
                   <td className="py-4 text-right pr-4">
                      {u.is_superuser ? (
                        <div className="flex justify-end pr-2 text-slate-300" title="Cuenta protegida del sistema">
                           <Shield size={18} />
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                           <button onClick={() => openFormForEdit(u)} className="p-1.5 text-slate-400 hover:text-[#111111] hover:bg-slate-200 rounded-full transition" title="Editar">
                              <Edit2 size={18} />
                           </button>
                           {u.is_active ? (
                             <button onClick={() => handleDelete(u.id)} className="p-1.5 text-orange-400 hover:text-white hover:bg-orange-500 rounded-full transition" title="Desactivar">
                                <PowerOff size={18} />
                             </button>
                           ) : (
                             <>
                               <button onClick={() => handleReactivate(u.id)} className="p-1.5 text-green-500 hover:text-white hover:bg-green-500 rounded-full transition bg-green-50" title="Reactivar">
                                  <PowerOff size={18} />
                               </button>
                               <button onClick={() => {
                                  setHardDeletingUserId(u.id);
                                  setHardDeletingUserTenantId(u.tenant_id);
                               }} className="p-1.5 text-red-500 hover:text-white hover:bg-red-600 rounded-full transition bg-red-50" title="Destruir Permanente">
                                  <Trash2 size={18} />
                               </button>
                             </>
                           )}
                        </div>
                      )}
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
        )}
      </div>

      {/* Formulario lateral */}
      {isFormOpen && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex justify-end">
           <div className="w-full max-w-md h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col p-8 animate-in slide-in-from-right duration-300">
              <div className="flex items-center justify-between mb-8">
                 <h3 className="text-xl font-black text-[#111111]">
                    {selectedUser ? "Editar Usuario" : "Nuevo Usuario"}
                 </h3>
                 <button onClick={closeForm} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                    <X size={20} />
                 </button>
              </div>

              <form onSubmit={handleSave} className="flex-1 overflow-y-auto flex flex-col gap-6 pr-2 custom-scrollbar">
                 <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">Empresa Asignada</label>
                    <select 
                      value={tenantId}
                      onChange={(e) => setTenantId(e.target.value)}
                      className="w-full h-12 pl-4 pr-5 appearance-none rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 outline-none focus-visible:ring-[#111111]/5"
                      required
                    >
                       <option value="" disabled>Selecciona una empresa...</option>
                       {tenants.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                       ))}
                    </select>
                 </div>
                 
                 <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">Tipo de Miembro</label>
                    <select 
                      value={roleId}
                      onChange={(e) => setRoleId(e.target.value)}
                      className="w-full h-12 pl-4 pr-5 appearance-none rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 outline-none focus-visible:ring-[#111111]/5"
                      required
                      disabled={!tenantId || selectedUser?.member_type === 'owner'}
                    >
                       <option value="" disabled>Selecciona un tipo...</option>
                       {selectedUser?.member_type === 'owner' && <option value="owner">Propietario</option>}
                       <option value="employee">Empleado (Acceso Limitado)</option>
                    </select>
                 </div>
                 
                 <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">Correo Electrónico</label>
                    <Input 
                      type="email"
                      placeholder="usuario@empresa.com" 
                      value={email} 
                      onChange={e => setEmail(e.target.value)} 
                      className="h-12 rounded-2xl bg-slate-50 border-slate-200 px-5 focus-visible:ring-[#111111]/5"
                      required
                    />
                 </div>
                 
                 <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">
                       {selectedUser ? "Cambiar Contraseña (opcional)" : "Contraseña Temporal"}
                    </label>
                    <Input 
                      type="password"
                      placeholder="****" 
                      value={password} 
                      onChange={e => setPassword(e.target.value)} 
                      className="h-12 rounded-2xl bg-slate-50 border-slate-200 px-5 focus-visible:ring-[#111111]/5"
                      required={!selectedUser}
                    />
                 </div>

                 <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-100 space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                       <input 
                         type="checkbox" 
                         checked={isSuperuser}
                         onChange={e => setIsSuperuser(e.target.checked)}
                         className="w-5 h-5 accent-[#111111] rounded"
                       />
                       <div>
                          <p className="font-bold text-sm text-[#111111]">Permisos Súper Admin</p>
                          <p className="text-xs text-slate-500 mt-0.5">Visibilidad global del sistema SaaS</p>
                       </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                       <input 
                         type="checkbox" 
                         checked={isActive}
                         onChange={e => setIsActive(e.target.checked)}
                         className="w-5 h-5 accent-[#111111] rounded"
                       />
                       <div>
                          <p className="font-bold text-sm text-[#111111]">Cuenta Activa</p>
                          <p className="text-xs text-slate-500 mt-0.5">El usuario puede iniciar sesión</p>
                       </div>
                    </label>
                 </div>

                 {roleId === 'employee' && tenantModules.length > 0 && (
                     <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-100 space-y-4">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Acceso a Módulos</label>
                        {tenantModules.map(mod => (
                            <label key={mod.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-slate-300 transition-colors">
                                <div className="flex items-center gap-3">
                                   <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center">
                                      <Shield size={16} />
                                   </div>
                                   <div>
                                      <p className="text-sm font-bold text-[#111111]">{mod.name}</p>
                                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">{mod.code}</p>
                                   </div>
                                </div>
                                <div className="relative inline-flex items-center cursor-pointer">
                                   <input 
                                     type="checkbox" 
                                     className="sr-only peer"
                                     checked={userModules.has(mod.id)}
                                     onChange={(e) => {
                                        const newSet = new Set(userModules);
                                        if (e.target.checked) newSet.add(mod.id);
                                        else newSet.delete(mod.id);
                                        setUserModules(newSet);
                                     }}
                                   />
                                   <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#69E7A8]"></div>
                                </div>
                            </label>
                        ))}
                     </div>
                 )}

                 <div className="mt-auto pt-8">
                    <Button 
                      type="submit" 
                      disabled={saving || !email.trim() || !tenantId}
                      className="w-full h-14 rounded-2xl bg-[#69E7A8] hover:bg-[#58C991] text-[#111111] font-black tracking-wide transition-all active:scale-[0.98]"
                    >
                      {selectedUser ? <><Save size={18} className="mr-2" /> GUARDAR CAMBIOS</> : "CREAR USUARIO"}
                    </Button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* Modal Hard Delete PRO */}
      {hardDeletingUserId && (
        <div className="absolute inset-0 bg-[#111111]/80 backdrop-blur-md z-30 flex items-center justify-center p-4">
           <form onSubmit={handleHardDelete} className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 text-center">
             <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
                <ShieldAlert size={32} />
             </div>
             <h3 className="text-2xl font-black text-[#111111] mb-2">Destrucción PRO</h3>
             <p className="text-slate-500 text-sm mb-6">Esta operación eliminará de forma irreversible a este usuario o empleado. Todas sus llaves de acceso serán destruidas.</p>
             
             <Input
               type="password"
               placeholder="Contraseña Maestra..."
               value={superAdminPassword}
               onChange={(e) => setSuperAdminPassword(e.target.value)}
               className="h-14 rounded-2xl text-center font-bold tracking-widest mb-4 border-slate-200 bg-slate-50 focus-visible:ring-red-500/20 focus-visible:border-red-500"
               autoFocus
             />
             
             <div className="flex gap-2">
               <Button type="button" variant="outline" onClick={() => {
                     setHardDeletingUserId(null);
                     setHardDeletingUserTenantId(null);
                 }} className="flex-1 h-12 rounded-xl text-slate-500 font-bold border-slate-200">
                 CANCELAR
               </Button>
               <Button type="submit" disabled={deleting || !superAdminPassword} className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold">
                 {deleting ? "PURGANDO..." : "DESTRUIR"}
               </Button>
             </div>
           </form>
        </div>
      )}
    </div>
  );
}
