import { useState } from 'react';
import {
  Home, BarChart3, Briefcase, User, LayoutGrid, X,
  Warehouse, ChefHat, Store, Lock, BookOpen, ShoppingCart,
  DollarSign, Package,
} from 'lucide-react';
import { resolveApp } from '@/apps';

export type TabId = string;

interface Module {
  id: string;
  name: string;
  code: string;
  frontend_route?: string | null;
  icon?: string | null;
}

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  activeModules?: Module[];
}

const MODULE_GRADIENTS: Record<string, string> = {
  bodega:           'from-blue-400 to-blue-600',
  cocina:           'from-orange-400 to-rose-500',
  recetas:          'from-violet-500 to-purple-600',
  cierre:           'from-slate-500 to-slate-700',
  mostrador:        'from-cyan-400 to-teal-500',
  gastos:           'from-amber-500 to-yellow-600',
  reportes:         'from-emerald-500 to-teal-600',
  personal_shopper: 'from-pink-500 to-rose-600',
};

const MODULE_ICONS: Record<string, React.ElementType> = {
  bodega:    Warehouse,
  cocina:    ChefHat,
  mostrador: Store,
  cierre:    Lock,
  recetas:   BookOpen,
  gastos:    DollarSign,
  reportes:  BarChart3,
  pos:       ShoppingCart,
};

function getModuleGradient(code: string) {
  return MODULE_GRADIENTS[code.toLowerCase()] ?? 'from-gray-400 to-gray-500';
}

function getModuleIcon(code: string): React.ElementType {
  return MODULE_ICONS[code.toLowerCase()] ?? Package;
}

export function BottomNav({
  activeTab, onTabChange, isSuperAdmin, isTenantAdmin, activeModules = [],
}: BottomNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isEmployee    = !isSuperAdmin && !isTenantAdmin;
  const showMgmt      = isSuperAdmin || isTenantAdmin;
  const hasModules    = activeModules.length > 0;
  const homeTab       = isSuperAdmin ? 'admin_home' : 'home';
  const managementTab = isSuperAdmin ? 'admin_tenants' : 'mgmt_employees';

  const isHomeActive = activeTab === homeTab || activeTab === 'admin_home' || activeTab === 'home';
  const isMetricsActive = activeTab === 'metrics';
  const isManagementActive = [
    'admin_tenants', 'admin_users', 'admin_roles',
    'admin_modules', 'admin_subscriptions', 'admin_platform_config',
    'mgmt_employees', 'mgmt_team', 'mgmt_config',
  ].includes(activeTab) && !isHomeActive;
  const isProfileActive = activeTab === 'profile';
  const isModuleActive = hasModules && activeModules.some(
    m => m.frontend_route === activeTab || m.code.toLowerCase() === activeTab
  );

  const tabs = [
    { id: homeTab,           label: 'Inicio',   icon: Home,       active: isHomeActive,       visible: true },
    { id: 'metrics',         label: 'Métricas', icon: BarChart3,  active: isMetricsActive,    visible: isSuperAdmin || isTenantAdmin },
    { id: managementTab,     label: 'Gestión',  icon: Briefcase,  active: isManagementActive, visible: showMgmt },
    { id: '__modules_drawer__', label: 'Apps',  icon: LayoutGrid, active: isModuleActive || drawerOpen, visible: isEmployee && hasModules },
    { id: 'profile',         label: 'Perfil',   icon: User,       active: isProfileActive,    visible: true },
  ].filter(t => t.visible);

  const handleTabClick = (id: TabId) => {
    if (id === '__modules_drawer__') {
      setDrawerOpen(prev => !prev);
    } else {
      setDrawerOpen(false);
      onTabChange(id);
    }
  };

  return (
    <>
      {/* ── Modules drawer ── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

          <div
            className="absolute left-0 right-0 bottom-[calc(56px+env(safe-area-inset-bottom,0px))] bg-nodo-card border-t border-nodo-line rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom-2 duration-250"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-8 h-1 rounded-full bg-nodo-line-s" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3">
              <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-widest">
                Mis Aplicaciones
              </p>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-7 h-7 rounded-full bg-nodo-inset flex items-center justify-center text-nodo-dim active:scale-90 transition-transform"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Module grid */}
            <div className="grid grid-cols-4 gap-3 px-5 pb-6 pt-1">
              {activeModules.map(mod => {
                const AppComponent = resolveApp(mod.frontend_route);
                const isActive = mod.frontend_route === activeTab || mod.code.toLowerCase() === activeTab;
                const gradient = getModuleGradient(mod.code);
                const Icon = getModuleIcon(mod.code);

                return (
                  <button
                    key={mod.id}
                    onClick={() => { setDrawerOpen(false); onTabChange(mod.frontend_route ?? mod.code.toLowerCase()); }}
                    disabled={!AppComponent}
                    className="flex flex-col items-center gap-2 disabled:opacity-40 active:scale-90 transition-transform duration-150"
                  >
                    <div className={`w-[58px] h-[58px] rounded-[16px] bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg ${isActive ? 'ring-2 ring-white ring-offset-2 ring-offset-nodo-card' : ''}`}>
                      {mod.icon
                        ? <span className="text-2xl">{mod.icon}</span>
                        : <Icon size={26} className="text-white" strokeWidth={1.5} />
                      }
                    </div>
                    <span className={`text-[10px] font-semibold text-center leading-tight line-clamp-2 w-[64px] ${isActive ? 'text-nodo-ink' : 'text-nodo-sub'}`}>
                      {mod.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab bar ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
        aria-label="Navegación principal"
      >
        {/* Frosted glass bar */}
        <div className="bg-nodo-card/80 backdrop-blur-2xl border-t border-nodo-line">
          <div
            className="flex items-center justify-around px-1"
            style={{ paddingTop: '8px', paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))' }}
          >
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  aria-label={tab.label}
                  aria-current={tab.active ? 'page' : undefined}
                  className="flex flex-col items-center gap-[3px] min-w-[56px] px-2 relative active:scale-90 transition-transform duration-150"
                >
                  {/* Active dot */}
                  <span className={`absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 w-1 h-1 rounded-full bg-nodo-accent transition-opacity duration-200 ${tab.active ? 'opacity-100' : 'opacity-0'}`} />

                  <Icon
                    className={`w-[22px] h-[22px] transition-colors duration-200 ${tab.active ? 'text-nodo-accent' : 'text-nodo-dim'}`}
                    strokeWidth={tab.active ? 2.3 : 1.8}
                  />
                  <span className={`text-[10px] font-semibold transition-colors duration-200 ${tab.active ? 'text-nodo-accent' : 'text-nodo-dim'}`}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
