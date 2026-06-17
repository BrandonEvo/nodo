import api from '@/lib/api';

export type AppointmentStatus =
  | 'pendiente' | 'confirmada' | 'rechazada'
  | 'cancelada' | 'completada' | 'no_asistio';

export interface BookingSettings {
  public_token: string;
  is_open: boolean;
  confirmation_mode: 'manual' | 'auto';
  slot_granularity_minutes: number;
  min_notice_hours: number;
  max_days_ahead: number;
  timezone: string;
}

export interface BookingService {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  is_published: boolean;
}

export interface BookingServiceCreate {
  name: string;
  description?: string | null;
  price: number;
  duration_minutes: number;
  is_published?: boolean;
}

export type BookingServiceUpdate = Partial<BookingServiceCreate>;

export interface BookingHour {
  id: string;
  weekday: number;        // 0=lunes ... 6=domingo
  start_time: string;     // "HH:MM:SS"
  end_time: string;
}

export interface BookingHourIn {
  weekday: number;
  start_time: string;
  end_time: string;
}

export interface BookingException {
  id: string;
  date: string;           // "YYYY-MM-DD"
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
}

export interface BookingExceptionCreate {
  date: string;
  is_closed: boolean;
  start_time?: string | null;
  end_time?: string | null;
  note?: string | null;
}

export interface BookingAppointment {
  id: string;
  short_code: string;
  public_token: string;
  customer_name: string;
  customer_phone: string;
  customer_note: string | null;
  service_id: string;
  service_name: string;
  service_price: number;
  duration_minutes: number;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: 'cliente' | 'negocio' | null;
  created_at: string;
}

export interface BookingAgenda {
  appointments: BookingAppointment[];
  pending_count: number;
}

export type OfferType = 'percent' | 'two_for_one' | 'fixed';

export interface BookingOffer {
  id: string;
  title: string;
  description: string | null;
  offer_type: OfferType;
  value: number | null;
  service_id: string | null;
  service_name: string | null;
  starts_on: string;        // "YYYY-MM-DD"
  ends_on: string;
  is_published: boolean;
}

export interface BookingOfferCreate {
  title: string;
  description?: string | null;
  offer_type: OfferType;
  value?: number | null;
  service_id?: string | null;
  starts_on: string;
  ends_on: string;
  is_published?: boolean;
}

export type BookingOfferUpdate = Partial<BookingOfferCreate>;

export interface BookingDaySummary {
  date: string;
  total: number;
  pending: number;
  has_offer: boolean;
}

export interface BookingMonth {
  month: string;
  days: BookingDaySummary[];
  pending_total: number;
}

// ── Tipos de los endpoints públicos (sin auth) ──────────────────────────────

export interface PublicBookingService {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
}

export interface PublicAgenda {
  business_name: string | null;
  business_logo_url: string | null;
  business_color: string | null;
  is_open: boolean;
  confirmation_mode: 'manual' | 'auto';
  max_days_ahead: number;
  services: PublicBookingService[];
}

export interface PublicOffer {
  title: string;
  description: string | null;
  offer_type: OfferType;
  value: number | null;
  service_id: string | null;
  service_name: string | null;
  starts_on: string;
  ends_on: string;
}

export interface PublicDay {
  date: string;
  has_slots: boolean;
}

export interface PublicDays {
  days: PublicDay[];
  next_available: string | null;
}

export interface PublicSlots {
  date: string;
  slots: string[];
}

export interface PublicAppointmentCreated {
  appointment_token: string;
  short_code: string;
  status: AppointmentStatus;
  starts_at: string;
}

export interface PublicAppointment {
  short_code: string;
  status: AppointmentStatus;
  service_name: string;
  service_price: number;
  duration_minutes: number;
  starts_at: string;
  customer_name: string;
  business_name: string | null;
  business_logo_url: string | null;
  business_color: string | null;
}

const BASE = '/api/citas';
const PUBLIC_BASE = '/api/booking';

export const citasService = {
  getSettings: async (): Promise<BookingSettings> => {
    const { data } = await api.get(`${BASE}/settings`);
    return data;
  },

  updateSettings: async (body: Partial<Omit<BookingSettings, 'public_token'>>): Promise<BookingSettings> => {
    const { data } = await api.patch(`${BASE}/settings`, body);
    return data;
  },

  listServices: async (): Promise<BookingService[]> => {
    const { data } = await api.get(`${BASE}/services`);
    return data;
  },

  createService: async (body: BookingServiceCreate): Promise<BookingService> => {
    const { data } = await api.post(`${BASE}/services`, body);
    return data;
  },

  updateService: async (id: string, body: BookingServiceUpdate): Promise<BookingService> => {
    const { data } = await api.patch(`${BASE}/services/${id}`, body);
    return data;
  },

  deleteService: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/services/${id}`);
  },

  listHours: async (): Promise<BookingHour[]> => {
    const { data } = await api.get(`${BASE}/hours`);
    return data;
  },

  replaceHours: async (body: BookingHourIn[]): Promise<BookingHour[]> => {
    const { data } = await api.put(`${BASE}/hours`, body);
    return data;
  },

  listExceptions: async (): Promise<BookingException[]> => {
    const { data } = await api.get(`${BASE}/exceptions`);
    return data;
  },

  upsertException: async (body: BookingExceptionCreate): Promise<BookingException> => {
    const { data } = await api.post(`${BASE}/exceptions`, body);
    return data;
  },

  deleteException: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/exceptions/${id}`);
  },

  getAgenda: async (date: string): Promise<BookingAgenda> => {
    const { data } = await api.get(`${BASE}/agenda`, { params: { date } });
    return data;
  },

  listAppointments: async (params: {
    status?: AppointmentStatus;
    date_from?: string;
    date_to?: string;
    limit?: number;
  } = {}): Promise<BookingAppointment[]> => {
    const { data } = await api.get(`${BASE}/appointments`, { params });
    return data;
  },

  createAppointment: async (body: {
    service_id: string;
    starts_at: string;
    customer_name: string;
    customer_phone: string;
    customer_note?: string | null;
  }): Promise<BookingAppointment> => {
    const { data } = await api.post(`${BASE}/appointments`, body);
    return data;
  },

  confirmAppointment: async (id: string): Promise<BookingAppointment> => {
    const { data } = await api.post(`${BASE}/appointments/${id}/confirm`);
    return data;
  },

  rejectAppointment: async (id: string): Promise<BookingAppointment> => {
    const { data } = await api.post(`${BASE}/appointments/${id}/reject`);
    return data;
  },

  cancelAppointment: async (id: string): Promise<BookingAppointment> => {
    const { data } = await api.post(`${BASE}/appointments/${id}/cancel`);
    return data;
  },

  completeAppointment: async (id: string): Promise<BookingAppointment> => {
    const { data } = await api.post(`${BASE}/appointments/${id}/complete`);
    return data;
  },

  noShowAppointment: async (id: string): Promise<BookingAppointment> => {
    const { data } = await api.post(`${BASE}/appointments/${id}/no-show`);
    return data;
  },

  getAgendaMonth: async (month: string): Promise<BookingMonth> => {
    const { data } = await api.get(`${BASE}/agenda/month`, { params: { month } });
    return data;
  },

  listPendingAppointments: async (): Promise<BookingAppointment[]> => {
    const { data } = await api.get(`${BASE}/appointments/pending`);
    return data;
  },

  // ── Ofertas ──

  listOffers: async (): Promise<BookingOffer[]> => {
    const { data } = await api.get(`${BASE}/offers`);
    return data;
  },

  createOffer: async (body: BookingOfferCreate): Promise<BookingOffer> => {
    const { data } = await api.post(`${BASE}/offers`, body);
    return data;
  },

  updateOffer: async (id: string, body: BookingOfferUpdate): Promise<BookingOffer> => {
    const { data } = await api.patch(`${BASE}/offers/${id}`, body);
    return data;
  },

  deleteOffer: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/offers/${id}`);
  },

  // ── Públicos (sin autenticación) ──

  getPublicAgenda: async (token: string): Promise<PublicAgenda> => {
    const { data } = await api.get(`${PUBLIC_BASE}/agenda/${token}`);
    return data;
  },

  getPublicOffers: async (token: string): Promise<PublicOffer[]> => {
    const { data } = await api.get(`${PUBLIC_BASE}/agenda/${token}/offers`);
    return data;
  },

  getPublicDays: async (token: string, serviceId: string): Promise<PublicDays> => {
    const { data } = await api.get(`${PUBLIC_BASE}/agenda/${token}/days`, { params: { service_id: serviceId } });
    return data;
  },

  getPublicSlots: async (token: string, serviceId: string, date: string): Promise<PublicSlots> => {
    const { data } = await api.get(`${PUBLIC_BASE}/agenda/${token}/slots`, { params: { service_id: serviceId, date } });
    return data;
  },

  createPublicAppointment: async (
    token: string,
    body: {
      service_id: string;
      starts_at: string;
      customer_name: string;
      customer_phone: string;
      customer_note?: string | null;
    },
  ): Promise<PublicAppointmentCreated> => {
    const { data } = await api.post(`${PUBLIC_BASE}/agenda/${token}/appointments`, body);
    return data;
  },

  getPublicAppointment: async (appointmentToken: string): Promise<PublicAppointment> => {
    const { data } = await api.get(`${PUBLIC_BASE}/appointments/${appointmentToken}`);
    return data;
  },

  cancelPublicAppointment: async (appointmentToken: string): Promise<PublicAppointment> => {
    const { data } = await api.post(`${PUBLIC_BASE}/appointments/${appointmentToken}/cancel`);
    return data;
  },
};
