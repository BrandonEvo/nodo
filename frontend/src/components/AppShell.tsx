import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Sidebar } from './navigation/Sidebar';
import { AppBar } from './navigation/AppBar';
import { BottomNav } from './navigation/BottomNav';
import { DashboardCanvas } from './dashboard/DashboardCanvas';
import { PushBanner } from './ui/PushBanner';
import { TrialBanner } from './ui/TrialBanner';
import { ModuleChromeProvider } from './chrome/ModuleChrome';
import { TAB_LABELS, HOME_TABS } from '@/lib/tab-labels';
import { useDarkMode } from '@/hooks/useDarkMode';
import { usePushPermission } from '@/hooks/usePushPermission';
import { authService } from '@/services/auth.service';
import { presenceService } from '@/services/presence.service';
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
            // `text-nodo-on-primary/70` NO funciona: el token de Tailwind es un var() pelado,
            // sin el placeholder `<alpha-value>`, así que el modificador de opacidad se
            // descarta en silencio y el texto sale a opacidad plena. Estas son las variantes
            // con alpha que sí existen. El alpha es asimétrico a propósito: el texto oscuro
            // pierde legibilidad más rápido al bajarlo que el blanco.
            '--nodo-primary-rgb':      `${r},${g},${b}`,
            '--nodo-on-primary-2':     onPrimary === '#111111' ? 'rgba(17,17,17,0.66)' : 'rgba(255,255,255,0.74)',
            '--nodo-veil':             onPrimary === '#111111' ? 'rgba(17,17,17,0.14)' : 'rgba(255,255,255,0.14)',
            '--nodo-hairline':         onPrimary === '#111111' ? 'rgba(17,17,17,0.28)' : 'rgba(255,255,255,0.28)',
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

    // ── CHROME DE MÓDULO (título + acciones en la AppBar) ──
    const mainRef = useRef<HTMLElement>(null);
    const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);
    const [chromeOverride, setChromeOverride] = useState<{ title: string; subtitle?: string } | null>(null);
    const chromeValue = useMemo(
        () => ({ setTitle: setChromeOverride, actionsSlot }),
        [actionsSlot],
    );

    // Sale de activeTab, no del hijo: mientras el chunk lazy del módulo carga, la barra
    // ya muestra su nombre en vez de parpadear a "Inicio".
    const defaultTitle = useMemo(() => {
        if (HOME_TABS.has(activeTab)) return null;
        const mod = activeModules.find(
            (m: any) => m.code?.toLowerCase() === activeTab || m.frontend_route === activeTab,
        );
        return mod?.name ?? TAB_LABELS[activeTab] ?? null;
    }, [activeTab, activeModules]);

    const barTitle    = chromeOverride?.title ?? defaultTitle;
    const barSubtitle = chromeOverride?.title ? chromeOverride.subtitle : undefined;

    // <main> es un nodo persistente: sin esto, entrar a un módulo te deja en el scroll
    // del anterior. El foco además anuncia la pantalla nueva sin un aria-live ruidoso.
    useEffect(() => {
        mainRef.current?.scrollTo({ top: 0 });
        mainRef.current?.focus({ preventScroll: true });
    }, [activeTab]);

    useEffect(() => {
        document.title = barTitle ? `${barTitle} · Nodo` : 'Nodo';
    }, [barTitle]);

    const goHome = useCallback(
        () => setActiveTab(isSuperAdmin ? 'admin_home' : 'home'),
        [isSuperAdmin],
    );

    // Reset tab when switching impersonation modes
    useEffect(() => {
        if (appViewMode === 'superadmin') {
            setActiveTab('admin_home');
        } else {
            setActiveTab('home');
        }
    }, [appViewMode]);

    // Heartbeat de presencia: envía la app abierta al montar, al cambiar de
    // pestaña, y cada 60s mientras la sesión está en primer plano. Fire-and-forget.
    useEffect(() => {
        void presenceService.ping(activeTab).catch(() => {});
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') {
                void presenceService.ping(activeTab).catch(() => {});
            }
        }, 60_000);
        return () => clearInterval(id);
    }, [activeTab]);

    return (
        // h-dvh + overflow-hidden: con min-h-screen (100vh = large viewport en iOS) el
        // body quedaba con scroll propio y toda la app se arrastraba bajo el BottomNav.
        <div className="h-dvh overflow-hidden nodo-canvas-ambient" style={tenantCssVars}>

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

                <AppBar
                    title={barTitle}
                    subtitle={barSubtitle}
                    onBack={barTitle ? goHome : undefined}
                    actionsRef={setActionsSlot}
                    displayName={displayName}
                    tenantName={tenantName}
                    tenantLogo={tenantLogo}
                    tenantColor={tenantColor}
                    userPicture={userPicture}
                    isDark={isDark}
                    onToggleDark={toggleDark}
                    realIsSuperAdmin={realIsSuperAdmin}
                    appViewMode={appViewMode}
                    onViewModeChange={setAppViewMode}
                    availableTenants={availableTenants}
                    onSwitchTenant={handleSwitchTenant}
                    onProfile={() => setActiveTab('profile')}
                />

                {/* ── CONTENT CANVAS ── */}
                {/* El padding vertical vive acá y en ningún wrapper interno: los sticky
                    de los módulos se anclan al padding-box de este scroller. */}
                <main
                    ref={mainRef}
                    tabIndex={-1}
                    aria-labelledby="app-title"
                    className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col outline-none
                               px-4 pt-3 pb-nav
                               sm:px-6 sm:pt-4
                               lg:px-8 lg:pt-6 xl:px-10"
                >
                    {!realIsSuperAdmin && userSession?.access_state && userSession.access_state !== 'active' && (
                        <div className="mb-5">
                            <TrialBanner
                                accessState={userSession.access_state}
                                trialDaysRemaining={userSession.trial_days_remaining}
                                graceDaysRemaining={userSession.grace_days_remaining}
                            />
                        </div>
                    )}
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
                    <ModuleChromeProvider value={chromeValue}>
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
                    </ModuleChromeProvider>
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