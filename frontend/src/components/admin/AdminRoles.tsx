import { useState, useEffect, useMemo } from 'react';
import { Shield, Search, Building2, Crown, Briefcase, Loader2 } from 'lucide-react';
import { rolesService, RoleAuditEntry } from '@/services/roles.service';

const MEMBER_TYPE_META = {
  owner:    { label: 'Propietario',   icon: Crown     },
  admin:    { label: 'Administrador', icon: Shield    },
  employee: { label: 'Empleado',      icon: Briefcase },
} as const;

export function AdminRoles() {
  const [entries, setEntries] = useState<RoleAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('');

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

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-[28px] font-black text-nodo-ink leading-tight">Auditoría de Roles</h1>
        <p className="text-nodo-sub text-sm font-medium mt-0.5">Vista global de membresías en todas las empresas.</p>
      </div>

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Empresas',        value: counts.tenants,   icon: Building2, colorIcon: 'text-[#69E7A8]',      colorBg: 'bg-[#69E7A8]/10' },
            { label: 'Propietarios',    value: counts.owners,    icon: Crown,     colorIcon: 'text-nodo-warn-tx',   colorBg: 'bg-nodo-warn-bg'  },
            { label: 'Administradores', value: counts.admins,    icon: Shield,    colorIcon: 'text-blue-500 dark:text-blue-400', colorBg: 'bg-blue-500/10' },
            { label: 'Empleados',       value: counts.employees, icon: Briefcase, colorIcon: 'text-nodo-sub',       colorBg: 'bg-nodo-raised'   },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="p-4 sm:p-5 bg-nodo-card rounded-2xl border border-nodo-line shadow-sm flex items-center gap-3 sm:gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${c.colorBg}`}>
                  <Icon size={18} className={c.colorIcon} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider truncate">{c.label}</p>
                  <p className="text-2xl font-black text-nodo-ink tabular-nums">{c.value}</p>
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
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {(['', 'owner', 'admin', 'employee'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-4 h-12 rounded-2xl text-xs font-bold border-2 transition-all shrink-0 active:scale-95 ${
                filterType === type
                  ? 'bg-nodo-ink text-nodo-canvas border-nodo-ink'
                  : 'bg-nodo-inset text-nodo-sub border-nodo-line hover:border-nodo-ink hover:text-nodo-ink'
              }`}
            >
              {type === '' ? 'Todos' : MEMBER_TYPE_META[type].label}
            </button>
          ))}
        </div>
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
          <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_150px_110px] gap-4 px-6 py-3 border-b border-nodo-line bg-nodo-inset">
            {['Usuario', 'Empresa', 'Rol', 'Estado'].map(h => (
              <span key={h} className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">{h}</span>
            ))}
          </div>

          <div className="divide-y divide-nodo-line">
            {filtered.map((entry) => {
              const meta = MEMBER_TYPE_META[entry.member_type] ?? MEMBER_TYPE_META.employee;
              const RoleIcon = meta.icon;
              const initials = (entry.user_full_name || entry.user_email).charAt(0).toUpperCase();

              const roleBadgeClass = entry.member_type === 'owner'
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
                  <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_150px_110px] gap-4 items-center">
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
  );
}
