import api from '@/lib/api';

export interface ExpenseLine {
  id: string;
  tenant_id: string;
  category: string;
  cost_center: string | null;
  concept: string;
  qty: number;
  unit_cost: number;
  total: number;
  month: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ExpenseCategoryTotals {
  operating_expense: number;
  owner_drawing: number;
  financing_cost: number;
  total: number;
}

export interface ExpenseSummary {
  month: string;
  expenses: Record<string, ExpenseLine[]>;
  totals: ExpenseCategoryTotals;
}

export const CATEGORY_LABELS: Record<string, string> = {
  operating_expense: 'OPEX Operativo',
  owner_drawing: 'Retiros del Propietario',
  financing_cost: 'Costos Financieros',
};

export const CC_LABELS: Record<string, string> = {
  administrativos: 'Administrativos',
  empaques: 'Empaques',
  produccion: 'Producción',
  ventas: 'Ventas',
  mantenimiento: 'Mantenimiento',
  otros: 'Otros',
};

const BASE = '/api/gastos';

export const gastosService = {
  getSummary: async (month: string): Promise<ExpenseSummary> => {
    const { data } = await api.get(`${BASE}/summary`, { params: { month } });
    return data;
  },

  create: async (body: Omit<ExpenseLine, 'id' | 'tenant_id' | 'total' | 'is_active' | 'created_at'>): Promise<ExpenseLine> => {
    const { data } = await api.post(`${BASE}/`, body);
    return data;
  },

  update: async (id: string, body: Partial<Omit<ExpenseLine, 'id' | 'tenant_id' | 'total' | 'is_active' | 'created_at'>>): Promise<ExpenseLine> => {
    const { data } = await api.patch(`${BASE}/${id}`, body);
    return data;
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/${id}`);
  },
};
