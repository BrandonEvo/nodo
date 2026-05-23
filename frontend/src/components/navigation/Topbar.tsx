import { Bell, Eye, ChevronDown, Sun, Moon } from 'lucide-react';

interface TopbarProps {
  displayName: string;
  tenantName: string;
  userPicture?: string | null;
  realIsSuperAdmin: boolean;
  appViewMode: 'superadmin' | 'admin' | 'employee';
  onViewModeChange: (mode: 'superadmin' | 'admin' | 'employee') => void;
  tenantColor?: string;
  isDark?: boolean;
  onToggleDark?: () => void;
}

export function Topbar({
  displayName,
  tenantName,
  userPicture,
  realIsSuperAdmin,
  appViewMode,
  onViewModeChange,
  tenantColor = '#69E7A8',
  isDark = false,
  onToggleDark,
}: TopbarProps) {
  return (
    <header className="hidden lg:flex items-center justify-end h-[72px] px-8 bg-nodo-card border-b border-nodo-line sticky top-0 z-30">

      <div className="flex items-center gap-4">

        {/* Impersonation Selector (SuperAdmin only) */}
        {realIsSuperAdmin && (
          <div className="flex items-center gap-2.5 bg-nodo-inset border border-nodo-line px-4 py-2 rounded-xl">
            <Eye className="w-4 h-4 text-nodo-sub" />
            <span className="text-[10px] font-bold text-nodo-dim uppercase tracking-widest hidden xl:block">
              Vista:
            </span>
            <select
              id="topbar-view-mode"
              value={appViewMode}
              onChange={(e) => onViewModeChange(e.target.value as any)}
              className="bg-transparent text-sm font-bold text-nodo-ink outline-none cursor-pointer appearance-none pr-1"
            >
              <option value="superadmin">SÚPER ADMIN</option>
              <option value="admin">ADMIN EMPRESA</option>
              <option value="employee">EMPLEADO</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-nodo-sub -ml-1 pointer-events-none" />
          </div>
        )}

        {/* Dark mode toggle */}
        {onToggleDark && (
          <button
            onClick={onToggleDark}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-nodo-sub hover:text-nodo-ink hover:bg-nodo-inset transition-all duration-200"
            aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        )}

        {/* Notification Bell */}
        <button
          id="topbar-notifications"
          className="relative p-2.5 rounded-xl text-nodo-sub hover:text-nodo-ink hover:bg-nodo-inset transition-all duration-200"
          aria-label="Notificaciones"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-nodo-card animate-pulse" />
        </button>

        {/* Separator */}
        <div className="h-8 w-px bg-nodo-line" />

        {/* User Profile */}
        <div className="flex items-center gap-3 cursor-pointer group pl-1">
          <div className="text-right hidden xl:block">
            <p className="text-sm font-bold text-nodo-ink leading-tight">{tenantName}</p>
            <p className="text-[11px] font-semibold text-nodo-sub leading-tight">{displayName}</p>
          </div>
          {userPicture ? (
            <img
              src={userPicture}
              alt="Perfil"
              className="w-10 h-10 rounded-xl object-cover shadow-sm ring-2 ring-nodo-line transition-all duration-200 group-hover:scale-105"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-sm group-hover:scale-105 transition-transform duration-200"
              style={{ background: `linear-gradient(135deg, ${tenantColor}, ${tenantColor}cc)` }}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
