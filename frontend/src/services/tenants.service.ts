import api from '@/lib/api';

export interface Tenant {
  id: string;
  name: string;
  is_active: boolean;
  plan_id: string | null;
  created_at: string;
}

export interface TenantCreate {
  name: string;
}

export interface TenantUser {
  id: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  tenant_id: string;
  member_type: string;
  is_google_user: boolean;
}

export const tenantsService = {
  async list(): Promise<Tenant[]> {
    const { data } = await api.get<Tenant[]>('/api/tenants/');
    return data;
  },

  async create(body: TenantCreate): Promise<Tenant> {
    const { data } = await api.post<Tenant>('/api/tenants/', body);
    return data;
  },

  async update(id: string, body: Partial<Pick<Tenant, 'name' | 'is_active'>>): Promise<Tenant> {
    const { data } = await api.patch<Tenant>(`/api/tenants/${id}`, body);
    return data;
  },

  async setTenantPlan(id: string, planId: string): Promise<Tenant> {
    const { data } = await api.put<Tenant>(`/api/tenants/${id}/plan`, { plan_id: planId });
    return data;
  },

  async hardDelete(id: string, password: string): Promise<void> {
    await api.post(`/api/tenants/${id}/hard-delete`, { password });
  },

  async listUsers(tenantId: string): Promise<TenantUser[]> {
    const { data } = await api.get<TenantUser[]>(`/api/tenants/${tenantId}/users`);
    return data;
  },

  // Se actualizó la firma para aceptar los nuevos campos del panel (is_superuser, is_active, member_type)
  async createUser(tenantId: string, body: { email: string; password?: string; is_superuser?: boolean; is_active?: boolean; member_type?: string }): Promise<TenantUser> {
    const { data } = await api.post<TenantUser>(`/api/tenants/${tenantId}/users`, body);
    return data;
  },

  // Endpoint de fastapi-users para actualizar
  async updateUser(userId: string, body: Partial<TenantUser> & { password?: string }): Promise<TenantUser> {
    const { data } = await api.patch<TenantUser>(`/api/users/${userId}`, body);
    return data;
  },

  // Endpoint de fastapi-users implementando la eliminación lógica
  async deleteUser(userId: string): Promise<TenantUser> {
    const { data } = await api.patch<TenantUser>(`/api/users/${userId}`, { is_active: false });
    return data;
  },

  async hardDeleteUser(tenantId: string, userId: string, password: string): Promise<void> {
    await api.post(`/api/tenants/${tenantId}/users/${userId}/hard-delete`, { password });
  },

  async getUserModules(tenantId: string, userId: string): Promise<string[]> {
    const { data } = await api.get<string[]>(`/api/tenants/${tenantId}/users/${userId}/modules`);
    return data;
  },

  async updateUserModules(tenantId: string, userId: string, moduleIds: string[]): Promise<void> {
    await api.put(`/api/tenants/${tenantId}/users/${userId}/modules`, moduleIds);
  }
};