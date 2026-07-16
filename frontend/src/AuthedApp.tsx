import { useState, useEffect } from 'react'
import { Login } from '@/components/Login'
import { AppShell } from '@/components/AppShell'
import { OnboardingModal } from '@/components/OnboardingModal'
import { InvitationAcceptanceModal } from '@/components/InvitationAcceptanceModal'
import { authService, SessionData } from '@/services/auth.service'
import { syncPasskeyHint } from '@/services/webauthn.service'
import { modulesService } from '@/services/modules.service'
import { isServerUnreachable } from '@/lib/api'
import { markSessionHint, clearSessionHint } from '@/lib/sessionHint'
import { WifiOff, RefreshCw } from 'lucide-react'

type AuthState = 'loading' | 'unauth' | 'auth' | 'offline';

export default function AuthedApp() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [userSession, setUserSession] = useState<SessionData | null>(null);
  const [activeModules, setActiveModules] = useState<any[]>([]);

  const loadSession = async (): Promise<SessionData | null> => {
    try {
      const session = await authService.session();
      setUserSession(session);
      markSessionHint();
      void syncPasskeyHint(session.full_name || session.email);

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
      markSessionHint();
      void syncPasskeyHint(session.full_name || session.email);
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
      if (isServerUnreachable(err)) {
        setAuthState('offline');
      } else {
        clearSessionHint();
        setAuthState('unauth');
      }
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
    clearSessionHint();
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
