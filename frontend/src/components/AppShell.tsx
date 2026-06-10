import { useState, useEffect, useMemo } from 'react';
import { Sun, Moon, ChevronsUpDown } from 'lucide-react';
import { Sidebar } from './navigation/Sidebar';
import { Topbar } from './navigation/Topbar';
import { BottomNav } from './navigation/BottomNav';
import { DashboardCanvas } from './dashboard/DashboardCanvas';
import { PushBanner } from './ui/PushBanner';
import { NodoMark, NodoWordmark } from './ui/NodoLogo';
import { useDarkMode } from '@/hooks/useDarkMode';
import { usePushPermission } from '@/hooks/usePushPermission';
import { authService } from '@/services/auth.service';
import { hexToRgb, darkenHex, luminance, irisFromTenant } from '@/lib/utils';

interface AppShellProps {
    userSession: any;
    activeModules?: any[];
    onLogout: () => void;
    onReloadSession?: () => void;
}

export function AppShell({ userSession, activeModules = [], onLogout, onReloadSession }: AppShellProps) {
    const { isDark, toggle: toggleDark } = useDarkMode();
    const { state: pushState, subscribing, subscribe, dismiss } = usePushPermission();
    // Mostrar banner 45s después del login — el usuario ya conoce la app en ese punto
    const [showPushBanner, setShowPushBanner] = useState(false);
    useEffect(() => {
        if (pushState !== 'eligible') return;
        const t = setTimeout(() => setShowPushBanner(true), 45_000);
        return () => clearTimeout(t);
    }, [pushState]);

    const realIsSuperAdmin  = userSession?.is_superuser;
    const availableTenants  = userSession?.available_tenants ?? [];

    const handleSwitchTenant = async (tenantId: string) => {
        await authService.switchTenant(tenantId);
        onReloadSession?.();
    };

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
        const { r, g, b } = hexToRgb(tenantColor);
        const onPrimary = luminance(tenantColor) > 0.55 ? '#111111' : '#FFFFFF';
        const iris = irisFromTenant(tenantColor);
        return {
            // Legacy tenant vars
            '--tenant-color': tenantColor,
            '--tenant-r':     String(r),
            '--tenant-g':     String(g),
            '--tenant-b':     String(b),
            // Manual de Diseño — primary dinámico
            '--nodo-primary':          tenantColor,
            '--nodo-primary-soft':     `rgba(${r},${g},${b},0.12)`,
            '--nodo-primary-softer':   `rgba(${r},${g},${b},0.07)`,
            '--nodo-primary-deep':     darkenHex(tenantColor, 0.15),
            '--nodo-on-primary':       onPrimary,
            '--nodo-shadow-fab':       `0 8px 20px -4px rgba(${r},${g},${b},0.35)`,
            // Marca nodo. — iridiscente derivado del tenantColor (hue ±50°)
            '--nodo-iris':             iris.gradient,
            '--nodo-iris-soft':        iris.soft,
            '--nodo-iris-start':       iris.start,
            '--nodo-iris-mid':         iris.mid,
            '--nodo-iris-end':         iris.end,
            '--nodo-on-iris':          onPrimary,
        } as React.CSSProperties;
    }, [tenantColor]);

    // Sincronizar theme-color del navegador con el color del tenant
    useEffect(() => {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', tenantColor);
    }, [tenantColor]);

    // ── ACTIVE TAB STATE ──
    const getDefaultTab = () => {
        if (isSuperAdmin) return 'admin_home';
        return 'home';
    };

    const [activeTab, setActiveTab] = useState(getDefaultTab());
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    // Reset tab when switching impersonation modes
    useEffect(() => {
        if (appViewMode === 'superadmin') {
            setActiveTab('admin_home');
        } else {
            setActiveTab('home');
        }
    }, [appViewMode]);

    return (
        <div className="min-h-screen nodo-canvas-ambient" style={tenantCssVars}>

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
                collapsed={sidebarCollapsed}
                onCollapse={setSidebarCollapsed}
            />

            {/* ── MAIN AREA ── */}
            <div className={`${sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[260px]'} transition-all duration-300 h-dvh overflow-hidden flex flex-col`}>

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
                    availableTenants={availableTenants}
                    onSwitchTenant={handleSwitchTenant}
                />

                {/* ── MOBILE HEADER ── */}
                <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-5 h-14 nodo-glass-bar border-b border-nodo-line"
                    style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
                >
                    {/* Tenant identity / switcher mobile */}
                    {availableTenants.length > 1 ? (
                        <div className="flex items-center gap-1.5 bg-nodo-inset border border-nodo-line rounded-xl px-3 py-1.5 max-w-[180px]">
                            <div
                                className="w-5 h-5 rounded-md flex items-center justify-center text-white font-black text-[10px] shrink-0"
                                style={{ backgroundColor: tenantColor }}
                            >
                                {tenantName.charAt(0)}
                            </div>
                            <select
                                value={availableTenants.find((t: any) => t.is_active)?.tenant_id ?? ''}
                                onChange={e => handleSwitchTenant(e.target.value)}
                                className="bg-transparent text-xs font-bold text-nodo-ink outline-none cursor-pointer appearance-none truncate flex-1"
                            >
                                {availableTenants.map((t: any) => (
                                    <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name}</option>
                                ))}
                            </select>
                            <ChevronsUpDown className="w-3 h-3 text-nodo-dim shrink-0 pointer-events-none" />
                        </div>
                    ) : (
                        <div className="flex items-center gap-2.5">
                            {tenantLogo ? (
                                <img src={tenantLogo} alt={tenantName} className="w-8 h-8 rounded-xl object-contain" />
                            ) : (
                                <NodoMark size={28} />
                            )}
                            <NodoWordmark name={tenantName} className="text-sm text-nodo-ink" />
                        </div>
                    )}

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
                    {showPushBanner && (
                        <div className="mb-5">
                            <PushBanner
                                subscribing={subscribing}
                                onAccept={async () => {
                                    await subscribe();
                                    setShowPushBanner(false);
                                }}
                                onDismiss={() => {
                                    dismiss();
                                    setShowPushBanner(false);
                                }}
                            />
                        </div>
                    )}
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