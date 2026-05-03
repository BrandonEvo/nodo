import { useState, useEffect } from 'react';
import { Sidebar } from './navigation/Sidebar';
import { Topbar } from './navigation/Topbar';
import { BottomNav } from './navigation/BottomNav';
import { DashboardCanvas } from './dashboard/DashboardCanvas';

interface AppShellProps {
    userSession: any;
    activeModules?: string[];
    onLogout: () => void;
}

export function AppShell({ userSession, activeModules = [], onLogout }: AppShellProps) {
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
        <div className="min-h-screen bg-[#f4f5f7]">
            {/* ── DESKTOP SIDEBAR (hidden on mobile) ── */}
            <Sidebar
                activeTab={activeTab}
                onTabChange={setActiveTab}
                isSuperAdmin={isSuperAdmin}
                isTenantAdmin={isTenantAdmin}
                activeModules={activeModules}
                onLogout={onLogout}
            />

            {/* ── MAIN AREA (offset by sidebar on desktop) ── */}
            <div className="lg:ml-[272px] transition-all duration-300 min-h-screen flex flex-col">
                {/* ── DESKTOP TOPBAR (hidden on mobile) ── */}
                <Topbar
                    displayName={displayName}
                    tenantName={tenantName}
                    userPicture={userPicture}
                    realIsSuperAdmin={realIsSuperAdmin}
                    appViewMode={appViewMode}
                    onViewModeChange={setAppViewMode}
                />

                {/* ── MOBILE HEADER (visible only on mobile) ── */}
                <header className="lg:hidden flex items-center justify-between px-5 h-16 bg-white/80 backdrop-blur-xl border-b border-gray-100/80 sticky top-0 z-30 pt-safe">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#69E7A8] flex items-center justify-center">
                            <span className="text-[#111111] font-black text-sm italic">N</span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-[#111111] leading-tight">{tenantName}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {userPicture ? (
                            <img src={userPicture} alt="Avatar" className="w-8 h-8 rounded-lg object-cover" referrerPolicy="no-referrer" />
                        ) : (
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#69E7A8] to-[#4BD48E] flex items-center justify-center text-[#111111] font-black text-sm">
                                {displayName.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>
                </header>

                {/* ── CONTENT CANVAS ── */}
                <main className="flex-1 p-4 sm:p-6 lg:p-8 xl:p-10 pb-24 lg:pb-8 overflow-y-auto">
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
                    />
                </main>
            </div>

            {/* ── MOBILE BOTTOM NAV (hidden on desktop) ── */}
            <BottomNav
                activeTab={activeTab}
                onTabChange={setActiveTab}
                isSuperAdmin={isSuperAdmin}
                isTenantAdmin={isTenantAdmin}
            />
        </div>
    );
}