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

  const accentColor = isSuperAdmin ? '#69E7A8' : tenantColor;

  const buildNavItems = (): NavItem[] => {
    if (isSuperAdmin) {
      return [
        { id: 'admin_home',          icon: Shield,           label: 'Panel Maestro',  section: 'Principal' },
        { id: 'metrics',             icon: BarChart3,        label: 'Métricas',        section: 'Principal' },
        { id: 'admin_tenants',       icon: Building2,        label: 'Empresas',        section: 'Gestión'   },
        { id: 'admin_users',         icon: Users,            label: 'Usuarios',        section: 'Gestión'   },
        { id: 'admin_roles',         icon: Shield,           label: 'Roles',           section: 'Gestión'   },
        { id: 'admin_modules',       icon: Package,          label: 'Módulos',         section: 'Gestión'   },
        { id: 'admin_subscriptions', icon: ShoppingCart,     label: 'Suscripciones',   section: 'Gestión'   },
        { id: 'admin_platform_config',icon: SlidersHorizontal,label: 'Configuración',  section: 'Gestión'   },
      ];
    }

    const items: NavItem[] = [
      { id: 'home', icon: Home, label: 'Inicio', section: 'Principal' },
    ];

    if (isTenantAdmin) {
      items.push({ id: 'metrics', icon: BarChart3, label: 'Métricas', section: 'Principal' });
    }

    activeModules.forEach((m: any) => {
      let icon = Package;
      if      (m.code === 'POS')              icon = ShoppingCart;
      else if (m.code === 'INVENTORY')        icon = Package;
      else if (m.code === 'HR')               icon = Users;
      else if (m.code === 'BODEGA')           icon = Warehouse;
      else if (m.code === 'COCINA')           icon = ChefHat;
      else if (m.code === 'MOSTRADOR')        icon = Store;
      else if (m.code === 'CIERRE')           icon = Lock;
      else if (m.code === 'RECETAS')          icon = BookOpen;
      items.push({ id: m.code.toLowerCase(), icon, label: m.name, section: 'Aplicaciones' });
    });

    if (isTenantAdmin) {
      items.push(
        { id: 'mgmt_employees', icon: Briefcase, label: 'Empleados',    section: 'Gestión' },
        { id: 'mgmt_team',      icon: Send,      label: 'Invitaciones', section: 'Gestión' },
        { id: 'mgmt_config',    icon: Settings,  label: 'Configuración',section: 'Gestión' },
      );
    }

    return items;
  };

  const navItems = buildNavItems();

  const sections = navItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    const s = item.section || 'Otros';
    if (!acc[s]) acc[s] = [];
    acc[s].push(item);
    return acc;
  }, {});

  return (
    <aside className={`hidden lg:flex flex-col fixed top-0 left-0 h-screen z-40 bg-[#111111] transition-all duration-300 ease-in-out ${collapsed ? 'w-[72px]' : 'w-[260px]'}`}>

      {/* ── Logo ── */}
      <div className={`flex items-center h-[68px] shrink-0 px-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <div className="flex items-center gap-3">
            {tenantLogo && !isSuperAdmin ? (
              <img src={tenantLogo} alt={tenantName} className="w-8 h-8 rounded-xl object-contain" />
            ) : (
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shadow-lg"
                style={{ backgroundColor: accentColor }}
              >
                <span className="text-[#111111] font-black text-base leading-none">
                  {isSuperAdmin ? 'N' : tenantName.charAt(0)}
                </span>
              </div>
            )}
            <span className="text-white font-black text-base tracking-tight">
              {isSuperAdmin ? 'NODO' : tenantName}
            </span>
          </div>
        )}

        {collapsed && (
          tenantLogo && !isSuperAdmin ? (
            <img src={tenantLogo} alt={tenantName} className="w-8 h-8 rounded-xl object-contain" />
          ) : (
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shadow-lg"
              style={{ backgroundColor: accentColor }}
            >
              <span className="text-[#111111] font-black text-base leading-none">
                {isSuperAdmin ? 'N' : tenantName.charAt(0)}
              </span>
            </div>
          )
        )}

        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Expand toggle (collapsed mode) ── */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="absolute -right-3 top-[26px] w-6 h-6 rounded-full bg-[#1e1e1e] border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:border-white/30 transition-all shadow-lg"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      )}

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 space-y-5">
        {Object.entries(sections).map(([sectionName, items]) => (
          <div key={sectionName}>

            {/* Section label */}
            {!collapsed ? (
              <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.18em] px-3 mb-1.5">
                {sectionName}
              </p>
            ) : (
              <div className="w-6 h-px bg-white/10 mx-auto mb-1.5" />
            )}

            <div className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    title={collapsed ? item.label : undefined}
                    className={`
                      relative w-full flex items-center rounded-xl transition-all duration-150 group
                      ${collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'}
                      ${isActive
                        ? 'bg-white/10 text-white'
                        : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                      }
                    `}
                  >
                    {/* Active indicator bar */}
                    {isActive && !collapsed && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full"
                        style={{ backgroundColor: accentColor }}
                      />
                    )}

                    {/* Icon container */}
                    <div className={`
                      shrink-0 flex items-center justify-center rounded-[10px] transition-all
                      ${isActive
                        ? 'w-8 h-8'
                        : 'w-8 h-8'
                      }
                    `}
                      style={isActive ? { backgroundColor: `${accentColor}22` } : undefined}
                    >
                      <Icon
                        className="w-[18px] h-[18px]"
                        strokeWidth={isActive ? 2.2 : 1.8}
                        style={isActive ? { color: accentColor } : undefined}
                      />
                    </div>

                    {!collapsed && (
                      <span className={`text-sm truncate ${isActive ? 'font-semibold text-white' : 'font-medium'}`}>
                        {item.label}
                      </span>
                    )}

                    {/* Tooltip en collapsed */}
                    {collapsed && (
                      <span className="absolute left-full ml-3 px-3 py-2 rounded-xl bg-[#1e1e1e] border border-white/10 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap z-50 shadow-2xl">
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

      {/* ── Bottom ── */}
      <div className="shrink-0 px-2 pb-4 pt-2 border-t border-white/8 space-y-0.5">
        <button
          onClick={() => onTabChange('profile')}
          title={collapsed ? 'Mi Perfil' : undefined}
          className={`
            relative w-full flex items-center rounded-xl transition-all duration-150 group
            ${collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'}
            ${activeTab === 'profile'
              ? 'bg-white/10 text-white'
              : 'text-white/40 hover:text-white/80 hover:bg-white/5'
            }
          `}
        >
          {activeTab === 'profile' && !collapsed && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full"
              style={{ backgroundColor: accentColor }}
            />
          )}
          <div
            className="w-8 h-8 shrink-0 rounded-[10px] flex items-center justify-center transition-all"
            style={activeTab === 'profile' ? { backgroundColor: `${accentColor}22` } : undefined}
          >
            <User
              className="w-[18px] h-[18px]"
              strokeWidth={activeTab === 'profile' ? 2.2 : 1.8}
              style={activeTab === 'profile' ? { color: accentColor } : undefined}
            />
          </div>
          {!collapsed && (
            <span className={`text-sm truncate ${activeTab === 'profile' ? 'font-semibold text-white' : 'font-medium'}`}>
              Mi Perfil
            </span>
          )}
          {collapsed && (
            <span className="absolute left-full ml-3 px-3 py-2 rounded-xl bg-[#1e1e1e] border border-white/10 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-2xl">
              Mi Perfil
            </span>
          )}
        </button>

        <button
          onClick={onLogout}
          title={collapsed ? 'Cerrar sesión' : undefined}
          className={`
            w-full flex items-center rounded-xl transition-all duration-150 group
            text-white/30 hover:text-red-400 hover:bg-red-500/8
            ${collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'}
          `}
        >
          <div className="w-8 h-8 shrink-0 rounded-[10px] flex items-center justify-center">
            <LogOut className="w-[18px] h-[18px]" strokeWidth={1.8} />
          </div>
          {!collapsed && <span className="text-sm font-medium">Cerrar sesión</span>}
          {collapsed && (
            <span className="absolute left-full ml-3 px-3 py-2 rounded-xl bg-[#1e1e1e] border border-white/10 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-2xl">
              Cerrar sesión
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}

export const SIDEBAR_WIDTH = 260;
export const SIDEBAR_COLLAPSED_WIDTH = 72;
