import api from '@/lib/api';

// ==========================================
// TIPOS
// ==========================================
export interface UserMe {
  id: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  full_name?: string | null;
  picture?: string | null;
  onboarding_completed: boolean;
}

export interface PendingInvitation {
  id: string;
  tenant_name: string;
  member_type: string;
  email: string;
}

export interface TenantSummary {
  tenant_id: string;
  tenant_name: string;
  member_type: string;
  is_active: boolean;
}

export interface SessionData {
  id: string;
  email: string;
  full_name?: string | null;
  picture?: string | null;
  is_superuser: boolean;
  is_verified: boolean;
  onboarding_completed: boolean;
  is_google_user: boolean;
  tenant_id?: string | null;
  tenant_name?: string | null;
  tenant_logo_url?: string | null;
  tenant_theme_color?: string | null;
  member_type?: string | null;
  is_tenant_admin: boolean;
  available_tenants: TenantSummary[];
  has_pending_invites: boolean;
  pending_invitations: PendingInvitation[];
}

// ==========================================
// SERVICIO
// ==========================================
export const authService = {
  async login(email: string, pass: string) {
    // JWT viaja en httpOnly cookie — nunca expuesto a JavaScript
    const params = new URLSearchParams();
    params.append('username', email);
    params.append('password', pass);
    const { data } = await api.post('/api/auth/cookie-login', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return data;
  },

  async logout() {
    await api.post('/api/auth/cookie-logout').catch(() => {});
  },

  /** Endpoint básico de fastapi-users */
  async me(): Promise<UserMe> {
    const { data } = await api.get<UserMe>('/api/users/me');
    return data;
  },

  /** Endpoint enriquecido con datos M:N, onboarding e invitaciones */
  async session(): Promise<SessionData> {
    const { data } = await api.get<SessionData>('/api/auth/session');
    return data;
  },

  async registerWorkspace(data: { tenant_name: string; email: string; password: string }) {
    const response = await api.post('/api/auth/register-workspace', data);
    return response.data;
  },

  async registerAsMember(data: { invite_token: string; email: string; password: string; full_name?: string }) {
    const response = await api.post('/api/auth/register-as-member', data);
    return response.data;
  },

  async loginAsMember(email: string, pass: string, inviteToken: string, invitationId: string) {
    await this.login(email, pass);
    await api.post(`/api/invitations/${invitationId}/respond`, { action: 'accept' });
  },

  async switchTenant(tenantId: string): Promise<void> {
    await api.post('/api/auth/switch-tenant', { tenant_id: tenantId });
  },

  async forgotPassword(email: string): Promise<{ detail: string; reset_token?: string }> {
    const { data } = await api.post('/api/auth/forgot-password', { email });
    return data;
  },

  async resetPassword(token: string, newPassword: string): Promise<{ ok: boolean }> {
    const { data } = await api.post('/api/auth/reset-password', { token, new_password: newPassword });
    return data;
  },
};
