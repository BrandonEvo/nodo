import { useState, useEffect } from 'react'
import { Login } from '@/components/Login'
import { AppShell } from '@/components/AppShell'
import { authService } from '@/services/auth.service'
import { tenantMeService } from '@/services/tenantMe.service'
import { modulesService } from '@/services/modules.service'

type AuthState = 'loading' | 'unauth' | 'auth';

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [userSession, setUserSession] = useState<any>(null);
  const [activeModules, setActiveModules] = useState<any[]>([]);

  const loadTenantModules = async (user: any) => {
    try {
      const tenant = await tenantMeService.getMyTenant();
      const modules = await modulesService.getMyActiveModules(tenant.id);
      setActiveModules(modules);
    } catch (error) {
      console.error("Error loading tenant modules:", error);
    }
  };

  useEffect(() => {
    const verifySession = async () => {
      // Intentamos verificar la sesión siempre. 
      // Si hay HttpOnly cookie, la petición tendrá éxito automáticamente.
      try {
        const user = await authService.me();
        setUserSession(user);
        await loadTenantModules(user);
        setAuthState('auth');
      } catch (error) {
        localStorage.removeItem('token');
        setAuthState('unauth');
      }
    };
    verifySession();
  }, []);

  const handleLoginSuccess = async (token: string) => {
    localStorage.setItem('token', token);
    const user = await authService.me();
    setUserSession(user);
    await loadTenantModules(user);
    setAuthState('auth');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUserSession(null);
    setAuthState('unauth');
  };

  if (authState === 'loading') {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#69E7A8]"></div></div>;
  }

  if (authState === 'unauth') {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (authState === 'auth') {
    return (
      <AppShell
        userSession={userSession}
        activeModules={activeModules}
        onLogout={handleLogout}
      />
    );
  }

  return null;
}