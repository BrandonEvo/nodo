import { Home, BarChart3, Briefcase, User } from 'lucide-react';

export type TabId = string;

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
}

export function BottomNav({ activeTab, onTabChange, isSuperAdmin, isTenantAdmin }: BottomNavProps) {
  const showManagement = isSuperAdmin || isTenantAdmin;

  // Determine which "home" tab corresponds to the user's role
  const homeTab = isSuperAdmin ? 'admin_home' : 'home';
  const managementTab = isSuperAdmin ? 'admin_tenants' : 'mgmt_employees';

  // Define which tabs map to the "home" group, "metrics" group, etc.
  const isHomeActive = activeTab === homeTab
    || activeTab === 'admin_home'
    || activeTab === 'home';

  const isMetricsActive = activeTab === 'metrics';

  const isManagementActive = [
    'admin_tenants', 'admin_users', 'admin_roles',
    'admin_modules', 'admin_subscriptions',
    'mgmt_employees', 'mgmt_config',
  ].includes(activeTab) && !isHomeActive;

  const isProfileActive = activeTab === 'profile';

  const tabs = [
    {
      id: homeTab,
      label: 'Inicio',
      icon: Home,
      active: isHomeActive,
      visible: true,
    },
    {
      id: 'metrics',
      label: 'Métricas',
      icon: BarChart3,
      active: isMetricsActive,
      visible: true,
    },
    {
      id: managementTab,
      label: 'Gestión',
      icon: Briefcase,
      active: isManagementActive,
      visible: showManagement,
    },
    {
      id: 'profile',
      label: 'Perfil',
      icon: User,
      active: isProfileActive,
      visible: true,
    },
  ];

  const visibleTabs = tabs.filter((t) => t.visible);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
      role="navigation"
      aria-label="Navegación principal"
    >
      {/* Glass background */}
      <div className="bg-white/80 backdrop-blur-2xl border-t border-gray-200/60 shadow-[0_-4px_30px_rgba(0,0,0,0.04)]">
        <div
          className="flex items-center justify-around px-2 pt-2 pb-safe"
          style={{ paddingBottom: `max(0.5rem, var(--safe-bottom))` }}
        >
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                id={`bottom-nav-${tab.id}`}
                onClick={() => onTabChange(tab.id)}
                className={`
                  flex flex-col items-center justify-center gap-0.5 
                  min-w-[64px] py-2 px-3 rounded-2xl
                  transition-all duration-200 active:scale-95
                  ${tab.active
                    ? 'bg-[#111111] text-white shadow-lg shadow-black/20'
                    : 'text-gray-400 hover:text-gray-600'
                  }
                `}
                aria-label={tab.label}
                aria-current={tab.active ? 'page' : undefined}
              >
                <Icon
                  className={`w-5 h-5 transition-transform duration-200 ${tab.active ? 'scale-110' : ''}`}
                  strokeWidth={tab.active ? 2.5 : 2}
                />
                <span className={`text-[10px] font-bold tracking-wide ${tab.active ? 'text-white' : ''}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
