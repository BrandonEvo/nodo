import { Search, Bell, Eye, ChevronDown } from 'lucide-react';

interface TopbarProps {
  displayName: string;
  tenantName: string;
  userPicture?: string | null;
  realIsSuperAdmin: boolean;
  appViewMode: 'superadmin' | 'admin' | 'employee';
  onViewModeChange: (mode: 'superadmin' | 'admin' | 'employee') => void;
}

export function Topbar({
  displayName,
  tenantName,
  userPicture,
  realIsSuperAdmin,
  appViewMode,
  onViewModeChange,
}: TopbarProps) {
  return (
    <header
      className="
        hidden lg:flex items-center justify-between
        h-[72px] px-8 bg-white/70 backdrop-blur-xl
        border-b border-gray-100/80 sticky top-0 z-30
      "
    >
      {/* ── Left: Search ── */}
      <div className="flex items-center gap-4 flex-1 max-w-lg">
        <div className="relative w-full group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-[#111111] transition-colors" />
          <input
            id="topbar-search"
            type="text"
            placeholder="Buscar...  ⌘K"
            className="
              w-full h-11 pl-11 pr-4 
              bg-gray-50/80 border border-gray-200/60 rounded-xl 
              text-sm font-medium text-[#111111] placeholder:text-gray-400
              focus:ring-2 focus:ring-[#111111]/5 focus:bg-white focus:border-gray-300
              outline-none transition-all duration-200
            "
          />
        </div>
      </div>

      {/* ── Right: Actions + User ── */}
      <div className="flex items-center gap-4">
        {/* Impersonation Selector (SuperAdmin only) */}
        {realIsSuperAdmin && (
          <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-200/60 px-4 py-2 rounded-xl">
            <Eye className="w-4 h-4 text-gray-400" />
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] hidden xl:block">
              Vista:
            </span>
            <select
              id="topbar-view-mode"
              value={appViewMode}
              onChange={(e) => onViewModeChange(e.target.value as any)}
              className="
                bg-transparent text-sm font-bold text-[#111111]
                outline-none cursor-pointer appearance-none pr-1
              "
            >
              <option value="superadmin">SÚPER ADMIN</option>
              <option value="admin">ADMIN EMPRESA</option>
              <option value="employee">EMPLEADO</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 -ml-1 pointer-events-none" />
          </div>
        )}

        {/* Notification Bell */}
        <button
          id="topbar-notifications"
          className="relative p-2.5 rounded-xl text-gray-400 hover:text-[#111111] hover:bg-gray-50 transition-all duration-200"
          aria-label="Notificaciones"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white animate-pulse" />
        </button>

        {/* Separator */}
        <div className="h-8 w-px bg-gray-200/80" />

        {/* User Profile */}
        <div className="flex items-center gap-3 cursor-pointer group pl-1">
          <div className="text-right hidden xl:block">
            <p className="text-sm font-bold text-[#111111] leading-tight">{tenantName}</p>
            <p className="text-[11px] font-semibold text-gray-400 leading-tight">{displayName}</p>
          </div>
          {userPicture ? (
            <img
              src={userPicture}
              alt="Perfil"
              className="w-10 h-10 rounded-xl object-cover shadow-sm ring-2 ring-gray-100 group-hover:ring-[#69E7A8]/40 transition-all duration-200"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#69E7A8] to-[#4BD48E] flex items-center justify-center text-[#111111] font-black text-lg shadow-sm group-hover:scale-105 transition-transform duration-200">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
