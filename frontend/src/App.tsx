import { useState, useEffect } from 'react'
import { Login } from '@/components/Login'
import { AppShell } from '@/components/AppShell'
import { OnboardingModal } from '@/components/OnboardingModal'
import { InvitationAcceptanceModal } from '@/components/InvitationAcceptanceModal'
import { PublicTrackingPage } from '@/components/PublicTrackingPage'
import { ImportTrackingPage } from '@/components/ImportTrackingPage'
import { InvitePage } from '@/components/InvitePage'
import { ToastProvider } from '@/components/ui/Toaster'
import { authService, SessionData } from '@/services/auth.service'
import { modulesService } from '@/services/modules.service'
import { isServerUnreachable } from '@/lib/api'
import { WifiOff, RefreshCw } from 'lucide-react'

function getTrackingToken(): string | null {
  const match = window.location.pathname.match(/^\/tracking\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

function getImportTrackingToken(): string | null {
  const match = window.location.pathname.match(/^\/import-tracking\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

// /invite/<token> — empleados invitados (token opaco urlsafe de 32 bytes)
function getInviteToken(): string | null {
  const match = window.location.pathname.match(/^\/invite\/([A-Za-z0-9_-]{20,})$/);
  return match ? match[1] : null;
}

type AuthState = 'loading' | 'unauth' | 'auth' | 'offline';

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

  // Chequeo inicial de sesión. Distingue "no autenticado" (→ login) de
  // "servidor no responde" (→ pantalla de reintento), para no confundir un
  // problema de conectividad con un cierre de sesión.
  const checkSession = async () => {
    setAuthState('loading');
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
      setAuthState('auth');
    } catch (err) {
      setAuthState(isServerUnreachable(err) ? 'offline' : 'unauth');
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const handleLoginSuccess = async () => {
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

  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-nodo-canvas">
        <div className="flex flex-col items-center gap-3">
          <span className="text-3xl font-black text-nodo-ink italic tracking-tighter">N.</span>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nodo-ink" />
        </div>
      </div>
    );
  }

  // ── OFFLINE / servidor no responde ──
  if (authState === 'offline') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-nodo-canvas p-6">
        <div className="max-w-sm w-full flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-nodo-inset flex items-center justify-center">
            <WifiOff className="w-7 h-7 text-nodo-sub" />
          </div>
          <div>
            <h1 className="text-xl font-black text-nodo-ink">No se pudo conectar</h1>
            <p className="text-sm text-nodo-sub font-medium mt-1 leading-relaxed">
              El servidor no responde. Puede estar iniciando tras un periodo inactivo
              —suele tardar unos segundos—. No es un fallo de tus datos ni de tu sesión.
            </p>
          </div>
          <button
            onClick={checkSession}
            className="w-full h-12 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-sm active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Reintentar
          </button>
        </div>
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
          onReloadSession={loadSession}
        />
        {!userSession.onboarding_completed && !userSession.is_superuser && (
          <OnboardingModal
            userEmail={userSession.email}
            tenantName={userSession.tenant_name}
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
  const trackingToken       = getTrackingToken();
  const importTrackingToken = getImportTrackingToken();
  const inviteToken         = getInviteToken();

  const handleInviteAccepted = () => {
    // Limpiar la URL y cargar la app autenticada
    window.history.replaceState({}, '', '/');
    window.location.reload();
  };

  return (
    <ToastProvider>
      {trackingToken
        ? <PublicTrackingPage token={trackingToken} />
        : importTrackingToken
        ? <ImportTrackingPage token={importTrackingToken} />
        : inviteToken
        ? <InvitePage token={inviteToken} onAccepted={handleInviteAccepted} />
        : <AuthedApp />}
    </ToastProvider>
  );
}
