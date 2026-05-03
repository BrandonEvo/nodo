import api from '@/lib/api';

export interface UserMe {
  id: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  tenant_id: string;
  is_tenant_admin?: boolean;
  role_id?: string | null;
  full_name?: string | null;
  picture?: string | null;
}

export const authService = {
  async login(email: string, pass: string) {
    const params = new URLSearchParams();
    params.append('username', email);
    params.append('password', pass);

    const { data } = await api.post('/api/auth/jwt/login', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (data.access_token) {
      localStorage.setItem('token', data.access_token);
    }
    return data;
  },

  async me(): Promise<UserMe> {
    const { data } = await api.get<UserMe>('/api/users/me');
    return data;
  },

  async registerWorkspace(data: { tenant_name: string; email: string; password: string }) {
    const response = await api.post('/api/auth/register-workspace', data);
    return response.data;
  }
};