import api from '@/lib/api';

export interface ModuleRead {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
}

export interface ModuleCreate {
  name: string;
  code: string;
  description?: string;
}

export const modulesService = {
  async list(): Promise<ModuleRead[]> {
    const { data } = await api.get<ModuleRead[]>('/api/admin/modules/');
    return data;
  },

  async create(body: ModuleCreate): Promise<ModuleRead> {
    const { data } = await api.post<ModuleRead>('/api/admin/modules/', body);
    return data;
  },

  async update(id: string, body: Partial<ModuleCreate & { is_active: boolean }>): Promise<ModuleRead> {
    const { data } = await api.patch<ModuleRead>(`/api/admin/modules/${id}`, body);
    return data;
  },

  async listByTenant(tenantId: string): Promise<ModuleRead[]> {
    const { data } = await api.get<ModuleRead[]>(`/api/admin/modules/tenant/${tenantId}`);
    return data;
  },

  async setForTenant(tenantId: string, moduleIds: string[]): Promise<ModuleRead[]> {
    const { data } = await api.put<ModuleRead[]>(`/api/admin/modules/tenant/${tenantId}`, moduleIds);
    return data;
  },

  async getMyActiveModules(tenantId: string): Promise<ModuleRead[]> {
    const { data } = await api.get<ModuleRead[]>('/api/tenant-modules/my-modules', {
      headers: { 'x-tenant-id': tenantId }
    });
    return data;
  },

  async hardDelete(id: string, password: string): Promise<void> {
    await api.post(`/api/admin/modules/${id}/hard-delete`, { password });
  }
};
