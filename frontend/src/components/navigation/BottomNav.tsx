import { useState } from 'react';
import { Home, BarChart3, Briefcase, User, LayoutGrid, X } from 'lucide-react';
import { resolveApp } from '@/apps';

export type TabId = string;

interface Module {
  id: string;
  name: string;
  code: string;
  frontend_route?: string | null;
}

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  activeModules?: Module[];
}

const MODULE_COLORS: Record<string, string> = {
  bodega: 'bg-blue-500/10 text-blue-600',
  cocina: 'bg-orange-500/10 text-orange-600',
  recetas: 'bg-purple-500/10 text-purple-600',
  cierre: 'bg-rose-500/10 text-rose-600',
  mostrador: 'bg-cyan-500/10 text-cyan-600',
  gastos: 'bg-amber-500/10 text-amber-600',
  reportes: 'bg-emerald-500/10 text-emerald-600',
};

function getModuleColor(code: string): string {
  return MODULE_COLORS[code.toLowerCase()] ?? 'bg-gray-100 text-gray-500';
}

export function BottomNav({ activeTab, onTabChange, isSuperAdmin, isTenantAdmin, activeModules = [] }: BottomNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const showManagement = isSuperAdmin || isTenantAdmin;
  const isEmployee = !isSuperAdmin && !isTenantAdmin;
  const hasModules = activeModules.length > 0;

  const homeTab = isSuperAdmin ? 'admin_home' : 'home';
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
    (m) => m.frontend_route === activeTab || m.code.toLowerCase() === activeTab
  );

  const tabs = [
    { id: homeTab, label: 'Inicio', icon: Home, active: isHomeActive, visible: true },
    { id: 'metrics', label: 'Métricas', icon: BarChart3, active: isMetricsActive, visible: isSuperAdmin || isTenantAdmin },
    { id: managementTab, label: 'Gestión', icon: Briefcase, active: isManagementActive, visible: showManagement },
    { id: '__modules_drawer__', label: 'Módulos', icon: LayoutGrid, active: isModuleActive || drawerOpen, visible: isEmployee && hasModules },
    { id: 'profile', label: 'Perfil', icon: User, active: isProfileActive, visible: true },
  ];

  const visibleTabs = tabs.filter((t) => t.visible);

  const handleTabClick = (id: TabId) => {
    if (id === '__modules_drawer__') {
      setDrawerOpen((prev) => !prev);
    } else {
      setDrawerOpen(false);
      onTabChange(id);
    }
  };

  const handleModuleSelect = (mod: Module) => {
    setDrawerOpen(false);
    onTabChange(mod.frontend_route ?? mod.code.toLowerCase());
  };

  return (
    <>
      {/* Modules bottom drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div
            className="absolute bottom-[calc(64px+env(safe-area-inset-bottom,0px))] left-0 right-0 bg-white dark:bg-[#2C2C2E] rounded-t-3xl shadow-2xl border-t border-gray-100 dark:border-white/5 p-5 animate-in slide-in-from-bottom-4 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-[#111111] dark:text-white tracking-tight">Mis Módulos</h3>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {activeModules.map((mod) => {
                const AppComponent = resolveApp(mod.frontend_route);
                const isCurrentlyActive = mod.frontend_route === activeTab || mod.code.toLowerCase() === activeTab;
                return (
                  <button
                    key={mod.id}
                    onClick={() => handleModuleSelect(mod)}
                    disabled={!AppComponent}
                    className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all active:scale-95 disabled:opacity-40 ${
                      isCurrentlyActive
                        ? 'bg-nodo-accent text-white shadow-lg'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black ${
                      isCurrentlyActive ? 'bg-white/20 text-white' : getModuleColor(mod.code)
                    }`}>
                      {mod.code.slice(0, 2).toUpperCase()}
                    </div>
                    <span className={`text-[10px] font-bold text-center leading-tight ${
                      isCurrentlyActive ? 'text-white' : 'text-[#111111]'
                    }`}>
                      {mod.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
        role="navigation"
        aria-label="Navegación principal"
      >
        <div className="bg-white/80 dark:bg-[#1C1C1E]/90 backdrop-blur-2xl border-t border-gray-200/60 dark:border-white/5 shadow-[0_-4px_30px_rgba(0,0,0,0.04)]">
          <div
            className="flex items-center justify-around px-2 pt-2"
            style={{ paddingBottom: `max(0.5rem, var(--safe-bottom))` }}
          >
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  id={`bottom-nav-${tab.id}`}
                  onClick={() => handleTabClick(tab.id)}
                  className={`
                    flex flex-col items-center justify-center gap-0.5
                    min-w-[64px] py-2 px-3 rounded-2xl
                    transition-all duration-200 active:scale-95
                    ${tab.active
                      ? 'bg-nodo-accent text-white shadow-lg shadow-black/20'
                      : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                    }
                  `}
                  aria-label={tab.label}
                  aria-current={tab.active ? 'page' : undefined}
                >
                  <Icon
                    className={`w-5 h-5 transition-transform duration-200 ${tab.active ? 'scale-110' : ''}`}
                    strokeWidth={tab.active ? 2.5 : 2}
                  />
                  <span className={`text-[10px] font-bold tracking-wide ${tab.active ? 'text-white/90' : ''}`}>
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
