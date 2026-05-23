import { useState, useEffect } from 'react';
import {
  Users, Mail, Shield, Send, RotateCcw, Ban,
  Clock, CheckCircle2, XCircle, AlertCircle, Plus,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toaster';
import { invitationsService, InvitationData } from '@/services/invitations.service';

export function TeamManagement() {
  const toast = useToast();

  const [invitations, setInvitations] = useState<InvitationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [newMemberType, setNewMemberType] = useState('employee');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const invData = await invitationsService.list();
      setInvitations(invData);
    } catch (e) {
      console.error('Error loading team data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newMemberType) return;
    setSubmitting(true);
    try {
      await invitationsService.create({ email: newEmail.trim().toLowerCase(), member_type: newMemberType });
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
          await loadData();
        } catch (err: any) {
          toast.error(err.response?.data?.detail || 'Error al revocar');
        }
      },
      { confirmLabel: 'Revocar' }
    );
  };

  const handleResend = async (id: string) => {
    try {
      await invitationsService.resend(id);
      toast.success('Invitación reenviada con nuevo token');
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al reenviar');
    }
  };

  const statusConfig: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
    pending: { label: 'Pendiente', color: 'text-amber-600', bg: 'bg-amber-50', icon: Clock },
    accepted: { label: 'Aceptada', color: 'text-[#69E7A8]', bg: 'bg-[#69E7A8]/10', icon: CheckCircle2 },
    rejected: { label: 'Rechazada', color: 'text-red-500', bg: 'bg-red-50', icon: XCircle },
    revoked: { label: 'Revocada', color: 'text-gray-400', bg: 'bg-gray-100', icon: Ban },
    expired: { label: 'Expirada', color: 'text-gray-400', bg: 'bg-gray-100', icon: AlertCircle },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#111111] tracking-tight flex items-center gap-3">
            <Users className="text-blue-500 w-7 h-7" /> Gestión de Equipo
          </h1>
          <p className="text-gray-400 mt-1 text-sm font-medium">
            Invita colaboradores a tu empresa y gestiona sus accesos.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 px-5 py-3 bg-[#111111] text-white font-bold text-sm rounded-xl shadow-md hover:bg-black transition-all active:scale-[0.97] shrink-0"
        >
          <Plus className="w-4 h-4" />
          Invitar Miembro
        </button>
      </div>

      {/* Formulario de invitación (colapsable) */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-in fade-in slide-in-from-top-2 duration-300">
          <h3 className="text-sm font-bold text-[#111111] mb-4 flex items-center gap-2">
            <Send className="w-4 h-4 text-[#69E7A8]" /> Nueva Invitación
          </h3>
          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="email"
                placeholder="correo@ejemplo.com"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full h-12 pl-12 pr-4 rounded-xl border-2 border-gray-200 bg-white text-sm font-medium focus:ring-2 focus:ring-[#111111]/10 focus:border-[#111111] transition-all outline-none"
              />
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            </div>
            <div className="relative">
              <select
                value={newMemberType}
                onChange={(e) => setNewMemberType(e.target.value)}
                className="h-12 pl-10 pr-8 rounded-xl border-2 border-gray-200 bg-white text-sm font-medium focus:ring-2 focus:ring-[#111111]/10 focus:border-[#111111] transition-all outline-none appearance-none min-w-[180px]"
              >
                <option value="employee">Empleado (Acceso Limitado)</option>
              </select>
              <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="h-12 px-6 bg-[#69E7A8] hover:bg-[#58C991] text-[#111111] font-bold text-sm rounded-xl shadow-sm transition-all active:scale-[0.97] disabled:opacity-50 flex items-center gap-2 shrink-0"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-[#111111]/30 border-t-[#111111] rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Enviar
            </button>
          </form>
        </div>
      )}

      {/* Tabla de invitaciones */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Spinner size="lg" />
        </div>
      ) : invitations.length === 0 ? (
        <div className="text-center py-16 bg-white border border-dashed border-gray-200 rounded-2xl">
          <Send className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-[#111111]">Sin Invitaciones</h3>
          <p className="text-gray-400 text-sm mt-1 max-w-sm mx-auto">
            Aún no has invitado a nadie. Haz clic en "Invitar Miembro" para comenzar.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {invitations.map((inv) => {
            const sc = statusConfig[inv.status] || statusConfig.pending;
            const StatusIcon = sc.icon;
            const isPending = inv.status === 'pending';

            return (
              <div
                key={inv.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-gray-200 transition-all gap-3"
              >
                {/* Info */}
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#111111] truncate">{inv.email}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        {inv.member_type === 'admin' ? 'Administrador' : 'Empleado'}
                      </span>
                      <span className="text-gray-200">•</span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(inv.created_at).toLocaleDateString('es-GT')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status + Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${sc.color} ${sc.bg}`}>
                    <StatusIcon className="w-3 h-3" />
                    {sc.label}
                  </span>

                  {isPending && (
                    <>
                      <button
                        onClick={() => handleResend(inv.id)}
                        className="p-2 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
                        title="Reenviar"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRevoke(inv.id)}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
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
