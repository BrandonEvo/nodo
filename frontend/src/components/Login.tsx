import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { authService } from "@/services/auth.service"
import { CheckCircle2, EyeOff, Eye, Mail, Lock, Store, ArrowLeft } from "lucide-react"

interface LoginProps {
  onLoginSuccess: (token: string, isSuperAdmin: boolean, isTenantAdmin: boolean) => void;
}

type AuthView = 'login' | 'register' | 'forgot';

export function Login({ onLoginSuccess }: LoginProps) {
  const [view, setView] = useState<AuthView>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      const data = await authService.login(email, password)
      const user = await authService.me()
      onLoginSuccess(data.access_token || '', user.is_superuser, user.is_tenant_admin ?? false)
    } catch (err) {
      alert("Error: Credenciales inválidas.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      console.log("Registrando empresa:", tenantName, email)
      const data = await authService.registerWorkspace({
        tenant_name: tenantName,
        email: email,
        password: password
      })
      alert(data.message || "Registro exitoso. Inicia sesión.")
      setView('login')
    } catch (err: any) {
      alert(err.response?.data?.detail || "Error al registrar cuenta.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      console.log("Recuperando password para:", email)
      alert("Si el correo existe, recibirás instrucciones.")
      setView('login')
    } catch (err) {
      alert("Error en el servidor.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex bg-[#F8F9FA] selection:bg-[#69E7A8] selection:text-[#111111] font-sans">

      {/* PANEL IZQUIERDO: Branding (Se oculta en móviles) */}
      <div className="hidden lg:flex flex-col justify-between w-[40%] bg-[#111111] text-white p-16 relative overflow-hidden">
        {/* Decoración sutil de fondo */}
        <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}>
        </div>

        <div className="relative z-10">
          <div className="text-white font-black text-5xl italic tracking-tighter mb-20">N.</div>
          <h1 className="text-5xl font-black mb-6 leading-[1.1] tracking-tight">
            El sistema<br />operativo de<br />tu negocio.
          </h1>
          <p className="text-gray-400 font-medium text-lg max-w-md leading-relaxed">
            Gestión multitenant, control de acceso y flujos de trabajo en milisegundos. Sin configuraciones complejas.
          </p>
        </div>

        <div className="text-xs text-gray-500 font-bold tracking-[0.2em] uppercase relative z-10">
          © 2026 Nodo Enterprise Framework
        </div>
      </div>

      {/* PANEL DERECHO: Máquina de Estados (Formularios) */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-[440px] transition-all duration-500">

          {/* Header para móviles (Visible solo cuando el panel izquierdo se oculta) */}
          <div className="flex lg:hidden items-center gap-3 mb-12 justify-center">
            <CheckCircle2 className="text-[#111111] w-8 h-8 fill-[#69E7A8] stroke-[#111111] stroke-[2px]" />
            <h1 className="text-3xl font-black text-[#111111] tracking-tighter italic">NODO</h1>
          </div>

          {/* VISTA: LOGIN */}
          {view === 'login' && (
            <div className="w-full animate-in fade-in zoom-in-95 duration-300">
              <h2 className="text-3xl font-black text-[#111111] mb-2 tracking-tight">Iniciar Sesión</h2>
              <p className="text-sm text-gray-500 font-medium mb-8">Ingresa tus credenciales para acceder a tu panel.</p>

              <form onSubmit={handleLogin} className="w-full space-y-4">
                <div className="relative group">
                  <Input type="email" placeholder="Correo electrónico" required
                    className="h-14 pl-14 rounded-2xl border-gray-200 bg-white text-base focus:ring-2 focus:ring-[#111111]/10 transition-all shadow-sm"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                  />
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#111111] w-5 h-5 transition-colors" />
                </div>

                <div className="relative group">
                  <Input type={showPassword ? "text" : "password"} placeholder="Contraseña" required
                    className="h-14 pl-14 pr-14 rounded-2xl border-gray-200 bg-white text-base focus:ring-2 focus:ring-[#111111]/10 transition-all shadow-sm"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                  />
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#111111] w-5 h-5 transition-colors" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#111111] transition-colors">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                <div className="flex justify-end w-full pt-1 pb-2">
                  <button type="button" onClick={() => setView('forgot')} className="text-xs font-bold text-gray-400 hover:text-[#111111] transition-colors uppercase tracking-wider">
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>

                <Button type="submit" disabled={isLoading} className="w-full h-14 bg-[#111111] hover:bg-black text-white font-bold text-lg rounded-2xl shadow-md transition-transform active:scale-[0.98]">
                  {isLoading ? 'VERIFICANDO...' : 'ENTRAR'}
                </Button>

                <div className="relative flex items-center py-2 mt-4">
                  <div className="flex-grow border-t border-gray-200"></div>
                  <span className="flex-shrink-0 mx-4 text-gray-400 text-sm font-medium">O</span>
                  <div className="flex-grow border-t border-gray-200"></div>
                </div>

                <Button 
                  type="button" 
                  onClick={() => window.location.href = 'http://localhost:8000/api/auth/google/login'} 
                  className="w-full h-14 bg-white hover:bg-gray-50 text-[#111111] border-2 border-gray-200 font-bold text-lg rounded-2xl shadow-sm transition-transform active:scale-[0.98] flex items-center justify-center gap-3"
                >
                  <svg viewBox="0 0 24 24" className="w-6 h-6">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continuar con Google
                </Button>
              </form>

              <div className="w-full mt-10 pt-8 flex flex-col items-center">
                <span className="text-sm text-gray-500 mb-4 font-medium">¿Aún no eres cliente?</span>
                <Button type="button" variant="outline" onClick={() => setView('register')} className="w-full h-14 border-2 border-gray-200 text-[#111111] hover:bg-gray-50 hover:border-gray-300 font-bold text-base rounded-2xl transition-all shadow-sm">
                  CREAR UNA EMPRESA
                </Button>
              </div>
            </div>
          )}

          {/* VISTA: REGISTRO */}
          {view === 'register' && (
            <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-3xl font-black text-[#111111] mb-2 tracking-tight">Nueva Empresa</h2>
              <p className="text-sm text-gray-500 font-medium mb-8">Configura tu entorno de trabajo en segundos.</p>

              <form onSubmit={handleRegister} className="w-full space-y-4">
                <div className="relative group">
                  <Input type="text" placeholder="Nombre de tu empresa" required
                    className="h-14 pl-14 rounded-2xl border-gray-200 bg-white text-base focus:ring-2 focus:ring-[#111111]/10 shadow-sm transition-all"
                    value={tenantName} onChange={(e) => setTenantName(e.target.value)}
                  />
                  <Store className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#111111] w-5 h-5 transition-colors" />
                </div>

                <div className="relative group">
                  <Input type="email" placeholder="Correo del administrador" required
                    className="h-14 pl-14 rounded-2xl border-gray-200 bg-white text-base focus:ring-2 focus:ring-[#111111]/10 shadow-sm transition-all"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                  />
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#111111] w-5 h-5 transition-colors" />
                </div>

                <div className="relative group">
                  <Input type="password" placeholder="Crea una contraseña maestra" required
                    className="h-14 pl-14 rounded-2xl border-gray-200 bg-white text-base focus:ring-2 focus:ring-[#111111]/10 shadow-sm transition-all"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                  />
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#111111] w-5 h-5 transition-colors" />
                </div>

                <Button type="submit" disabled={isLoading} className="w-full h-14 mt-2 bg-[#69E7A8] hover:bg-[#58C991] text-[#111111] font-black text-lg rounded-2xl shadow-md transition-transform active:scale-[0.98]">
                  {isLoading ? 'CREANDO...' : 'REGISTRAR EMPRESA'}
                </Button>
              </form>

              <button type="button" onClick={() => setView('login')} className="mt-8 flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-[#111111] transition-colors uppercase tracking-wider">
                <ArrowLeft className="w-4 h-4" /> VOLVER AL LOGIN
              </button>
            </div>
          )}

          {/* VISTA: RECUPERAR CONTRASEÑA */}
          {view === 'forgot' && (
            <div className="w-full animate-in fade-in slide-in-from-left-4 duration-300">
              <h2 className="text-3xl font-black text-[#111111] mb-2 tracking-tight">Recuperar Acceso</h2>
              <p className="text-sm text-gray-500 font-medium mb-8">Ingresa el correo asociado a tu empresa y te enviaremos las instrucciones.</p>

              <form onSubmit={handleForgot} className="w-full space-y-4">
                <div className="relative group">
                  <Input type="email" placeholder="Correo electrónico" required
                    className="h-14 pl-14 rounded-2xl border-gray-200 bg-white text-base focus:ring-2 focus:ring-[#111111]/10 shadow-sm transition-all"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                  />
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#111111] w-5 h-5 transition-colors" />
                </div>

                <Button type="submit" disabled={isLoading} className="w-full h-14 mt-2 bg-[#111111] hover:bg-black text-white font-bold text-lg rounded-2xl shadow-md transition-transform active:scale-[0.98]">
                  {isLoading ? 'ENVIANDO...' : 'ENVIAR ENLACE'}
                </Button>
              </form>

              <button type="button" onClick={() => setView('login')} className="mt-8 flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-[#111111] transition-colors uppercase tracking-wider">
                <ArrowLeft className="w-4 h-4" /> VOLVER AL LOGIN
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}