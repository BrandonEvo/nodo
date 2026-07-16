// Presencia de usuarios conectados — heartbeat + snapshot para superadmin.
import api from '@/lib/api';

export interface PresenceUser {
  email: string;
  full_name?: string | null;
  tenant_name?: string | null;
  app_key?: string | null;
  last_seen: string;
  is_superuser: boolean;
}

export interface PresenceAppCount {
  app_key: string;
  count: number;
}

export interface PresenceTenantCount {
  tenant_name: string;
  count: number;
}

export interface PresenceSnapshot {
  total_online: number;
  window_minutes: number;
  apps: PresenceAppCount[];
  tenants: PresenceTenantCount[];
  users: PresenceUser[];
}

export const presenceService = {
  ping: (appKey: string | null): Promise<void> =>
    api.post('/api/presence/ping', { app_key: appKey }).then(() => undefined),

  getOnline: (): Promise<PresenceSnapshot> =>
    api.get('/api/presence/online').then(r => r.data),
};
