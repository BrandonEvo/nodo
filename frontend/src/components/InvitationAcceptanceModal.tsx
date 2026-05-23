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
      setResults(prev => ({ ...prev, [invitationId]: action === 'accept' ? 'accepted' : 'rejected' }));
      setRespondedIds(prev => new Set([...prev, invitationId]));

      // Si todas las invitaciones fueron respondidas, refrescar sesión
      const newResponded = new Set([...respondedIds, invitationId]);
      if (newResponded.size >= pendingList.length) {
        setTimeout(() => {
          onComplete();
        }, 1200);
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
      {/* Decoración */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 right-1/4 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 left-1/4 w-64 h-64 bg-[#69E7A8]/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0.5s' }} />
      </div>

      <div className="relative w-full max-w-lg mx-4">
        <div className="bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden">

          {/* Header */}
          <div className="p-8 pb-0 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 mb-5">
              <Users className="w-8 h-8 text-blue-500" />
            </div>
            <h2 className="text-2xl font-black text-[#111111] tracking-tight mb-2">
              Invitaciones Pendientes
            </h2>
            <p className="text-gray-400 text-sm font-medium max-w-sm mx-auto">
              Tienes {pendingList.length} invitación{pendingList.length > 1 ? 'es' : ''} esperando tu respuesta.
            </p>
          </div>

          {/* Lista de invitaciones */}
          <div className="p-6 space-y-3 max-h-[400px] overflow-y-auto">
            {pendingList.map((inv) => {
              const isResponded = respondedIds.has(inv.id);
              const result = results[inv.id];
              const isProcessing = processingId === inv.id;

              return (
                <div
                  key={inv.id}
                  className={`rounded-2xl border-2 p-5 transition-all duration-300 ${
                    isResponded
                      ? result === 'accepted'
                        ? 'border-[#69E7A8]/30 bg-[#69E7A8]/5'
                        : 'border-red-200 bg-red-50/50'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  {/* Info de la invitación */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-gray-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-[#111111] truncate">
                        {inv.tenant_name}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Shield className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-xs text-gray-400 font-medium">
                          Te invitaron como <span className="font-bold text-gray-600">{inv.member_type === 'admin' ? 'Administrador' : 'Empleado'}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Botones o resultado */}
                  {isResponded ? (
                    <div className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold ${
                      result === 'accepted'
                        ? 'text-[#69E7A8] bg-[#69E7A8]/10'
                        : 'text-red-500 bg-red-50'
                    }`}>
                      {result === 'accepted' ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          Aceptada
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4" />
                          Rechazada
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRespond(inv.id, 'accept')}
                        disabled={isProcessing}
                        className="flex-1 h-11 bg-[#111111] hover:bg-black text-white font-bold text-sm rounded-xl transition-all duration-200 active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isProcessing ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            Aceptar
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleRespond(inv.id, 'reject')}
                        disabled={isProcessing}
                        className="flex-1 h-11 bg-white hover:bg-red-50 text-red-500 border-2 border-red-200 font-bold text-sm rounded-xl transition-all duration-200 active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-2"
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

          {/* Footer (skip si ya respondió todo) */}
          {allResponded && (
            <div className="px-6 pb-6 text-center animate-in fade-in duration-500">
              <div className="h-px bg-gray-100 mb-4" />
              <p className="text-xs text-gray-400 font-medium">
                Redirigiendo a tu panel...
              </p>
            </div>
          )}

          {/* Botón para continuar sin responder (si hay más de 1 y ya respondió al menos 1) */}
          {!allResponded && respondedIds.size > 0 && (
            <div className="px-6 pb-6">
              <button
                onClick={onComplete}
                className="w-full h-11 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm rounded-xl transition-all"
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
