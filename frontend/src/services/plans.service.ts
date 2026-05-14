import api from '@/lib/api';

export interface SubscriptionPlanRead {
  id: string;
  name: string;
  price: number;
  currency: string;
  is_active: boolean;
  module_ids: string[];
}

export interface SubscriptionPlanCreate {
  name: string;
  price?: number;
  currency?: string;
  module_ids?: string[];
}

export const plansService = {
  async list(): Promise<SubscriptionPlanRead[]> {
    const { data } = await api.get<SubscriptionPlanRead[]>('/api/plans/');
    return data;
  },

  async create(body: SubscriptionPlanCreate): Promise<SubscriptionPlanRead> {
    const { data } = await api.post<SubscriptionPlanRead>('/api/plans/', body);
    return data;
  },

  async update(id: string, body: Partial<SubscriptionPlanCreate & { is_active: boolean }>): Promise<SubscriptionPlanRead> {
    const { data } = await api.put<SubscriptionPlanRead>(`/api/plans/${id}`, body);
    return data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/api/plans/${id}`);
  },

  async hardDelete(id: string, password: string): Promise<void> {
    await api.post(`/api/plans/${id}/hard-delete`, { password });
  }
};
