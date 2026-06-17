// Helpers de fecha/hora del módulo Citas — las citas viven en hora local
// del negocio (strings naive del backend), nunca convertir a UTC.

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const money = (n: number) =>
  'Q' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function todayISO(): string {
  return toISODate(new Date());
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "2026-06-13" → Date local (sin el shift UTC de new Date("YYYY-MM-DD")) */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** weekday del backend (0=lunes) para una fecha ISO */
export function backendWeekday(iso: string): number {
  return (parseISODate(iso).getDay() + 6) % 7;
}

/** "2026-06-13T10:00:00" → "10:00" */
export function timeOf(datetime: string): string {
  return datetime.slice(11, 16);
}

/** "09:00:00" | "09:00" → "09:00" */
export function shortTime(t: string): string {
  return t.slice(0, 5);
}

/** "2026-06-13" → "Vie 13 jun" */
export function shortDateLabel(iso: string): string {
  const d = parseISODate(iso);
  const label = d.toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric', month: 'short' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "2026-06-13T10:00:00" → "Viernes 13 de junio, 10:00" */
export function longDateTimeLabel(datetime: string): string {
  const d = parseISODate(datetime.slice(0, 10));
  const label = d.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' });
  return `${label.charAt(0).toUpperCase() + label.slice(1)}, ${timeOf(datetime)}`;
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Link de WhatsApp con mensaje pre-llenado */
export function whatsappLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const full = digits.length === 8 ? `502${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}

/** Etiqueta corta del tipo + valor de una oferta */
export function offerLabel(type: 'percent' | 'two_for_one' | 'fixed', value: number | null): string {
  if (type === 'two_for_one') return '2x1';
  if (type === 'percent') return `-${value ?? 0}%`;
  return money(value ?? 0);
}

/** Mes ISO de hoy: "YYYY-MM" */
export function monthISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "YYYY-MM" → primer día (Date local) */
export function parseMonth(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1);
}
