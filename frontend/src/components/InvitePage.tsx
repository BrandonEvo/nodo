import { useState, useEffect } from 'react';
import { Building2, User, Lock, ArrowRight, CheckCircle2, AlertTriangle, Loader2, Eye, EyeOff, Mail } from 'lucide-react';
import { invitationsService, type InvitationPreview } from '@/services/invitations.service';
import { authService } from '@/services/auth.service';
import { useToast } from '@/components/ui/Toaster';
import api from '@/lib/api';

interface InvitePageProps {
  token: string;
  onAccepted: () => void;
}

type Step = 'loading' | 'error' | 'choice' | 'register' | 'login' | 'done';

export function InvitePage({ token, onAccepted }: InvitePageProps) {
  const toast = useToast();
  const [step, setStep]           = useState<Step>('loading');
  const [preview, setPreview]     = useState<InvitationPreview | null>(null);
  const [errorMsg, setErrorMsg]   = useState('');

  // Form state
  const [fullName, setFullName]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    invitationsService.preview(token)
      .then(data => {
        setPreview(data);
        setEmail(data.email);
        setStep('choice');
      })
      .catch(err => {
        const detail = err.response?.data?.detail;
        setErrorMsg(detail || 'Esta invitación no está disponible.');
        setStep('error');
      });
  }, [token]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await authService.registerAsMember({ invite_token: token, email, password, full_name: fullName || undefined });
      setStep('done');
      setTimeout(onAccepted, 1500);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al crear la cuenta.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview) return;
    setSaving(true);
    try {
      await authService.loginAsMember(email, password, token, preview.id);
      setStep('done');
      setTimeout(onAccepted, 1500);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Credenciales incorrectas.');
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = preview?.member_type === 'admin' ? 'Administrador'
    : preview?.member_type === 'owner' ? 'Propietario'
    : 'Empleado';

  return (
    <div className="min-h-screen flex items-center justify-center bg-nodo-canvas px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-4xl font-black text-nodo-ink italic tracking-tighter">N.</span>
        </div>

        {/* Loading */}
        {step === 'loading' && (
          <div className="bg-nodo-card border border-nodo-line rounded-3xl p-10 flex flex-col items-center gap-4 shadow-sm">
            <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
            <p className="text-sm font-semibold text-nodo-sub">Verificando invitación...</p>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="bg-nodo-card border border-nodo-line rounded-3xl p-10 flex flex-col items-center gap-4 text-center shadow-sm">
            <div className="w-16 h-16 rounded-full bg-nodo-danger-bg flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-nodo-danger-tx" />
            </div>
            <h2 className="text-xl font-black text-nodo-ink">Invitación no válida</h2>
            <p className="text-sm text-nodo-sub">{errorMsg}</p>
            <button
              onClick={() => window.location.href = '/portal'}
              className="mt-2 h-12 px-6 rounded-2xl bg-nodo-ink text-nodo-canvas font-bold text-sm active:scale-[0.97] transition-transform"
            >
              Ir al inicio
            </button>
          </div>
        )}

        {/* Choice: tengo cuenta / no tengo cuenta */}
        {step === 'choice' && preview && (
          <div className="bg-nodo-card border border-nodo-line rounded-3xl overflow-hidden shadow-sm">
            {/* Banner de empresa */}
            <div className="bg-nodo-inset border-b border-nodo-line p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-nodo-raised flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-nodo-sub" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-0.5">Te invitaron a</p>
                <p className="text-base font-black text-nodo-ink truncate">{preview.tenant_name}</p>
                <p className="text-xs text-nodo-sub font-medium">Como <span className="font-bold">{roleLabel}</span></p>
              </div>
            </div>

            <div className="p-6 space-y-3">
              <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-4">¿Cómo quieres acceder?</p>

              <button
                onClick={() => setStep('register')}
                className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-bold text-sm active:scale-[0.97] transition-transform flex items-center gap-4 px-5"
              >
                <User className="w-5 h-5 shrink-0" />
                <span className="flex-1 text-left">Crear cuenta nueva</span>
                <ArrowRight className="w-4 h-4 shrink-0 opacity-50" />
              </button>

              <button
                onClick={() => setStep('login')}
                className="w-full h-14 rounded-2xl border-2 border-nodo-line text-nodo-ink font-bold text-sm active:scale-[0.97] transition-transform flex items-center gap-4 px-5 hover:bg-nodo-inset"
              >
                <Lock className="w-5 h-5 shrink-0" />
                <span className="flex-1 text-left">Ya tengo cuenta</span>
                <ArrowRight className="w-4 h-4 shrink-0 opacity-50" />
              </button>
            </div>
          </div>
        )}

        {/* Registro */}
        {step === 'register' && preview && (
          <div className="bg-nodo-card border border-nodo-line rounded-3xl overflow-hidden shadow-sm">
            <div className="bg-nodo-inset border-b border-nodo-line px-6 py-4">
              <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">Uniéndote a</p>
              <p className="text-sm font-black text-nodo-ink">{preview.tenant_name}</p>
            </div>

            <form onSubmit={handleRegister} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Tu nombre</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Nombre completo (opcional)"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="w-full h-12 pl-11 pr-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim"
                  />
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-nodo-dim" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Correo</label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    readOnly
                    className="w-full h-12 pl-11 pr-4 bg-nodo-raised border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-sub outline-none cursor-not-allowed"
                  />
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-nodo-dim" />
                </div>
                <p className="text-[10px] text-nodo-dim mt-1 ml-1">Este correo está fijo por la invitación</p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    placeholder="Mínimo 8 caracteres con letras y números"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full h-12 pl-11 pr-11 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim"
                  />
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-nodo-dim" />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-nodo-dim hover:text-nodo-sub transition-colors"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving || !password}
                className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2 shadow-lg mt-2"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                UNIRME A {preview.tenant_name.toUpperCase()}
              </button>

              <button
                type="button"
                onClick={() => setStep('choice')}
                className="w-full text-center text-xs font-bold text-nodo-dim hover:text-nodo-sub transition-colors pt-1"
              >
                Volver
              </button>
            </form>
          </div>
        )}

        {/* Login para usuario existente */}
        {step === 'login' && preview && (
          <div className="bg-nodo-card border border-nodo-line rounded-3xl overflow-hidden shadow-sm">
            <div className="bg-nodo-inset border-b border-nodo-line px-6 py-4">
              <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">Uniéndote a</p>
              <p className="text-sm font-black text-nodo-ink">{preview.tenant_name}</p>
            </div>

            <form onSubmit={handleLogin} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Correo</label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    readOnly
                    className="w-full h-12 pl-11 pr-4 bg-nodo-raised border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-sub outline-none cursor-not-allowed"
                  />
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-nodo-dim" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    placeholder="Tu contraseña"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full h-12 pl-11 pr-11 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim"
                  />
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-nodo-dim" />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-nodo-dim hover:text-nodo-sub transition-colors"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving || !password}
                className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2 shadow-lg mt-2"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                INGRESAR Y UNIRME
              </button>

              <button
                type="button"
                onClick={() => setStep('choice')}
                className="w-full text-center text-xs font-bold text-nodo-dim hover:text-nodo-sub transition-colors pt-1"
              >
                Volver
              </button>
            </form>
          </div>
        )}

        {/* Done */}
        {step === 'done' && preview && (
          <div className="bg-nodo-card border border-nodo-line rounded-3xl p-10 flex flex-col items-center gap-4 text-center shadow-sm">
            <div className="w-16 h-16 rounded-full bg-nodo-success-bg flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-nodo-success-tx" />
            </div>
            <h2 className="text-xl font-black text-nodo-ink">¡Ya eres parte del equipo!</h2>
            <p className="text-sm text-nodo-sub">
              Bienvenido a <span className="font-bold text-nodo-ink">{preview.tenant_name}</span>
            </p>
            <Loader2 className="w-5 h-5 animate-spin text-nodo-dim mt-2" />
          </div>
        )}

      </div>
    </div>
  );
}
