import { useState, useEffect } from 'react';
import {
  Users, Mail, Shield, Send, RotateCcw, Ban,
  Clock, CheckCircle2, XCircle, AlertCircle, Plus,
  Link2, Copy, Check,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toaster';
import { invitationsService, InvitationData } from '@/services/invitations.service';

function inviteLink(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback para contextos sin clipboard API
      const el = document.createElement('textarea');
      el.value = inviteLink(token);
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`p-2 rounded-lg transition-all ${
        copied
          ? 'text-nodo-success-tx bg-nodo-success-bg'
          : 'text-nodo-dim hover:text-blue-500 hover:bg-blue-500/10'
      }`}
      title={copied ? '¡Copiado!' : 'Copiar link de invitación'}
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending:  { label: 'Pendiente', color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-500/10',        icon: Clock        },
  accepted: { label: 'Aceptada',  color: 'text-nodo-success-tx',                  bg: 'bg-nodo-success-bg',     icon: CheckCircle2 },
  rejected: { label: 'Rechazada', color: 'text-nodo-danger-tx',                   bg: 'bg-nodo-danger-bg',      icon: XCircle      },
  revoked:  { label: 'Revocada',  color: 'text-nodo-dim',                          bg: 'bg-nodo-inset',          icon: Ban          },
  expired:  { label: 'Expirada',  color: 'text-nodo-dim',                          bg: 'bg-nodo-inset',          icon: AlertCircle  },
};

export function TeamManagement() {
  const toast = useToast();

  const [invitations, setInvitations] = useState<InvitationData[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [newlyCreated, setNewlyCreated] = useState<InvitationData | null>(null);

  const [newEmail, setNewEmail]           = useState('');
  const [newMemberType, setNewMemberType] = useState('employee');
  const [submitting, setSubmitting]       = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      setInvitations(await invitationsService.list());
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setSubmitting(true);
    try {
      const created = await invitationsService.create({
        email: newEmail.trim().toLowerCase(),
        member_type: newMemberType,
      });
      setNewlyCreated(created);
      setNewEmail('');
      setShowForm(false);
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al crear invitación');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = (id: string) => {
    toast.confirm(
      '¿Revocar esta invitación?',
      async () => {
        try {
          await invitationsService.revoke(id);
          toast.warning('Invitación revocada');
          if (newlyCreated?.id === id) setNewlyCreated(null);
          await loadData();
        } catch (err: any) {
          toast.error(err.response?.data?.detail || 'Error al revocar');
        }
      },
      { confirmLabel: 'Revocar' },
    );
  };

  const handleResend = async (id: string) => {
    try {
      const res = await invitationsService.resend(id) as any;
      toast.success('Invitación reenviada con nuevo token');
      // Actualizar el token en newlyCreated si coincide
      if (newlyCreated?.id === id && res.token) {
        setNewlyCreated(prev => prev ? { ...prev, token: res.token } : null);
      }
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al reenviar');
    }
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-black text-nodo-ink leading-tight">Gestión de Equipo</h1>
          <p className="text-nodo-sub text-sm font-medium mt-0.5">
            Invita colaboradores y gestiona sus accesos.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setNewlyCreated(null); }}
          className="inline-flex items-center gap-2 px-5 py-3 bg-nodo-ink text-nodo-canvas font-bold text-sm rounded-xl shadow-md active:scale-[0.97] transition-transform shrink-0"
        >
          <Plus className="w-4 h-4" />
          Invitar Miembro
        </button>
      </div>

      {/* KPI row */}
      {!loading && invitations.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Pendientes', value: invitations.filter(i => i.status === 'pending').length,                                      accent: '#fbbf24', pastel: '#fbbf241a', icon: Clock        },
            { label: 'Aceptadas',  value: invitations.filter(i => i.status === 'accepted').length,                                     accent: '#4ade80', pastel: '#4ade801a', icon: CheckCircle2 },
            { label: 'Inactivas',  value: invitations.filter(i => ['expired','revoked','rejected'].includes(i.status)).length,          accent: '#94a3b8', pastel: '#94a3b81a', icon: Ban          },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="flex flex-col gap-3 p-4 rounded-[20px]" style={{ backgroundColor: c.pastel }}>
                <div className="w-9 h-9 rounded-[11px] flex items-center justify-center" style={{ background: `${c.accent}22` }}>
                  <Icon size={16} style={{ color: c.accent }} strokeWidth={2} />
                </div>
                <div>
                  <p className="text-2xl font-black text-nodo-ink tabular-nums leading-none">{c.value}</p>
                  <p className="text-[10px] font-semibold text-nodo-sub mt-1 leading-tight">{c.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <div className="bg-nodo-card border border-nodo-line rounded-3xl p-6 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <h3 className="text-sm font-bold text-nodo-ink mb-4 flex items-center gap-2">
            <Send className="w-4 h-4 text-[#69E7A8]" /> Nueva Invitación
          </h3>
          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="email"
                placeholder="correo@ejemplo.com"
                required
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="w-full h-12 pl-12 pr-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim"
              />
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-nodo-dim w-4 h-4" />
            </div>
            <div className="relative">
              <select
                value={newMemberType}
                onChange={e => setNewMemberType(e.target.value)}
                className="h-12 pl-10 pr-8 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors appearance-none min-w-[180px]"
              >
                <option value="employee">Empleado</option>
                <option value="admin">Administrador</option>
              </select>
              <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-nodo-dim w-4 h-4" />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="h-12 px-6 bg-nodo-ink text-nodo-canvas font-bold text-sm rounded-2xl active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center gap-2 shrink-0"
            >
              {submitting
                ? <div className="w-4 h-4 border-2 border-nodo-canvas/30 border-t-nodo-canvas rounded-full animate-spin" />
                : <Send className="w-4 h-4" />}
              Enviar
            </button>
          </form>
        </div>
      )}

      {/* Banner del link recién creado */}
      {newlyCreated && (
        <div className="bg-nodo-card border-2 border-[#69E7A8]/40 rounded-3xl p-5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-[#69E7A8]/15 flex items-center justify-center shrink-0">
              <Link2 className="w-4 h-4 text-[#69E7A8]" />
            </div>
            <div>
              <p className="text-sm font-bold text-nodo-ink">Invitación creada</p>
              <p className="text-xs text-nodo-sub mt-0.5">
                Comparte este link con <span className="font-bold">{newlyCreated.email}</span>
              </p>
            </div>
            <button
              onClick={() => setNewlyCreated(null)}
              className="ml-auto text-nodo-dim hover:text-nodo-sub text-lg leading-none"
            >
              ×
            </button>
          </div>

          {/* Link copiable */}
          <div className="flex items-center gap-2 bg-nodo-inset border border-nodo-line rounded-2xl px-4 py-3">
            <span className="text-xs font-mono text-nodo-sub truncate flex-1 select-all">
              {inviteLink(newlyCreated.token)}
            </span>
            <CopyLinkButton token={newlyCreated.token} />
          </div>

          <p className="text-[10px] text-nodo-dim mt-2.5 ml-1">
            Válido 7 días · El destinatario debe usar el correo <span className="font-bold">{newlyCreated.email}</span>
          </p>
        </div>
      )}

      {/* Lista de invitaciones */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Spinner size="lg" />
        </div>
      ) : invitations.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center px-4">
          <Send className="w-8 h-8 text-nodo-dim mb-2" />
          <p className="text-sm font-bold text-nodo-dim">Sin invitaciones</p>
          <p className="text-xs text-nodo-dim mt-1">Haz clic en "Invitar Miembro" para comenzar.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invitations.map(inv => {
            const sc        = statusConfig[inv.status] ?? statusConfig.pending;
            const StatusIcon = sc.icon;
            const isPending  = inv.status === 'pending';

            return (
              <div
                key={inv.id}
                className="bg-nodo-card border border-nodo-line rounded-2xl p-4 lg:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-nodo-inset transition-colors"
              >
                {/* Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-nodo-ink truncate">{inv.email}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">
                        {inv.member_type === 'admin' ? 'Administrador' : 'Empleado'}
                      </span>
                      <span className="text-nodo-line">•</span>
                      <span className="text-[10px] text-nodo-dim">
                        {new Date(inv.created_at).toLocaleDateString('es-GT')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Badge + acciones */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${sc.color} ${sc.bg}`}>
                    <StatusIcon className="w-3 h-3" />
                    {sc.label}
                  </span>

                  {isPending && (
                    <>
                      <CopyLinkButton token={inv.token} />
                      <button
                        onClick={() => handleResend(inv.id)}
                        className="p-2 rounded-lg text-nodo-dim hover:text-blue-500 hover:bg-blue-500/10 transition-all"
                        title="Reenviar (nuevo token)"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRevoke(inv.id)}
                        className="p-2 rounded-lg text-nodo-dim hover:text-nodo-danger-tx hover:bg-nodo-danger-bg transition-all"
                        title="Revocar"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
