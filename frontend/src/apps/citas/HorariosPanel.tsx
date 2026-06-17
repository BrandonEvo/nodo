import { useEffect, useState } from 'react';
import { CalendarOff, Check, Loader2, Plus, Trash2, X } from 'lucide-react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import {
  citasService,
  type BookingException, type BookingHourIn, type BookingSettings,
} from '@/services/citas.service';
import { WEEKDAYS, shortDateLabel, shortTime, todayISO } from './shared';

const CONFIRM_OPTS = [
  { value: 'manual', label: 'Yo confirmo' },
  { value: 'auto', label: 'Automática' },
];

const GRANULARITIES = [15, 20, 30, 45, 60];

// Editor en memoria: un rango por día (cubre el 95% de los negocios);
// el backend soporta varios rangos por día para horario partido futuro
type DayRow = { open: boolean; start: string; end: string };

const DEFAULT_DAY: DayRow = { open: false, start: '09:00', end: '17:00' };

interface Props {
  settings: BookingSettings | null;
  onUpdateSettings: (body: Partial<Omit<BookingSettings, 'public_token'>>) => Promise<void>;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export function HorariosPanel({ settings, onUpdateSettings, onError, onSuccess }: Props) {
  const [days, setDays] = useState<DayRow[]>(Array(7).fill(DEFAULT_DAY));
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [exceptions, setExceptions] = useState<BookingException[]>([]);
  const [showException, setShowException] = useState(false);
  const [excDate, setExcDate] = useState(todayISO());
  const [excNote, setExcNote] = useState('');
  const [savingExc, setSavingExc] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [hours, excs] = await Promise.all([
          citasService.listHours(),
          citasService.listExceptions(),
        ]);
        const rows: DayRow[] = Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY }));
        for (const h of hours) {
          rows[h.weekday] = { open: true, start: shortTime(h.start_time), end: shortTime(h.end_time) };
        }
        setDays(rows);
        setExceptions(excs);
      } catch {
        onError('Error al cargar los horarios');
      } finally {
        setLoaded(true);
      }
    })();
  }, [onError]);

  const setDay = (i: number, patch: Partial<DayRow>) => {
    setDays(prev => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
    setDirty(true);
  };

  const handleSaveHours = async () => {
    if (saving) return;
    for (const [i, d] of days.entries()) {
      if (d.open && d.start >= d.end) {
        onError(`${WEEKDAYS[i]}: la hora de inicio debe ser anterior a la de fin`);
        return;
      }
    }
    setSaving(true);
    try {
      const body: BookingHourIn[] = days
        .map((d, weekday) => ({ weekday, start_time: d.start, end_time: d.end, open: d.open }))
        .filter(d => d.open)
        .map(({ weekday, start_time, end_time }) => ({ weekday, start_time, end_time }));
      await citasService.replaceHours(body);
      setDirty(false);
      onSuccess('Horario guardado');
    } catch (err: any) {
      onError(err?.response?.data?.detail ?? 'No se pudo guardar el horario');
    } finally {
      setSaving(false);
    }
  };

  const handleAddException = async () => {
    if (savingExc || !excDate) return;
    setSavingExc(true);
    try {
      await citasService.upsertException({ date: excDate, is_closed: true, note: excNote.trim() || null });
      setExceptions(await citasService.listExceptions());
      setShowException(false);
      setExcNote('');
      onSuccess('Día bloqueado');
    } catch (err: any) {
      onError(err?.response?.data?.detail ?? 'No se pudo bloquear el día');
    } finally {
      setSavingExc(false);
    }
  };

  const handleDeleteException = async (id: string) => {
    try {
      await citasService.deleteException(id);
      setExceptions(prev => prev.filter(e => e.id !== id));
      onSuccess('Día desbloqueado');
    } catch {
      onError('No se pudo eliminar la excepción');
    }
  };

  if (!loaded || !settings) {
    return (
      <div className="nodo-spinner-container">
        <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Estado de la agenda */}
        <div className="nodo-card p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-nodo-ink">
              {settings.is_open ? 'Agenda abierta' : 'Agenda pausada'}
            </p>
            <p className="text-xs text-nodo-sub mt-0.5">
              {settings.is_open ? 'Los clientes pueden reservar en línea' : 'No se aceptan reservas nuevas'}
            </p>
          </div>
          <button
            onClick={() => onUpdateSettings({ is_open: !settings.is_open })}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${settings.is_open ? 'bg-nodo-success-tx' : 'bg-nodo-inset border border-nodo-line'}`}
          >
            <span
              className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${settings.is_open ? 'left-6' : 'left-1'}`}
            />
          </button>
        </div>

        {/* Modo de confirmación */}
        <div className="nodo-card p-4">
          <p className="text-sm font-bold text-nodo-ink">Confirmación de citas</p>
          <p className="text-xs text-nodo-sub mt-0.5 mb-3">
            {settings.confirmation_mode === 'manual'
              ? 'Cada reserva queda pendiente hasta que la confirmes'
              : 'Las reservas se confirman solas al instante'}
          </p>
          <SegmentedControl
            options={CONFIRM_OPTS}
            value={settings.confirmation_mode}
            onChange={v => onUpdateSettings({ confirmation_mode: v as 'manual' | 'auto' })}
            size="sm"
          />
        </div>

        {/* Reglas de reserva */}
        <div className="nodo-card p-4 grid grid-cols-3 gap-3">
          <div>
            <label className="nodo-label">Cada</label>
            <select
              value={settings.slot_granularity_minutes}
              onChange={e => onUpdateSettings({ slot_granularity_minutes: Number(e.target.value) })}
              className="nodo-select"
            >
              {GRANULARITIES.map(g => <option key={g} value={g}>{g} min</option>)}
            </select>
          </div>
          <div>
            <label className="nodo-label">Anticipación</label>
            <select
              value={settings.min_notice_hours}
              onChange={e => onUpdateSettings({ min_notice_hours: Number(e.target.value) })}
              className="nodo-select"
            >
              {[0, 1, 2, 4, 12, 24, 48].map(h => (
                <option key={h} value={h}>{h === 0 ? 'Sin mínimo' : `${h} h antes`}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="nodo-label">Hasta</label>
            <select
              value={settings.max_days_ahead}
              onChange={e => onUpdateSettings({ max_days_ahead: Number(e.target.value) })}
              className="nodo-select"
            >
              {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} días</option>)}
            </select>
          </div>
        </div>

        {/* Plantilla semanal */}
        <div className="nodo-card p-4">
          <p className="nodo-section-label">Horario semanal</p>
          <div className="flex flex-col gap-2.5">
            {days.map((d, i) => (
              <div key={i} className="flex items-center gap-3">
                <button
                  onClick={() => setDay(i, { open: !d.open })}
                  className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${d.open ? 'bg-nodo-success-tx' : 'bg-nodo-inset border border-nodo-line'}`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${d.open ? 'left-[18px]' : 'left-0.5'}`}
                  />
                </button>
                <span className={`w-20 text-sm font-bold shrink-0 ${d.open ? 'text-nodo-ink' : 'text-nodo-dim'}`}>
                  {WEEKDAYS[i]}
                </span>
                {d.open ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input
                      type="time"
                      value={d.start}
                      onChange={e => setDay(i, { start: e.target.value })}
                      className="nodo-input !h-9 !px-2 text-xs flex-1 min-w-0"
                    />
                    <span className="text-nodo-dim text-xs shrink-0">a</span>
                    <input
                      type="time"
                      value={d.end}
                      onChange={e => setDay(i, { end: e.target.value })}
                      className="nodo-input !h-9 !px-2 text-xs flex-1 min-w-0"
                    />
                  </div>
                ) : (
                  <span className="text-xs font-semibold text-nodo-dim">Cerrado</span>
                )}
              </div>
            ))}
          </div>
          {dirty && (
            <button
              onClick={handleSaveHours}
              disabled={saving}
              className="w-full h-12 mt-4 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-sm active:scale-[0.97] transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              GUARDAR HORARIO
            </button>
          )}
        </div>

        {/* Días bloqueados */}
        <div className="nodo-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="nodo-section-label !mb-0">Días bloqueados</p>
            <button
              onClick={() => setShowException(true)}
              className="inline-flex items-center gap-1 text-xs font-bold text-nodo-sub"
            >
              <Plus size={14} /> Bloquear día
            </button>
          </div>
          {exceptions.length === 0 ? (
            <p className="text-xs font-semibold text-nodo-dim py-2">
              Sin bloqueos — feriados o vacaciones se agregan aquí
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {exceptions.map(e => (
                <div key={e.id} className="flex items-center gap-3 bg-nodo-inset border border-nodo-line rounded-2xl px-3.5 py-2.5">
                  <CalendarOff size={15} className="text-nodo-dim shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-nodo-ink">{shortDateLabel(e.date)}</p>
                    {e.note && <p className="text-[11px] text-nodo-sub truncate">{e.note}</p>}
                  </div>
                  <button
                    onClick={() => handleDeleteException(e.id)}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-nodo-danger-tx active:scale-90 transition-transform shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomSheet
        open={showException}
        onClose={() => setShowException(false)}
        title="Bloquear un día"
        footer={
          <button onClick={handleAddException} disabled={savingExc || !excDate} className="nodo-btn-primary">
            {savingExc ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />}
            BLOQUEAR DÍA
          </button>
        }
      >
        <div className="space-y-4 px-1">
          <div>
            <label className="nodo-label">Fecha</label>
            <input
              type="date"
              value={excDate}
              min={todayISO()}
              onChange={e => setExcDate(e.target.value)}
              className="nodo-input"
            />
          </div>
          <div>
            <label className="nodo-label">Motivo (opcional)</label>
            <input
              type="text"
              value={excNote}
              onChange={e => setExcNote(e.target.value)}
              placeholder="Ej: Feriado, vacaciones"
              className="nodo-input"
            />
          </div>
          <p className="text-xs text-nodo-sub">
            Ese día no se ofrecerán horarios en la agenda pública. Las citas ya
            reservadas no se cancelan solas.
          </p>
        </div>
      </BottomSheet>
    </>
  );
}
