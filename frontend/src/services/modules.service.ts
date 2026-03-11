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
    const { data } = await api.get<ModuleRead[]>('/api/modules/');
    return data;
  },

  async create(body: ModuleCreate): Promise<ModuleRead> {
    const { data } = await api.post<ModuleRead>('/api/modules/', body);
    return data;
  },

  async update(id: string, body: Partial<ModuleCreate & { is_active: boolean }>): Promise<ModuleRead> {
    const { data } = await api.patch<ModuleRead>(`/api/modules/${id}`, body);
    return data;
  },

  async listByTenant(tenantId: string): Promise<ModuleRead[]> {
    const { data } = await api.get<ModuleRead[]>(`/api/tenants/${tenantId}/modules`);
    return data;
  },

  async setForTenant(tenantId: string, moduleIds: string[]): Promise<ModuleRead[]> {
    const { data } = await api.put<ModuleRead[]>(`/api/tenants/${tenantId}/modules`, moduleIds);
    return data;
  },
};
