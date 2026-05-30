import { useState, useEffect, useMemo } from 'react';
import { Shield, Search, Building2, Crown, Briefcase, Loader2, Zap, LayoutGrid, Check } from 'lucide-react';
import { rolesService, RoleAuditEntry } from '@/services/roles.service';
import { tenantsService } from '@/services/tenants.service';
import { modulesService, type ModuleRead } from '@/services/modules.service';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useToast } from '@/components/ui/Toaster';

const MEMBER_TYPE_META = {
  owner:      { label: 'Propietario',   icon: Crown     },
  admin:      { label: 'Administrador', icon: Shield    },
  employee:   { label: 'Empleado',      icon: Briefcase },
  superadmin: { label: 'Súper Admin',   icon: Zap       },
} as const;

export function AdminRoles() {
  const toast = useToast();

  const [entries, setEntries] = useState<RoleAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('');

  // Panel de acceso a módulos
  const [moduleEntry, setModuleEntry] = useState<RoleAuditEntry | null>(null);
  const [tenantModules, setTenantModules] = useState<ModuleRead[]>([]);
  const [userModules, setUserModules] = useState<Set<string>>(new Set());
  const [loadingModules, setLoadingModules] = useState(false);
  const [savingModules, setSavingModules] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try { setEntries(await rolesService.listAudit()); }
      catch (e) { console.error('Error loading roles audit', e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((e) => {
      const matchesSearch = !q ||
        e.user_email.toLowerCase().includes(q) ||
        (e.user_full_name?.toLowerCase() ?? '').includes(q) ||
        e.tenant_name.toLowerCase().includes(q);
      return matchesSearch && (!filterType || e.member_type === filterType);
    });
  }, [entries, search, filterType]);

  const counts = useMemo(() => ({
    tenants:   new Set(entries.map(e => e.tenant_id)).size,
    owners:    entries.filter(e => e.member_type === 'owner').length,
    admins:    entries.filter(e => e.member_type === 'admin').length,
    employees: entries.filter(e => e.member_type === 'employee').length,
  }), [entries]);

  const openModuleAccess = async (entry: RoleAuditEntry) => {
    setModuleEntry(entry);
    setLoadingModules(true);
    try {
      const [mods, userMods] = await Promise.all([
        modulesService.listByTenant(entry.tenant_id),
        tenantsService.getUserModules(entry.tenant_id, entry.user_id),
      ]);
      setTenantModules(mods);
      setUserModules(new Set(userMods));
    } catch {
      toast.error('Error al cargar módulos');
    } finally {
      setLoadingModules(false);
    }
  };

  const toggleMod = (id: string) => {
    setUserModules(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const saveModuleAccess = async () => {
    if (!moduleEntry) return;
    setSavingModules(true);
    try {
      await tenantsService.updateUserModules(
        moduleEntry.tenant_id,
        moduleEntry.user_id,
        Array.from(userModules),
      );
      toast.success('Acceso a módulos actualizado');
      setModuleEntry(null);
    } catch {
      toast.error('Error al guardar acceso');
    } finally {
      setSavingModules(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div>
          <h1 className="text-[28px] font-black text-nodo-ink leading-tight">Auditoría de Roles</h1>
          <p className="text-nodo-sub text-sm font-medium mt-0.5">Vista global de membresías y acceso a módulos.</p>
        </div>

        {/* Summary cards */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Empresas',        value: counts.tenants,   icon: Building2, accent: '#69E7A8', pastel: '#69E7A81a' },
              { label: 'Propietarios',    value: counts.owners,    icon: Crown,     accent: '#fbbf24', pastel: '#fbbf241a' },
              { label: 'Administradores', value: counts.admins,    icon: Shield,    accent: '#60a5fa', pastel: '#60a5fa1a' },
              { label: 'Empleados',       value: counts.employees, icon: Briefcase, accent: '#94a3b8', pastel: '#94a3b81a' },
            ].map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className="flex flex-col gap-3 p-4 rounded-[20px]" style={{ backgroundColor: c.pastel }}>
                  <div className="w-9 h-9 rounded-[11px] flex items-center justify-center" style={{ background: `${c.accent}22` }}>
                    <Icon size={16} style={{ color: c.accent }} strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-nodo-ink tabular-nums leading-none">{c.value}</p>
                    <p className="text-[10px] font-semibold text-nodo-sub mt-1 leading-tight">{c.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-nodo-dim pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por usuario o empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-12 pl-11 pr-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim"
            />
          </div>
          <SegmentedControl
            options={[
              { value: '',         label: 'Todos'          },
              { value: 'owner',    label: 'Propietarios'   },
              { value: 'admin',    label: 'Admins'         },
              { value: 'employee', label: 'Empleados'      },
            ]}
            value={filterType}
            onChange={(v) => setFilterType(v as typeof filterType)}
            size="sm"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center px-4">
            <Shield size={32} className="text-nodo-dim mb-2" />
            <p className="text-sm font-bold text-nodo-dim">No se encontraron resultados.</p>
          </div>
        ) : (
          <div className="bg-nodo-card rounded-3xl border border-nodo-line shadow-sm overflow-hidden">
            {/* Desktop column headers */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_150px_110px_44px] gap-4 px-6 py-3 border-b border-nodo-line bg-nodo-inset">
              {['Usuario', 'Empresa', 'Rol', 'Estado', ''].map(h => (
                <span key={h} className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">{h}</span>
              ))}
            </div>

            <div className="divide-y divide-nodo-line">
              {filtered.map((entry) => {
                const roleKey = entry.is_superuser ? 'superadmin' : (entry.member_type ?? 'employee');
                const meta = MEMBER_TYPE_META[roleKey as keyof typeof MEMBER_TYPE_META] ?? MEMBER_TYPE_META.employee;
                const RoleIcon = meta.icon;
                const initials = (entry.user_full_name || entry.user_email).charAt(0).toUpperCase();
                const canEditModules = !entry.is_superuser && entry.member_type === 'employee' && entry.is_active;

                const roleBadgeClass = entry.is_superuser
                  ? 'bg-nodo-ink text-nodo-canvas border-nodo-ink'
                  : entry.member_type === 'owner'
                  ? 'bg-nodo-warn-bg text-nodo-warn-tx border-nodo-warn-bd'
                  : entry.member_type === 'admin'
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                    : 'bg-nodo-raised text-nodo-sub border-nodo-line';

                const statusBadgeClass = entry.is_active
                  ? 'bg-nodo-success-bg text-nodo-success-tx border-nodo-success-bd'
                  : 'bg-nodo-raised text-nodo-dim border-nodo-line';

                return (
                  <div key={entry.member_id} className="px-4 sm:px-6 py-4 hover:bg-nodo-inset transition-colors">
                    {/* Mobile */}
                    <div className="sm:hidden">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-xl bg-nodo-inset text-nodo-sub flex items-center justify-center font-black text-sm shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          {entry.user_full_name && (
                            <p className="text-sm font-bold text-nodo-ink truncate">{entry.user_full_name}</p>
                          )}
                          <p className="text-xs text-nodo-dim truncate">{entry.user_email}</p>
                        </div>
                        {canEditModules && (
                          <button
                            onClick={() => openModuleAccess(entry)}
                            className="p-2 text-nodo-dim hover:text-nodo-ink hover:bg-nodo-raised rounded-xl transition-colors shrink-0"
                            title="Gestionar acceso a módulos"
                          >
                            <LayoutGrid size={16} />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap pl-12">
                        <span className="inline-flex items-center gap-1 text-xs text-nodo-sub font-semibold">
                          <Building2 className="w-3 h-3 text-nodo-dim" /> {entry.tenant_name}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold border uppercase tracking-wider ${roleBadgeClass}`}>
                          <RoleIcon className="w-3 h-3" /> {meta.label}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border uppercase tracking-wider ${statusBadgeClass}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${entry.is_active ? 'bg-nodo-success-tx' : 'bg-nodo-dim'}`} />
                          {entry.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    </div>

                    {/* Desktop */}
                    <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_150px_110px_44px] gap-4 items-center">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-nodo-inset text-nodo-sub flex items-center justify-center font-black text-sm shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          {entry.user_full_name && (
                            <p className="text-sm font-bold text-nodo-ink truncate">{entry.user_full_name}</p>
                          )}
                          <p className="text-xs text-nodo-dim truncate">{entry.user_email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="w-4 h-4 text-nodo-dim shrink-0" />
                        <span className="text-sm font-semibold text-nodo-ink truncate">{entry.tenant_name}</span>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-bold border uppercase tracking-wider w-fit ${roleBadgeClass}`}>
                        <RoleIcon className="w-3 h-3" /> {meta.label}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-bold border uppercase tracking-wider w-fit ${statusBadgeClass}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${entry.is_active ? 'bg-nodo-success-tx' : 'bg-nodo-dim'}`} />
                        {entry.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                      {/* Acción módulos — solo para empleados activos */}
                      <div className="flex justify-end">
                        {canEditModules ? (
                          <button
                            onClick={() => openModuleAccess(entry)}
                            className="p-2 text-nodo-dim hover:text-nodo-ink hover:bg-nodo-raised rounded-xl transition-colors"
                            title="Gestionar acceso a módulos"
                          >
                            <LayoutGrid size={16} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-3 border-t border-nodo-line bg-nodo-inset">
              <p className="text-xs text-nodo-dim font-medium">
                {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
                {filtered.length !== entries.length && ` de ${entries.length} total`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Panel de acceso a módulos */}
      <BottomSheet
        open={!!moduleEntry}
        onClose={() => setModuleEntry(null)}
        title="Acceso a Módulos"
        footer={
          <button
            onClick={saveModuleAccess}
            disabled={savingModules || loadingModules}
            className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {savingModules ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            GUARDAR ACCESO
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          {moduleEntry && (
            <div className="bg-nodo-inset rounded-2xl border border-nodo-line px-4 py-3">
              <p className="text-sm font-bold text-nodo-ink">{moduleEntry.user_full_name || moduleEntry.user_email}</p>
              <p className="text-xs text-nodo-dim mt-0.5 flex items-center gap-1.5">
                <Building2 size={11} /> {moduleEntry.tenant_name}
              </p>
            </div>
          )}

          {loadingModules ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-7 h-7 animate-spin text-nodo-sub" />
            </div>
          ) : tenantModules.length === 0 ? (
            <p className="text-sm text-nodo-dim text-center py-8">
              Esta empresa no tiene módulos activos.
            </p>
          ) : (
            <div className="bg-nodo-inset rounded-2xl border border-nodo-line overflow-hidden">
              {tenantModules.map((mod, i) => {
                const active = userModules.has(mod.id);
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => toggleMod(mod.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-nodo-raised ${i < tenantModules.length - 1 ? 'border-b border-nodo-line' : ''} ${active ? 'bg-nodo-raised' : ''}`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base transition-colors ${active ? 'bg-nodo-ink text-nodo-canvas' : 'bg-nodo-raised text-nodo-sub'}`}>
                      {mod.icon ?? <LayoutGrid size={15} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-nodo-ink">{mod.name}</p>
                      <p className="text-[10px] text-nodo-dim uppercase tracking-wider font-mono">{mod.code}</p>
                    </div>
                    <div className={`relative w-[44px] h-[26px] rounded-full transition-colors duration-200 shrink-0 ${active ? 'bg-[#30D158]' : 'bg-nodo-line'}`}>
                      <span className={`absolute top-[2px] left-[2px] w-[22px] h-[22px] bg-nodo-canvas rounded-full shadow-sm transition-transform duration-200 ${active ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
