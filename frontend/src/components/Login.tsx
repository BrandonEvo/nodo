import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { authService } from "@/services/auth.service"
import { Chrome, Github, LayoutGrid, CheckCircle2, EyeOff, Mail, Lock } from "lucide-react"

interface LoginProps {
  onLoginSuccess: (token: string, isSuperAdmin: boolean, isTenantAdmin: boolean) => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await authService.login(email, password);
      const user = await authService.me();
      onLoginSuccess(data.access_token || '', user.is_superuser, user.is_tenant_admin ?? false);
    } catch (err) {
      alert("Error: Revisa tus credenciales.");
    }
  }

  return (
    <div className="min-h-screen w-full bg-cover bg-center flex items-center justify-center lg:justify-end p-4 md:p-8 lg:p-20 overflow-y-auto"
         style={{ backgroundImage: "url('/bg-nodo.png')" }}>
      
      <Card className="w-full max-w-[520px] bg-white/95 backdrop-blur-md rounded-[45px] shadow-[0_25px_60px_rgba(0,0,0,0.15)] border-none">
        <CardContent className="p-10 md:p-14 flex flex-col items-center">
          
          <div className="flex items-center gap-3 mb-10">
            <CheckCircle2 className="text-[#69E7A8] w-10 h-10 fill-[#69E7A8] stroke-white stroke-[2.5px]" />
            <h1 className="text-3xl font-black text-[#2D3E35] tracking-tighter italic">NODO</h1>
          </div>

          <h2 className="text-xl font-bold text-[#2D3E35] mb-12 tracking-tight">INICIAR SESIÓN</h2>

          <form onSubmit={handleLogin} className="w-full space-y-6">
            <div className="space-y-4">
              <div className="relative group">
                <Input id="email" type="email" placeholder="USUARIO"
                  className="h-14 pl-14 rounded-full border-slate-100 bg-slate-50/40 text-base focus:ring-2 focus:ring-[#69E7A8]"
                  value={email} onChange={(e) => setEmail(e.target.value)} required 
                />
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#69E7A8] w-5 h-5 transition-colors" />
              </div>
              
              <div className="relative group">
                <Input id="password" type="password" placeholder="CONTRASEÑA"
                  className="h-14 pl-14 pr-14 rounded-full border-slate-100 bg-slate-50/40 text-base focus:ring-2 focus:ring-[#69E7A8]"
                  value={password} onChange={(e) => setPassword(e.target.value)} required 
                />
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#69E7A8] w-5 h-5 transition-colors" />
                <EyeOff className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer w-5 h-5" />
              </div>
            </div>

            <Button type="submit" className="w-full h-14 bg-[#69E7A8] hover:bg-[#58C991] text-[#2D3E35] font-extrabold text-xl rounded-full shadow-lg transition-transform active:scale-[0.98]">
              LOGIN
            </Button>
          </form>

          <p className="text-[10px] font-black text-slate-400 mt-6 uppercase tracking-[0.3em]">O continúa con</p>

          {/* REINTEGRACIÓN DEL PANEL SOCIAL SOLICITADO */}
          <div className="w-full mt-10">
            <div className="relative flex items-center justify-center mb-8">
              <div className="border-t border-slate-100 w-full absolute"></div>
              <span className="bg-white px-4 text-[11px] text-slate-400 uppercase font-bold relative z-10 tracking-widest text-center">Inicia sesión con</span>
            </div>
            
            <div className="flex justify-center gap-6">
              <button className="w-16 h-16 flex items-center justify-center border-[1.5px] border-slate-100 rounded-2xl bg-slate-50/30 hover:bg-white hover:border-[#69E7A8] transition-all shadow-sm active:scale-95 group">
                <Chrome className="w-7 h-7 text-slate-500 group-hover:text-[#69E7A8] transition-colors" />
              </button>
              <button className="w-16 h-16 flex items-center justify-center border-[1.5px] border-slate-100 rounded-2xl bg-slate-50/30 hover:bg-white hover:border-[#69E7A8] transition-all shadow-sm active:scale-95 group">
                <LayoutGrid className="w-7 h-7 text-slate-500 group-hover:text-[#69E7A8] transition-colors" />
              </button>
              <button className="w-16 h-16 flex items-center justify-center border-[1.5px] border-slate-100 rounded-2xl bg-slate-50/30 hover:bg-white hover:border-[#69E7A8] transition-all shadow-sm active:scale-95 group">
                <Github className="w-7 h-7 text-slate-500 group-hover:text-[#69E7A8] transition-colors" />
              </button>
            </div>
          </div>

          <button className="mt-12 text-xs font-black text-slate-500 hover:text-[#2D3E35] transition-colors uppercase tracking-[0.2em]">
            CREAR CUENTA
          </button>
        </CardContent>
      </Card>
    </div>
  )
}