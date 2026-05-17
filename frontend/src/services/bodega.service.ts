import api from '@/lib/api';

export interface InventoryItem {
  id: string;
  tenant_id: string;
  name: string;
  unit: string;
  current_stock: number;
  minimum_stock: number;
  category: string | null;
  is_active: boolean;
  created_at: string;
}

export interface InventoryItemCreate {
  name: string;
  unit?: string;
  current_stock?: number;
  minimum_stock?: number;
  category?: string | null;
}

export interface StockAdjust {
  quantity: number;
  adjust_type: 'entrada' | 'ajuste';
}

const BASE = '/api/bodega';

export const bodegaService = {
  listItems: async (): Promise<InventoryItem[]> => {
    const { data } = await api.get(`${BASE}/items`);
    return data;
  },

  createItem: async (body: InventoryItemCreate): Promise<InventoryItem> => {
    const { data } = await api.post(`${BASE}/items`, body);
    return data;
  },

  updateItem: async (id: string, body: Partial<InventoryItemCreate>): Promise<InventoryItem> => {
    const { data } = await api.patch(`${BASE}/items/${id}`, body);
    return data;
  },

  adjustStock: async (id: string, body: StockAdjust): Promise<InventoryItem> => {
    const { data } = await api.patch(`${BASE}/items/${id}/adjust`, body);
    return data;
  },

  deleteItem: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/items/${id}`);
  },
};
