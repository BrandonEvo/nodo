import {
  Building2, Users, ShoppingCart, Package,
  BarChart3, TrendingUp, DollarSign, Activity,
  LogOut, User, Moon, ChevronRight, Briefcase,
  Settings, Send, SlidersHorizontal,
  Warehouse, ChefHat, Store, Lock, BookOpen,
} from 'lucide-react';
import { useState, useEffect, Suspense } from 'react';
import { AdminTenants } from '../admin/AdminTenants';
import { AdminModules } from '../admin/AdminModules';
import { AdminUsers } from '../admin/AdminUsers';
import { AdminSubscriptions } from '../admin/AdminSubscriptions';
import { TeamManagement } from '../admin/TeamManagement';
import { TenantConfigPanel } from '../admin/TenantConfigPanel';
import { tenantMeService } from '@/services/tenantMe.service';
import { resolveApp } from '@/apps/index';
import api from '@/lib/api';

interface DashboardCanvasProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  displayName: string;
  tenantName: string;
  userPicture?: string | null;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  activeModules: Array<{ id: string; name: string; code: string; frontend_route?: string | null }>;
  onLogout: () => void;
  tenantLogo?: string | null;
  tenantColor?: string;
}

export function DashboardCanvas({
  activeTab, setActiveTab, displayName, tenantName,
  userPicture, isSuperAdmin, isTenantAdmin, activeModules, onLogout,
  tenantLogo = null, tenantColor = '#69E7A8',
}: DashboardCanvasProps) {

  // ── SUPER ADMIN HOME ──
  if (activeTab === 'admin_home') {
    const cards = [
      { id: 'admin_tenants', label: 'Empresas', sub: 'Gestión de', icon: Building2, color: 'bg-[#69E7A8]/10 text-[#69E7A8]' },
      { id: 'admin_users', label: 'Usuarios', sub: 'Directorio de', icon: Users, color: 'bg-blue-500/10 text-blue-500' },
      { id: 'admin_subscriptions', label: 'Planes', sub: 'Facturación y', icon: ShoppingCart, color: 'bg-purple-500/10 text-purple-500' },
      { id: 'admin_modules', label: 'Módulos', sub: 'Catálogo de', icon: Package, color: 'bg-amber-500/10 text-amber-500' },
      { id: 'admin_platform_config', label: 'Configuración', sub: 'Plataforma y', icon: SlidersHorizontal, color: 'bg-cyan-500/10 text-cyan-500' },
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
  if (activeTab === 'admin_platform_config') return <PlatformConfigPanel />;

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
    return <TenantEmployeeManager activeModules={activeModules} />;
  }
  if (activeTab === 'mgmt_team') {
    return <TeamManagement />;
  }
  if (activeTab === 'mgmt_config') {
    return <TenantConfigPanel />;
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
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-sm" style={{ background: `linear-gradient(135deg, ${tenantColor}, ${tenantColor}cc)` }}>
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

    // Contextual greeting based on time of day
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
    const dateStr = new Date().toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' });

    const getModuleIcon = (code: string) => {
      if (code === 'BODEGA') return Warehouse;
      if (code === 'COCINA') return ChefHat;
      if (code === 'MOSTRADOR') return Store;
      if (code === 'CIERRE') return Lock;
      if (code === 'RECETAS') return BookOpen;
      if (code === 'POS') return ShoppingCart;
      if (code === 'HR') return Users;
      if (code === 'INVENTORY') return Package;
      return Package;
    };

    // If employee has exactly 1 module, show a branded launch screen
    if (moduleCards.length === 1 && !isTenantAdmin) {
      const m = moduleCards[0];
      const Icon = getModuleIcon(m.code);
      return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center relative overflow-hidden">
          {/* Decorative background orbs */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-[0.08] blur-3xl" style={{ backgroundColor: tenantColor }} />
            <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full opacity-[0.06] blur-3xl" style={{ backgroundColor: tenantColor }} />
          </div>

          <div className="relative z-10 space-y-8">
            {/* Logo / Company Identity */}
            {tenantLogo ? (
              <img src={tenantLogo} alt={tenantName} className="h-20 w-auto object-contain mx-auto drop-shadow-sm" />
            ) : (
              <div className="w-20 h-20 rounded-3xl mx-auto flex items-center justify-center text-white text-3xl font-black shadow-lg" style={{ background: `linear-gradient(135deg, ${tenantColor}, ${tenantColor}bb)` }}>
                {tenantName.charAt(0)}
              </div>
            )}

            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] mb-2" style={{ color: tenantColor }}>{tenantName}</p>
              <h1 className="text-3xl sm:text-4xl font-black text-[#111111]">{greeting}, {firstName}</h1>
              <p className="text-gray-400 mt-2 text-sm capitalize">{dateStr}</p>
            </div>

            {/* Module launch */}
            <div className="pt-4">
              <div className="w-20 h-20 rounded-3xl mx-auto flex items-center justify-center mb-5 shadow-lg" style={{ backgroundColor: `${tenantColor}18`, color: tenantColor }}>
                <Icon size={40} strokeWidth={1.8} />
              </div>
              <button onClick={() => setActiveTab(m.code.toLowerCase())}
                className="px-10 py-5 text-white text-lg font-black rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 active:scale-[0.97] flex items-center gap-3 mx-auto"
                style={{ backgroundColor: tenantColor }}>
                <Icon size={22} /> Abrir {m.name}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        {/* ── HERO BANNER ── */}
        <div className="relative overflow-hidden rounded-3xl p-8 sm:p-10 lg:p-12" style={{ background: `linear-gradient(135deg, ${tenantColor}15 0%, ${tenantColor}08 50%, transparent 100%)` }}>
          {/* Decorative orbs */}
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-[0.12] blur-2xl" style={{ backgroundColor: tenantColor }} />
          <div className="absolute -bottom-16 -left-10 w-64 h-64 rounded-full opacity-[0.07] blur-3xl" style={{ backgroundColor: tenantColor }} />
          <div className="absolute top-1/2 right-1/4 w-32 h-32 rounded-full opacity-[0.05] blur-2xl" style={{ backgroundColor: tenantColor }} />

          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Logo / Avatar */}
            {tenantLogo ? (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white/80 backdrop-blur-sm shadow-lg flex items-center justify-center p-3 border border-white/60 shrink-0">
                <img src={tenantLogo} alt={tenantName} className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl shadow-lg flex items-center justify-center text-white text-4xl font-black shrink-0" style={{ background: `linear-gradient(135deg, ${tenantColor}, ${tenantColor}cc)` }}>
                {tenantName.charAt(0)}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] border" style={{ color: tenantColor, backgroundColor: `${tenantColor}12`, borderColor: `${tenantColor}25` }}>
                  {tenantName}
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#111111] tracking-tight leading-[1.1]">
                {greeting}, <span style={{ color: tenantColor }}>{firstName}</span>
              </h1>
              <p className="text-gray-400 mt-2 text-sm sm:text-base font-medium capitalize">{dateStr}</p>
            </div>
          </div>
        </div>

        {/* ── MODULE GRID ── */}
        {moduleCards.length > 0 ? (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-4">Aplicaciones</p>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {moduleCards.map((m: any, idx: number) => {
                const Icon = getModuleIcon(m.code);
                return (
                  <button key={m.code} onClick={() => setActiveTab(m.code.toLowerCase())}
                    className="relative flex flex-col items-center justify-center p-6 lg:p-8 bg-white rounded-2xl border border-gray-100 shadow-sm group min-h-[160px] overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 active:scale-[0.97]"
                    style={{ ['--card-accent' as string]: tenantColor }}
                  >
                    {/* Hover glow */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" style={{ boxShadow: `inset 0 0 0 2px ${tenantColor}35, 0 8px 32px -8px ${tenantColor}25` }} />
                    
                    {/* Icon */}
                    <div className="relative z-10 w-14 h-14 lg:w-16 lg:h-16 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg" style={{ backgroundColor: `${tenantColor}12`, color: tenantColor }}>
                      <Icon size={28} strokeWidth={1.8} />
                    </div>
                    
                    <span className="relative z-10 text-sm font-bold text-[#111111] text-center">{m.name}</span>
                    
                    {/* Decorative corner accent */}
                    <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-0 group-hover:opacity-[0.08] transition-opacity duration-300 blur-xl" style={{ backgroundColor: tenantColor }} />
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="relative py-20 flex flex-col items-center justify-center bg-white border-2 border-dashed rounded-3xl text-center px-6 overflow-hidden" style={{ borderColor: `${tenantColor}30` }}>
            <div className="absolute inset-0 opacity-[0.03]" style={{ background: `radial-gradient(circle at center, ${tenantColor}, transparent 70%)` }} />
            <div className="relative z-10">
              <div className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center" style={{ backgroundColor: `${tenantColor}10`, color: `${tenantColor}60` }}>
                <Package size={36} strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-black text-[#111111]">Sin Módulos Asignados</h3>
              <p className="text-gray-400 text-sm mt-2 max-w-sm">No cuentas con aplicativos habilitados. Contacta a tu administrador para habilitar módulos.</p>
            </div>
          </div>
        )}

        {/* ── ADMIN QUICK ACCESS ── */}
        {isTenantAdmin && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-4">Administración</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { id: 'mgmt_employees', label: 'Empleados', desc: 'Gestionar equipo', icon: Briefcase },
                { id: 'mgmt_team', label: 'Invitaciones', desc: 'Invitar miembros', icon: Send },
                { id: 'mgmt_config', label: 'Configuración', desc: 'Ajustes empresa', icon: Settings },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.id} onClick={() => setActiveTab(item.id)}
                    className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 active:scale-[0.98] text-left group">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110" style={{ backgroundColor: `${tenantColor}12`, color: tenantColor }}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#111111]">{item.label}</h4>
                      <p className="text-xs text-gray-400">{item.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }


  // ── DYNAMIC MODULE APP RENDERER ──
  // Busca si el tab activo corresponde a un módulo con una app registrada
  const activeModule = activeModules.find(
    (m) => m.code?.toLowerCase() === activeTab || m.frontend_route === activeTab
  );
  const AppComponent = activeModule ? resolveApp(activeModule.frontend_route) : null;

  if (AppComponent) {
    return (
      <div className="space-y-6">
        <Suspense fallback={
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#111111]" />
          </div>
        }>
          <AppComponent tenantName={tenantName} />
        </Suspense>
      </div>
    );
  }

  // ── MODULE PLACEHOLDER (módulo sin app de frontend aún) ──
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
function TenantEmployeeManager({ activeModules }: { activeModules: Array<{ id: string; name: string }> }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const u = await tenantMeService.listUsers();
        setUsers(u);
      } catch (e) {
        console.error('Error loading tenant data:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleToggleModule = async (userId: string, moduleId: string, currentModuleIds: string[]) => {
    try {
      const newModules = currentModuleIds.includes(moduleId)
        ? currentModuleIds.filter(id => id !== moduleId)
        : [...currentModuleIds, moduleId];

      await tenantMeService.setUserModules(userId, newModules);
      
      setUsers(prev => prev.map(u => {
        if (u.id === userId) {
          return { ...u, module_ids: newModules };
        }
        return u;
      }));
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error al actualizar módulos');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#111111] tracking-tight flex items-center gap-3">
          <Briefcase className="text-blue-500 w-7 h-7" /> Empleados
        </h1>
        <p className="text-gray-400 mt-1 text-sm font-medium">Gestiona los accesos a módulos de tu equipo.</p>
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
        <div className="space-y-4">
          {users.map((u) => (
            <div key={u.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 lg:p-6 bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-gray-200 transition-all gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black ${u.is_active ? 'bg-[#69E7A8]/10 text-[#69E7A8]' : 'bg-gray-100 text-gray-400'}`}>
                  {u.email.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-base font-bold text-[#111111]">{u.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {u.member_type === 'owner' ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wider">
                        Propietario
                      </span>
                    ) : u.member_type === 'admin' ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
                        Administrador
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-gray-50 text-gray-600 border border-gray-200 uppercase tracking-wider">
                        Empleado
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {activeModules.map(mod => {
                  // Owner and Admin have access to everything implicitly
                  const hasAccess = u.member_type !== 'employee' || u.module_ids.includes(mod.id);
                  const isLocked = u.member_type !== 'employee';

                  return (
                    <button
                      key={mod.id}
                      disabled={isLocked}
                      onClick={() => handleToggleModule(u.id, mod.id, u.module_ids)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-bold transition-all ${
                        hasAccess 
                          ? 'bg-[#111111] text-white border-[#111111]' 
                          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'
                      } ${isLocked ? 'opacity-70 cursor-not-allowed' : 'active:scale-95 cursor-pointer'}`}
                    >
                      <div className={`w-2 h-2 rounded-full ${hasAccess ? 'bg-[#69E7A8]' : 'bg-gray-300'}`} />
                      {mod.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PLATFORM CONFIG PANEL (Super Admin) ──
function PlatformConfigPanel() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/config/');
      setConfigs(data);
    } catch (e: any) {
      // Si está vacío, intentar sembrar
      try {
        await api.post('/api/admin/config/seed');
        const { data } = await api.get('/api/admin/config/');
        setConfigs(data);
      } catch {
        console.error('Error loading platform config');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConfigs(); }, []);

  const handleSave = async (key: string) => {
    try {
      await api.patch(`/api/admin/config/${key}`, { value: editValue });
      setEditingKey(null);
      await loadConfigs();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Error al guardar');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#111111] tracking-tight flex items-center gap-3">
          <SlidersHorizontal className="text-cyan-500 w-7 h-7" /> Configuración de Plataforma
        </h1>
        <p className="text-gray-400 mt-1 text-sm font-medium">Parámetros globales del sistema.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#111111]" />
        </div>
      ) : configs.length === 0 ? (
        <div className="text-center py-16 bg-white border border-dashed border-gray-200 rounded-2xl">
          <SlidersHorizontal className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No hay configuraciones disponibles.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((cfg: any) => (
            <div key={cfg.key} className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#111111]">{cfg.key.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{cfg.description}</p>
                </div>
                {editingKey === cfg.key ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-9 px-3 w-24 rounded-lg border-2 border-[#111111] text-sm font-bold text-center outline-none"
                      autoFocus
                    />
                    <button onClick={() => handleSave(cfg.key)} className="h-9 px-3 bg-[#69E7A8] text-[#111111] font-bold text-xs rounded-lg hover:bg-[#58C991] transition-all">
                      Guardar
                    </button>
                    <button onClick={() => setEditingKey(null)} className="h-9 px-3 bg-gray-100 text-gray-500 font-bold text-xs rounded-lg hover:bg-gray-200 transition-all">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingKey(cfg.key); setEditValue(cfg.value); }}
                    className="shrink-0 h-9 px-4 bg-gray-50 border border-gray-200 text-sm font-bold text-[#111111] rounded-lg hover:bg-gray-100 transition-all"
                  >
                    {cfg.value}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
