import api from '@/lib/api';

export interface PublicPlanModule {
  id: string;
  name: string;
  code: string;
  icon: string | null;
}

export interface PublicPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  modules: PublicPlanModule[];
}

export const onboardingService = {
  async listPlans(): Promise<PublicPlan[]> {
    const { data } = await api.get<PublicPlan[]>('/api/onboarding/plans');
    return data;
  },

  async selectPlan(opts: { planId: string; companyName?: string }) {
    const { data } = await api.patch('/api/onboarding/complete', {
      plan_id: opts.planId,
      company_name: opts.companyName ?? null,
    });
    return data;
  },
};
