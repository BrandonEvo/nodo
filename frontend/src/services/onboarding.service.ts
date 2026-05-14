import api from '@/lib/api';

export const onboardingService = {
  /** Completa el onboarding del dueño: actualiza nombre del tenant y marca como completado */
  async complete(companyName: string): Promise<{ detail: string; tenant_name: string; onboarding_completed: boolean }> {
    const { data } = await api.patch('/api/onboarding/complete', {
      company_name: companyName,
    });
    return data;
  },
};
