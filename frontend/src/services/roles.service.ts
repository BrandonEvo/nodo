import api from '@/lib/api';

export interface RoleAuditEntry {
  member_id: string;
  user_id: string;
  user_email: string;
  user_full_name: string | null;
  tenant_id: string;
  tenant_name: string;
  member_type: 'owner' | 'admin' | 'employee';
  is_active: boolean;
  assigned_at: string | null;
}

export const rolesService = {
  listAudit: async (params?: { member_type?: string; tenant_id?: string }): Promise<RoleAuditEntry[]> => {
    const { data } = await api.get<RoleAuditEntry[]>('/api/admin/roles/', { params });
    return data;
  },
};
