/**
 * AdminBackups — "Cartuchera": export/import de datos por empresa (solo superadmin).
 * Cada empresa es un cartucho: exportar = expulsar (.nodocart), importar = insertar
 * (arrastrar/soltar con preview de conteos y confirmación). Historial GFS por empresa.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload, Download, Loader2, RefreshCw, Archive, AlertTriangle,
  Check, Building2, RotateCcw, Settings2, ShieldAlert, FileDown, Package, Play,
} from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useToast } from '@/components/ui/Toaster';
import api from '@/lib/api';
import {
  backupsService, type BackupRecord, type BackupSettings, type PreviewResult,
} from '@/services/backups.service';

interface TenantLite { id: string; name: string; theme_color?: string | null; logo_url?: string | null; }

const TIER: Record<string, { label: string; color: string }> = {
  monthly: { label: 'Abuelo', color: '#a78bfa' },
  weekly:  { label: 'Padre',  color: '#60a5fa' },
  daily:   { label: 'Hijo',   color: '#34d399' },
  manual:  { label: 'Manual', color: '#fb923c' },
  safety:  { label: 'Undo',   color: '#f59e0b' },
};

function fmtBytes(n: number | null | undefined): string {
  if (n == null || n <= 0) return n === 0 ? '0 B' : '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}
function relTime(iso: string | null | undefined): string {
  if (!iso) return 'Sin backups';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'hace segundos';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('es-GT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function AdminBackups() {
  const toast = useToast();
  // El provider recrea el objeto `toast` en cada render suyo: si entra en las deps
  // de un efecto, mostrar un toast de error lo re-dispara en bucle.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [tenants, setTenants] = useState<TenantLite[]>([]);
  const [records, setRecords] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  // Historial por empresa
  const [historyTenant, setHistoryTenant] = useState<TenantLite | null>(null);

  // Import (insertar cartucho)
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importTarget, setImportTarget] = useState('');
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [importRemap, setImportRemap] = useState(false);
  const [importPassword, setImportPassword] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Restaurar desde un cartucho guardado
  const [restoreRecord, setRestoreRecord] = useState<BackupRecord | null>(null);
  const [recordMode, setRecordMode] = useState<'replace' | 'merge'>('replace');
  const [recordPassword, setRecordPassword] = useState('');

  // Ajustes
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [runningNow, setRunningNow] = useState(false);

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    try {
      const [tr, rr] = await Promise.all([api.get('/api/tenants/'), backupsService.listRecords()]);
      setTenants(tr.data);
      setRecords(rr);
    } catch { toastRef.current.error('No se pudo cargar la Cartuchera'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const recordsByTenant = (id: string) =>
    records.filter(r => r.subject_tenant_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));

  // ── Export ──────────────────────────────────────────────────────────────
  const handleExport = async (tenant: TenantLite) => {
    setExporting(tenant.id);
    try {
      await backupsService.exportTenant(tenant.id);
      toast.success(`Cartucho de "${tenant.name}" generado`);
      await load(true);
    } catch { toast.error('No se pudo generar el cartucho'); }
    finally { setExporting(null); }
  };

  const handleDownload = async (record: BackupRecord) => {
    try { await backupsService.downloadRecord(record); }
    catch { toast.error('No se pudo descargar el cartucho'); }
  };

  // ── Import ──────────────────────────────────────────────────────────────
  const openImport = (file: File) => {
    setImportFile(file);
    setImportTarget('');
    setImportMode('replace');
    setImportRemap(false);
    setImportPassword('');
    setPreview(null);
    setImportOpen(true);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) openImport(file);
  };

  // Recalcular preview al cambiar destino o re-mapeo
  useEffect(() => {
    if (!importOpen || !importFile || !importTarget) { setPreview(null); return; }
    let cancelled = false;
    setPreviewing(true);
    backupsService.importPreview(importTarget, importFile, importRemap)
      .then(p => { if (!cancelled) setPreview(p); })
      .catch(() => { if (!cancelled) toastRef.current.error('No se pudo leer el cartucho'); })
      .finally(() => { if (!cancelled) setPreviewing(false); });
    return () => { cancelled = true; };
  }, [importOpen, importFile, importTarget, importRemap]);

  const confirmImport = async () => {
    if (!importFile || !importTarget || !importPassword) return;
    setRestoring(true);
    try {
      const res = await backupsService.importRestore({
        tenantId: importTarget, file: importFile, password: importPassword,
        mode: importMode, remap: importRemap,
      });
      toast.success(`Cartucho insertado. Se guardó un punto de undo${res.skipped_rows ? ` · ${res.skipped_rows} filas omitidas` : ''}`);
      setImportOpen(false);
      await load(true);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'No se pudo insertar el cartucho');
    } finally { setRestoring(false); }
  };

  // ── Restore desde registro ──────────────────────────────────────────────
  const confirmRecordRestore = async () => {
    if (!restoreRecord || !recordPassword) return;
    setRestoring(true);
    try {
      await backupsService.recordRestore(restoreRecord.id, {
        password: recordPassword, mode: recordMode, remap_tenant: false,
      });
      toast.success('Cartucho restaurado. Se guardó un punto de undo');
      setRestoreRecord(null); setRecordPassword('');
      await load(true);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'No se pudo restaurar');
    } finally { setRestoring(false); }
  };

  // ── Ajustes ─────────────────────────────────────────────────────────────
  const openSettings = async () => {
    setSettingsOpen(true);
    try { setSettings(await backupsService.getSettings()); } catch { /* noop */ }
  };
  const patchSettings = async (patch: Partial<BackupSettings>) => {
    try { setSettings(await backupsService.updateSettings(patch)); }
    catch { toast.error('No se pudo guardar'); }
  };
  const handleRunNow = async () => {
    setRunningNow(true);
    try {
      const res = await backupsService.runNow();
      const podados = res.pruned?.deleted ?? 0;
      toast.success(
        `${res.exported} cartucho${res.exported === 1 ? '' : 's'} generado${res.exported === 1 ? '' : 's'}`
        + (podados ? ` · ${podados} viejo${podados === 1 ? '' : 's'} podado${podados === 1 ? '' : 's'}` : ''),
      );
      if (res.errors?.length) toast.error(`${res.errors.length} empresa(s) fallaron`);
      setSettings(await backupsService.getSettings());
      await load(true);
    } catch { toast.error('No se pudo correr la tanda'); }
    finally { setRunningNow(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-5 pb-8 w-full max-w-2xl lg:max-w-5xl">

        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <h1 className="text-[28px] font-black text-nodo-ink leading-tight">Cartuchera</h1>
            <p className="text-nodo-sub text-sm font-medium mt-0.5">
              Exportá e insertá los datos de cada empresa como un cartucho
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openSettings}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-nodo-inset hover:bg-nodo-raised transition-colors">
              <Settings2 size={15} className="text-nodo-sub" />
            </button>
            <button onClick={() => load(true)} disabled={refreshing}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-nodo-inset hover:bg-nodo-raised transition-colors disabled:opacity-40">
              <RefreshCw size={15} className={`text-nodo-sub ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Insertar cartucho — dropzone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
          className={`relative overflow-hidden rounded-[28px] p-6 cursor-pointer transition-colors border-2 border-dashed
            ${dragOver ? 'border-nodo-ink bg-nodo-raised' : 'border-nodo-line-s bg-nodo-inset hover:bg-nodo-raised'}`}
        >
          <input ref={fileInput} type="file" accept=".nodocart,application/zip" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) openImport(f); e.target.value = ''; }} />
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-nodo-ink flex items-center justify-center shrink-0">
              <Upload size={24} className="text-nodo-canvas" />
            </div>
            <div>
              <p className="text-base font-black text-nodo-ink">Insertar cartucho</p>
              <p className="text-xs font-semibold text-nodo-sub mt-0.5">
                Arrastrá un archivo <code className="text-nodo-ink">.nodocart</code> o tocá para elegirlo
              </p>
            </div>
          </div>
        </div>

        {/* Grilla de cartuchos (empresas) */}
        <div>
          <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-[0.14em] mb-3">Empresas</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tenants.map(t => {
              const recs = recordsByTenant(t.id);
              const last = recs[0];
              const totalSize = recs.reduce((s, r) => s + r.size_bytes, 0);
              const spine = t.theme_color || 'var(--nodo-iris)';
              return (
                <div key={t.id}
                  className="nodo-card p-0 overflow-hidden flex active:scale-[0.99] transition-transform">
                  <div className="w-1.5 shrink-0" style={{ background: spine }} />
                  <button onClick={() => setHistoryTenant(t)} className="flex-1 text-left p-4 min-w-0">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-[10px] flex items-center justify-center text-white font-black text-sm shrink-0"
                        style={{ background: spine }}>
                        {t.name.charAt(0).toUpperCase()}
                      </div>
                      <p className="text-sm font-black text-nodo-ink truncate flex-1">{t.name}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-semibold text-nodo-dim uppercase tracking-wide">Último</p>
                        <p className="text-sm font-black text-nodo-ink">{relTime(last?.created_at)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-semibold text-nodo-dim uppercase tracking-wide">Cartuchos</p>
                        <p className="text-sm font-black text-nodo-ink tabular-nums">
                          {recs.length}{totalSize > 0 && <span className="text-nodo-dim font-semibold"> · {fmtBytes(totalSize)}</span>}
                        </p>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleExport(t)} disabled={exporting === t.id}
                    title="Expulsar cartucho (exportar)"
                    className="w-11 shrink-0 flex items-center justify-center border-l border-nodo-line hover:bg-nodo-inset transition-colors disabled:opacity-40">
                    {exporting === t.id
                      ? <Loader2 size={16} className="animate-spin text-nodo-sub" />
                      : <FileDown size={16} className="text-nodo-sub" />}
                  </button>
                </div>
              );
            })}
          </div>
          {tenants.length === 0 && (
            <div className="nodo-card p-10 flex flex-col items-center text-center gap-2">
              <Building2 size={32} className="text-nodo-dim" />
              <p className="text-sm font-bold text-nodo-dim">No hay empresas todavía</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Sheet: historial GFS por empresa ── */}
      <BottomSheet
        open={!!historyTenant}
        onClose={() => setHistoryTenant(null)}
        title={historyTenant?.name ?? ''}
        footer={
          historyTenant && (
            <button
              onClick={() => handleExport(historyTenant)}
              disabled={exporting === historyTenant.id}
              className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-40 flex items-center justify-center gap-2">
              {exporting === historyTenant.id ? <Loader2 size={18} className="animate-spin" /> : <Archive size={18} />}
              EXPULSAR CARTUCHO
            </button>
          )
        }
      >
        {historyTenant && (() => {
          const recs = recordsByTenant(historyTenant.id);
          if (recs.length === 0) return (
            <div className="flex flex-col items-center text-center gap-2 py-10">
              <Package size={32} className="text-nodo-dim" />
              <p className="text-sm font-bold text-nodo-dim">Aún no hay cartuchos de esta empresa</p>
              <p className="text-xs text-nodo-sub">Tocá “Expulsar cartucho” para crear el primero.</p>
            </div>
          );
          return (
            <div className="flex flex-col gap-2.5">
              {recs.map(r => {
                const tier = TIER[r.gfs_tier] ?? TIER.manual;
                const rows = r.table_counts ? Object.values(r.table_counts).reduce((a, b) => a + b, 0) : null;
                return (
                  <div key={r.id} className="bg-nodo-inset rounded-2xl p-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{ background: `${tier.color}22`, color: tier.color }}>{tier.label}</span>
                      <p className="text-xs font-bold text-nodo-ink flex-1">{fmtDate(r.created_at)}</p>
                      <span className="text-[11px] font-semibold text-nodo-dim tabular-nums">{fmtBytes(r.size_bytes)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-nodo-sub tabular-nums">
                        {rows != null ? `${rows} filas` : ''}
                        {r.schema_revision && <span className="text-nodo-dim"> · {r.schema_revision.slice(0, 8)}</span>}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => handleDownload(r)}
                          className="h-8 px-3 rounded-lg bg-nodo-card border border-nodo-line flex items-center gap-1.5 text-xs font-bold text-nodo-ink active:scale-95 transition-transform">
                          <Download size={13} /> Descargar
                        </button>
                        <button onClick={() => { setRestoreRecord(r); setRecordMode('replace'); setRecordPassword(''); }}
                          className="h-8 px-3 rounded-lg bg-nodo-card border border-nodo-line flex items-center gap-1.5 text-xs font-bold text-nodo-ink active:scale-95 transition-transform">
                          <RotateCcw size={13} /> Restaurar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </BottomSheet>

      {/* ── Sheet: insertar cartucho (import) ── */}
      <BottomSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Insertar cartucho"
        footer={
          <button
            onClick={confirmImport}
            disabled={!preview?.valid || !importPassword || restoring || previewing}
            className="w-full h-14 rounded-2xl bg-nodo-danger-tx text-white font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2">
            {restoring ? <Loader2 size={18} className="animate-spin" /> : <ShieldAlert size={18} />}
            {importMode === 'replace' ? 'REEMPLAZAR DATOS' : 'FUSIONAR DATOS'}
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          {importFile && (
            <div className="flex items-center gap-2.5 bg-nodo-inset rounded-2xl p-3">
              <Package size={18} className="text-nodo-sub shrink-0" />
              <p className="text-xs font-bold text-nodo-ink truncate flex-1">{importFile.name}</p>
              <span className="text-[11px] text-nodo-dim tabular-nums">{fmtBytes(importFile.size)}</span>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Empresa destino</label>
            <select value={importTarget} onChange={e => setImportTarget(e.target.value)}
              className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-bold text-nodo-ink focus:border-nodo-line-s outline-none">
              <option value="">Elegí en qué empresa insertar…</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {previewing && (
            <div className="flex items-center justify-center gap-2 py-4 text-nodo-sub">
              <Loader2 size={16} className="animate-spin" /> <span className="text-sm font-semibold">Leyendo cartucho…</span>
            </div>
          )}

          {preview && !previewing && (
            <>
              {/* Origen del cartucho */}
              <div className="bg-nodo-inset rounded-2xl p-3.5">
                <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1">Cartucho de</p>
                <p className="text-sm font-black text-nodo-ink">{preview.manifest.tenant?.name ?? '—'}</p>
                <p className="text-[11px] text-nodo-sub mt-1">
                  {preview.manifest.total_rows ?? 0} filas · {preview.manifest.created_at ? fmtDate(preview.manifest.created_at) : ''}
                </p>
              </div>

              {/* Problemas */}
              {preview.problems.map((p, i) => (
                <div key={i} className="flex items-center gap-2 bg-nodo-danger-bg border border-nodo-danger-bd text-nodo-danger-tx text-xs font-bold px-3 py-2.5 rounded-xl">
                  <AlertTriangle size={14} className="shrink-0" /> <span>{p}</span>
                </div>
              ))}

              {/* Re-mapeo si el cartucho es de otra empresa */}
              {!preview.tenant_match && (
                <button onClick={() => setImportRemap(v => !v)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors
                    ${importRemap ? 'bg-nodo-warn-bg border-nodo-warn-bd' : 'bg-nodo-inset border-nodo-line'}`}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${importRemap ? 'bg-nodo-warn-tx border-nodo-warn-tx' : 'border-nodo-line-s'}`}>
                    {importRemap && <Check size={13} className="text-white" />}
                  </div>
                  <span className="text-xs font-bold text-nodo-ink">
                    Este cartucho es de otra empresa. Re-mapear sus datos a la empresa destino.
                  </span>
                </button>
              )}

              {/* Avisos */}
              {preview.warnings.map((w, i) => (
                <div key={i} className="flex items-center gap-2 bg-nodo-warn-bg border border-nodo-warn-bd text-nodo-warn-tx text-xs font-semibold px-3 py-2.5 rounded-xl">
                  <AlertTriangle size={14} className="shrink-0" /> <span>{w}</span>
                </div>
              ))}

              {/* Modo */}
              <div>
                <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Modo</label>
                <SegmentedControl
                  options={[
                    { value: 'replace', label: 'Reemplazar' },
                    { value: 'merge', label: 'Fusionar' },
                  ]}
                  value={importMode}
                  onChange={v => setImportMode(v as 'replace' | 'merge')}
                  size="sm"
                />
                <p className="text-[11px] text-nodo-sub mt-1.5">
                  {importMode === 'replace'
                    ? 'Borra los datos actuales de la empresa y carga los del cartucho.'
                    : 'Combina: actualiza lo existente y agrega lo nuevo, sin borrar.'}
                </p>
              </div>

              {/* Diff de conteos */}
              {preview.tables.filter(t => t.in_cartridge > 0 || (t.current ?? 0) > 0).length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Vista previa (filas)</label>
                  <div className="bg-nodo-inset rounded-2xl overflow-hidden divide-y divide-nodo-line">
                    {preview.tables.filter(t => t.in_cartridge > 0 || (t.current ?? 0) > 0).map(t => (
                      <div key={t.table} className="flex items-center gap-2 px-3 py-2 text-xs">
                        <span className="font-bold text-nodo-ink flex-1 truncate">{t.table}</span>
                        <span className="text-nodo-dim tabular-nums">{t.current ?? 0}</span>
                        <span className="text-nodo-dim">→</span>
                        <span className="font-black text-nodo-ink tabular-nums w-8 text-right">{t.in_cartridge}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Password superadmin */}
              <div>
                <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Contraseña de Súper Admin</label>
                <input type="password" value={importPassword} onChange={e => setImportPassword(e.target.value)}
                  placeholder="Requerida para confirmar"
                  className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-bold text-nodo-ink focus:border-nodo-line-s outline-none" />
              </div>
            </>
          )}
        </div>
      </BottomSheet>

      {/* ── Sheet: confirmar restaurar desde registro ── */}
      <BottomSheet
        open={!!restoreRecord}
        onClose={() => setRestoreRecord(null)}
        title="Restaurar cartucho"
        footer={
          <button onClick={confirmRecordRestore}
            disabled={!recordPassword || restoring}
            className="w-full h-14 rounded-2xl bg-nodo-danger-tx text-white font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2">
            {restoring ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />}
            RESTAURAR
          </button>
        }
      >
        {restoreRecord && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 bg-nodo-warn-bg border border-nodo-warn-bd text-nodo-warn-tx text-xs font-semibold px-3 py-2.5 rounded-xl">
              <ShieldAlert size={14} className="shrink-0" />
              <span>Antes de restaurar se guarda automáticamente un punto de undo del estado actual.</span>
            </div>
            <div className="bg-nodo-inset rounded-2xl p-3.5">
              <p className="text-sm font-black text-nodo-ink">{fmtDate(restoreRecord.created_at)}</p>
              <p className="text-[11px] text-nodo-sub mt-0.5">{fmtBytes(restoreRecord.size_bytes)} · {restoreRecord.filename}</p>
            </div>
            <div>
              <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Modo</label>
              <SegmentedControl
                options={[{ value: 'replace', label: 'Reemplazar' }, { value: 'merge', label: 'Fusionar' }]}
                value={recordMode} onChange={v => setRecordMode(v as 'replace' | 'merge')} size="sm" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Contraseña de Súper Admin</label>
              <input type="password" value={recordPassword} onChange={e => setRecordPassword(e.target.value)}
                placeholder="Requerida para confirmar"
                className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-bold text-nodo-ink focus:border-nodo-line-s outline-none" />
            </div>
          </div>
        )}
      </BottomSheet>

      {/* ── Sheet: ajustes de backup automático ── */}
      <BottomSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Backup automático">
        {!settings ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-nodo-sub" /></div>
        ) : (
          <div className="flex flex-col gap-4">
            <button onClick={() => patchSettings({ enabled: !settings.enabled })}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-colors ${settings.enabled ? 'bg-nodo-success-bg border-nodo-success-bd' : 'bg-nodo-inset border-nodo-line'}`}>
              <div className={`w-11 h-6 rounded-full p-0.5 transition-colors ${settings.enabled ? 'bg-nodo-success-tx' : 'bg-nodo-line-s'}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${settings.enabled ? 'translate-x-5' : ''}`} />
              </div>
              <div className="text-left">
                <p className="text-sm font-black text-nodo-ink">Backup automático GFS</p>
                <p className="text-[11px] text-nodo-sub">Diario (hijo) · Semanal (padre) · Mensual (abuelo)</p>
              </div>
            </button>

            <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">Retención (copias a conservar)</p>
            {([['keep_daily', 'Diarias (hijo)'], ['keep_weekly', 'Semanales (padre)'], ['keep_monthly', 'Mensuales (abuelo)']] as const).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between bg-nodo-inset rounded-2xl px-4 py-2.5">
                <span className="text-sm font-bold text-nodo-ink">{label}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => patchSettings({ [key]: Math.max(1, settings[key] - 1) } as any)}
                    className="w-9 h-9 rounded-xl bg-nodo-card border border-nodo-line flex items-center justify-center text-nodo-ink active:scale-90 transition-transform">–</button>
                  <span className="w-8 text-center text-sm font-black text-nodo-ink tabular-nums">{settings[key]}</span>
                  <button onClick={() => patchSettings({ [key]: settings[key] + 1 } as any)}
                    className="w-9 h-9 rounded-xl bg-nodo-ink text-nodo-canvas flex items-center justify-center active:scale-90 transition-transform">+</button>
                </div>
              </div>
            ))}
            <div className="bg-nodo-inset rounded-2xl p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">Última corrida</p>
                <p className="text-sm font-black text-nodo-ink">{relTime(settings.last_run_at)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">Próxima</p>
                <p className="text-sm font-black text-nodo-ink">
                  {settings.next_run_at ? fmtDate(settings.next_run_at) : '—'}
                </p>
              </div>
            </div>

            <button onClick={handleRunNow} disabled={runningNow}
              className="w-full h-12 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-40">
              {runningNow ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              {runningNow ? 'Generando cartuchos…' : 'CORRER LA TANDA AHORA'}
            </button>

            <p className="text-[11px] text-nodo-sub">
              La tanda genera un cartucho por empresa y poda los que exceden la retención.
              Aparte, la bóveda completa del servidor (todos los datos) se respalda con GFS
              por separado, agendada en el servidor.
            </p>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
