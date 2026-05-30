import api from '@/lib/api';
import type { Recipe } from './recetas.service';

export interface SaleItemCreate {
  recipe_id: string;
  quantity: number;
  price: number;
  freshness_tag?: 'fresco' | 'ayer';
}

export interface SaleItemRead {
  id: string;
  recipe_id: string;
  recipe_name: string;
  recipe_icon: string | null;
  quantity: number;
  price: number;
  freshness_tag: string;
}

export interface Sale {
  id: string;
  tenant_id: string;
  total: number;
  payment_method: string;
  created_at: string;
  items: SaleItemRead[];
}

const BASE = '/api/mostrador';

export const mostradorService = {
  listProducts: async (): Promise<Recipe[]> => {
    const { data } = await api.get(`${BASE}/products`);
    return data;
  },

  createSale: async (payment_method: string, items: SaleItemCreate[]): Promise<Sale> => {
    const { data } = await api.post(`${BASE}/sales`, { payment_method, items });
    return data;
  },

  listTodaySales: async (): Promise<Sale[]> => {
    const { data } = await api.get(`${BASE}/sales`);
    return data;
  },

  cancelSale: async (saleId: string): Promise<void> => {
    await api.delete(`${BASE}/sales/${saleId}`);
  },
};
