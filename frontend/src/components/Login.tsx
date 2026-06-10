import { useState } from 'react'
import { useToast } from "@/components/ui/Toaster"
import { authService } from "@/services/auth.service"
import { isServerUnreachable } from "@/lib/api"
import { EyeOff, Eye, Mail, Lock, Store, ArrowLeft, Loader2 } from "lucide-react"
import { PrivacyPolicyModal } from "@/components/PrivacyPolicyModal"
import { NodoWordmark } from "@/components/ui/NodoLogo"

const SERVER_DOWN_MSG = "El servidor no responde (puede estar iniciando tras un rato inactivo). Espera unos segundos y vuelve a intentar — no es un problema de tus datos."

interface LoginProps {
  onLoginSuccess: () => void;
}

type AuthView = 'login' | 'register' | 'forgot';

const inputClass = "w-full h-[52px] px-4 pr-12 bg-nodo-card border border-nodo-line rounded-2xl text-base font-medium text-nodo-ink placeholder:text-nodo-dim outline-none focus:border-nodo-line-s transition-colors"

export function Login({ onLoginSuccess }: LoginProps) {
  const toast = useToast()
  const [view, setView] = useState<AuthView>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      await authService.login(email, password)
      onLoginSuccess()
    } catch (err: any) {
      if (isServerUnreachable(err)) {
        toast.error(SERVER_DOWN_MSG)
      } else if (err?.response?.status === 429) {
        toast.error("Demasiados intentos. Espera un momento antes de volver a intentar.")
      } else {
        toast.error("Credenciales inválidas. Verifica tu correo y contraseña.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres.")
      return
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      toast.error("La contraseña debe tener letras y números.")
      return
    }
    setIsLoading(true)
    try {
      const data = await authService.registerWorkspace({
        tenant_name: tenantName,
        email: email,
        password: password
      })
      toast.success(data.message || "Registro exitoso. Inicia sesión.")
      setView('login')
    } catch (err: any) {
      if (isServerUnreachable(err)) {
        toast.error(SERVER_DOWN_MSG)
      } else {
        toast.error(err.response?.data?.detail || "Error al registrar cuenta.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <PrivacyPolicyModal open={showPrivacy} onClose={() => setShowPrivacy(false)} />

      <div className="min-h-dvh w-full flex flex-col items-center bg-nodo-canvas relative overflow-hidden px-6 selection:bg-nodo-primary selection:text-nodo-on-primary font-sans">

        {/* Blobs iridiscentes muy sutiles */}
        <div className="absolute -top-40 -right-40 w-[420px] h-[420px] rounded-full opacity-[0.14] blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, var(--nodo-iris-start), transparent 70%)' }} />
        <div className="absolute -bottom-48 -left-44 w-[460px] h-[460px] rounded-full opacity-[0.12] blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, var(--nodo-iris-end), transparent 70%)' }} />

        <div className="w-full max-w-[380px] flex-1 flex flex-col justify-center relative z-10 py-10">

          {/* Wordmark */}
          <div className="text-center mb-12" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            <NodoWordmark className="text-[46px] text-nodo-ink" />
          </div>

          {/* VISTA: LOGIN */}
          {view === 'login' && (
            <div className="w-full animate-in fade-in zoom-in-95 duration-300">
              <h2 className="text-[22px] font-black text-nodo-ink text-center mb-9 tracking-tight">
                Bienvenido de nuevo.
              </h2>

              <form onSubmit={handleLogin} className="w-full space-y-3.5">
                <div className="relative">
                  <input
                    type="email"
                    placeholder="Correo"
                    required
                    autoComplete="email"
                    className={inputClass}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-nodo-dim w-5 h-5 pointer-events-none" />
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Contraseña"
                    required
                    autoComplete="current-password"
                    className={inputClass}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-nodo-dim hover:text-nodo-ink transition-colors p-1 rounded-lg active:scale-90"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                  </button>
                </div>

                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-[52px] rounded-full font-bold text-base flex items-center justify-center gap-2.5 shadow-lg active:scale-[0.97] transition-transform disabled:opacity-40"
                    style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
                  >
                    {isLoading
                      ? <><Loader2 size={18} className="animate-spin" /> Verificando…</>
                      : 'Entrar'
                    }
                  </button>
                </div>
              </form>

              <div className="flex justify-center mt-6">
                <button
                  type="button"
                  onClick={() => setView('forgot')}
                  className="text-sm font-bold text-nodo-ink hover:opacity-70 transition-opacity py-1"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              {/* Divisor */}
              <div className="relative flex items-center py-6">
                <div className="flex-grow border-t border-nodo-line" />
                <span className="flex-shrink-0 mx-4 text-nodo-dim text-xs font-semibold">o</span>
                <div className="flex-grow border-t border-nodo-line" />
              </div>

              {/* Google */}
              <button
                type="button"
                onClick={() => {
                  const base = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api').replace(/\/api\/?$/, '');
                  window.location.href = `${base}/api/auth/google/login`;
                }}
                className="w-full h-[52px] bg-nodo-card border border-nodo-line hover:bg-nodo-inset text-nodo-ink font-bold text-sm rounded-full transition-all active:scale-[0.98] flex items-center justify-center gap-3 shadow-sm"
              >
                <GoogleLogo />
                Continuar con Google
              </button>
            </div>
          )}

          {/* VISTA: REGISTRO */}
          {view === 'register' && (
            <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-[22px] font-black text-nodo-ink text-center mb-2 tracking-tight">
                Crea tu empresa.
              </h2>
              <p className="text-sm text-nodo-sub font-medium text-center mb-9">
                Configura tu entorno de trabajo en segundos.
              </p>

              <form onSubmit={handleRegister} className="w-full space-y-3.5">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Nombre de tu empresa"
                    required
                    autoComplete="organization"
                    className={inputClass}
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                  />
                  <Store className="absolute right-4 top-1/2 -translate-y-1/2 text-nodo-dim w-5 h-5 pointer-events-none" />
                </div>

                <div className="relative">
                  <input
                    type="email"
                    placeholder="Correo del administrador"
                    required
                    autoComplete="email"
                    className={inputClass}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-nodo-dim w-5 h-5 pointer-events-none" />
                </div>

                <div className="relative">
                  <input
                    type="password"
                    placeholder="Crea una contraseña maestra"
                    required
                    autoComplete="new-password"
                    className={inputClass}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-nodo-dim w-5 h-5 pointer-events-none" />
                </div>

                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-[52px] rounded-full font-bold text-base flex items-center justify-center gap-2.5 shadow-lg active:scale-[0.97] transition-transform disabled:opacity-40"
                    style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
                  >
                    {isLoading
                      ? <><Loader2 size={18} className="animate-spin" /> Creando…</>
                      : 'Registrar empresa'
                    }
                  </button>
                </div>
              </form>

              <div className="flex justify-center mt-8">
                <button
                  type="button"
                  onClick={() => setView('login')}
                  className="flex items-center gap-2 text-sm font-bold text-nodo-sub hover:text-nodo-ink transition-colors py-1"
                >
                  <ArrowLeft className="w-4 h-4" /> Volver al login
                </button>
              </div>
            </div>
          )}

          {/* VISTA: RECUPERAR CONTRASEÑA */}
          {view === 'forgot' && (
            <div className="w-full animate-in fade-in slide-in-from-left-4 duration-300">
              <h2 className="text-[22px] font-black text-nodo-ink text-center mb-2 tracking-tight">
                Recuperar acceso.
              </h2>
              <p className="text-sm text-nodo-sub font-medium text-center mb-9">
                Selecciona cómo iniciaste sesión para continuar.
              </p>

              <div className="space-y-3">
                <div className="nodo-card p-5 space-y-3">
                  <p className="text-sm font-bold text-nodo-ink">¿Usas Google para ingresar?</p>
                  <p className="text-xs text-nodo-sub leading-relaxed">Tu contraseña la gestiona Google. Restablécela desde tu cuenta de Google.</p>
                  <button
                    type="button"
                    onClick={() => window.open('https://myaccount.google.com/security', '_blank')}
                    className="w-full h-11 bg-nodo-inset hover:bg-nodo-raised border border-nodo-line text-nodo-ink font-bold text-sm rounded-full transition-all active:scale-[0.98] flex items-center justify-center gap-2.5"
                  >
                    <GoogleLogo size={16} />
                    Gestionar contraseña en Google
                  </button>
                </div>

                <div className="nodo-card p-5 space-y-3">
                  <p className="text-sm font-bold text-nodo-ink">¿Creaste una cuenta con correo?</p>
                  <p className="text-xs text-nodo-sub leading-relaxed">La recuperación por correo estará disponible pronto. Por ahora contacta al administrador de tu empresa.</p>
                  <div className="flex items-center gap-2 bg-nodo-warn-bg border border-nodo-warn-bd rounded-xl px-3.5 py-2.5">
                    <span className="text-nodo-warn-tx text-xs font-bold">⏳ Próximamente disponible</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-center mt-8">
                <button
                  type="button"
                  onClick={() => setView('login')}
                  className="flex items-center gap-2 text-sm font-bold text-nodo-sub hover:text-nodo-ink transition-colors py-1"
                >
                  <ArrowLeft className="w-4 h-4" /> Volver al login
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer — Sign up + legal */}
        <div className="relative z-10 flex flex-col items-center gap-4 pb-8 pb-safe">
          {view === 'login' && (
            <button
              type="button"
              onClick={() => setView('register')}
              className="text-sm font-bold text-nodo-ink hover:opacity-70 transition-opacity py-1"
            >
              Crear una empresa
            </button>
          )}
          <div className="flex items-center gap-4">
            <span className="text-[11px] text-nodo-dim font-semibold">© 2026 Nodo</span>
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="text-[11px] text-nodo-dim hover:text-nodo-ink transition-colors underline underline-offset-2"
            >
              Política de Privacidad
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="shrink-0">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
