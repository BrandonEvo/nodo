import api from '@/lib/api';

export interface RoleRead {
  id: string;
  name: string;
  code: string;
  tenant_id: string;
  is_active: boolean;
}

export interface RoleCreate {
  name: string;
  code: string;
}

export const tenantMeService = {
  async getMyTenant(): Promise<{ id: string; name: string }> {
    const { data } = await api.get<{ id: string; name: string }>('/api/me/tenant/');
    return data;
  },

  async listRoles(): Promise<RoleRead[]> {
    const { data } = await api.get<RoleRead[]>('/api/me/tenant/roles');
    return data;
  },

  async createRole(body: RoleCreate): Promise<RoleRead> {
    const { data } = await api.post<RoleRead>('/api/me/tenant/roles', body);
    return data;
  },

  async listUsers(): Promise<TenantUser[]> {
    const { data } = await api.get<TenantUser[]>('/api/me/tenant/users');
    return data;
  },

  async setUserRole(userId: string, roleId: string | null): Promise<{ id: string; role_id: string | null }> {
    const { data } = await api.patch(`/api/me/tenant/users/${userId}/role`, { role_id: roleId });
    return data;
  },
};

export interface TenantUser {
  id: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  tenant_id: string;
  role_id: string | null;
  is_tenant_admin: boolean;
}
