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

  async listUsers(tenantId: string): Promise<TenantUser[]> {
    const { data } = await api.get<TenantUser[]>(`/api/tenants/${tenantId}/users`);
    return data;
  },

  async createUser(tenantId: string, body: { email: string; password: string }): Promise<TenantUser> {
    const { data } = await api.post<TenantUser>(`/api/tenants/${tenantId}/users`, body);
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
}
