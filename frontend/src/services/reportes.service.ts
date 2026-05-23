import api from '@/lib/api';

export interface MonthlyProductRow {
  recipe_id: string;
  recipe_name: string;
  harina_total_lbs: number;
  costo_total: number;
  venta_total: number;
  merma_al_costo: number;
  utilidad_producto: number;
  participacion_pct: number;
}

export interface MonthlyTotals {
  harina_total_qq: number;
  costo_total: number;
  venta_total: number;
  merma_total: number;
  utilidad_operativa: number;
  opex_operativo: number;
  owner_drawing: number;
  financing_cost: number;
  opex_total: number;
  utilidad_neta: number;
}

export interface MonthlyReport {
  year: number;
  month: number;
  products: MonthlyProductRow[];
  totals: MonthlyTotals;
}

const BASE = '/api/reportes';

export const reportesService = {
  getMonthly: async (year: number, month: number): Promise<MonthlyReport> => {
    const { data } = await api.get(`${BASE}/mensual`, { params: { year, month } });
    return data;
  },
};
