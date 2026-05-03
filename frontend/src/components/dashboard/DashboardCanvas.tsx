import {
  Building2, Users, ShoppingCart, Package, Shield,
  BarChart3, TrendingUp, DollarSign, Activity,
  LogOut, User, Moon, ChevronRight, Briefcase,
  Settings,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { AdminTenants } from '../admin/AdminTenants';
import { AdminModules } from '../admin/AdminModules';
import { AdminUsers } from '../admin/AdminUsers';
import { AdminRoles } from '../admin/AdminRoles';
import { AdminSubscriptions } from '../admin/AdminSubscriptions';
import { tenantMeService } from '@/services/tenantMe.service';

interface DashboardCanvasProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  displayName: string;
  tenantName: string;
  userPicture?: string | null;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  activeModules: any[];
  onLogout: () => void;
}

export function DashboardCanvas({
  activeTab, setActiveTab, displayName, tenantName,
  userPicture, isSuperAdmin, isTenantAdmin, activeModules, onLogout,
}: DashboardCanvasProps) {

  // ── SUPER ADMIN HOME ──
  if (activeTab === 'admin_home') {
    const cards = [
      { id: 'admin_tenants', label: 'Empresas', sub: 'Gestión de', icon: Building2, color: 'bg-[#69E7A8]/10 text-[#69E7A8]' },
      { id: 'admin_users', label: 'Usuarios', sub: 'Directorio de', icon: Users, color: 'bg-blue-500/10 text-blue-500' },
      { id: 'admin_subscriptions', label: 'Planes', sub: 'Facturación y', icon: ShoppingCart, color: 'bg-purple-500/10 text-purple-500' },
      { id: 'admin_modules', label: 'Módulos', sub: 'Catálogo de', icon: Package, color: 'bg-amber-500/10 text-amber-500' },
      { id: 'admin_roles', label: 'Roles', sub: 'Permisos y', icon: Shield, color: 'bg-rose-500/10 text-rose-500' },
    ];
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#111111] tracking-tight">Panel Maestro</h1>
          <p className="text-gray-400 mt-1 text-sm sm:text-base font-medium">Bienvenido al Workbench de Administración de NODO.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <button key={c.id} onClick={() => setActiveTab(c.id)}
                className="p-6 lg:p-8 bg-white rounded-2xl lg:rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between group hover:shadow-md hover:border-gray-200 transition-all duration-200 text-left w-full active:scale-[0.98]">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.15em] text-gray-400 uppercase">{c.sub}</p>
                  <h3 className="text-xl lg:text-2xl font-black text-[#111111] mt-1">{c.label}</h3>
                </div>
                <div className={`w-12 h-12 lg:w-14 lg:h-14 rounded-xl lg:rounded-2xl flex items-center justify-center ${c.color} group-hover:scale-110 transition-transform duration-200`}>
                  <Icon size={24} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── ADMIN CRUD PANELS ──
  if (activeTab === 'admin_tenants') return <AdminTenants />;
  if (activeTab === 'admin_modules') return <AdminModules />;
  if (activeTab === 'admin_subscriptions') return <AdminSubscriptions />;
  if (activeTab === 'admin_users') return <AdminUsers />;
  if (activeTab === 'admin_roles') return <AdminRoles />;

  // ── METRICS (Placeholder) ──
  if (activeTab === 'metrics') {
    const placeholderCards = [
      { label: 'Ingresos Mes', value: '—', icon: DollarSign, color: 'text-[#69E7A8]', bg: 'bg-[#69E7A8]/10' },
      { label: 'Crecimiento', value: '—', icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-500/10' },
      { label: 'Usuarios Activos', value: '—', icon: Activity, color: 'text-purple-500', bg: 'bg-purple-500/10' },
      { label: 'Tendencia', value: '—', icon: BarChart3, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    ];
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#111111] tracking-tight">Métricas</h1>
          <p className="text-gray-400 mt-1 text-sm sm:text-base font-medium">Resumen analítico de la plataforma.</p>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {placeholderCards.map((c, i) => {
            const Icon = c.icon;
            return (
              <div key={i} className="p-5 lg:p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg} ${c.color} mb-3`}>
                  <Icon size={20} />
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{c.label}</p>
                <p className="text-2xl font-black text-[#111111] mt-1">{c.value}</p>
              </div>
            );
          })}
        </div>
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 flex flex-col items-center justify-center text-center">
          <BarChart3 className="w-12 h-12 text-gray-200 mb-4" />
          <h3 className="text-lg font-bold text-[#111111]">Próximamente</h3>
          <p className="text-gray-400 text-sm mt-1 max-w-md">Los gráficos y análisis detallados estarán disponibles en una futura actualización.</p>
        </div>
      </div>
    );
  }

  // ── TENANT ADMIN MANAGEMENT ──
  if (activeTab === 'mgmt_employees') {
    return <TenantEmployeeManager />;
  }
  if (activeTab === 'mgmt_config') {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#111111] tracking-tight">Configuración</h1>
          <p className="text-gray-400 mt-1 text-sm font-medium">Ajustes de tu empresa.</p>
        </div>
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 flex flex-col items-center justify-center text-center">
          <Settings className="w-12 h-12 text-gray-200 mb-4" />
          <h3 className="text-lg font-bold text-[#111111]">Próximamente</h3>
          <p className="text-gray-400 text-sm mt-1 max-w-md">La configuración avanzada estará disponible en una futura actualización.</p>
        </div>
      </div>
    );
  }

  // ── PROFILE ──
  if (activeTab === 'profile') {
    return (
      <div className="space-y-8 max-w-lg">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#111111] tracking-tight">Mi Perfil</h1>
          <p className="text-gray-400 mt-1 text-sm font-medium">Configuración personal.</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 lg:p-8 flex items-center gap-5">
          {userPicture ? (
            <img src={userPicture} alt="Avatar" className="w-16 h-16 rounded-2xl object-cover shadow-sm" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#69E7A8] to-[#4BD48E] flex items-center justify-center text-[#111111] font-black text-2xl shadow-sm">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h3 className="text-lg font-bold text-[#111111]">{displayName}</h3>
            <p className="text-sm text-gray-400 font-medium">{tenantName}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          <button className="w-full flex items-center justify-between p-5 hover:bg-gray-50/50 transition-colors text-left group">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-semibold text-[#111111]">Datos personales</span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
          </button>
          <button className="w-full flex items-center justify-between p-5 hover:bg-gray-50/50 transition-colors text-left group">
            <div className="flex items-center gap-3">
              <Moon className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-semibold text-[#111111]">Tema oscuro</span>
            </div>
            <div className="w-10 h-6 bg-gray-200 rounded-full relative">
              <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform" />
            </div>
          </button>
          <button onClick={onLogout} className="w-full flex items-center gap-3 p-5 hover:bg-red-50/50 transition-colors text-left text-red-500">
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-semibold">Cerrar sesión</span>
          </button>
        </div>
      </div>
    );
  }

  // ── EMPLOYEE / TENANT HOME (Quick Launch) ──
  if (activeTab === 'home') {
    const firstName = displayName.split(' ')[0] || displayName.split('@')[0];
    const moduleCards = activeModules || [];
    const colors = [
      'bg-[#69E7A8]/10 text-[#69E7A8]',
      'bg-blue-500/10 text-blue-500',
      'bg-purple-500/10 text-purple-500',
      'bg-amber-500/10 text-amber-500',
      'bg-rose-500/10 text-rose-500',
    ];

    // If employee has exactly 1 module, show it as a giant launch button
    if (moduleCards.length === 1 && !isTenantAdmin) {
      const m = moduleCards[0];
      let Icon = Package;
      if (m.code === 'POS') Icon = ShoppingCart;
      else if (m.code === 'HR') Icon = Users;
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
          <div className="w-24 h-24 rounded-3xl bg-[#69E7A8]/10 flex items-center justify-center text-[#69E7A8] animate-pulse">
            <Icon size={48} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#111111]">¡Hola, {firstName}!</h1>
            <p className="text-gray-400 mt-1 text-sm">Tu módulo está listo.</p>
          </div>
          <button onClick={() => setActiveTab(m.code.toLowerCase())}
            className="px-10 py-5 bg-[#111111] text-white text-lg font-black rounded-2xl shadow-lg hover:shadow-xl hover:bg-black transition-all duration-200 active:scale-[0.97] flex items-center gap-3">
            <Icon size={24} /> Abrir {m.name}
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#111111] tracking-tight">¡Bienvenido, {firstName}! 🎉</h1>
          <p className="text-gray-400 mt-1 text-sm sm:text-base font-medium">Selecciona un módulo para comenzar tu jornada.</p>
        </div>

        {/* Quick Launch Grid */}
        {moduleCards.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {moduleCards.map((m: any, idx: number) => {
              let Icon = Package;
              if (m.code === 'POS') Icon = ShoppingCart;
              else if (m.code === 'INVENTORY') Icon = Package;
              else if (m.code === 'HR') Icon = Users;
              const colorClass = colors[idx % colors.length];

              return (
                <button key={m.code} onClick={() => setActiveTab(m.code.toLowerCase())}
                  className="flex flex-col items-center justify-center p-6 lg:p-8 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 active:scale-[0.97] group min-h-[140px]">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${colorClass} group-hover:scale-110 transition-transform duration-200 mb-3`}>
                    <Icon size={28} />
                  </div>
                  <span className="text-sm font-bold text-[#111111] text-center">{m.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="col-span-full py-16 flex flex-col items-center justify-center bg-white border border-dashed border-gray-200 rounded-2xl text-center px-6">
            <Package className="w-14 h-14 text-gray-200 mb-4" />
            <h3 className="text-lg font-bold text-[#111111]">Sin Módulos Asignados</h3>
            <p className="text-gray-400 text-sm mt-2 max-w-sm">No cuentas con aplicativos habilitados. Contacta a tu administrador.</p>
          </div>
        )}

        {/* Tenant Admin Quick Access */}
        {isTenantAdmin && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-3">Administración</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button onClick={() => setActiveTab('mgmt_employees')}
                className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md hover:border-gray-200 transition-all duration-200 active:scale-[0.98] text-left">
                <div className="w-11 h-11 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <Briefcase size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#111111]">Empleados</h4>
                  <p className="text-xs text-gray-400">Gestionar equipo</p>
                </div>
              </button>
              <button onClick={() => setActiveTab('mgmt_config')}
                className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md hover:border-gray-200 transition-all duration-200 active:scale-[0.98] text-left">
                <div className="w-11 h-11 rounded-xl bg-gray-500/10 flex items-center justify-center text-gray-500">
                  <Settings size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#111111]">Configuración</h4>
                  <p className="text-xs text-gray-400">Ajustes empresa</p>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── MODULE PLACEHOLDER (for active modules that don't have a view yet) ──
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4 px-6">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-300">
        <Package size={32} />
      </div>
      <h2 className="text-xl font-bold text-[#111111]">Módulo: {activeTab.toUpperCase()}</h2>
      <p className="text-gray-400 text-sm max-w-md">La interfaz de este módulo estará disponible próximamente.</p>
      <button onClick={() => setActiveTab(isSuperAdmin ? 'admin_home' : 'home')}
        className="mt-4 px-6 py-3 bg-[#111111] text-white font-bold text-sm rounded-xl hover:bg-black transition-all active:scale-[0.97]">
        Volver al Inicio
      </button>
    </div>
  );
}

// ── TENANT EMPLOYEE MANAGER (Simplified) ──
function TenantEmployeeManager() {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [u, r] = await Promise.all([
          tenantMeService.listUsers(),
          tenantMeService.listRoles(),
        ]);
        setUsers(u);
        setRoles(r);
      } catch (e) {
        console.error('Error loading tenant data:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleRoleChange = async (userId: string, roleId: string) => {
    try {
      await tenantMeService.setUserRole(userId, roleId || null);
      const updatedUsers = await tenantMeService.listUsers();
      setUsers(updatedUsers);
    } catch (e) {
      alert('Error al asignar rol');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#111111] tracking-tight flex items-center gap-3">
          <Briefcase className="text-blue-500 w-7 h-7" /> Empleados
        </h1>
        <p className="text-gray-400 mt-1 text-sm font-medium">Gestiona los usuarios de tu empresa.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#111111]" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 bg-white border border-dashed border-gray-200 rounded-2xl">
          <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No hay empleados registrados.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between p-4 lg:p-5 bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-gray-200 transition-all">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black ${u.is_active ? 'bg-[#69E7A8]/10 text-[#69E7A8]' : 'bg-gray-100 text-gray-400'}`}>
                  {u.email.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-[#111111]">{u.email}</p>
                  {u.is_tenant_admin && (
                    <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md uppercase tracking-wider">Admin</span>
                  )}
                </div>
              </div>
              <select
                value={u.role_id || ''}
                onChange={(e) => handleRoleChange(u.id, e.target.value)}
                className="text-sm font-medium bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-[#111111]/5 max-w-[160px]"
              >
                <option value="">Sin rol</option>
                {roles.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
