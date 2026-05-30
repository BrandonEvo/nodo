import { useState } from 'react';
import { CheckCircle2, XCircle, Users, Building2, Shield } from 'lucide-react';
import { useToast } from '@/components/ui/Toaster';
import { invitationsService } from '@/services/invitations.service';
import type { PendingInvitation } from '@/services/auth.service';

interface InvitationAcceptanceModalProps {
  invitations: PendingInvitation[];
  onComplete: () => void;
}

export function InvitationAcceptanceModal({ invitations, onComplete }: InvitationAcceptanceModalProps) {
  const toast = useToast();
  const [pendingList] = useState(invitations);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [respondedIds, setRespondedIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, 'accepted' | 'rejected'>>({});

  const handleRespond = async (invitationId: string, action: 'accept' | 'reject') => {
    setProcessingId(invitationId);
    try {
      await invitationsService.respond(invitationId, action);
      const result = action === 'accept' ? 'accepted' : 'rejected';
      setResults(prev => ({ ...prev, [invitationId]: result }));
      const newResponded = new Set([...respondedIds, invitationId]);
      setRespondedIds(newResponded);
      if (newResponded.size >= pendingList.length) {
        setTimeout(onComplete, 1200);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al responder la invitación');
    } finally {
      setProcessingId(null);
    }
  };

  const allResponded = respondedIds.size >= pendingList.length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-xl bg-black/40">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 right-1/4 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 left-1/4 w-64 h-64 bg-[#69E7A8]/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0.5s' }} />
      </div>

      <div className="relative w-full max-w-lg mx-4">
        <div className="bg-nodo-card border border-nodo-line rounded-3xl shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="p-8 pb-0 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 mb-5">
              <Users className="w-8 h-8 text-blue-500" />
            </div>
            <h2 className="text-2xl font-black text-nodo-ink tracking-tight mb-2">
              Invitaciones Pendientes
            </h2>
            <p className="text-nodo-sub text-sm font-medium max-w-sm mx-auto">
              Tienes {pendingList.length} invitación{pendingList.length > 1 ? 'es' : ''} esperando tu respuesta.
            </p>
          </div>

          {/* Lista */}
          <div className="p-6 space-y-3 max-h-[400px] overflow-y-auto">
            {pendingList.map((inv) => {
              const isResponded  = respondedIds.has(inv.id);
              const result       = results[inv.id];
              const isProcessing = processingId === inv.id;

              return (
                <div
                  key={inv.id}
                  className={`rounded-2xl border-2 p-5 transition-all duration-300 ${
                    isResponded
                      ? result === 'accepted'
                        ? 'border-nodo-success-bd bg-nodo-success-bg'
                        : 'border-nodo-danger-bd bg-nodo-danger-bg'
                      : 'border-nodo-line bg-nodo-card hover:bg-nodo-inset'
                  }`}
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-11 h-11 rounded-xl bg-nodo-inset flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-nodo-sub" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-nodo-ink truncate">{inv.tenant_name}</h4>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Shield className="w-3.5 h-3.5 text-nodo-dim" />
                        <span className="text-xs text-nodo-dim font-medium">
                          Como <span className="font-bold text-nodo-sub">
                            {inv.member_type === 'admin' ? 'Administrador' : 'Empleado'}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {isResponded ? (
                    <div className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold ${
                      result === 'accepted' ? 'text-nodo-success-tx' : 'text-nodo-danger-tx'
                    }`}>
                      {result === 'accepted'
                        ? <><CheckCircle2 className="w-4 h-4" /> Aceptada</>
                        : <><XCircle className="w-4 h-4" /> Rechazada</>}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRespond(inv.id, 'accept')}
                        disabled={isProcessing}
                        className="flex-1 h-11 bg-nodo-ink text-nodo-canvas font-bold text-sm rounded-xl active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2"
                      >
                        {isProcessing
                          ? <div className="w-4 h-4 border-2 border-nodo-canvas/30 border-t-nodo-canvas rounded-full animate-spin" />
                          : <><CheckCircle2 className="w-4 h-4" /> Aceptar</>}
                      </button>
                      <button
                        onClick={() => handleRespond(inv.id, 'reject')}
                        disabled={isProcessing}
                        className="flex-1 h-11 border-2 border-nodo-danger-bd text-nodo-danger-tx font-bold text-sm rounded-xl active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2 hover:bg-nodo-danger-bg"
                      >
                        <XCircle className="w-4 h-4" />
                        Rechazar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {allResponded && (
            <div className="px-6 pb-6 text-center animate-in fade-in duration-500">
              <div className="h-px bg-nodo-line mb-4" />
              <p className="text-xs text-nodo-dim font-medium">Redirigiendo a tu panel...</p>
            </div>
          )}

          {!allResponded && respondedIds.size > 0 && (
            <div className="px-6 pb-6">
              <button
                onClick={onComplete}
                className="w-full h-11 bg-nodo-inset hover:bg-nodo-raised text-nodo-sub font-bold text-sm rounded-xl transition-all"
              >
                Responder después
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-[10px] text-white/40 font-bold tracking-widest uppercase mt-6">
          Nodo Enterprise Framework
        </p>
      </div>
    </div>
  );
}
