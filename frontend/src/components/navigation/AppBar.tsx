/**
 * Barra única de la app — fusiona el header móvil y la vieja Topbar de desktop.
 *
 * Es contextual: en Inicio muestra la identidad del tenant; dentro de un módulo muestra
 * su título y hospeda sus acciones (portal desde `ModuleActions`). El `<h1>` de 28px que
 * cada pantalla dibujaba en el cuerpo desaparece — el título ya está acá, en una barra
 * que se paga igual.
 *
 * El padding de safe-area va en el <header> y el alto fijo en la fila interna: con
 * `h-14` + `padding-top` en el mismo nodo, en PWA con notch (inset 59px > 56px) el
 * content-box colapsaba a 0 y el logo se salía de la barra.
 */
import { Bell, Eye, ChevronDown, Sun, Moon, Building2, ChevronsUpDown, ChevronLeft } from 'lucide-react';
import { NodoMark, NodoWordmark } from '@/components/ui/NodoLogo';
import { haptic } from '@/utils/haptic';

export interface TenantOption {
  tenant_id: string;
  tenant_name: string;
  member_type: string;
  is_active: boolean;
}

interface AppBarProps {
  /** null ⇒ pantalla de inicio: muestra identidad del tenant. */
  title: string | null;
  subtitle?: string;
  onBack?: () => void;
  actionsRef: (el: HTMLDivElement | null) => void;
  displayName: string;
  tenantName: string;
  tenantLogo?: string | null;
  tenantColor: string;
  userPicture?: string | null;
  isDark: boolean;
  onToggleDark: () => void;
  realIsSuperAdmin: boolean;
  appViewMode: 'superadmin' | 'admin' | 'employee';
  onViewModeChange: (mode: 'superadmin' | 'admin' | 'employee') => void;
  availableTenants?: TenantOption[];
  onSwitchTenant?: (tenantId: string) => void;
  onProfile: () => void;
}

export function AppBar({
  title, subtitle, onBack, actionsRef,
  displayName, tenantName, tenantLogo = null, tenantColor, userPicture,
  isDark, onToggleDark, realIsSuperAdmin, appViewMode, onViewModeChange,
  availableTenants = [], onSwitchTenant, onProfile,
}: AppBarProps) {
  const showSwitcher = availableTenants.length > 1 && !!onSwitchTenant;

  return (
    <header
      className="sticky top-0 z-30 nodo-glass-bar border-b border-nodo-line"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center gap-2 px-4 lg:px-8 h-14 lg:h-[72px]">

        {title ? (
          <>
            {onBack && (
              <button
                onClick={() => { haptic.tap(); onBack(); }}
                aria-label="Volver al inicio"
                className="lg:hidden -ml-2 w-9 h-9 shrink-0 flex items-center justify-center rounded-xl text-nodo-sub active:scale-90 transition-transform"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <h1 id="app-title" className="text-[15px] lg:text-xl font-black text-nodo-ink leading-tight truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-[11px] lg:text-xs text-nodo-sub font-medium leading-tight truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <h1 id="app-title" className="sr-only">Inicio</h1>
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {tenantLogo ? (
                <img src={tenantLogo} alt="" className="w-8 h-8 rounded-xl object-contain shrink-0" />
              ) : (
                <NodoMark size={28} />
              )}
              <NodoWordmark name={tenantName} className="text-sm text-nodo-ink truncate" />
            </div>
          </>
        )}

        {/* Slot de acciones del módulo (portal desde ModuleActions) */}
        <div ref={actionsRef} className="flex items-center gap-1.5 shrink-0" />

        {/* Dentro de un módulo el ancho móvil es de las acciones: el switcher y el toggle
            de tema se repliegan a desktop. Ambos siguen a un toque desde Inicio/Perfil. */}
        {showSwitcher && (
          <div className={`${title ? 'hidden lg:flex' : 'flex'} items-center gap-1.5 lg:gap-2 bg-nodo-inset border border-nodo-line rounded-xl px-3 py-1.5 lg:py-2 max-w-[180px] shrink-0`}>
            <Building2 className="w-4 h-4 text-nodo-sub shrink-0 hidden lg:block" />
            <div
              className="w-5 h-5 rounded-md lg:hidden flex items-center justify-center text-white font-black text-[10px] shrink-0"
              style={{ backgroundColor: tenantColor }}
            >
              {tenantName.charAt(0)}
            </div>
            <select
              value={availableTenants.find(t => t.is_active)?.tenant_id ?? ''}
              onChange={e => onSwitchTenant!(e.target.value)}
              aria-label="Cambiar de empresa"
              className="bg-transparent text-xs lg:text-sm font-bold text-nodo-ink outline-none cursor-pointer appearance-none truncate flex-1 lg:max-w-[160px]"
            >
              {availableTenants.map(t => (
                <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name}</option>
              ))}
            </select>
            <ChevronsUpDown className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-nodo-dim shrink-0 pointer-events-none" />
          </div>
        )}

        {realIsSuperAdmin && (
          <div className="hidden lg:flex items-center gap-2.5 bg-nodo-inset border border-nodo-line px-4 py-2 rounded-xl shrink-0">
            <Eye className="w-4 h-4 text-nodo-sub" />
            <span className="text-[10px] font-bold text-nodo-dim uppercase tracking-widest hidden xl:block">Vista:</span>
            <select
              id="topbar-view-mode"
              value={appViewMode}
              onChange={e => onViewModeChange(e.target.value as 'superadmin' | 'admin' | 'employee')}
              className="bg-transparent text-sm font-bold text-nodo-ink outline-none cursor-pointer appearance-none pr-1"
            >
              <option value="superadmin">SÚPER ADMIN</option>
              <option value="admin">ADMIN EMPRESA</option>
              <option value="employee">EMPLEADO</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-nodo-sub -ml-1 pointer-events-none" />
          </div>
        )}

        <button
          onClick={onToggleDark}
          className={`${title ? 'hidden lg:flex' : 'flex'} w-9 h-9 shrink-0 items-center justify-center rounded-xl text-nodo-dim hover:text-nodo-sub hover:bg-nodo-inset transition-colors`}
          aria-label={isDark ? 'Modo claro' : 'Modo oscuro'}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          id="topbar-notifications"
          aria-label="Notificaciones"
          className="hidden lg:flex relative p-2.5 rounded-xl text-nodo-sub hover:text-nodo-ink hover:bg-nodo-inset transition-colors shrink-0"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-nodo-card animate-pulse" />
        </button>

        <div className="hidden lg:block h-8 w-px bg-nodo-line shrink-0" />

        <button onClick={onProfile} className="flex items-center gap-3 group shrink-0" aria-label="Mi perfil">
          <div className="text-right hidden xl:block">
            <p className="text-sm font-bold text-nodo-ink leading-tight">{tenantName}</p>
            <p className="text-[11px] font-semibold text-nodo-sub leading-tight">{displayName}</p>
          </div>
          {userPicture ? (
            <img
              src={userPicture}
              alt=""
              referrerPolicy="no-referrer"
              className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl object-cover ring-2 ring-nodo-line transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div
              className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center text-white font-black text-sm lg:text-lg shadow-sm group-hover:scale-105 transition-transform duration-200"
              style={{ background: `linear-gradient(135deg, ${tenantColor}, ${tenantColor}cc)` }}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </button>
      </div>
    </header>
  );
}
