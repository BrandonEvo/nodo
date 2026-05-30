import {
  Building2, Users, ShoppingCart, Package,
  BarChart3, DollarSign,
  LogOut, User, Moon, ChevronRight, Briefcase,
  Settings, Send, SlidersHorizontal, Shield,
  Warehouse, ChefHat, Store, Lock, BookOpen,
  Zap, Activity, RefreshCw,
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

// ── ADMIN HOME DASHBOARD ──
function AdminHomeDashboard({ displayName, setActiveTab }: {
  displayName: string;
  setActiveTab: (tab: string) => void;
}) {
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Buenas noches' : hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
  const firstName = displayName.split(' ')[0] || displayName.split('@')[0];
  const dateStr = new Date().toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' });

  const [counts, setCounts] = useState<{ tenants: number | null; modules: number | null; active: number | null }>({
    tenants: null, modules: null, active: null,
  });

  type HealthStatus = { status: 'ok' | 'error' | null; database: string | null; environment: string | null; ms: number | null; checkedAt: Date | null };
  const [health, setHealth] = useState<HealthStatus>({ status: null, database: null, environment: null, ms: null, checkedAt: null });
  const [healthLoading, setHealthLoading] = useState(false);

  const fetchHealth = async () => {
    setHealthLoading(true);
    const t0 = performance.now();
    try {
      const { data } = await api.get('/health');
      setHealth({ status: data.status === 'ok' ? 'ok' : 'error', database: data.database, environment: data.environment, ms: Math.round(performance.now() - t0), checkedAt: new Date() });
    } catch {
      setHealth({ status: 'error', database: null, environment: null, ms: null, checkedAt: new Date() });
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    Promise.allSettled([
      api.get('/api/tenants/'),
      api.get('/api/admin/modules/'),
    ]).then(([tr, mr]) => {
      setCounts({
        tenants: tr.status === 'fulfilled' ? tr.value.data.length : null,
        modules: mr.status === 'fulfilled' ? mr.value.data.length : null,
        active:  mr.status === 'fulfilled' ? mr.value.data.filter((m: any) => m.is_active !== false).length : null,
      });
    });
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, []);

  const fmt = (n: number | null) => n === null ? '—' : String(n);

  const navItems = [
    { id: 'admin_tenants',         label: 'Empresas',  icon: Building2,         bg: '#69E7A8' },
    { id: 'admin_users',           label: 'Usuarios',  icon: Users,             bg: '#60a5fa' },
    { id: 'admin_modules',         label: 'Módulos',   icon: Package,           bg: '#fb923c' },
    { id: 'admin_subscriptions',   label: 'Planes',    icon: ShoppingCart,      bg: '#a78bfa' },
    { id: 'admin_roles',           label: 'Roles',     icon: Shield,            bg: '#f87171' },
    { id: 'admin_platform_config', label: 'Config',    icon: SlidersHorizontal, bg: '#22d3ee' },
  ];

  const healthItems = [
    { label: 'API',           ok: health.status === 'ok',          loading: health.status === null,      value: health.status === null ? '—' : health.status === 'ok' ? `${health.ms}ms` : 'Error'            },
    { label: 'Base de datos', ok: health.database === 'connected',  loading: health.database === null,    value: health.database === null ? '—' : health.database === 'connected' ? 'Conectada' : 'Error'      },
    { label: 'Entorno',       ok: true,                             loading: health.environment === null, value: health.environment ?? '—'                                                                      },
  ];

  const kpiCards = [
    { label: 'Módulos',     value: fmt(counts.modules), icon: Package, pastel: '#fb923c1a', accent: '#fb923c', tab: 'admin_modules'       },
    { label: 'Habilitados', value: fmt(counts.active),  icon: Zap,     pastel: '#a78bfa1a', accent: '#a78bfa', tab: 'admin_subscriptions' },
    { label: 'Usuarios',    value: '—',                 icon: Users,   pastel: '#60a5fa1a', accent: '#60a5fa', tab: 'admin_users'         },
  ];

  return (
    <div className="flex flex-col gap-5 pb-8 w-full max-w-2xl lg:max-w-none">

      {/* ── Header ── */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="text-[11px] font-semibold text-nodo-dim leading-none mb-1 tracking-wide">{greeting},</p>
          <h1 className="text-[30px] font-black text-nodo-ink leading-tight tracking-tight">{firstName}</h1>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-medium text-nodo-sub capitalize hidden sm:block">{dateStr}</p>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-nodo-ink text-sm font-black shadow-sm shrink-0"
            style={{ background: 'linear-gradient(135deg, #69E7A8, #2dbb77)' }}>
            {firstName.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      {/* ── Fila superior: 3 columnas (20% | 30% | 50%) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr_2.5fr] gap-4">

        {/* Col 1 — Plataforma hero */}
        <button
          onClick={() => setActiveTab('admin_tenants')}
          className="relative rounded-[28px] overflow-hidden p-6 pb-7 text-left active:scale-[0.985] transition-transform"
          style={{ background: 'linear-gradient(140deg, #0a0f1e 0%, #0d1f2f 55%, #0a2b1a 100%)' }}
        >
          <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, #69E7A8 0%, transparent 68%)', opacity: 0.18 }} />
          <div className="absolute -left-6 bottom-0 w-44 h-44 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)', opacity: 0.07 }} />

          <p className="relative text-[9px] font-bold uppercase tracking-[0.20em] mb-5" style={{ color: '#69E7A8' }}>
            Plataforma · NODO
          </p>
          <p className="relative text-[68px] font-black leading-none text-white tabular-nums tracking-tighter">
            {fmt(counts.tenants)}
          </p>
          <p className="relative text-white/40 text-sm font-medium mt-2 mb-7">empresas activas</p>

          <div className="relative w-full h-px bg-white/[0.08] mb-5" />

          <div className="relative flex items-center gap-0">
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-1">Módulos</p>
              <p className="text-white font-black text-xl tabular-nums leading-none">{fmt(counts.modules)}</p>
            </div>
            <div className="w-px h-9 bg-white/10 mx-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: '#69E7A8aa' }}>Activos</p>
              <p className="font-black text-xl tabular-nums leading-none" style={{ color: '#69E7A8' }}>{fmt(counts.active)}</p>
            </div>
          </div>
        </button>

        {/* Col 2 — KPI: módulos, habilitados, usuarios */}
        <div className="grid grid-cols-3 lg:grid-cols-1 gap-3">
          {kpiCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.label}
                onClick={() => setActiveTab(card.tab)}
                className="flex flex-col gap-3 p-4 lg:p-5 rounded-[20px] text-left active:scale-[0.97] transition-transform lg:flex-1"
                style={{ backgroundColor: card.pastel }}
              >
                <div className="w-9 h-9 rounded-[11px] flex items-center justify-center" style={{ background: `${card.accent}22` }}>
                  <Icon size={16} style={{ color: card.accent }} strokeWidth={2} />
                </div>
                <div>
                  <p className="text-2xl font-black text-nodo-ink tabular-nums leading-none">{card.value}</p>
                  <p className="text-[10px] font-semibold text-nodo-sub mt-1 leading-tight">{card.label}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Col 3 — Acceso rápido */}
        <div className="bg-nodo-card border border-nodo-line rounded-[20px] p-5 flex flex-col">
          <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-4">Acceso rápido</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-3 gap-4 flex-1 content-center">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} onClick={() => setActiveTab(item.id)}
                  className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-[16px] flex items-center justify-center shadow-sm active:scale-90 transition-transform"
                    style={{ backgroundColor: item.bg }}>
                    <Icon size={20} className="text-white" strokeWidth={1.7} />
                  </div>
                  <span className="text-[10px] font-semibold text-center leading-tight" style={{ color: item.bg }}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* ── Fila inferior: 3 columnas iguales ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

        {/* 1 — Servidor */}
        <div className="bg-nodo-card border border-nodo-line rounded-[20px] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5">
              <Activity size={11} className="text-nodo-dim" />
              <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest">Servidor</p>
            </div>
            <div className="flex items-center gap-2">
              {health.checkedAt && (
                <p className="text-[9px] text-nodo-dim tabular-nums">
                  {health.checkedAt.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
              )}
              <button onClick={fetchHealth} disabled={healthLoading}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-nodo-raised transition-colors disabled:opacity-40">
                <RefreshCw size={11} className={`text-nodo-dim ${healthLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {healthItems.map((item) => (
              <div key={item.label} className="flex items-center gap-2.5 px-3 py-2.5 bg-nodo-inset rounded-xl">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.loading ? 'bg-nodo-dim animate-pulse' : item.ok ? 'bg-emerald-400' : 'bg-nodo-danger-tx'}`} />
                <p className="text-xs font-semibold text-nodo-sub flex-1">{item.label}</p>
                <p className={`text-xs font-black tabular-nums ${item.loading ? 'text-nodo-dim' : item.ok ? 'text-nodo-ink' : 'text-nodo-danger-tx'}`}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 2 — Próximo widget */}
        <div className="bg-nodo-card border border-nodo-line border-dashed rounded-[20px] p-5 flex flex-col items-center justify-center gap-2 min-h-[140px]">
          <BarChart3 size={24} className="text-nodo-dim" strokeWidth={1.5} />
          <p className="text-xs font-bold text-nodo-dim">Próximamente</p>
        </div>

        {/* 3 — Actividad reciente */}
        <div className="bg-nodo-card border border-nodo-line rounded-[20px] overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest">Actividad reciente</p>
            <button className="text-[10px] font-bold text-nodo-dim hover:text-nodo-ink transition-colors flex items-center gap-0.5">
              Ver todo <ChevronRight size={10} />
            </button>
          </div>
          <div className="divide-y divide-nodo-line">
            {[
              { icon: Building2, label: 'Nueva empresa registrada', color: '#69E7A8' },
              { icon: Users,     label: 'Usuario invitado',          color: '#60a5fa' },
              { icon: Package,   label: 'Módulo actualizado',        color: '#fb923c' },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0"
                    style={{ background: `${item.color}1a` }}>
                    <Icon size={14} style={{ color: item.color }} strokeWidth={2} />
                  </div>
                  <p className="text-xs font-semibold text-nodo-ink flex-1">{item.label}</p>
                  <span className="text-[10px] text-nodo-dim bg-nodo-inset px-2 py-0.5 rounded-full">Pronto</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
}

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

  // ── SUPER ADMIN HOME + METRICS (merged) ──
  if (activeTab === 'admin_home' || activeTab === 'metrics') {
    return (
      <div className="w-full">
        <AdminHomeDashboard displayName={displayName} setActiveTab={setActiveTab} />
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

    const MODULE_CONFIG: Record<string, { pasteBg: string; deepColor: string; icon: typeof Package }> = {
      BODEGA:           { pasteBg: '#DFF0FF', deepColor: '#3A8ADF', icon: Warehouse    },
      COCINA:           { pasteBg: '#FFE8D4', deepColor: '#D4733C', icon: ChefHat      },
      MOSTRADOR:        { pasteBg: '#D4F2E4', deepColor: '#1EA05E', icon: Store        },
      CIERRE:           { pasteBg: '#ECE4FF', deepColor: '#7B50DC', icon: Lock         },
      RECETAS:          { pasteBg: '#ECE4FF', deepColor: '#7B50DC', icon: BookOpen     },
      POS:              { pasteBg: '#D4F2E4', deepColor: '#1EA05E', icon: ShoppingCart },
      HR:               { pasteBg: '#DFF0FF', deepColor: '#3A8ADF', icon: Users        },
      INVENTORY:        { pasteBg: '#FFE8D4', deepColor: '#D4920C', icon: Package      },
      PERSONAL_SHOPPER: { pasteBg: '#FFE0E4', deepColor: '#E83A4F', icon: ShoppingCart },
      GASTOS:           { pasteBg: '#FFF0CC', deepColor: '#D4920C', icon: DollarSign   },
      REPORTES:         { pasteBg: '#D4F2E4', deepColor: '#1EA05E', icon: BarChart3    },
    };

    const getModuleCfg = (code: string) =>
      MODULE_CONFIG[code.toUpperCase()] ?? { pasteBg: '#F0F0F0', deepColor: '#94a3b8', icon: Package };

    // Single module — branded splash
    if (moduleCards.length === 1 && !isTenantAdmin) {
      const m = moduleCards[0];
      const { pasteBg, deepColor, icon: Icon } = getModuleCfg(m.code);
      return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6"
          style={{ fontFamily: 'Nunito, system-ui, sans-serif' }}>
          <div className="mb-8">
            {tenantLogo ? (
              <img src={tenantLogo} alt={tenantName} className="h-16 w-auto object-contain mx-auto mb-3" />
            ) : (
              <div className="w-16 h-16 rounded-[20px] mx-auto mb-3 flex items-center justify-center text-white text-2xl font-black shadow-lg"
                style={{ background: `linear-gradient(135deg, ${tenantColor}, ${tenantColor}cc)` }}>
                {tenantName.charAt(0)}
              </div>
            )}
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: tenantColor }}>{tenantName}</p>
          </div>
          <div className="mb-10">
            <h1 className="text-3xl font-black text-nodo-ink tracking-tight">
              {greeting}, {firstName} {greetingEmoji}
            </h1>
            <p className="text-sm text-nodo-sub mt-1 capitalize font-medium">{dateStr}</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => setActiveTab(m.frontend_route ?? m.code.toLowerCase())}
              className="w-[88px] h-[88px] rounded-[28px] flex items-center justify-center active:scale-90 transition-transform duration-150"
              style={{ backgroundColor: pasteBg, boxShadow: '0 6px 28px rgba(0,0,0,0.08)' }}
            >
              <Icon size={40} style={{ color: deepColor }} strokeWidth={1.8} />
            </button>
            <p className="text-sm font-bold text-nodo-ink mt-1">{m.name}</p>
            <p className="text-xs text-nodo-dim">Toca para abrir</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-7 max-w-2xl" style={{ fontFamily: 'Nunito, system-ui, sans-serif' }}>

        {/* ── GREETING — Google Health style card ── */}
        <div className="bg-nodo-card rounded-[24px] p-5 flex items-center gap-4"
          style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div className="shrink-0">
            {userPicture ? (
              <img src={userPicture} alt="Avatar"
                className="w-[52px] h-[52px] rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : tenantLogo ? (
              <div className="w-[52px] h-[52px] rounded-full bg-nodo-inset flex items-center justify-center p-2">
                <img src={tenantLogo} alt={tenantName} className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white text-xl font-black"
                style={{ background: `linear-gradient(135deg, ${tenantColor}, ${tenantColor}cc)` }}>
                {firstName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-0.5" style={{ color: tenantColor }}>
              {tenantName}
            </p>
            <h1 className="text-xl font-black text-nodo-ink leading-tight tracking-tight">
              {greeting}, {firstName.toUpperCase()} {greetingEmoji}
            </h1>
            <p className="text-xs text-nodo-sub mt-0.5 capitalize font-medium">{dateStr}</p>
          </div>
        </div>

        {/* ── APPS — MASA v2: pastel bg + deep color icon ── */}
        {moduleCards.length > 0 ? (
          <div>
            <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-[0.16em] mb-5">
              Aplicaciones
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-x-2 gap-y-6">
              {moduleCards.map((m: any) => {
                const { pasteBg, deepColor, icon: Icon } = getModuleCfg(m.code);
                const route = m.frontend_route ?? m.code.toLowerCase();
                return (
                  <button key={m.code} onClick={() => setActiveTab(route)}
                    className="flex flex-col items-center gap-2.5 group">
                    <div className="w-[64px] h-[64px] rounded-[22px] flex items-center justify-center group-active:scale-[0.87] transition-transform duration-150"
                      style={{ backgroundColor: pasteBg, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
                      <Icon size={28} style={{ color: deepColor }} strokeWidth={1.8} />
                    </div>
                    <span className="text-[11px] font-semibold text-nodo-sub text-center leading-tight line-clamp-2 w-[68px]">
                      {m.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="w-16 h-16 rounded-[22px] flex items-center justify-center"
              style={{ backgroundColor: `${tenantColor}18` }}>
              <Package size={28} strokeWidth={1.5} style={{ color: tenantColor }} />
            </div>
            <div>
              <p className="text-sm font-bold text-nodo-ink">Sin módulos asignados</p>
              <p className="text-xs text-nodo-sub mt-0.5">Contacta a tu administrador para habilitar aplicaciones.</p>
            </div>
          </div>
        )}

        {/* ── ADMINISTRACIÓN — MASA v2 pastel icon list ── */}
        {isTenantAdmin && (
          <div>
            <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-[0.16em] mb-3">
              Administración
            </p>
            <div className="bg-nodo-card rounded-[24px] overflow-hidden divide-y divide-nodo-line"
              style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              {[
                { id: 'mgmt_employees', label: 'Empleados',     desc: 'Gestionar equipo',   icon: Briefcase, pasteBg: '#DFF0FF', deepColor: '#3A8ADF' },
                { id: 'mgmt_team',      label: 'Invitaciones',  desc: 'Invitar miembros',   icon: Send,      pasteBg: '#ECE4FF', deepColor: '#7B50DC' },
                { id: 'mgmt_config',    label: 'Configuración', desc: 'Ajustes de empresa', icon: Settings,  pasteBg: '#F0F0F2', deepColor: '#64748b' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.id} onClick={() => setActiveTab(item.id)}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-nodo-inset active:bg-nodo-raised transition-colors text-left">
                    <div className="w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0"
                      style={{ backgroundColor: item.pasteBg }}>
                      <Icon size={18} style={{ color: item.deepColor }} strokeWidth={1.8} />
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
