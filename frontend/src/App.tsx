import { useState, useEffect } from 'react'
import { Login } from '@/components/Login'
import { AppShell } from '@/components/AppShell'
import { OnboardingModal } from '@/components/OnboardingModal'
import { InvitationAcceptanceModal } from '@/components/InvitationAcceptanceModal'
import { PublicTrackingPage } from '@/components/PublicTrackingPage'
import { ToastProvider } from '@/components/ui/Toaster'
import { authService, SessionData } from '@/services/auth.service'
import { modulesService } from '@/services/modules.service'

// Extract tracking token from URL: /tracking/<uuid>
function getTrackingToken(): string | null {
  const match = window.location.pathname.match(/^\/tracking\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

type AuthState = 'loading' | 'unauth' | 'auth';

// ── Authenticated app shell ──────────────────────────────────────────────────
function AuthedApp() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [userSession, setUserSession] = useState<SessionData | null>(null);
  const [activeModules, setActiveModules] = useState<any[]>([]);

  const loadSession = async (): Promise<SessionData | null> => {
    try {
      const session = await authService.session();
      setUserSession(session);

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

  const handleLoginSuccess = async () => {
    // La cookie ya fue seteada por el backend — solo cargar la sesión
    localStorage.removeItem('token'); // limpiar token legacy si existía
    const session = await loadSession();
    if (session) {
      setAuthState('auth');
    }
  };

  const handleLogout = async () => {
    await authService.logout(); // borra la httpOnly cookie en el backend
    setUserSession(null);
    setActiveModules([]);
    setAuthState('unauth');
  };

  const handleOnboardingComplete = async () => {
    await loadSession();
  };

  const handleInvitationsComplete = async () => {
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
        <AppShell
          userSession={userSession}
          activeModules={activeModules}
          onLogout={handleLogout}
        />
        {!userSession.onboarding_completed && !userSession.is_superuser && (
          <OnboardingModal
            userEmail={userSession.email}
            onComplete={handleOnboardingComplete}
          />
        )}
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

// ── Root router ──────────────────────────────────────────────────────────────
export default function App() {
  const trackingToken = getTrackingToken();

  return (
    <ToastProvider>
      {trackingToken
        ? <PublicTrackingPage token={trackingToken} />
        : <AuthedApp />}
    </ToastProvider>
  );
}
