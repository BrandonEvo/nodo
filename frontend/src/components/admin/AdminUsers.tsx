import { useState, useEffect } from "react";
import { Plus, Users, Search, Edit2, Trash2, PowerOff, Shield, User as UserIcon, CheckCircle2, XCircle, X, Save, ShieldAlert } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/Toaster";
import { tenantsService, type Tenant, type TenantUser } from "@/services/tenants.service";
import { modulesService, type ModuleRead } from "@/services/modules.service";

export function AdminUsers() {
  const toast = useToast();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("all");
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<TenantUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [tenantModules, setTenantModules] = useState<ModuleRead[]>([]);
  const [userModules, setUserModules] = useState<Set<string>>(new Set());

  const [hardDeletingUserId, setHardDeletingUserId] = useState<string | null>(null);
  const [hardDeletingUserTenantId, setHardDeletingUserTenantId] = useState<string | null>(null);
  const [superAdminPassword, setSuperAdminPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadTenants = async () => {
    try {
      setTenants(await tenantsService.list());
    } catch {
      setTenants([]);
    }
  };

  const loadUsersForTenant = async (tId: string) => {
    try {
      let list: TenantUser[] = [];
      if (tId === "all") {
        const results = await Promise.all(tenants.map(t => tenantsService.listUsers(t.id).catch(() => [])));
        list = results.flat();
      } else {
        list = await tenantsService.listUsers(tId);
      }
      setUsers(list);
    } catch {
      setUsers([]);
    }
  };

  useEffect(() => { loadTenants(); }, []);

  useEffect(() => {
    if (tenants.length > 0 || selectedTenant === "all") {
      setLoading(true);
      loadUsersForTenant(selectedTenant).finally(() => setLoading(false));
    }
  }, [selectedTenant, tenants]);

  useEffect(() => {
    if (!tenantId) {
      setRoleId("");
      setTenantModules([]);
      setUserModules(new Set());
    } else {
      modulesService.listByTenant(tenantId).then(setTenantModules).catch(() => setTenantModules([]));
      if (selectedUser?.member_type === 'employee') {
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
        member_type: roleId,
      };
      if (password && !selectedUser?.is_google_user) payload.password = password;

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
      toast.success(selectedUser ? "Usuario actualizado correctamente" : "Usuario creado correctamente");
      closeForm();
      await loadUsersForTenant(selectedTenant);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al guardar usuario");
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

  const handleDelete = (uId: string) => {
    toast.confirm(
      "¿Desactivar este usuario?",
      async () => {
        try {
          await tenantsService.deleteUser(uId);
          toast.warning("Usuario desactivado");
          await loadUsersForTenant(selectedTenant);
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Error al desactivar");
        }
      },
      { description: "Perderá acceso sin ser eliminado del sistema.", confirmLabel: "Desactivar" }
    );
  };

  const handleReactivate = async (uId: string) => {
    try {
      await tenantsService.updateUser(uId, { is_active: true });
      toast.success("Usuario reactivado");
      await loadUsersForTenant(selectedTenant);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al reactivar usuario");
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
      toast.success("Usuario destruido permanentemente");
      await loadUsersForTenant(selectedTenant);
    } catch (e: any) {
      toast.error(e.response?.data?.detail || e.message || "Error al destruir el usuario");
    } finally {
      setDeleting(false);
    }
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setSelectedUser(null);
    setEmail(""); setPassword("");
    setTenantId(selectedTenant !== "all" ? selectedTenant : "");
    setRoleId(""); setUserModules(new Set());
    setIsSuperuser(false); setIsActive(true);
  };

  const getTenantName = (tId: string) => tenants.find(t => t.id === tId)?.name || "Desconocida";

  // ── Role badge ──
  const RoleBadge = ({ u }: { u: TenantUser }) => {
    if (u.is_superuser) return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${u.is_active === false ? 'bg-slate-300 text-slate-500' : 'bg-[#111111] text-white'}`}>
        <Shield size={10} className={u.is_active === false ? "text-slate-400" : "text-[#69E7A8]"} /> Súper Admin
      </span>
    );
    if (u.member_type === 'owner') return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${u.is_active === false ? 'bg-amber-100/50 text-amber-600/50' : 'bg-amber-100 text-amber-700'}`}>
        Propietario
      </span>
    );
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${u.is_active === false ? 'bg-slate-200 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
        Empleado
      </span>
    );
  };

  // ── Actions ──
  const UserActions = ({ u }: { u: TenantUser }) => {
    if (u.is_superuser) return (
      <div className="p-1.5 text-slate-300" title="Cuenta protegida del sistema">
        <Shield size={18} />
      </div>
    );
    return (
      <div className="flex items-center gap-1">
        <button onClick={() => openFormForEdit(u)} className="p-1.5 text-slate-400 hover:text-[#111111] hover:bg-slate-200 rounded-full transition" title="Editar">
          <Edit2 size={16} />
        </button>
        {u.is_active ? (
          <button onClick={() => handleDelete(u.id)} className="p-1.5 text-orange-400 hover:text-white hover:bg-orange-500 rounded-full transition" title="Desactivar">
            <PowerOff size={16} />
          </button>
        ) : (
          <>
            <button onClick={() => handleReactivate(u.id)} className="p-1.5 text-green-500 hover:text-white hover:bg-green-500 rounded-full transition bg-green-50" title="Reactivar">
              <PowerOff size={16} />
            </button>
            <button onClick={() => { setHardDeletingUserId(u.id); setHardDeletingUserTenantId(u.tenant_id); }} className="p-1.5 text-red-500 hover:text-white hover:bg-red-600 rounded-full transition bg-red-50" title="Destruir Permanente">
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl sm:rounded-[40px] p-4 sm:p-6 lg:p-10 shadow-sm border border-slate-100 flex flex-col flex-1 overflow-hidden relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8 shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#111111] tracking-tight flex items-center gap-3">
            <Users className="text-[#69E7A8] w-7 h-7 shrink-0" /> Usuarios y Empleados
          </h2>
          <p className="text-slate-500 text-sm mt-1">Directorio global de todas las cuentas.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              className="h-11 w-full sm:w-56 pl-10 pr-5 appearance-none rounded-full bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 outline-none"
            >
              <option value="all">Todas las empresas</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <Button
            onClick={() => { closeForm(); setIsFormOpen(true); }}
            className="h-11 sm:h-12 rounded-full bg-[#111111] hover:bg-[#333333] text-white font-bold px-5 sm:px-6 transition-all shrink-0"
          >
            <Plus size={16} className="mr-2" /> Añadir Usuario
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Spinner size="lg" />
          </div>
        ) : users.length === 0 ? (
          <EmptyState icon={<UserIcon className="w-6 h-6" />} title="No hay usuarios registrados." />
        ) : (
          <>
            {/* ── Mobile: card list ── */}
            <div className="sm:hidden space-y-3">
              {users.map((u) => (
                <div
                  key={u.id}
                  className={`p-4 rounded-2xl border transition-colors ${u.is_active === false ? 'bg-slate-50/70 border-slate-100 opacity-70' : 'bg-slate-50 border-transparent hover:border-slate-100'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-black ${u.is_active === false ? 'bg-slate-200 text-slate-400' : 'bg-white text-[#111111] shadow-sm'}`}>
                        {u.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className={`font-bold text-sm truncate ${u.is_active === false ? 'text-slate-400' : 'text-[#111111]'}`}>{u.email}</p>
                        <p className="text-xs text-slate-400 truncate">{getTenantName(u.tenant_id)}</p>
                      </div>
                    </div>
                    <UserActions u={u} />
                  </div>
                  <div className="flex items-center gap-2 mt-3 pl-13">
                    <RoleBadge u={u} />
                    {u.is_active ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#2ea86b] uppercase tracking-wider">
                        <CheckCircle2 size={12} /> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                        <XCircle size={12} /> Inactivo
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Desktop: table ── */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="pb-4 pl-4 font-bold">Usuario</th>
                    <th className="pb-4 font-bold">Empresa</th>
                    <th className="pb-4 font-bold">Privilegios</th>
                    <th className="pb-4 font-bold">Estado</th>
                    <th className="pb-4 text-right pr-4 font-bold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={`border-b border-slate-50 transition-colors group ${u.is_active === false ? 'opacity-60 bg-slate-50/50' : 'hover:bg-slate-50/80'}`}>
                      <td className="py-4 pl-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${u.is_active === false ? 'bg-slate-200 text-slate-500' : 'bg-slate-100 text-[#111111]'}`}>
                            {u.email.charAt(0).toUpperCase()}
                          </div>
                          <span className={`font-bold text-sm ${u.is_active === false ? 'text-slate-500' : 'text-[#111111]'}`}>{u.email}</span>
                        </div>
                      </td>
                      <td className="py-4 text-sm font-semibold text-slate-600">{getTenantName(u.tenant_id)}</td>
                      <td className="py-4"><RoleBadge u={u} /></td>
                      <td className="py-4">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1.5 text-[#69E7A8] text-xs font-black tracking-widest uppercase">
                            <CheckCircle2 size={14} /> Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-slate-400 text-xs font-black tracking-widest uppercase">
                            <XCircle size={14} /> Inactivo
                          </span>
                        )}
                      </td>
                      <td className="py-4 text-right pr-4">
                        <div className="flex justify-end opacity-80 group-hover:opacity-100 transition-opacity">
                          <UserActions u={u} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Form drawer */}
      {isFormOpen && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex justify-end">
          <div className="w-full max-w-md h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col p-6 sm:p-8 animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-[#111111]">
                {selectedUser ? "Editar Usuario" : "Nuevo Usuario"}
              </h3>
              <button onClick={closeForm} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto flex flex-col gap-5 pr-2 custom-scrollbar">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">Empresa Asignada</label>
                <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="w-full h-12 pl-4 pr-5 appearance-none rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 outline-none" required>
                  <option value="" disabled>Selecciona una empresa...</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">Tipo de Miembro</label>
                <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="w-full h-12 pl-4 pr-5 appearance-none rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 outline-none" required disabled={!tenantId || selectedUser?.member_type === 'owner'}>
                  <option value="" disabled>Selecciona un tipo...</option>
                  {selectedUser?.member_type === 'owner' && <option value="owner">Propietario</option>}
                  <option value="employee">Empleado (Acceso Limitado)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">Correo Electrónico</label>
                <Input type="email" placeholder="usuario@empresa.com" value={email} onChange={e => setEmail(e.target.value)} className="h-12 rounded-2xl bg-slate-50 border-slate-200 px-5 focus-visible:ring-[#111111]/5" required />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2 mb-2 block">
                  {selectedUser ? "Cambiar Contraseña (opcional)" : "Contraseña Temporal"}
                </label>
                {selectedUser?.is_google_user ? (
                  <div className="h-12 flex items-center gap-3 px-4 bg-blue-50 border-2 border-blue-100 rounded-2xl">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span className="text-xs font-bold text-blue-600">Contraseña gestionada por Google</span>
                  </div>
                ) : (
                  <Input type="password" placeholder="****" value={password} onChange={e => setPassword(e.target.value)} className="h-12 rounded-2xl bg-slate-50 border-slate-200 px-5 focus-visible:ring-[#111111]/5" required={!selectedUser} />
                )}
              </div>
              <div className="bg-slate-50 p-5 rounded-[24px] border border-slate-100 space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={isSuperuser} onChange={e => setIsSuperuser(e.target.checked)} className="w-5 h-5 accent-[#111111] rounded" />
                  <div>
                    <p className="font-bold text-sm text-[#111111]">Permisos Súper Admin</p>
                    <p className="text-xs text-slate-500 mt-0.5">Visibilidad global del sistema</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="w-5 h-5 accent-[#111111] rounded" />
                  <div>
                    <p className="font-bold text-sm text-[#111111]">Cuenta Activa</p>
                    <p className="text-xs text-slate-500 mt-0.5">El usuario puede iniciar sesión</p>
                  </div>
                </label>
              </div>
              {roleId === 'employee' && tenantModules.length > 0 && (
                <div className="bg-slate-50 p-5 rounded-[24px] border border-slate-100 space-y-3">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Acceso a Módulos</label>
                  {tenantModules.map(mod => (
                    <label key={mod.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-slate-300 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center">
                          <Shield size={15} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#111111]">{mod.name}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider">{mod.code}</p>
                        </div>
                      </div>
                      <div className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={userModules.has(mod.id)} onChange={(e) => {
                          const s = new Set(userModules);
                          e.target.checked ? s.add(mod.id) : s.delete(mod.id);
                          setUserModules(s);
                        }} />
                        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#69E7A8]" />
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="mt-auto pt-6">
                <Button type="submit" disabled={saving || !email.trim() || !tenantId} className="w-full h-14 rounded-2xl bg-[#69E7A8] hover:bg-[#58C991] text-[#111111] font-black tracking-wide transition-all active:scale-[0.98]">
                  {saving
                    ? <div className="w-5 h-5 border-2 border-[#111111]/30 border-t-[#111111] rounded-full animate-spin" />
                    : selectedUser ? <><Save size={16} className="mr-2" /> Guardar Cambios</> : "Crear Usuario"
                  }
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hard delete modal */}
      {hardDeletingUserId && (
        <div className="absolute inset-0 bg-[#111111]/80 backdrop-blur-md z-30 flex items-center justify-center p-4">
          <form onSubmit={handleHardDelete} className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
              <ShieldAlert size={32} />
            </div>
            <h3 className="text-2xl font-black text-[#111111] mb-2">Destrucción PRO</h3>
            <p className="text-slate-500 text-sm mb-6">Eliminará de forma irreversible a este usuario. Todas sus llaves de acceso serán destruidas.</p>
            <Input type="password" placeholder="Contraseña Maestra..." value={superAdminPassword} onChange={(e) => setSuperAdminPassword(e.target.value)} className="h-14 rounded-2xl text-center font-bold tracking-widest mb-4 border-slate-200 bg-slate-50 focus-visible:ring-red-500/20 focus-visible:border-red-500" autoFocus />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => { setHardDeletingUserId(null); setHardDeletingUserTenantId(null); }} className="flex-1 h-12 rounded-xl text-slate-500 font-bold border-slate-200">
                Cancelar
              </Button>
              <Button type="submit" disabled={deleting || !superAdminPassword} className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold">
                {deleting ? "Purgando..." : "Destruir"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
