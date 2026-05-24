import {
  Building2, Users, ShoppingCart, Package,
  BarChart3, TrendingUp, DollarSign, Activity,
  LogOut, User, Moon, ChevronRight, Briefcase,
  Settings, Send, SlidersHorizontal, Shield,
  Warehouse, ChefHat, Store, Lock, BookOpen,
} from 'lucide-react';
import { useState, useEffect, Suspense } from 'react';
import { AdminTenants } from '../admin/AdminTenants';
import { AdminModules } from '../admin/AdminModules';
import { AdminUsers } from '../admin/AdminUsers';
import { AdminRoles } from '../admin/AdminRoles';
import { AdminSubscriptions } from '../admin/AdminSubscriptions';
import { TeamManagement } from '../admin/TeamManagement';
import { TenantConfigPanel } from '../admin/TenantConfigPanel';
import { useToast } from '@/components/ui/Toaster';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
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
  isDark?: boolean;
  onToggleDark?: () => void;
}

export function DashboardCanvas({
  activeTab, setActiveTab, displayName, tenantName,
  userPicture, isSuperAdmin, isTenantAdmin, activeModules, onLogout,
  tenantLogo = null, tenantColor = '#69E7A8',
  isDark = false, onToggleDark,
}: DashboardCanvasProps) {

  // ── SUPER ADMIN HOME ──
  if (activeTab === 'admin_home') {
    const hour = new Date().getHours();
    const greeting = hour < 5 ? 'Buenas noches' : hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
    const greetingEmoji = hour < 5 ? '🌙' : hour < 12 ? '☀️' : hour < 18 ? '🌤️' : '🌙';
    const firstName = displayName.split(' ')[0] || displayName.split('@')[0];

    const sections = [
      {
        label: 'Negocio',
        items: [
          { id: 'admin_tenants', label: 'Empresas',  desc: 'Gestión de workspaces',       icon: Building2,  gradient: 'from-[#69E7A8] to-emerald-500' },
          { id: 'admin_users',   label: 'Usuarios',  desc: 'Directorio global de cuentas', icon: Users,      gradient: 'from-blue-400 to-blue-600'      },
        ],
      },
      {
        label: 'Plataforma',
        items: [
          { id: 'admin_modules',       label: 'Módulos', desc: 'Catálogo de funcionalidades',     icon: Package,    gradient: 'from-amber-400 to-orange-500'  },
          { id: 'admin_subscriptions', label: 'Planes',  desc: 'Suscripciones y facturación',     icon: ShoppingCart, gradient: 'from-violet-500 to-purple-600' },
        ],
      },
      {
        label: 'Sistema',
        items: [
          { id: 'admin_roles',          label: 'Roles',          desc: 'Permisos y auditoría',         icon: Shield,           gradient: 'from-rose-400 to-rose-600'    },
          { id: 'admin_platform_config',label: 'Configuración',  desc: 'Parámetros globales',           icon: SlidersHorizontal, gradient: 'from-cyan-400 to-cyan-600'   },
        ],
      },
    ];

    return (
      <div className="flex flex-col gap-8 max-w-lg">

        {/* Header greeting */}
        <div className="flex items-center gap-4 pt-1">
          <div className="w-[60px] h-[60px] rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-md shrink-0"
            style={{ background: 'linear-gradient(135deg, #69E7A8, #3ec98a)' }}>
            {firstName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#69E7A8] mb-0.5">
              NODO Admin
            </p>
            <h1 className="text-2xl font-bold text-nodo-ink leading-tight">
              {greeting}, {firstName} {greetingEmoji}
            </h1>
            <p className="text-xs text-nodo-sub mt-0.5">Panel Maestro · Workbench</p>
          </div>
        </div>

        {/* Sections iOS Settings style */}
        {sections.map(section => (
          <div key={section.label}>
            <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-widest mb-2 px-1">
              {section.label}
            </p>
            <div className="bg-nodo-card rounded-3xl border border-nodo-line overflow-hidden divide-y divide-nodo-line shadow-sm">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-nodo-inset active:bg-nodo-raised transition-colors text-left"
                  >
                    <div className={`w-11 h-11 rounded-[14px] bg-gradient-to-br ${item.gradient} flex items-center justify-center shrink-0 shadow-sm`}>
                      <Icon size={20} className="text-white" strokeWidth={1.8} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-nodo-ink">{item.label}</p>
                      <p className="text-xs text-nodo-sub mt-0.5">{item.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-nodo-dim shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── ADMIN CRUD PANELS ──
  if (activeTab === 'admin_tenants')        return <AdminTenants />;
  if (activeTab === 'admin_modules')        return <AdminModules />;
  if (activeTab === 'admin_subscriptions')  return <AdminSubscriptions />;
  if (activeTab === 'admin_users')          return <AdminUsers />;
  if (activeTab === 'admin_roles')          return <AdminRoles />;
  if (activeTab === 'admin_platform_config') return <PlatformConfigPanel />;

  // ── METRICS ──
  if (activeTab === 'metrics') {
    const placeholderCards = [
      { label: 'Ingresos Mes',    value: '—', icon: DollarSign, color: 'text-[#69E7A8]', bg: 'bg-[#69E7A8]/10' },
      { label: 'Crecimiento',     value: '—', icon: TrendingUp,  color: 'text-blue-500',  bg: 'bg-blue-500/10'  },
      { label: 'Usuarios Activos',value: '—', icon: Activity,    color: 'text-purple-500',bg: 'bg-purple-500/10'},
      { label: 'Tendencia',       value: '—', icon: BarChart3,   color: 'text-amber-500', bg: 'bg-amber-500/10' },
    ];
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-[28px] font-black text-nodo-ink leading-tight">Métricas</h1>
          <p className="text-nodo-sub text-sm font-medium mt-0.5">Resumen analítico de la plataforma.</p>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {placeholderCards.map((c, i) => {
            const Icon = c.icon;
            return (
              <div key={i} className="p-5 lg:p-6 bg-nodo-card rounded-2xl border border-nodo-line shadow-sm">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg} ${c.color} mb-3`}>
                  <Icon size={20} />
                </div>
                <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">{c.label}</p>
                <p className="text-2xl font-black text-nodo-ink mt-1 tabular-nums">{c.value}</p>
              </div>
            );
          })}
        </div>
        <div className="bg-nodo-card rounded-2xl border border-dashed border-nodo-line p-12 flex flex-col items-center justify-center text-center">
          <BarChart3 className="w-12 h-12 text-nodo-dim mb-4" />
          <h3 className="text-lg font-bold text-nodo-ink">Próximamente</h3>
          <p className="text-nodo-sub text-sm mt-1 max-w-md">Los gráficos y análisis detallados estarán disponibles en una futura actualización.</p>
        </div>
      </div>
    );
  }

  // ── TENANT ADMIN MANAGEMENT ──
  if (activeTab === 'mgmt_employees') return <TenantEmployeeManager activeModules={activeModules} />;
  if (activeTab === 'mgmt_team')      return <TeamManagement />;
  if (activeTab === 'mgmt_config')    return <TenantConfigPanel />;

  // ── PROFILE ──
  if (activeTab === 'profile') {
    return (
      <div className="space-y-8 max-w-lg">
        <div>
          <h1 className="text-[28px] font-black text-nodo-ink leading-tight">Mi Perfil</h1>
          <p className="text-nodo-sub text-sm font-medium mt-0.5">Configuración personal.</p>
        </div>
        <div className="bg-nodo-card rounded-3xl border border-nodo-line shadow-sm p-6 lg:p-8 flex items-center gap-5">
          {userPicture ? (
            <img src={userPicture} alt="Avatar" className="w-16 h-16 rounded-2xl object-cover shadow-sm" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-sm"
              style={{ background: `linear-gradient(135deg, ${tenantColor}, ${tenantColor}cc)` }}>
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h3 className="text-lg font-bold text-nodo-ink">{displayName}</h3>
            <p className="text-sm text-nodo-sub font-medium">{tenantName}</p>
          </div>
        </div>
        <div className="bg-nodo-card rounded-3xl border border-nodo-line shadow-sm divide-y divide-nodo-line">
          <button className="w-full flex items-center justify-between p-5 hover:bg-nodo-inset transition-colors text-left group">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-nodo-sub" />
              <span className="text-sm font-semibold text-nodo-ink">Datos personales</span>
            </div>
            <ChevronRight className="w-4 h-4 text-nodo-dim group-hover:text-nodo-sub transition-colors" />
          </button>
          <button
            onClick={onToggleDark}
            className="w-full flex items-center justify-between p-5 hover:bg-nodo-inset transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <Moon className="w-5 h-5 text-nodo-sub" />
              <span className="text-sm font-semibold text-nodo-ink">Tema oscuro</span>
            </div>
            {/* iOS-style toggle */}
            <div className={`w-12 h-7 rounded-full relative transition-colors duration-200 ${isDark ? 'bg-[#30D158]' : 'bg-nodo-inset'}`}>
              <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-200 ${isDark ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </div>
          </button>
          <button onClick={onLogout} className="w-full flex items-center gap-3 p-5 hover:bg-nodo-danger-bg transition-colors text-left text-nodo-danger-tx">
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-semibold">Cerrar sesión</span>
          </button>
        </div>
      </div>
    );
  }

  // ── EMPLOYEE / TENANT HOME ──
  if (activeTab === 'home') {
    const firstName = displayName.split(' ')[0] || displayName.split('@')[0];
    const moduleCards = activeModules || [];

    const hour = new Date().getHours();
    const greeting = hour < 5 ? 'Buenas noches' : hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
    const greetingEmoji = hour < 5 ? '🌙' : hour < 12 ? '☀️' : hour < 18 ? '🌤️' : '🌙';
    const dateStr = new Date().toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' });

    const MODULE_CONFIG: Record<string, { gradient: string; icon: typeof Package }> = {
      BODEGA:           { gradient: 'from-blue-500 to-blue-600',     icon: Warehouse    },
      COCINA:           { gradient: 'from-orange-400 to-rose-500',   icon: ChefHat      },
      MOSTRADOR:        { gradient: 'from-cyan-400 to-teal-500',     icon: Store        },
      CIERRE:           { gradient: 'from-slate-500 to-slate-700',   icon: Lock         },
      RECETAS:          { gradient: 'from-violet-500 to-purple-600', icon: BookOpen     },
      POS:              { gradient: 'from-emerald-400 to-green-500', icon: ShoppingCart },
      HR:               { gradient: 'from-indigo-400 to-indigo-600', icon: Users        },
      INVENTORY:        { gradient: 'from-amber-400 to-orange-500',  icon: Package      },
      PERSONAL_SHOPPER: { gradient: 'from-pink-500 to-rose-600',     icon: ShoppingCart },
      GASTOS:           { gradient: 'from-amber-500 to-yellow-600',  icon: DollarSign   },
      REPORTES:         { gradient: 'from-emerald-500 to-teal-600',  icon: BarChart3    },
    };

    const getModuleCfg = (code: string) =>
      MODULE_CONFIG[code.toUpperCase()] ?? { gradient: 'from-gray-400 to-gray-500', icon: Package };

    // Single module — branded splash
    if (moduleCards.length === 1 && !isTenantAdmin) {
      const m = moduleCards[0];
      const { gradient, icon: Icon } = getModuleCfg(m.code);
      return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
          <div className="mb-8">
            {tenantLogo ? (
              <img src={tenantLogo} alt={tenantName} className="h-16 w-auto object-contain mx-auto mb-3" />
            ) : (
              <div className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center text-white text-2xl font-black shadow-lg"
                style={{ background: `linear-gradient(135deg, ${tenantColor}, ${tenantColor}cc)` }}>
                {tenantName.charAt(0)}
              </div>
            )}
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: tenantColor }}>{tenantName}</p>
          </div>
          <div className="mb-10">
            <p className="text-4xl mb-1">{greetingEmoji}</p>
            <h1 className="text-3xl font-bold text-nodo-ink tracking-tight">
              {greeting}, {firstName}
            </h1>
            <p className="text-sm text-nodo-sub mt-1 capitalize">{dateStr}</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => setActiveTab(m.frontend_route ?? m.code.toLowerCase())}
              className={`w-24 h-24 rounded-[28px] bg-gradient-to-br ${gradient} flex items-center justify-center shadow-2xl active:scale-90 transition-transform duration-150`}
            >
              <Icon size={44} className="text-white" strokeWidth={1.6} />
            </button>
            <p className="text-sm font-semibold text-nodo-ink">{m.name}</p>
            <p className="text-xs text-nodo-dim">Toca para abrir</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-10 max-w-2xl">

        {/* ── GREETING — directo en canvas, sin tarjeta ── */}
        <div className="flex items-center gap-4 pt-1">
          <div className="shrink-0">
            {userPicture ? (
              <img src={userPicture} alt="Avatar"
                className="w-[60px] h-[60px] rounded-2xl object-cover shadow-md" referrerPolicy="no-referrer" />
            ) : tenantLogo ? (
              <div className="w-[60px] h-[60px] rounded-2xl bg-nodo-inset flex items-center justify-center p-2 shadow-sm">
                <img src={tenantLogo} alt={tenantName} className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="w-[60px] h-[60px] rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-md"
                style={{ background: `linear-gradient(135deg, ${tenantColor}, ${tenantColor}cc)` }}>
                {firstName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest mb-0.5" style={{ color: tenantColor }}>
              {tenantName}
            </p>
            <h1 className="text-2xl font-bold text-nodo-ink tracking-tight leading-tight">
              {greeting}, {firstName} {greetingEmoji}
            </h1>
            <p className="text-xs text-nodo-sub mt-0.5 capitalize">{dateStr}</p>
          </div>
        </div>

        {/* ── APPS — iconos flotando en canvas, estilo iOS ── */}
        {moduleCards.length > 0 ? (
          <div>
            <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-widest mb-5">
              Aplicaciones
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-x-2 gap-y-7">
              {moduleCards.map((m: any) => {
                const { gradient, icon: Icon } = getModuleCfg(m.code);
                const route = m.frontend_route ?? m.code.toLowerCase();
                return (
                  <button key={m.code} onClick={() => setActiveTab(route)}
                    className="flex flex-col items-center gap-2 group">
                    <div className={`w-[62px] h-[62px] rounded-[18px] bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg shadow-black/10 group-active:scale-[0.87] transition-transform duration-150`}>
                      <Icon size={28} className="text-white drop-shadow-sm" strokeWidth={1.5} />
                    </div>
                    <span className="text-[11px] font-medium text-nodo-sub text-center leading-tight line-clamp-2 w-[70px]">
                      {m.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${tenantColor}15`, color: tenantColor }}>
              <Package size={28} strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-bold text-nodo-ink">Sin módulos asignados</p>
              <p className="text-xs text-nodo-sub mt-0.5">Contacta a tu administrador para habilitar aplicaciones.</p>
            </div>
          </div>
        )}

        {/* ── ADMINISTRACIÓN — iOS Settings grouped list ── */}
        {isTenantAdmin && (
          <div>
            <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-widest mb-3">
              Administración
            </p>
            <div className="bg-nodo-card rounded-3xl border border-nodo-line overflow-hidden divide-y divide-nodo-line">
              {[
                { id: 'mgmt_employees', label: 'Empleados',     desc: 'Gestionar equipo',   icon: Briefcase, color: 'from-blue-500 to-blue-600'    },
                { id: 'mgmt_team',      label: 'Invitaciones',  desc: 'Invitar miembros',   icon: Send,      color: 'from-violet-500 to-purple-600' },
                { id: 'mgmt_config',    label: 'Configuración', desc: 'Ajustes de empresa', icon: Settings,  color: 'from-slate-500 to-slate-600'   },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.id} onClick={() => setActiveTab(item.id)}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-nodo-inset active:bg-nodo-raised transition-colors text-left">
                    <div className={`w-10 h-10 rounded-[13px] bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0`}>
                      <Icon size={18} className="text-white" strokeWidth={1.8} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-nodo-ink">{item.label}</p>
                      <p className="text-xs text-nodo-sub mt-0.5">{item.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-nodo-dim shrink-0" />
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
  const activeModule = activeModules.find(
    (m) => m.code?.toLowerCase() === activeTab || m.frontend_route === activeTab
  );
  const AppComponent = activeModule ? resolveApp(activeModule.frontend_route) : null;

  if (AppComponent) {
    return (
      <div className="space-y-6">
        <Suspense fallback={
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" />
          </div>
        }>
          <AppComponent tenantName={tenantName} />
        </Suspense>
      </div>
    );
  }

  // ── MODULE PLACEHOLDER ──
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4 px-6">
      <div className="w-16 h-16 rounded-2xl bg-nodo-inset flex items-center justify-center text-nodo-dim">
        <Package size={32} />
      </div>
      <h2 className="text-xl font-bold text-nodo-ink">Módulo: {activeTab.toUpperCase()}</h2>
      <p className="text-nodo-sub text-sm max-w-md">La interfaz de este módulo estará disponible próximamente.</p>
      <button onClick={() => setActiveTab(isSuperAdmin ? 'admin_home' : 'home')}
        className="mt-4 px-6 py-3 bg-nodo-ink text-nodo-canvas font-bold text-sm rounded-xl hover:opacity-90 transition-all active:scale-[0.97]">
        Volver al Inicio
      </button>
    </div>
  );
}

// ── TENANT EMPLOYEE MANAGER ──
function TenantEmployeeManager({ activeModules }: { activeModules: Array<{ id: string; name: string }> }) {
  const toast = useToast();
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
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, module_ids: newModules } : u));
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Error al actualizar módulos');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-black text-nodo-ink leading-tight flex items-center gap-3">
          <Briefcase className="text-blue-500 w-7 h-7" /> Empleados
        </h1>
        <p className="text-nodo-sub text-sm font-medium mt-0.5">Gestiona los accesos a módulos de tu equipo.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Spinner size="lg" />
        </div>
      ) : users.length === 0 ? (
        <EmptyState icon={<Users className="w-6 h-6" />} title="No hay empleados registrados." />
      ) : (
        <div className="space-y-4">
          {users.map((u) => (
            <div key={u.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 lg:p-6 bg-nodo-card rounded-3xl border border-nodo-line shadow-sm hover:border-nodo-line-s transition-all gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black ${u.is_active ? 'bg-[#69E7A8]/10 text-[#69E7A8]' : 'bg-nodo-inset text-nodo-sub'}`}>
                  {u.email.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-base font-bold text-nodo-ink">{u.email}</p>
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
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-nodo-inset text-nodo-sub border border-nodo-line uppercase tracking-wider">
                        Empleado
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {activeModules.map(mod => {
                  const hasAccess = u.member_type !== 'employee' || u.module_ids.includes(mod.id);
                  const isLocked = u.member_type !== 'employee';
                  return (
                    <button
                      key={mod.id}
                      disabled={isLocked}
                      onClick={() => handleToggleModule(u.id, mod.id, u.module_ids)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-bold transition-all ${
                        hasAccess
                          ? 'bg-nodo-ink text-nodo-canvas border-nodo-ink'
                          : 'bg-nodo-card text-nodo-dim border-nodo-line hover:border-nodo-line-s hover:text-nodo-sub'
                      } ${isLocked ? 'opacity-70 cursor-not-allowed' : 'active:scale-95 cursor-pointer'}`}
                    >
                      <div className={`w-2 h-2 rounded-full ${hasAccess ? 'bg-[#69E7A8]' : 'bg-nodo-dim'}`} />
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
  const toast = useToast();
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/config/');
      setConfigs(data);
    } catch {
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
      toast.error(err.response?.data?.detail || 'Error al guardar');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-black text-nodo-ink leading-tight flex items-center gap-3">
          <SlidersHorizontal className="text-cyan-500 w-7 h-7" /> Configuración de Plataforma
        </h1>
        <p className="text-nodo-sub text-sm font-medium mt-0.5">Parámetros globales del sistema.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Spinner size="lg" />
        </div>
      ) : configs.length === 0 ? (
        <EmptyState icon={<SlidersHorizontal className="w-6 h-6" />} title="No hay configuraciones disponibles." />
      ) : (
        <div className="space-y-3">
          {configs.map((cfg: any) => (
            <div key={cfg.key} className="p-5 bg-nodo-card rounded-2xl border border-nodo-line shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-nodo-ink">{cfg.key.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</p>
                  <p className="text-xs text-nodo-sub mt-0.5">{cfg.description}</p>
                </div>
                {editingKey === cfg.key ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-9 px-3 w-24 rounded-lg border-2 border-nodo-ink bg-nodo-inset text-sm font-bold text-center text-nodo-ink outline-none"
                      autoFocus
                    />
                    <button onClick={() => handleSave(cfg.key)} className="h-9 px-3 bg-[#69E7A8] text-[#111111] font-bold text-xs rounded-lg hover:opacity-90 transition-all">
                      Guardar
                    </button>
                    <button onClick={() => setEditingKey(null)} className="h-9 px-3 bg-nodo-inset text-nodo-sub font-bold text-xs rounded-lg hover:bg-nodo-raised transition-all">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingKey(cfg.key); setEditValue(cfg.value); }}
                    className="shrink-0 h-9 px-4 bg-nodo-inset border border-nodo-line text-sm font-bold text-nodo-ink rounded-lg hover:bg-nodo-raised transition-all"
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
