// Cliente de la Cartuchera (backups por empresa). Solo Súper Admin.
import api from '@/lib/api';

export interface BackupRecord {
  id: string;
  subject_tenant_id: string | null;
  kind: string;
  gfs_tier: string;            // daily | weekly | monthly | manual | safety
  trigger: string;
  schema_revision: string | null;
  filename: string;
  storage_driver: string;
  size_bytes: number;
  checksum_sha256: string | null;
  table_counts: Record<string, number> | null;
  status: string;
  error: string | null;
  created_at: string;
}

export interface BackupSettings {
  id: string;
  enabled: boolean;
  keep_daily: number;
  keep_weekly: number;
  keep_monthly: number;
  scope: string;
  selected_tenants: string[] | null;
  storage_driver: string;
  last_run_at: string | null;
  next_run_at: string | null;
}

export interface PreviewTable {
  table: string;
  in_cartridge: number;
  current: number | null;
}

export interface PreviewResult {
  valid: boolean;
  problems: string[];
  warnings: string[];
  tenant_match: boolean;
  manifest: {
    format_version?: number;
    kind?: string;
    tenant?: { id: string; name: string };
    schema_revision?: string | null;
    created_at?: string;
    total_rows?: number;
  };
  tables: PreviewTable[];
}

export interface RunNowResult {
  status: string;               // ok | partial | disabled
  tier?: string;                // daily | weekly | monthly
  exported: number;
  skipped?: number;
  errors?: { tenant: string; error: string }[];
  pruned?: { deleted: number; freed_bytes: number };
  next_run_at?: string;
}

export interface RestoreResult {
  log_id: string;
  safety_backup_id: string;
  mode: string;
  counts_before: Record<string, number>;
  counts_after: Record<string, number>;
  skipped_rows: number;
  nulled_fks: number;
  warnings: string[];
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const backupsService = {
  getSettings: (): Promise<BackupSettings> =>
    api.get('/api/admin/backups/settings').then(r => r.data),

  updateSettings: (patch: Partial<BackupSettings>): Promise<BackupSettings> =>
    api.patch('/api/admin/backups/settings', patch).then(r => r.data),

  listRecords: (tenantId?: string): Promise<BackupRecord[]> =>
    api.get('/api/admin/backups/records', { params: tenantId ? { tenant_id: tenantId } : {} }).then(r => r.data),

  exportTenant: (tenantId: string): Promise<BackupRecord> =>
    api.post(`/api/admin/backups/export/${tenantId}`).then(r => r.data),

  runNow: (): Promise<RunNowResult> =>
    api.post('/api/admin/backups/run-now').then(r => r.data),

  downloadRecord: async (record: BackupRecord): Promise<void> => {
    const res = await api.get(`/api/admin/backups/records/${record.id}/download`, { responseType: 'blob' });
    triggerDownload(res.data, record.filename);
  },

  importPreview: (tenantId: string, file: File, remap = false): Promise<PreviewResult> => {
    const fd = new FormData();
    fd.append('tenant_id', tenantId);
    fd.append('remap', String(remap));
    fd.append('file', file);
    return api.post('/api/admin/backups/import/preview', fd).then(r => r.data);
  },

  importRestore: (args: {
    tenantId: string; file: File; password: string; mode: string; remap: boolean;
  }): Promise<RestoreResult> => {
    const fd = new FormData();
    fd.append('tenant_id', args.tenantId);
    fd.append('password', args.password);
    fd.append('mode', args.mode);
    fd.append('remap', String(args.remap));
    fd.append('file', args.file);
    return api.post('/api/admin/backups/import/restore', fd).then(r => r.data);
  },

  recordRestore: (recordId: string, body: {
    password: string; mode: string; remap_tenant: boolean; target_tenant_id?: string;
  }): Promise<RestoreResult> =>
    api.post(`/api/admin/backups/records/${recordId}/restore`, body).then(r => r.data),
};
