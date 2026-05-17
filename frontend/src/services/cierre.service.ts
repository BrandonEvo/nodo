import api from '@/lib/api';

export interface ShiftSummary {
  efectivo: number;
  tarjeta: number;
  total: number;
  tickets: number;
  promedio: number;
}

export interface ShiftRegister {
  id: string;
  tenant_id: string;
  expected_cash: number;
  actual_cash: number;
  difference: number;
  card_total: number;
  total_sales: number;
  ticket_count: number;
  notes: string | null;
  closed_at: string | null;
  created_at: string;
}

const BASE = '/api/cierre';

export const cierreService = {
  getSummary: async (): Promise<ShiftSummary> => {
    const { data } = await api.get(`${BASE}/summary`);
    return data;
  },

  closeShift: async (actual_cash: number, notes?: string): Promise<ShiftRegister> => {
    const { data } = await api.post(`${BASE}/`, { actual_cash, notes });
    return data;
  },

  listShifts: async (): Promise<ShiftRegister[]> => {
    const { data } = await api.get(`${BASE}/`);
    return data;
  },
};
