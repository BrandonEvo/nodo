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

  /** Cierra el onboarding. `planId` es el plan que le interesó: no habilita nada. */
  async complete(opts: { companyName?: string; planId?: string }) {
    const { data } = await api.patch('/api/onboarding/complete', {
      company_name: opts.companyName ?? null,
      plan_id: opts.planId ?? null,
    });
    return data;
  },
};
