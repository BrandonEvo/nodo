import api from "@/lib/api";

/** Copy que la landing pública muestra en la tarjeta del plan. */
export interface PlanMarketingCopy {
  tagline: string | null;
  description: string | null;
  features: string[];
  badge_label: string | null;
  cta_label: string | null;
  is_featured: boolean;
  billing_period: string;
  sort_order: number;
  is_public: boolean;
}

export interface SubscriptionPlan extends PlanMarketingCopy {
  id: string;
  name: string;
  price: number;
  currency: string;
  module_ids: string[];
  is_active: boolean;
}

export interface SubscriptionCreate extends Partial<PlanMarketingCopy> {
  name: string;
  price: number;
  currency: string;
  module_ids: string[];
}

export interface SubscriptionUpdate extends Partial<PlanMarketingCopy> {
  name?: string;
  price?: number;
  currency?: string;
  module_ids?: string[];
  is_active?: boolean;
}

export const subscriptionsService = {
  async list(): Promise<SubscriptionPlan[]> {
    const response = await api.get('/api/plans/');
    return response.data;
  },

  async create(body: SubscriptionCreate): Promise<SubscriptionPlan> {
    const response = await api.post('/api/plans/', body);
    return response.data;
  },

  async update(id: string, body: SubscriptionUpdate): Promise<SubscriptionPlan> {
    const response = await api.put(`/api/plans/${id}`, body);
    return response.data;
  },
  
  async delete(id: string): Promise<void> {
    await api.delete(`/api/plans/${id}`);
  },

  async hardDelete(id: string, password: string): Promise<void> {
    await api.post(`/api/plans/${id}/hard-delete`, { password });
  }
};
