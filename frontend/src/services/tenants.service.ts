import api from '@/lib/api';

export interface Tenant {
  id: string;
  name: string;
  is_active: boolean;
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

  async get(id: string): Promise<Tenant> {
    const { data } = await api.get<Tenant>(`/api/tenants/${id}`);
    return data;
  },

  async update(id: string, body: Partial<Pick<Tenant, 'name' | 'is_active'>>): Promise<Tenant> {
    const { data } = await api.patch<Tenant>(`/api/tenants/${id}`, body);
    return data;
  },

  async hardDelete(id: string, password: string): Promise<void> {
    await api.post(`/api/tenants/${id}/hard-delete`, { password });
  },

  async listUsers(tenantId: string): Promise<TenantUser[]> {
    const { data } = await api.get<TenantUser[]>(`/api/tenants/${tenantId}/users`);
    return data;
  },

  // Se actualizó la firma para aceptar los nuevos campos del panel (is_superuser, is_active)
  async createUser(tenantId: string, body: { email: string; password?: string; is_superuser?: boolean; is_active?: boolean }): Promise<TenantUser> {
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

  // Gestión de Roles por Tenant (SuperAdmin)
  async listRoles(tenantId: string): Promise<any[]> {
    const { data } = await api.get<any[]>(`/api/tenants/${tenantId}/roles`);
    return data;
  },

  async createRole(tenantId: string, body: { name: string; code: string }): Promise<any> {
    const { data } = await api.post<any>(`/api/tenants/${tenantId}/roles`, body);
    return data;
  },

  async updateRole(tenantId: string, roleId: string, body: { name?: string; is_active?: boolean }): Promise<any> {
    const { data } = await api.put<any>(`/api/tenants/${tenantId}/roles/${roleId}`, body);
    return data;
  },

  async deleteRole(tenantId: string, roleId: string): Promise<void> {
    await api.delete(`/api/tenants/${tenantId}/roles/${roleId}`);
  },

  async hardDeleteRole(tenantId: string, roleId: string, password: string): Promise<void> {
    await api.post(`/api/tenants/${tenantId}/roles/${roleId}/hard-delete`, { password });
  }
};