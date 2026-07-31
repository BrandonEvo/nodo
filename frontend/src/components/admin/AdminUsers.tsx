import { useState, useEffect } from "react";
import { Plus, Search, Edit2, Trash2, PowerOff, Shield, User as UserIcon, CheckCircle2, XCircle, ShieldAlert, Loader2, Check } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/Toaster";
import { tenantsService, type Tenant, type TenantUser } from "@/services/tenants.service";

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

  const [hardDeletingUser, setHardDeletingUser] = useState<{ id: string; tenantId: string } | null>(null);
  const [superAdminPassword, setSuperAdminPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadTenants = async () => {
    try { setTenants(await tenantsService.list()); } catch { setTenants([]); }
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
    } catch { setUsers([]); }
  };

  useEffect(() => { loadTenants(); }, []);

  useEffect(() => {
    if (tenants.length > 0 || selectedTenant === "all") {
      setLoading(true);
      loadUsersForTenant(selectedTenant).finally(() => setLoading(false));
    }
  }, [selectedTenant, tenants]);

  useEffect(() => {
    if (!tenantId) setRoleId("");
  }, [tenantId, selectedUser]);

  const doSave = async () => {
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

      if (selectedUser) {
        await tenantsService.updateUser(selectedUser.id, payload);
      } else {
        await tenantsService.createUser(tenantId, payload);
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

  const handleSave = (e: React.FormEvent) => { e.preventDefault(); doSave(); };

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

  const handleHardDelete = async () => {
    if (!hardDeletingUser || !superAdminPassword) return;
    setDeleting(true);
    try {
      await tenantsService.hardDeleteUser(hardDeletingUser.tenantId, hardDeletingUser.id, superAdminPassword);
      setHardDeletingUser(null);
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
    setRoleId("");
    setIsSuperuser(false); setIsActive(true);
  };

  const getTenantName = (tId: string) => tenants.find(t => t.id === tId)?.name || "Desconocida";

  const RoleBadge = ({ u }: { u: TenantUser }) => {
    if (u.is_superuser) return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${u.is_active === false ? 'bg-nodo-inset text-nodo-dim' : 'bg-nodo-ink text-nodo-canvas'}`}>
        <Shield size={10} className={u.is_active === false ? "text-nodo-dim" : "text-[#69E7A8]"} /> Súper Admin
      </span>
    );
    if (u.member_type === 'owner') return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${u.is_active === false ? 'bg-nodo-warn-bg/50 text-nodo-warn-tx/50' : 'bg-nodo-warn-bg text-nodo-warn-tx'}`}>
        Propietario
      </span>
    );
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${u.is_active === false ? 'bg-nodo-inset text-nodo-dim' : 'bg-nodo-raised text-nodo-sub'}`}>
        Empleado
      </span>
    );
  };

  const UserActions = ({ u }: { u: TenantUser }) => {
    if (u.is_superuser) return (
      <div className="p-1.5 text-nodo-dim" title="Cuenta protegida del sistema">
        <Shield size={18} />
      </div>
    );
    return (
      <div className="flex items-center gap-1">
        <button onClick={() => openFormForEdit(u)} className="p-1.5 text-nodo-dim hover:text-nodo-ink hover:bg-nodo-raised rounded-full transition-colors" title="Editar">
          <Edit2 size={16} />
        </button>
        {u.is_active ? (
          <button onClick={() => handleDelete(u.id)} className="p-1.5 text-nodo-warn-tx hover:text-white hover:bg-nodo-warn-tx rounded-full transition-colors" title="Desactivar">
            <PowerOff size={16} />
          </button>
        ) : (
          <>
            <button onClick={() => handleReactivate(u.id)} className="p-1.5 text-nodo-success-tx hover:text-white hover:bg-nodo-success-tx rounded-full transition-colors bg-nodo-success-bg" title="Reactivar">
              <PowerOff size={16} />
            </button>
            <button onClick={() => setHardDeletingUser({ id: u.id, tenantId: u.tenant_id })} className="p-1.5 text-nodo-danger-tx hover:text-white hover:bg-nodo-danger-tx rounded-full transition-colors bg-nodo-danger-bg" title="Destruir Permanente">
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-nodo-dim pointer-events-none" />
              <select
                value={selectedTenant}
                onChange={(e) => setSelectedTenant(e.target.value)}
                className="h-11 w-full sm:w-56 pl-10 pr-5 appearance-none rounded-2xl bg-nodo-inset border-2 border-nodo-line text-sm font-bold text-nodo-ink outline-none focus:border-nodo-ink transition-colors"
              >
                <option value="all">Todas las empresas</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <button
              onClick={() => { closeForm(); setIsFormOpen(true); }}
              className="h-11 sm:h-12 rounded-2xl bg-nodo-ink text-nodo-canvas font-bold px-5 sm:px-6 active:scale-[0.97] transition-transform shrink-0 flex items-center justify-center gap-2"
            >
              <Plus size={16} /> Añadir Usuario
            </button>
          </div>
        </div>

        {/* KPI row */}
        {!loading && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total',       value: users.length,                                       accent: '#60a5fa', pastel: '#60a5fa1a', icon: UserIcon  },
              { label: 'Activos',     value: users.filter(u => u.is_active !== false).length,    accent: '#69E7A8', pastel: '#69E7A81a', icon: CheckCircle2 },
              { label: 'Superadmins', value: users.filter(u => u.is_superuser).length,           accent: '#f87171', pastel: '#f871711a', icon: Shield     },
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

        {/* User list */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center px-4">
            <UserIcon size={32} className="text-nodo-dim mb-2" />
            <p className="text-sm font-bold text-nodo-dim">No hay usuarios registrados.</p>
          </div>
        ) : (
          <div className="bg-nodo-card border border-nodo-line rounded-3xl overflow-hidden shadow-sm divide-y divide-nodo-line">
            {users.map((u) => (
              <div
                key={u.id}
                className={`flex items-center gap-3 px-5 py-4 transition-colors ${u.is_active === false ? 'opacity-60' : 'hover:bg-nodo-inset'}`}
              >
                {/* Avatar */}
                <div className={`w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center font-black text-sm ${u.is_active === false ? 'bg-nodo-raised text-nodo-dim' : 'bg-nodo-inset text-nodo-ink'}`}>
                  {u.email.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm truncate ${u.is_active === false ? 'text-nodo-dim' : 'text-nodo-ink'}`}>{u.email}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-nodo-dim truncate">{getTenantName(u.tenant_id)}</span>
                    <RoleBadge u={u} />
                    {u.is_active ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-nodo-success-tx uppercase tracking-wider">
                        <CheckCircle2 size={10} /> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-nodo-dim uppercase tracking-wider">
                        <XCircle size={10} /> Inactivo
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <UserActions u={u} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Form BottomSheet ── */}
      <BottomSheet
        open={isFormOpen}
        onClose={closeForm}
        title={selectedUser ? "Editar Usuario" : "Nuevo Usuario"}
        footer={
          <button
            onClick={doSave}
            disabled={saving || !email.trim() || !tenantId || (!selectedUser && !password)}
            className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {saving
              ? <Loader2 size={18} className="animate-spin" />
              : selectedUser ? <><Check size={18} /> Guardar Cambios</> : <><Plus size={18} /> Crear Usuario</>
            }
          </button>
        }
      >
        <form onSubmit={handleSave} className="flex flex-col gap-5">
          {/* Empresa */}
          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Empresa Asignada</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors"
              required
            >
              <option value="" disabled>Selecciona una empresa...</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Tipo de miembro */}
          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Tipo de Miembro</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors disabled:opacity-40"
              required
              disabled={!tenantId || selectedUser?.member_type === 'owner'}
            >
              <option value="" disabled>Selecciona un tipo...</option>
              {selectedUser?.member_type === 'owner' && <option value="owner">Propietario</option>}
              <option value="employee">Empleado (Acceso Limitado)</option>
            </select>
          </div>

          {/* Email */}
          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Correo Electrónico</label>
            <input
              type="email"
              placeholder="usuario@empresa.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim"
              required
            />
          </div>

          {/* Contraseña */}
          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
              {selectedUser ? "Cambiar Contraseña (opcional)" : "Contraseña Temporal"}
            </label>
            {selectedUser?.is_google_user ? (
              <div className="h-12 flex items-center gap-3 px-4 bg-blue-500/10 border-2 border-blue-500/20 rounded-2xl">
                <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span className="text-xs font-bold text-blue-500 dark:text-blue-400">Contraseña gestionada por Google</span>
              </div>
            ) : (
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim"
                required={!selectedUser}
              />
            )}
          </div>

          {/* Checkboxes */}
          <div className="bg-nodo-inset rounded-2xl border border-nodo-line divide-y divide-nodo-line">
            {/* Súper Admin */}
            <label className="flex items-center justify-between px-4 py-3.5 cursor-pointer">
              <div>
                <p className="font-bold text-sm text-nodo-ink">Permisos Súper Admin</p>
                <p className="text-xs text-nodo-sub mt-0.5">Visibilidad global del sistema</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSuperuser(v => !v)}
                className={`relative w-[51px] h-[31px] rounded-full transition-colors duration-200 shrink-0 ${isSuperuser ? 'bg-[#30D158]' : 'bg-nodo-raised'}`}
              >
                <span className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] bg-nodo-canvas rounded-full shadow-sm transition-transform duration-200 ${isSuperuser ? 'translate-x-[20px]' : 'translate-x-0'}`} />
              </button>
            </label>
            {/* Cuenta activa */}
            <label className="flex items-center justify-between px-4 py-3.5 cursor-pointer">
              <div>
                <p className="font-bold text-sm text-nodo-ink">Cuenta Activa</p>
                <p className="text-xs text-nodo-sub mt-0.5">El usuario puede iniciar sesión</p>
              </div>
              <button
                type="button"
                onClick={() => setIsActive(v => !v)}
                className={`relative w-[51px] h-[31px] rounded-full transition-colors duration-200 shrink-0 ${isActive ? 'bg-[#30D158]' : 'bg-nodo-raised'}`}
              >
                <span className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] bg-nodo-canvas rounded-full shadow-sm transition-transform duration-200 ${isActive ? 'translate-x-[20px]' : 'translate-x-0'}`} />
              </button>
            </label>
          </div>

          {/* El acceso a módulos se gestiona desde Auditoría de Roles */}
          {roleId === 'employee' && (
            <div className="flex items-center gap-3 px-4 py-3 bg-nodo-inset rounded-2xl border border-nodo-line">
              <Shield size={16} className="text-nodo-dim shrink-0" />
              <p className="text-xs text-nodo-sub font-medium">
                El acceso a módulos se configura desde <span className="font-bold text-nodo-ink">Auditoría de Roles</span>.
              </p>
            </div>
          )}
        </form>
      </BottomSheet>

      {/* ── Hard delete BottomSheet ── */}
      <BottomSheet
        open={!!hardDeletingUser}
        onClose={() => { setHardDeletingUser(null); setSuperAdminPassword(""); }}
        title="Destrucción Permanente"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setHardDeletingUser(null); setSuperAdminPassword(""); }}
              className="flex-1 h-14 rounded-2xl border-2 border-nodo-line text-nodo-sub font-bold text-sm active:scale-[0.97] transition-transform"
            >
              Cancelar
            </button>
            <button
              onClick={handleHardDelete}
              disabled={deleting || !superAdminPassword}
              className="flex-1 h-14 rounded-2xl bg-nodo-danger-tx text-white font-bold text-sm active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2"
            >
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {deleting ? "Purgando..." : "Destruir"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col items-center text-center gap-5">
          <div className="w-16 h-16 bg-nodo-danger-bg rounded-full flex items-center justify-center text-nodo-danger-tx">
            <ShieldAlert size={32} />
          </div>
          <p className="text-nodo-sub text-sm">
            Eliminará de forma <strong className="text-nodo-ink">irreversible</strong> a este usuario. Todas sus llaves de acceso serán destruidas.
          </p>
          <input
            type="password"
            placeholder="Contraseña Maestra..."
            value={superAdminPassword}
            onChange={(e) => setSuperAdminPassword(e.target.value)}
            className="w-full h-14 px-4 bg-nodo-inset border-2 border-nodo-danger-bd rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-danger-tx outline-none transition-colors text-center placeholder:text-nodo-dim tracking-widest"
            autoFocus
          />
        </div>
      </BottomSheet>
    </>
  );
}
