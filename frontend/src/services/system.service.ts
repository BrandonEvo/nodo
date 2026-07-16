// Métricas de infraestructura del servidor para el panel Súper Admin.
// Disco (real del host), RAM, versión de Docker y último backup.
import api from '@/lib/api';

export interface DiskMetrics {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  percent_used: number;
  path: string;
  available: boolean;
}

export interface RamMetrics {
  total_bytes: number | null;
  available_bytes: number | null;
  percent_used: number | null;
}

export interface BackupMetrics {
  last_backup_at: string | null;
  daily_count: number;
  weekly_count: number;
  monthly_count: number;
  total_bytes: number;
}

export interface SystemMetrics {
  disk: DiskMetrics;
  ram: RamMetrics;
  docker_version: string | null;
  backups: BackupMetrics;
  status_fresh: boolean;
  generated_at: string;
}

export const systemService = {
  getMetrics: (): Promise<SystemMetrics> =>
    api.get('/api/admin/system/metrics').then(r => r.data),
};
