import api from '@/lib/api';

export interface TenantUser {
  id: string;
  tenant_member_id: string;
  email: string;
  full_name?: string | null;
  picture?: string | null;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  member_type: string;
  is_tenant_admin: boolean;
  module_ids: string[];
}

export const tenantMeService = {
  async getMyTenant(): Promise<{ id: string; name: string; logo_url?: string | null; theme_color?: string | null }> {
    const { data } = await api.get<{ id: string; name: string; logo_url?: string | null; theme_color?: string | null }>('/api/me/tenant/');
    return data;
  },

  async updateConfig(payload: { name?: string; logo_url?: string; theme_color?: string }): Promise<any> {
    const { data } = await api.put('/api/me/tenant/config', payload);
    return data;
  },

  async listUsers(): Promise<TenantUser[]> {
    const { data } = await api.get<TenantUser[]>('/api/me/tenant/users');
    return data;
  },

  async setUserModules(userId: string, moduleIds: string[]): Promise<{ id: string; module_ids: string[] }> {
    const { data } = await api.put(`/api/me/tenant/users/${userId}/modules`, { module_ids: moduleIds });
    return data;
  },
};
