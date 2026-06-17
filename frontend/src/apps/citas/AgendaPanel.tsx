import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus, Check, CheckCheck, ChevronLeft, ChevronRight, Clock, Loader2,
  MessageCircle, Phone, Tag, UserX, X,
} from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import {
  citasService,
  type BookingAgenda, type BookingAppointment, type BookingDaySummary, type BookingMonth,
  type BookingService, type BookingSettings, type AppointmentStatus,
} from '@/services/citas.service';
import {
  durationLabel, money, monthISO, parseISODate, parseMonth, shortDateLabel,
  timeOf, toISODate, todayISO, whatsappLink, WEEKDAYS_SHORT,
} from './shared';

const STATUS_CHIP: Record<AppointmentStatus, { label: string; cls: string }> = {
  pendiente:  { label: 'Pendiente',  cls: 'bg-nodo-warn-bg border-nodo-warn-bd text-nodo-warn-tx' },
  confirmada: { label: 'Confirmada', cls: 'bg-nodo-success-bg border-nodo-success-bd text-nodo-success-tx' },
  rechazada:  { label: 'Rechazada',  cls: 'bg-nodo-danger-bg border-nodo-danger-bd text-nodo-danger-tx' },
  cancelada:  { label: 'Cancelada',  cls: 'bg-nodo-danger-bg border-nodo-danger-bd text-nodo-danger-tx' },
  completada: { label: 'Completada', cls: 'bg-nodo-inset border-nodo-line text-nodo-sub' },
  no_asistio: { label: 'No asistió', cls: 'bg-nodo-inset border-nodo-line text-nodo-dim' },
};

const MODE_OPTS = [
  { value: 'mes' as const, label: 'Mes' },
  { value: 'dia' as const, label: 'Día' },
];

type Mode = 'mes' | 'dia';

interface Props {
  agenda: BookingAgenda | null;
  date: string;
  settings: BookingSettings | null;
  services: BookingService[];
  onChangeDate: (date: string) => Promise<void>;
  onReload: () => Promise<void>;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export function AgendaPanel({
  agenda, date, settings, services, onChangeDate, onReload, onError, onSuccess,
}: Props) {
  const [actingId, setActingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [mode, setMode] = useState<Mode>('mes');

  const [month, setMonth] = useState(() => monthISO(parseISODate(date)));
  const [monthData, setMonthData] = useState<BookingMonth | null>(null);
  const [pending, setPending] = useState<BookingAppointment[]>([]);

  const loadMonth = useCallback(async (m: string) => {
    try {
      const [mr, pr] = await Promise.all([
        citasService.getAgendaMonth(m),
        citasService.listPendingAppointments(),
      ]);
      setMonthData(mr);
      setPending(pr);
    } catch {
      // silencioso: el polling externo reintenta
    }
  }, []);

  useEffect(() => { loadMonth(month); }, [month, loadMonth]);

  // Acciones recargan también el resumen del mes y los pendientes
  const reloadAll = useCallback(async () => {
    await Promise.all([onReload(), loadMonth(month)]);
  }, [onReload, loadMonth, month]);

  const handleAction = async (
    a: BookingAppointment,
    action: 'confirm' | 'reject' | 'cancel' | 'complete' | 'no-show',
  ) => {
    if (actingId) return;
    setActingId(a.id);
    try {
      if (action === 'confirm') await citasService.confirmAppointment(a.id);
      else if (action === 'reject') await citasService.rejectAppointment(a.id);
      else if (action === 'cancel') await citasService.cancelAppointment(a.id);
      else if (action === 'complete') await citasService.completeAppointment(a.id);
      else await citasService.noShowAppointment(a.id);
      await reloadAll();
    } catch (err: any) {
      onError(err?.response?.data?.detail ?? 'No se pudo actualizar la cita');
      await reloadAll();
    } finally {
      setActingId(null);
    }
  };

  const confirmMessage = (a: BookingAppointment) =>
    `Hola ${a.customer_name}, te confirmo tu cita de ${a.service_name} el ${shortDateLabel(a.starts_at.slice(0, 10))} a las ${timeOf(a.starts_at)}. ¡Te esperamos!`;

  const appointments = agenda?.appointments ?? [];

  const goToDay = async (d: string) => {
    setMode('dia');
    await onChangeDate(d);
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* FOCO: pendientes por confirmar — lo primero al abrir el módulo */}
        {pending.length > 0 && (
          <div className="nodo-card-hero p-5 bg-nodo-warn-bg border-nodo-warn-bd">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-2xl bg-nodo-warn-bd/40 flex items-center justify-center shrink-0">
                <Clock size={18} className="text-nodo-warn-tx" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-nodo-warn-tx leading-tight">Pendientes por confirmar</p>
                <p className="text-[11px] font-semibold text-nodo-warn-tx/70">
                  {pending.length} cita{pending.length !== 1 ? 's' : ''} esperan tu respuesta
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              {pending.map(a => {
                const acting = actingId === a.id;
                return (
                  <div key={a.id} className="bg-nodo-card rounded-2xl border border-nodo-line p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-nodo-ink truncate">{a.customer_name}</p>
                        <p className="text-xs text-nodo-sub mt-0.5 truncate">
                          {a.service_name} · <span className="font-bold tabular-nums">{money(a.service_price)}</span>
                        </p>
                        <p className="text-[11px] font-bold text-nodo-warn-tx mt-0.5 tabular-nums">
                          {shortDateLabel(a.starts_at.slice(0, 10))} · {timeOf(a.starts_at)}
                        </p>
                      </div>
                      <a
                        href={whatsappLink(a.customer_phone, confirmMessage(a))}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-nodo-success-tx shrink-0 mt-0.5"
                      >
                        <MessageCircle size={12} /> WhatsApp
                      </a>
                    </div>
                    <div className="flex gap-2 mt-2.5">
                      <button
                        onClick={() => handleAction(a, 'confirm')}
                        disabled={acting}
                        className="flex-1 h-9 rounded-xl bg-nodo-ink text-nodo-canvas text-xs font-black active:scale-[0.97] transition-transform disabled:opacity-40 flex items-center justify-center gap-1.5"
                      >
                        {acting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        CONFIRMAR
                      </button>
                      <button
                        onClick={() => handleAction(a, 'reject')}
                        disabled={acting}
                        className="h-9 px-4 rounded-xl border-2 border-nodo-danger-bd text-nodo-danger-tx text-xs font-bold active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-1.5"
                      >
                        <X size={14} /> Rechazar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <SegmentedControl options={MODE_OPTS} value={mode} onChange={v => setMode(v)} size="sm" />

        {mode === 'mes' ? (
          <MonthCalendar
            month={month}
            data={monthData}
            selectedDate={date}
            onPrev={() => setMonth(shiftMonth(month, -1))}
            onNext={() => setMonth(shiftMonth(month, 1))}
            onPickDay={goToDay}
          />
        ) : (
          <>
            {/* Tira de días — 2 semanas */}
            <DayStrip date={date} onChangeDate={onChangeDate} />

            {/* Citas del día */}
            {appointments.length === 0 ? (
              <div className="nodo-empty-state">
                <CalendarPlus size={32} className="text-nodo-dim mb-2" />
                <p className="text-sm font-bold text-nodo-dim">Sin citas para este día</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {appointments.map(a => {
                  const chip = STATUS_CHIP[a.status];
                  const acting = actingId === a.id;
                  const finished = !['pendiente', 'confirmada'].includes(a.status);
                  return (
                    <div key={a.id} className={`nodo-card p-4 ${finished ? 'opacity-60' : ''}`}>
                      <div className="flex items-start gap-3">
                        <div className="w-14 shrink-0 text-center">
                          <p className="text-lg font-black text-nodo-ink tabular-nums leading-tight">{timeOf(a.starts_at)}</p>
                          <p className="text-[10px] font-semibold text-nodo-dim">{durationLabel(a.duration_minutes)}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-nodo-ink truncate">{a.customer_name}</p>
                            <span className={`border rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase shrink-0 ${chip.cls}`}>
                              {chip.label}
                            </span>
                          </div>
                          <p className="text-xs text-nodo-sub mt-0.5 truncate">
                            {a.service_name} · <span className="font-bold tabular-nums">{money(a.service_price)}</span>
                          </p>
                          {a.customer_note && (
                            <p className="text-[11px] text-nodo-dim mt-1 italic line-clamp-2">"{a.customer_note}"</p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <a
                              href={whatsappLink(a.customer_phone, confirmMessage(a))}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-nodo-success-tx"
                            >
                              <MessageCircle size={12} /> WhatsApp
                            </a>
                            <a
                              href={`tel:${a.customer_phone}`}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-nodo-sub"
                            >
                              <Phone size={12} /> {a.customer_phone}
                            </a>
                            <span className="text-[11px] font-bold text-nodo-dim tabular-nums ml-auto shrink-0">{a.short_code}</span>
                          </div>
                        </div>
                      </div>

                      {/* Acciones por estado */}
                      {a.status === 'pendiente' && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleAction(a, 'confirm')}
                            disabled={acting}
                            className="flex-1 h-10 rounded-xl bg-nodo-ink text-nodo-canvas text-xs font-black active:scale-[0.97] transition-transform disabled:opacity-40 flex items-center justify-center gap-1.5"
                          >
                            {acting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            CONFIRMAR
                          </button>
                          <button
                            onClick={() => handleAction(a, 'reject')}
                            disabled={acting}
                            className="h-10 px-4 rounded-xl border-2 border-nodo-danger-bd text-nodo-danger-tx text-xs font-bold active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-1.5"
                          >
                            <X size={14} /> Rechazar
                          </button>
                        </div>
                      )}
                      {a.status === 'confirmada' && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleAction(a, 'complete')}
                            disabled={acting}
                            className="flex-1 h-10 rounded-xl bg-nodo-success-tx text-white text-xs font-black active:scale-[0.97] transition-transform disabled:opacity-40 flex items-center justify-center gap-1.5"
                          >
                            {acting ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
                            COMPLETADA
                          </button>
                          <button
                            onClick={() => handleAction(a, 'no-show')}
                            disabled={acting}
                            className="h-10 px-3 rounded-xl border-2 border-nodo-line text-nodo-sub text-xs font-bold active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-1.5"
                          >
                            <UserX size={14} /> No vino
                          </button>
                          <button
                            onClick={() => handleAction(a, 'cancel')}
                            disabled={acting}
                            className="h-10 px-3 rounded-xl border-2 border-nodo-danger-bd text-nodo-danger-tx text-xs font-bold active:scale-95 transition-transform disabled:opacity-40"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <button onClick={() => setShowNew(true)} className="nodo-btn-primary">
          <CalendarPlus size={20} />
          NUEVA CITA
        </button>
      </div>

      <NuevaCitaSheet
        open={showNew}
        onClose={() => setShowNew(false)}
        settings={settings}
        services={services}
        defaultDate={date}
        onDone={async msg => {
          setShowNew(false);
          onSuccess(msg);
          await reloadAll();
        }}
        onError={onError}
      />
    </>
  );
}

function shiftMonth(month: string, delta: number): string {
  const d = parseMonth(month);
  return monthISO(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}

// ── Tira de días (modo Día) ─────────────────────────────────────────────────

function DayStrip({ date, onChangeDate }: { date: string; onChangeDate: (d: string) => Promise<void> }) {
  const dayStrip = useMemo(() => {
    const days: string[] = [];
    const base = new Date();
    for (let i = 0; i < 14; i++) {
      days.push(toISODate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)));
    }
    return days;
  }, []);

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {dayStrip.map(d => {
        const selected = d === date;
        return (
          <button
            key={d}
            onClick={() => onChangeDate(d)}
            className={`shrink-0 px-3.5 py-2 rounded-2xl text-xs font-bold transition-colors ${
              selected
                ? 'bg-nodo-ink text-nodo-canvas'
                : 'bg-nodo-card border border-nodo-line text-nodo-sub hover:bg-nodo-raised'
            }`}
          >
            {d === todayISO() ? 'Hoy' : shortDateLabel(d)}
          </button>
        );
      })}
    </div>
  );
}

// ── Calendario de mes completo (modo Mes) ───────────────────────────────────

interface CalendarProps {
  month: string;
  data: BookingMonth | null;
  selectedDate: string;
  onPrev: () => void;
  onNext: () => void;
  onPickDay: (d: string) => void;
}

function MonthCalendar({ month, data, selectedDate, onPrev, onNext, onPickDay }: CalendarProps) {
  const first = parseMonth(month);
  const monthLabel = first.toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
  const summaryByDate = useMemo(() => {
    const map = new Map<string, BookingDaySummary>();
    for (const d of data?.days ?? []) map.set(d.date, d);
    return map;
  }, [data]);

  // Lunes-primero: offset de la primera celda
  const leadBlanks = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array(leadBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      toISODate(new Date(first.getFullYear(), first.getMonth(), i + 1)),
    ),
  ];

  return (
    <div className="nodo-card p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onPrev}
          className="w-9 h-9 rounded-xl bg-nodo-inset border border-nodo-line flex items-center justify-center text-nodo-ink active:scale-90 transition-transform"
        >
          <ChevronLeft size={16} />
        </button>
        <p className="text-sm font-black text-nodo-ink capitalize">{monthLabel}</p>
        <button
          onClick={onNext}
          className="w-9 h-9 rounded-xl bg-nodo-inset border border-nodo-line flex items-center justify-center text-nodo-ink active:scale-90 transition-transform"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS_SHORT.map(w => (
          <div key={w} className="text-center text-[9px] font-bold text-nodo-dim uppercase tracking-wider py-1">
            {w.charAt(0)}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((iso, idx) => {
          if (!iso) return <div key={`b${idx}`} />;
          const summary = summaryByDate.get(iso);
          const total = summary?.total ?? 0;
          const pending = summary?.pending ?? 0;
          const hasOffer = summary?.has_offer ?? false;
          const isToday = iso === todayISO();
          const selected = iso === selectedDate;
          const dayNum = Number(iso.slice(8, 10));
          return (
            <button
              key={iso}
              onClick={() => onPickDay(iso)}
              className={`relative aspect-square rounded-xl flex flex-col items-center justify-center transition-colors ${
                selected
                  ? 'bg-nodo-ink text-nodo-canvas'
                  : pending > 0
                    ? 'bg-nodo-warn-bg border border-nodo-warn-bd'
                    : total > 0
                      ? 'bg-nodo-primary-soft'
                      : 'bg-nodo-inset hover:bg-nodo-raised'
              }`}
            >
              <span
                className={`text-xs font-bold tabular-nums ${
                  selected ? 'text-nodo-canvas' : isToday ? 'text-nodo-primary' : 'text-nodo-ink'
                }`}
              >
                {dayNum}
              </span>
              {total > 0 && (
                <span
                  className={`text-[9px] font-black tabular-nums leading-none ${
                    selected ? 'text-nodo-canvas/80' : pending > 0 ? 'text-nodo-warn-tx' : 'text-nodo-sub'
                  }`}
                >
                  {total}
                </span>
              )}
              {hasOffer && (
                <span
                  className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                    selected ? 'bg-nodo-canvas' : 'bg-nodo-primary'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 flex-wrap mt-3 pt-3 border-t border-nodo-line">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-nodo-sub">
          <span className="w-2.5 h-2.5 rounded bg-nodo-warn-bg border border-nodo-warn-bd" /> Pendientes
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-nodo-sub">
          <span className="w-2.5 h-2.5 rounded bg-nodo-primary-soft" /> Con citas
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-nodo-sub">
          <Tag size={11} className="text-nodo-primary" /> Oferta
        </span>
      </div>
    </div>
  );
}

// ── Cita manual del negocio (walk-in / por teléfono) ────────────────────────

interface NuevaCitaProps {
  open: boolean;
  onClose: () => void;
  settings: BookingSettings | null;
  services: BookingService[];
  defaultDate: string;
  onDone: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}

function NuevaCitaSheet({ open, onClose, settings, services, defaultDate, onDone, onError }: NuevaCitaProps) {
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const published = services.filter(s => s.is_published);

  useEffect(() => {
    if (!open) return;
    setServiceId(published[0]?.id ?? '');
    setDate(defaultDate);
    setSlot('');
    setName('');
    setPhone('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // La disponibilidad se consulta por el endpoint público — es la misma
  // información que ve el cliente, no hace falta duplicarla en el tenant API
  useEffect(() => {
    if (!open || !settings || !serviceId || !date) return;
    setLoadingSlots(true);
    setSlot('');
    citasService.getPublicSlots(settings.public_token, serviceId, date)
      .then(r => setSlots(r.slots))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [open, settings, serviceId, date]);

  const valid = serviceId && slot && name.trim().length >= 2 && phone.trim().length >= 6;

  const handleSave = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await citasService.createAppointment({
        service_id: serviceId,
        starts_at: slot,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
      });
      await onDone('Cita creada y confirmada');
    } catch (err: any) {
      onError(err?.response?.data?.detail ?? 'No se pudo crear la cita');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Nueva cita"
      footer={
        <button onClick={handleSave} disabled={!valid || saving} className="nodo-btn-primary">
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          CREAR CITA
        </button>
      }
    >
      <div className="space-y-4 px-1">
        {published.length === 0 ? (
          <p className="text-sm font-bold text-nodo-dim text-center py-8">
            Primero crea un servicio en la pestaña Servicios
          </p>
        ) : (
          <>
            <div>
              <label className="nodo-label">Servicio</label>
              <select value={serviceId} onChange={e => setServiceId(e.target.value)} className="nodo-select">
                {published.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {money(s.price)} · {durationLabel(s.duration_minutes)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="nodo-label">Fecha</label>
              <input
                type="date"
                value={date}
                min={todayISO()}
                onChange={e => setDate(e.target.value)}
                className="nodo-input"
              />
            </div>

            <div>
              <label className="nodo-label">Hora</label>
              {loadingSlots ? (
                <div className="flex items-center justify-center h-16">
                  <Loader2 size={18} className="animate-spin text-nodo-sub" />
                </div>
              ) : slots.length === 0 ? (
                <p className="text-xs font-bold text-nodo-dim py-3">Sin horarios libres este día</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {slots.map(s => (
                    <button
                      key={s}
                      onClick={() => setSlot(s)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold tabular-nums transition-colors ${
                        slot === s
                          ? 'bg-nodo-ink text-nodo-canvas'
                          : 'bg-nodo-inset border border-nodo-line text-nodo-ink hover:bg-nodo-raised'
                      }`}
                    >
                      {timeOf(s)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="nodo-label">Nombre del cliente</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nombre y apellido"
                className="nodo-input"
              />
            </div>

            <div>
              <label className="nodo-label">Teléfono</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="5555 5555"
                className="nodo-input"
              />
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
