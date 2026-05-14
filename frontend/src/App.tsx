import { useState, useEffect } from 'react'
import { Login } from '@/components/Login'
import { AppShell } from '@/components/AppShell'
import { OnboardingModal } from '@/components/OnboardingModal'
import { InvitationAcceptanceModal } from '@/components/InvitationAcceptanceModal'
import { authService, SessionData } from '@/services/auth.service'
import { modulesService } from '@/services/modules.service'

type AuthState = 'loading' | 'unauth' | 'auth';

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [userSession, setUserSession] = useState<SessionData | null>(null);
  const [activeModules, setActiveModules] = useState<any[]>([]);

  const loadSession = async (): Promise<SessionData | null> => {
    try {
      const session = await authService.session();
      setUserSession(session);

      // Cargar módulos del tenant si tiene uno
      if (session.tenant_id) {
        try {
          const modules = await modulesService.getMyActiveModules(session.tenant_id);
          setActiveModules(modules);
        } catch {
          setActiveModules([]);
        }
      }

      return session;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const verifySession = async () => {
      const session = await loadSession();
      if (session) {
        setAuthState('auth');
      } else {
        localStorage.removeItem('token');
        setAuthState('unauth');
      }
    };
    verifySession();
  }, []);

  const handleLoginSuccess = async (_token: string) => {
    localStorage.setItem('token', _token);
    const session = await loadSession();
    if (session) {
      setAuthState('auth');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUserSession(null);
    setActiveModules([]);
    setAuthState('unauth');
  };

  const handleOnboardingComplete = async () => {
    // Recargar la sesión para obtener el estado actualizado
    await loadSession();
  };

  const handleInvitationsComplete = async () => {
    // Recargar la sesión para obtener el estado actualizado
    await loadSession();
  };

  // ── LOADING ──
  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#69E7A8]" />
      </div>
    );
  }

  // ── UNAUTH ──
  if (authState === 'unauth') {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // ── AUTH ──
  if (authState === 'auth' && userSession) {
    return (
      <>
        {/* CAPA 1: AppShell siempre se renderiza */}
        <AppShell
          userSession={userSession}
          activeModules={activeModules}
          onLogout={handleLogout}
        />

        {/* CAPA 2: Modal de Onboarding (bloqueante, sin cierre) */}
        {!userSession.onboarding_completed && !userSession.is_superuser && (
          <OnboardingModal
            userEmail={userSession.email}
            onComplete={handleOnboardingComplete}
          />
        )}

        {/* CAPA 3: Modal de Invitaciones Pendientes (después del onboarding) */}
        {userSession.onboarding_completed && userSession.has_pending_invites && (
          <InvitationAcceptanceModal
            invitations={userSession.pending_invitations}
            onComplete={handleInvitationsComplete}
          />
        )}
      </>
    );
  }

  return null;
}