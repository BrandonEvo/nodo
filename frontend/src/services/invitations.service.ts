import api from '@/lib/api';

export interface InvitationData {
  id: string;
  email: string;
  tenant_id: string;
  member_type: string;
  status: string;
  token: string;
  expires_at: string;
  created_at: string;
  tenant_name?: string;
}

export interface InvitationCreatePayload {
  email: string;
  member_type: string;
}

export const invitationsService = {
  /** Lista todas las invitaciones del tenant del admin actual */
  async list(): Promise<InvitationData[]> {
    const { data } = await api.get<InvitationData[]>('/api/invitations/');
    return data;
  },

  /** Crea una nueva invitación (admin) */
  async create(payload: InvitationCreatePayload): Promise<InvitationData> {
    const { data } = await api.post<InvitationData>('/api/invitations/', payload);
    return data;
  },

  /** Responde a una invitación (accept/reject) */
  async respond(invitationId: string, action: 'accept' | 'reject'): Promise<{ detail: string }> {
    const { data } = await api.post<{ detail: string }>(
      `/api/invitations/${invitationId}/respond`,
      { action }
    );
    return data;
  },

  /** Revoca una invitación pendiente (admin) */
  async revoke(invitationId: string): Promise<{ detail: string }> {
    const { data } = await api.patch<{ detail: string }>(
      `/api/invitations/${invitationId}/revoke`
    );
    return data;
  },

  /** Reenvía una invitación pendiente (admin) */
  async resend(invitationId: string): Promise<{ detail: string }> {
    const { data } = await api.post<{ detail: string }>(
      `/api/invitations/${invitationId}/resend`
    );
    return data;
  },
};
