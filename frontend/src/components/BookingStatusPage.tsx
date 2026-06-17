import { useEffect, useState } from 'react';
import {
  CalendarDays, CalendarPlus, Check, CheckCheck, Clock, Loader2, UserX, X,
} from 'lucide-react';
import { citasService, type PublicAppointment, type AppointmentStatus } from '@/services/citas.service';
import { brandTheme } from '@/lib/utils';

interface Props {
  token: string;
}

const money = (n: number) => `Q${n.toFixed(2)}`;

const parseISODate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const timeOf = (dt: string) => dt.slice(11, 16);

const fullDateTime = (dt: string) => {
  const d = parseISODate(dt.slice(0, 10));
  const label = d.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' });
  return `${label.charAt(0).toUpperCase() + label.slice(1)} · ${timeOf(dt)}`;
};

const STATUS_VIEW: Record<AppointmentStatus, {
  label: string; sub: string; icon: typeof Check; color: string; bg: string;
}> = {
  pendiente:  { label: 'Pendiente de confirmar', sub: 'El negocio revisará tu reserva en breve', icon: Clock,      color: '#b45309', bg: '#fef3c7' },
  confirmada: { label: 'Cita confirmada',        sub: '¡Te esperamos! Llega unos minutos antes',  icon: Check,     color: '#047857', bg: '#d1fae5' },
  rechazada:  { label: 'Cita rechazada',         sub: 'El negocio no pudo aceptar este horario',  icon: X,         color: '#b91c1c', bg: '#fee2e2' },
  cancelada:  { label: 'Cita cancelada',         sub: 'Esta reserva ya no está activa',           icon: X,         color: '#b91c1c', bg: '#fee2e2' },
  completada: { label: 'Cita completada',        sub: 'Gracias por tu visita',                    icon: CheckCheck, color: '#374151', bg: '#f3f4f6' },
  no_asistio: { label: 'No asististe',           sub: 'La cita venció sin registro de visita',    icon: UserX,     color: '#6b7280', bg: '#f3f4f6' },
};

// El archivo .ics dispara el recordatorio nativo del teléfono — sin SMS de pago
function downloadICS(a: PublicAppointment) {
  const start = a.starts_at.replace(/[-:]/g, '').slice(0, 15);
  const endDate = new Date(parseISODate(a.starts_at.slice(0, 10)).getTime());
  const [h, m] = [parseInt(a.starts_at.slice(11, 13)), parseInt(a.starts_at.slice(14, 16))];
  endDate.setHours(h, m + a.duration_minutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  const end = `${endDate.getFullYear()}${pad(endDate.getMonth() + 1)}${pad(endDate.getDate())}T${pad(endDate.getHours())}${pad(endDate.getMinutes())}00`;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nodo//Citas//ES',
    'BEGIN:VEVENT',
    `UID:${a.short_code}@nodo`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${a.service_name}${a.business_name ? ` — ${a.business_name}` : ''}`,
    `DESCRIPTION:Código de reserva: ${a.short_code}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio de cita',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `cita-${a.short_code}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

export function BookingStatusPage({ token }: Props) {
  const [appointment, setAppointment] = useState<PublicAppointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = () =>
    citasService.getPublicAppointment(token)
      .then(setAppointment)
      .catch(() => setError('Cita no encontrada o link inválido.'));

  useEffect(() => {
    load().finally(() => setLoading(false));
    // El estado cambia cuando el negocio confirma — refrescar sin recargar
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      setAppointment(await citasService.cancelPublicAppointment(token));
      setConfirmCancel(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo cancelar la cita.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error || !appointment) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-6">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <CalendarDays className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-gray-700 font-semibold text-center">{error ?? 'Cita no encontrada.'}</p>
        <p className="text-gray-400 text-sm text-center">Verifica el link con el negocio.</p>
      </div>
    );
  }

  const brand = brandTheme(appointment.business_color);
  const view = STATUS_VIEW[appointment.status];
  const StatusIcon = view.icon;
  const active = appointment.status === 'pendiente' || appointment.status === 'confirmada';

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Hero con branding */}
      <div className="relative overflow-hidden px-6 pt-12 pb-16" style={{ background: brand.gradient, color: brand.onBrand }}>
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full pointer-events-none" style={{ background: brand.overlay }} />
        <div className="relative max-w-md mx-auto flex flex-col items-center text-center">
          {appointment.business_logo_url ? (
            <img
              src={appointment.business_logo_url}
              alt={appointment.business_name ?? ''}
              className="w-16 h-16 rounded-[18px] object-contain bg-white p-1.5 shadow-xl"
            />
          ) : (
            <div className="w-16 h-16 rounded-[18px] bg-white shadow-xl flex items-center justify-center">
              <CalendarDays className="w-8 h-8" style={{ color: brand.base }} />
            </div>
          )}
          <h1 className="text-xl font-black tracking-tight mt-3">
            {appointment.business_name ?? 'Tu cita'}
          </h1>
        </div>
      </div>

      <div className="relative -mt-8 max-w-md mx-auto px-4">
        {/* Tarjeta de estado */}
        <div className="bg-white rounded-[28px] shadow-lg border border-gray-100 overflow-hidden">
          <div className="flex flex-col items-center text-center px-6 pt-8 pb-6">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: view.bg }}>
              <StatusIcon size={28} style={{ color: view.color }} />
            </div>
            <p className="text-lg font-black mt-3" style={{ color: view.color }}>{view.label}</p>
            <p className="text-sm text-gray-400 font-medium mt-0.5">{view.sub}</p>
          </div>

          {/* Código de reserva */}
          <div className="mx-6 mb-5 rounded-2xl border-2 border-dashed border-gray-200 py-3.5 text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em]">Código de reserva</p>
            <p className="text-[28px] font-black text-gray-900 tracking-[0.2em] tabular-nums leading-tight">
              {appointment.short_code}
            </p>
          </div>

          {/* Detalle */}
          <div className="px-6 pb-6 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-gray-400">Servicio</span>
              <span className="font-bold text-gray-900 text-right">{appointment.service_name}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-gray-400">Fecha y hora</span>
              <span className="font-bold text-gray-900 text-right">{fullDateTime(appointment.starts_at)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-gray-400">A nombre de</span>
              <span className="font-bold text-gray-900 text-right">{appointment.customer_name}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm pt-3 border-t border-gray-100">
              <span className="font-semibold text-gray-400">Precio</span>
              <span className="text-lg font-black text-gray-900 tabular-nums">{money(appointment.service_price)}</span>
            </div>
          </div>
        </div>

        {/* Acciones */}
        {active && (
          <div className="flex flex-col gap-2.5 mt-5">
            <button
              onClick={() => downloadICS(appointment)}
              className="w-full h-13 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform shadow-md"
              style={{ background: brand.base, color: brand.onBrand }}
            >
              <CalendarPlus size={17} />
              AGREGAR A MI CALENDARIO
            </button>

            {!confirmCancel ? (
              <button
                onClick={() => setConfirmCancel(true)}
                className="w-full py-3 text-sm font-bold text-gray-400 active:scale-[0.97] transition-transform"
              >
                Necesito cancelar mi cita
              </button>
            ) : (
              <div className="bg-white rounded-2xl border border-red-100 p-4">
                <p className="text-sm font-bold text-gray-900 text-center mb-3">¿Seguro que quieres cancelar?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmCancel(false)}
                    className="flex-1 h-11 rounded-xl border-2 border-gray-200 text-gray-500 text-xs font-bold active:scale-95 transition-transform"
                  >
                    No, mantenerla
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="flex-1 h-11 rounded-xl bg-red-500 text-white text-xs font-black active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    {cancelling ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                    Sí, cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="text-center py-6">
          <p className="text-xs text-gray-400">
            Powered by <span className="font-semibold text-gray-500">Nodo</span>
          </p>
        </div>
      </div>
    </div>
  );
}
