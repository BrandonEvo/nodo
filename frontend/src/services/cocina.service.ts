import api from '@/lib/api';

export interface ProductionOrder {
  id: string;
  tenant_id: string;
  recipe_id: string;
  recipe_name: string;
  quantity: number;
  actual_units: number | null;
  status: 'pending' | 'en_proceso' | 'completed';
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface WasteLog {
  id: string;
  production_order_id: string;
  quantity: number;
  reason: string | null;
  created_at: string;
}

export interface OrderPreviewIngredient {
  name: string;
  unit: string;
  required: number;
  available: number;
  sufficient: boolean;
}

export interface OrderPreview {
  recipe_id: string;
  recipe_name: string;
  estimated_yield: number;
  total_units: number;
  estimated_cost: number;
  ingredients: OrderPreviewIngredient[];
}

export interface DayCell {
  harina_lbs: number;
  costo: number;
  venta: number;
  utilidad: number;
}

export interface MatrixRecipeRow {
  recipe_id: string;
  recipe_name: string;
  sell_price: number;
  days: Record<string, DayCell>;
  totals: DayCell;
}

export interface MatrixResponse {
  year: number;
  month: number;
  days: number[];
  recipes: MatrixRecipeRow[];
  daily_totals: Record<string, DayCell>;
  grand_totals: DayCell;
}

const BASE = '/api/cocina';

export const cocinaService = {
  listOrders: async (): Promise<ProductionOrder[]> => {
    const { data } = await api.get(`${BASE}/orders`);
    return data;
  },

  getPreview: async (recipeId: string, quantity: number): Promise<OrderPreview> => {
    const { data } = await api.get(`${BASE}/preview/${recipeId}`, { params: { quantity } });
    return data;
  },

  createOrder: async (recipe_id: string, quantity: number): Promise<ProductionOrder> => {
    const { data } = await api.post(`${BASE}/orders`, { recipe_id, quantity });
    return data;
  },

  startOrder: async (id: string): Promise<ProductionOrder> => {
    const { data } = await api.patch(`${BASE}/orders/${id}/start`);
    return data;
  },

  completeOrder: async (id: string, actual_units?: number): Promise<ProductionOrder> => {
    const { data } = await api.patch(`${BASE}/orders/${id}/complete`, { actual_units: actual_units ?? null });
    return data;
  },

  logWaste: async (id: string, quantity: number, reason?: string): Promise<WasteLog> => {
    const { data } = await api.post(`${BASE}/orders/${id}/waste`, { quantity, reason });
    return data;
  },

  deleteOrder: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/orders/${id}`);
  },

  getMatriz: async (year: number, month: number): Promise<MatrixResponse> => {
    const { data } = await api.get(`${BASE}/matriz-mensual`, { params: { year, month } });
    return data;
  },
};
