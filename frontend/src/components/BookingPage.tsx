import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronRight, Clock, Loader2, Sparkles, Tag, X } from 'lucide-react';
import {
  citasService,
  type PublicAgenda, type PublicBookingService, type PublicDay, type PublicOffer,
} from '@/services/citas.service';
import { brandTheme } from '@/lib/utils';

interface Props {
  token: string;
}

const money = (n: number) => `Q${n.toFixed(2)}`;

const durationLabel = (m: number) =>
  m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`;

/** "2026-06-13" → Date local (sin shift UTC) */
const parseISODate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const timeOf = (dt: string) => dt.slice(11, 16);

const dayLabel = (iso: string) => {
  const label = parseISODate(iso).toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric', month: 'short' });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const fullDateTime = (dt: string) => {
  const d = parseISODate(dt.slice(0, 10));
  const label = d.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' });
  return `${label.charAt(0).toUpperCase() + label.slice(1)} · ${timeOf(dt)}`;
};

const offerBadge = (o: PublicOffer) =>
  o.offer_type === 'two_for_one' ? '2x1'
    : o.offer_type === 'percent' ? `-${o.value ?? 0}%`
    : money(o.value ?? 0);

const offerDates = (o: PublicOffer) => {
  const a = parseISODate(o.starts_on);
  const b = parseISODate(o.ends_on);
  const fmt = (d: Date) => {
    const l = d.toLocaleDateString('es-GT', { day: 'numeric', month: 'short' });
    return l.charAt(0).toUpperCase() + l.slice(1);
  };
  return o.starts_on === o.ends_on ? fmt(a) : `${fmt(a)} – ${fmt(b)}`;
};

export function BookingPage({ token }: Props) {
  const [agenda, setAgenda] = useState<PublicAgenda | null>(null);
  const [offers, setOffers] = useState<PublicOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [service, setService] = useState<PublicBookingService | null>(null);
  const [days, setDays] = useState<PublicDay[]>([]);
  const [nextAvailable, setNextAvailable] = useState<string | null>(null);
  const [loadingDays, setLoadingDays] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const stepDaysRef = useRef<HTMLDivElement>(null);
  const stepSlotsRef = useRef<HTMLDivElement>(null);
  const stepFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    citasService.getPublicAgenda(token)
      .then(setAgenda)
      .catch(() => setError('Agenda no encontrada o link inválido.'))
      .finally(() => setLoading(false));
    // Las ofertas son un extra — si fallan no rompen la reserva
    citasService.getPublicOffers(token).then(setOffers).catch(() => {});
  }, [token]);

  const pickService = async (s: PublicBookingService) => {
    setService(s);
    setDate(null);
    setSlot(null);
    setSlots([]);
    setLoadingDays(true);
    try {
      const r = await citasService.getPublicDays(token, s.id);
      setDays(r.days);
      setNextAvailable(r.next_available);
      setTimeout(() => stepDaysRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch {
      setError('No se pudo cargar la disponibilidad.');
    } finally {
      setLoadingDays(false);
    }
  };

  const pickDate = async (d: string) => {
    if (!service) return;
    setDate(d);
    setSlot(null);
    setLoadingSlots(true);
    try {
      const r = await citasService.getPublicSlots(token, service.id, d);
      setSlots(r.slots);
      setTimeout(() => stepSlotsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const pickSlot = (s: string) => {
    setSlot(s);
    setTimeout(() => stepFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  // El chip "próxima disponible" se salta los pasos de día y hora
  const pickNextAvailable = async () => {
    if (!nextAvailable || !service) return;
    const d = nextAvailable.slice(0, 10);
    setDate(d);
    setLoadingSlots(true);
    try {
      const r = await citasService.getPublicSlots(token, service.id, d);
      setSlots(r.slots);
      setSlot(nextAvailable);
      setTimeout(() => stepFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const { morning, afternoon } = useMemo(() => {
    const morning: string[] = [];
    const afternoon: string[] = [];
    for (const s of slots) {
      (parseInt(s.slice(11, 13), 10) < 12 ? morning : afternoon).push(s);
    }
    return { morning, afternoon };
  }, [slots]);

  const formValid = name.trim().length >= 2 && phone.trim().length >= 6;

  const handleSubmit = async () => {
    if (!service || !slot || !formValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await citasService.createPublicAppointment(token, {
        service_id: service.id,
        starts_at: slot,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        customer_note: note.trim() || null,
      });
      window.location.href = `/cita/${created.appointment_token}`;
    } catch (err: any) {
      setSubmitError(err?.response?.data?.detail ?? 'No se pudo reservar. Intenta de nuevo.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error || !agenda) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-6">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <CalendarDays className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-gray-700 font-semibold text-center">{error}</p>
        <p className="text-gray-400 text-sm text-center">Verifica el link con el negocio.</p>
      </div>
    );
  }

  const brand = brandTheme(agenda.business_color);

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Hero con branding del negocio */}
      <div className="relative overflow-hidden px-6 pt-12 pb-16" style={{ background: brand.gradient, color: brand.onBrand }}>
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full pointer-events-none" style={{ background: brand.overlay }} />
        <div className="absolute -bottom-24 -left-10 w-48 h-48 rounded-full pointer-events-none" style={{ background: brand.overlay }} />

        <div className="relative max-w-md mx-auto flex flex-col items-center text-center">
          {agenda.business_logo_url ? (
            <img
              src={agenda.business_logo_url}
              alt={agenda.business_name ?? ''}
              className="w-20 h-20 rounded-[22px] object-contain bg-white p-1.5 shadow-xl"
            />
          ) : (
            <div className="w-20 h-20 rounded-[22px] bg-white shadow-xl flex items-center justify-center">
              <CalendarDays className="w-9 h-9" style={{ color: brand.base }} />
            </div>
          )}

          <h1 className="text-[26px] font-black tracking-tight leading-tight mt-3">
            {agenda.business_name ?? 'Agenda'}
          </h1>
          <p className="text-sm font-medium mt-0.5" style={{ opacity: 0.8 }}>
            Reserva tu cita en línea
          </p>

          <div
            className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold"
            style={{ background: brand.overlay }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${agenda.is_open ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {agenda.is_open ? 'Reservas abiertas' : 'Sin reservas por ahora'}
          </div>
        </div>
      </div>

      <div className="relative -mt-8 bg-gray-50 rounded-t-[32px] pt-6">
        <div className="max-w-md mx-auto px-4 flex flex-col gap-6">

          {/* Ofertas vigentes — gancho para el cliente */}
          {offers.length > 0 && (
            <section>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-3 px-1 flex items-center gap-1.5">
                <Tag size={12} /> Ofertas de hoy
              </p>
              <div className="flex flex-col gap-2.5">
                {offers.map((o, i) => (
                  <div
                    key={i}
                    className="rounded-3xl p-4 flex items-center gap-3.5 shadow-md"
                    style={{ background: brand.gradient, color: brand.onBrand }}
                  >
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 font-black text-sm tabular-nums text-center leading-tight px-1"
                      style={{ background: brand.overlay }}
                    >
                      {offerBadge(o)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black leading-snug truncate">{o.title}</p>
                      {o.description && (
                        <p className="text-xs font-medium truncate" style={{ opacity: 0.85 }}>{o.description}</p>
                      )}
                      <p className="text-[11px] font-bold mt-0.5" style={{ opacity: 0.8 }}>
                        {offerDates(o)}
                        {o.service_name ? ` · ${o.service_name}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* PASO 1 — Servicio */}
          <section>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-3 px-1">
              1 · Elige tu servicio
            </p>
            {agenda.services.length === 0 ? (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-10 text-center">
                <CalendarDays className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-gray-400">Aún no hay servicios disponibles</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {agenda.services.map(s => {
                  const selected = service?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => pickService(s)}
                      disabled={!agenda.is_open}
                      className="w-full bg-white rounded-3xl shadow-sm border-2 p-4 flex items-center gap-3.5 text-left active:scale-[0.99] transition-all disabled:opacity-50"
                      style={{ borderColor: selected ? brand.base : 'transparent' }}
                    >
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black shrink-0"
                        style={{ background: brand.base + '14', color: brand.base }}
                      >
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 leading-snug">{s.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          <Clock size={11} className="inline -mt-0.5 mr-1" />
                          {durationLabel(s.duration_minutes)}
                          {s.description && <span> · {s.description}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-base font-black text-gray-900 tabular-nums">{money(s.price)}</span>
                        {selected
                          ? <Check size={16} style={{ color: brand.base }} />
                          : <ChevronRight size={16} className="text-gray-300" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* PASO 2 — Día */}
          {service && (
            <section ref={stepDaysRef} className="scroll-mt-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-3 px-1">
                2 · Elige el día
              </p>
              {loadingDays ? (
                <div className="flex items-center justify-center h-20">
                  <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
                </div>
              ) : (
                <>
                  {nextAvailable && (
                    <button
                      onClick={pickNextAvailable}
                      className="w-full mb-3 rounded-2xl px-4 py-3 flex items-center gap-2.5 text-sm font-bold active:scale-[0.98] transition-transform shadow-md"
                      style={{ background: brand.base, color: brand.onBrand }}
                    >
                      <Sparkles size={16} className="shrink-0" />
                      <span className="flex-1 text-left">Próxima disponible</span>
                      <span className="tabular-nums">{fullDateTime(nextAvailable)}</span>
                    </button>
                  )}
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                    {days.map(d => {
                      const selected = d.date === date;
                      return (
                        <button
                          key={d.date}
                          onClick={() => d.has_slots && pickDate(d.date)}
                          disabled={!d.has_slots}
                          className={`shrink-0 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-colors border-2 ${
                            d.has_slots
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'bg-gray-100 text-gray-300 border-transparent'
                          }`}
                          style={selected ? { borderColor: brand.base, color: brand.base } : { borderColor: d.has_slots ? 'transparent' : undefined }}
                        >
                          {dayLabel(d.date)}
                        </button>
                      );
                    })}
                  </div>
                  {!days.some(d => d.has_slots) && (
                    <p className="text-sm font-semibold text-gray-400 text-center py-4">
                      No hay horarios disponibles por ahora — intenta más tarde
                    </p>
                  )}
                </>
              )}
            </section>
          )}

          {/* PASO 3 — Hora */}
          {service && date && (
            <section ref={stepSlotsRef} className="scroll-mt-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-3 px-1">
                3 · Elige la hora
              </p>
              {loadingSlots ? (
                <div className="flex items-center justify-center h-20">
                  <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
                </div>
              ) : slots.length === 0 ? (
                <p className="text-sm font-semibold text-gray-400 text-center py-4">
                  Este día se llenó — prueba con otro
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {([['Mañana', morning], ['Tarde', afternoon]] as const).map(([label, group]) =>
                    group.length === 0 ? null : (
                      <div key={label}>
                        <p className="text-[11px] font-bold text-gray-400 mb-2 px-1">{label}</p>
                        <div className="grid grid-cols-4 gap-2">
                          {group.map(s => {
                            const selected = s === slot;
                            return (
                              <button
                                key={s}
                                onClick={() => pickSlot(s)}
                                className="h-11 rounded-2xl text-sm font-bold tabular-nums transition-all border-2 bg-white shadow-sm active:scale-95"
                                style={selected
                                  ? { background: brand.base, color: brand.onBrand, borderColor: brand.base }
                                  : { borderColor: 'transparent', color: '#111827' }}
                              >
                                {timeOf(s)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </section>
          )}

          {/* PASO 4 — Datos y confirmación */}
          {service && slot && (
            <section ref={stepFormRef} className="scroll-mt-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-3 px-1">
                4 · Confirma tu reserva
              </p>
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
                {/* Resumen */}
                <div className="bg-gray-50 rounded-2xl p-4 mb-4 flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: brand.base + '14', color: brand.base }}
                  >
                    <CalendarDays size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-gray-900 truncate">{service.name}</p>
                    <p className="text-xs font-semibold text-gray-500">{fullDateTime(slot)}</p>
                  </div>
                  <span className="text-base font-black text-gray-900 tabular-nums shrink-0">{money(service.price)}</span>
                </div>

                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Tu nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Nombre y apellido"
                  className="w-full h-12 px-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm font-semibold text-gray-900 outline-none focus:border-gray-300 mb-3"
                />

                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Tu teléfono</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="5555 5555"
                  className="w-full h-12 px-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm font-semibold text-gray-900 outline-none focus:border-gray-300 mb-3"
                />

                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Nota (opcional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Algo que el negocio deba saber"
                  className="w-full h-12 px-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm font-semibold text-gray-900 outline-none focus:border-gray-300 mb-4"
                />

                {submitError && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-2xl px-3.5 py-2.5 mb-3">
                    <X size={14} className="text-red-400 mt-0.5 shrink-0" />
                    <p className="text-xs font-semibold text-red-500">{submitError}</p>
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={!formValid || submitting}
                  className="w-full h-14 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-30 shadow-lg"
                  style={{ background: brand.base, color: brand.onBrand }}
                >
                  {submitting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  RESERVAR
                </button>
                <p className="text-[11px] text-gray-400 text-center mt-3">
                  {agenda.confirmation_mode === 'manual'
                    ? 'El negocio confirmará tu cita — recibirás un link para consultarla.'
                    : 'Tu cita queda confirmada al instante.'}
                </p>
              </div>
            </section>
          )}

          <div className="text-center py-4">
            <p className="text-xs text-gray-400">
              Powered by <span className="font-semibold text-gray-500">Nodo</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
