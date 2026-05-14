import { useState } from 'react';
import {
  Home, Shield, Building2, Users, Package,
  ShoppingCart, Settings, LogOut, ChevronLeft,
  ChevronRight, BarChart3, Briefcase, User, Send,
  SlidersHorizontal, Warehouse, ChefHat, Store, Lock, BookOpen,
} from 'lucide-react';

export type TabId = string;

interface NavItem {
  id: TabId;
  icon: React.ElementType;
  label: string;
  section?: string;
}

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  activeModules: any[];
  onLogout: () => void;
  tenantColor?: string;
  tenantLogo?: string | null;
  tenantName?: string;
}

export function Sidebar({
  activeTab,
  onTabChange,
  isSuperAdmin,
  isTenantAdmin,
  activeModules,
  onLogout,
  tenantColor = '#69E7A8',
  tenantLogo = null,
  tenantName = 'NODO',
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Use default NODO green for superadmin, tenant color for others
  const accentColor = isSuperAdmin ? '#69E7A8' : tenantColor;

  // ── Build navigation based on role ──
  const buildNavItems = (): NavItem[] => {
    if (isSuperAdmin) {
      return [
        { id: 'admin_home', icon: Shield, label: 'Panel Maestro', section: 'Principal' },
        { id: 'metrics', icon: BarChart3, label: 'Métricas', section: 'Principal' },
        { id: 'admin_tenants', icon: Building2, label: 'Empresas', section: 'Gestión' },
        { id: 'admin_users', icon: Users, label: 'Usuarios', section: 'Gestión' },
        { id: 'admin_roles', icon: Shield, label: 'Roles', section: 'Gestión' },
        { id: 'admin_modules', icon: Package, label: 'Módulos', section: 'Gestión' },
        { id: 'admin_subscriptions', icon: ShoppingCart, label: 'Suscripciones', section: 'Gestión' },
        { id: 'admin_platform_config', icon: SlidersHorizontal, label: 'Configuración', section: 'Gestión' },
      ];
    }

    const items: NavItem[] = [
      { id: 'home', icon: Home, label: 'Inicio', section: 'Principal' },
    ];

    if (isTenantAdmin) {
      items.push({ id: 'metrics', icon: BarChart3, label: 'Métricas', section: 'Principal' });
    }

    // Module entries for tenant users
    activeModules.forEach((m: any) => {
      let icon = Package;
      if (m.code === 'POS') icon = ShoppingCart;
      else if (m.code === 'INVENTORY') icon = Package;
      else if (m.code === 'HR') icon = Users;
      else if (m.code === 'BODEGA') icon = Warehouse;
      else if (m.code === 'COCINA') icon = ChefHat;
      else if (m.code === 'MOSTRADOR') icon = Store;
      else if (m.code === 'CIERRE') icon = Lock;
      else if (m.code === 'RECETAS') icon = BookOpen;

      items.push({
        id: m.code.toLowerCase(),
        icon,
        label: m.name,
        section: 'Aplicaciones',
      });
    });

    // Admin-only management items
    if (isTenantAdmin) {
      items.push(
        { id: 'mgmt_employees', icon: Briefcase, label: 'Empleados', section: 'Gestión' },
        { id: 'mgmt_team', icon: Send, label: 'Invitaciones', section: 'Gestión' },
        { id: 'mgmt_config', icon: Settings, label: 'Configuración', section: 'Gestión' },
      );
    }

    return items;
  };

  const navItems = buildNavItems();

  // Group items by section
  const sections = navItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    const section = item.section || 'Otros';
    if (!acc[section]) acc[section] = [];
    acc[section].push(item);
    return acc;
  }, {});

  return (
    <aside
      className={`
        hidden lg:flex flex-col fixed top-0 left-0 h-screen z-40
        bg-[#111111] text-white
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-[80px]' : 'w-[272px]'}
      `}
    >
      {/* ── Logo + Collapse Toggle ── */}
      <div className={`flex items-center h-[72px] px-6 shrink-0 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            {tenantLogo && !isSuperAdmin ? (
              <img src={tenantLogo} alt={tenantName} className="w-9 h-9 rounded-xl object-contain bg-white/10 p-0.5" />
            ) : (
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: accentColor }}>
                <span className="text-[#111111] font-black text-lg italic">{isSuperAdmin ? 'N' : tenantName.charAt(0)}</span>
              </div>
            )}
            <span className="text-lg font-black tracking-tighter">{isSuperAdmin ? 'NODO' : tenantName}</span>
          </div>
        )}
        {collapsed && (
          <>
            {tenantLogo && !isSuperAdmin ? (
              <img src={tenantLogo} alt={tenantName} className="w-9 h-9 rounded-xl object-contain bg-white/10 p-0.5" />
            ) : (
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: accentColor }}>
                <span className="text-[#111111] font-black text-lg italic">{isSuperAdmin ? 'N' : tenantName.charAt(0)}</span>
              </div>
            )}
          </>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`
            p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10
            transition-all duration-200
            ${collapsed ? 'absolute -right-3 top-7 bg-[#111111] border border-gray-800 shadow-lg rounded-full p-1' : ''}
          `}
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Navigation Items ── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden dark-scrollbar px-3 py-2 space-y-5">
        {Object.entries(sections).map(([sectionName, items]) => (
          <div key={sectionName}>
            {!collapsed && (
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] px-3 mb-2">
                {sectionName}
              </p>
            )}
            {collapsed && <div className="w-8 h-px bg-gray-800 mx-auto mb-2" />}

            <div className="space-y-1">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    id={`sidebar-${item.id}`}
                    onClick={() => onTabChange(item.id)}
                    className={`
                      w-full flex items-center gap-3 rounded-xl
                      transition-all duration-200 group relative
                      ${collapsed ? 'justify-center px-2 py-3' : 'px-3 py-2.5'}
                      ${isActive
                        ? 'bg-white text-[#111111] shadow-lg shadow-white/10'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }
                    `}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.8px]'}`} />
                    {!collapsed && (
                      <span className={`text-sm truncate ${isActive ? 'font-bold' : 'font-medium'}`}>
                        {item.label}
                      </span>
                    )}

                    {/* Tooltip for collapsed state */}
                    {collapsed && (
                      <span className="
                        absolute left-full ml-3 px-3 py-2 rounded-lg
                        bg-[#111111] border border-gray-800 text-white text-xs font-bold
                        opacity-0 group-hover:opacity-100 pointer-events-none
                        transition-opacity duration-150 whitespace-nowrap z-50
                        shadow-xl
                      ">
                        {item.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Bottom Actions ── */}
      <div className={`shrink-0 border-t border-gray-800/60 px-3 py-4 space-y-1`}>
        <button
          onClick={() => onTabChange('profile')}
          className={`
            w-full flex items-center gap-3 rounded-xl transition-all duration-200
            ${collapsed ? 'justify-center px-2 py-3' : 'px-3 py-2.5'}
            ${activeTab === 'profile'
              ? 'bg-white text-[#111111]'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
            }
          `}
          title={collapsed ? 'Mi Perfil' : undefined}
        >
          <User className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Mi Perfil</span>}
        </button>

        <button
          onClick={onLogout}
          className={`
            w-full flex items-center gap-3 rounded-xl transition-all duration-200
            text-gray-500 hover:text-red-400 hover:bg-red-500/10
            ${collapsed ? 'justify-center px-2 py-3' : 'px-3 py-2.5'}
          `}
          title={collapsed ? 'Cerrar sesión' : undefined}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}

// Export the width constants for use by AppShell layout
export const SIDEBAR_WIDTH = 272;
export const SIDEBAR_COLLAPSED_WIDTH = 80;

