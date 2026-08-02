import api from '@/lib/api';

export interface BillingPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  module_ids: string[];
}

export interface BillingRequestInfo {
  id: string;
  plan_id: string;
  plan_name: string | null;
  status: string;
  note: string | null;
  created_at: string;
}

export interface BillingMe {
  billing_status: string | null;
  access_state: 'pending' | 'active' | 'trialing' | 'grace' | 'locked' | null;
  trial_ends_at: string | null;
  trial_days_remaining: number | null;
  grace_days_remaining: number | null;
  current_plan_id: string | null;
  current_plan_name: string | null;
  pending_request: BillingRequestInfo | null;
}

export const billingService = {
  listPlans: async (): Promise<BillingPlan[]> => {
    const { data } = await api.get<BillingPlan[]>('/api/billing/plans');
    return data;
  },
  me: async (): Promise<BillingMe> => {
    const { data } = await api.get<BillingMe>('/api/billing/me');
    return data;
  },
  request: async (planId: string, note?: string): Promise<BillingRequestInfo> => {
    const { data } = await api.post<BillingRequestInfo>('/api/billing/request', { plan_id: planId, note: note || null });
    return data;
  },
  cancelRequest: async (): Promise<void> => {
    await api.delete('/api/billing/request');
  },
};
