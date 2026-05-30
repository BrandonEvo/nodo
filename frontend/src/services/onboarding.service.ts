import api from '@/lib/api';

export const onboardingService = {
  async complete(opts: { moduleCodes: string[]; companyName?: string }) {
    const { data } = await api.patch('/api/onboarding/complete', {
      company_name: opts.companyName || null,
      module_codes: opts.moduleCodes,
    });
    return data;
  },
};
