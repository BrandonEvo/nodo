import api from '@/lib/api';

export interface ProductionOrder {
  id: string;
  tenant_id: string;
  recipe_id: string;
  recipe_name: string;
  quantity: number;
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

const BASE = '/api/cocina';

export const cocinaService = {
  listOrders: async (): Promise<ProductionOrder[]> => {
    const { data } = await api.get(`${BASE}/orders`);
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

  completeOrder: async (id: string): Promise<ProductionOrder> => {
    const { data } = await api.patch(`${BASE}/orders/${id}/complete`);
    return data;
  },

  logWaste: async (id: string, quantity: number, reason?: string): Promise<WasteLog> => {
    const { data } = await api.post(`${BASE}/orders/${id}/waste`, { quantity, reason });
    return data;
  },

  deleteOrder: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/orders/${id}`);
  },
};
