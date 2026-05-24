import { useState, useEffect, useMemo } from 'react';
import { Sun, Moon } from 'lucide-react';
import { Sidebar } from './navigation/Sidebar';
import { Topbar } from './navigation/Topbar';
import { BottomNav } from './navigation/BottomNav';
import { DashboardCanvas } from './dashboard/DashboardCanvas';
import { useDarkMode } from '@/hooks/useDarkMode';

interface AppShellProps {
    userSession: any;
    activeModules?: any[];
    onLogout: () => void;
}

/** Convert hex to RGB object */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

export function AppShell({ userSession, activeModules = [], onLogout }: AppShellProps) {
    const { isDark, toggle: toggleDark } = useDarkMode();
    const realIsSuperAdmin = userSession?.is_superuser;

    // ── IMPERSONATION STATE (3 levels) ──
    const [appViewMode, setAppViewMode] = useState<'superadmin' | 'admin' | 'employee'>(
        realIsSuperAdmin ? 'superadmin' : (userSession?.is_tenant_admin ? 'admin' : 'employee')
    );

    // Derived role flags
    const isSuperAdmin = realIsSuperAdmin && appViewMode === 'superadmin';
    const isTenantAdmin = (realIsSuperAdmin && appViewMode === 'admin')
        || (!realIsSuperAdmin && userSession?.is_tenant_admin);

    const displayName = userSession?.full_name || userSession?.email || "Usuario";
    const userPicture = userSession?.picture;
    const tenantName = userSession?.tenant_name || (isSuperAdmin ? "NODO CORE" : "Mi Empresa");
    const tenantLogo = userSession?.tenant_logo_url || null;
    const tenantColor = userSession?.tenant_theme_color || '#69E7A8';

    // ── COMPUTE CSS CUSTOM PROPERTIES ──
    const tenantCssVars = useMemo(() => {
        const rgb = hexToRgb(tenantColor);
        return {
            '--tenant-color': tenantColor,
            '--tenant-r': String(rgb.r),
            '--tenant-g': String(rgb.g),
            '--tenant-b': String(rgb.b),
        } as React.CSSProperties;
    }, [tenantColor]);

    // ── ACTIVE TAB STATE ──
    const getDefaultTab = () => {
        if (isSuperAdmin) return 'admin_home';
        return 'home';
    };

    const [activeTab, setActiveTab] = useState(getDefaultTab());

    // Reset tab when switching impersonation modes
    useEffect(() => {
        if (appViewMode === 'superadmin') {
            setActiveTab('admin_home');
        } else {
            setActiveTab('home');
        }
    }, [appViewMode]);

    return (
        <div className="min-h-screen bg-nodo-canvas" style={tenantCssVars}>

            {/* ── DESKTOP SIDEBAR ── */}
            <Sidebar
                activeTab={activeTab}
                onTabChange={setActiveTab}
                isSuperAdmin={isSuperAdmin}
                isTenantAdmin={isTenantAdmin}
                activeModules={activeModules}
                onLogout={onLogout}
                tenantColor={tenantColor}
                tenantLogo={tenantLogo}
                tenantName={tenantName}
            />

            {/* ── MAIN AREA ── */}
            <div className="lg:ml-[260px] transition-all duration-300 min-h-screen flex flex-col">

                {/* ── DESKTOP TOPBAR ── */}
                <Topbar
                    displayName={displayName}
                    tenantName={tenantName}
                    userPicture={userPicture}
                    realIsSuperAdmin={realIsSuperAdmin}
                    appViewMode={appViewMode}
                    onViewModeChange={setAppViewMode}
                    tenantColor={tenantColor}
                    isDark={isDark}
                    onToggleDark={toggleDark}
                />

                {/* ── MOBILE HEADER ── */}
                <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-5 h-14 bg-nodo-card/80 backdrop-blur-xl border-b border-nodo-line"
                    style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
                >
                    <div className="flex items-center gap-2.5">
                        {tenantLogo ? (
                            <img src={tenantLogo} alt={tenantName} className="w-8 h-8 rounded-xl object-contain" />
                        ) : (
                            <div
                                className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-sm"
                                style={{ backgroundColor: tenantColor }}
                            >
                                {tenantName.charAt(0)}
                            </div>
                        )}
                        <p className="text-sm font-bold text-nodo-ink leading-none">{tenantName}</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={toggleDark}
                            className="w-9 h-9 flex items-center justify-center rounded-xl text-nodo-dim hover:text-nodo-sub hover:bg-nodo-inset transition-colors"
                            aria-label={isDark ? 'Modo claro' : 'Modo oscuro'}
                        >
                            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </button>
                        {userPicture ? (
                            <img src={userPicture} alt="Avatar"
                                className="w-8 h-8 rounded-xl object-cover ring-2 ring-nodo-line"
                                referrerPolicy="no-referrer"
                            />
                        ) : (
                            <div
                                className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-sm"
                                style={{ background: `linear-gradient(135deg, ${tenantColor}, ${tenantColor}cc)` }}
                            >
                                {displayName.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>
                </header>

                {/* ── CONTENT CANVAS ── */}
                <main className="flex-1 p-4 sm:p-6 lg:p-8 xl:p-10 pb-28 lg:pb-10 overflow-y-auto flex flex-col">
                    <DashboardCanvas
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        displayName={displayName}
                        tenantName={tenantName}
                        userPicture={userPicture}
                        isSuperAdmin={isSuperAdmin}
                        isTenantAdmin={isTenantAdmin}
                        activeModules={activeModules}
                        onLogout={onLogout}
                        tenantLogo={tenantLogo}
                        tenantColor={tenantColor}
                        isDark={isDark}
                        onToggleDark={toggleDark}
                    />
                </main>
            </div>

            {/* ── MOBILE BOTTOM NAV ── */}
            <BottomNav
                activeTab={activeTab}
                onTabChange={setActiveTab}
                isSuperAdmin={isSuperAdmin}
                isTenantAdmin={isTenantAdmin}
                activeModules={activeModules}
            />
        </div>
    );
}