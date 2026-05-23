import { useState, useEffect, useMemo } from 'react';
import { Shield, Search, Building2, Crown, Briefcase } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { rolesService, RoleAuditEntry } from '@/services/roles.service';

const MEMBER_TYPE_META = {
  owner:    { label: 'Propietario',    color: 'bg-amber-50 text-amber-700 border-amber-200',  icon: Crown    },
  admin:    { label: 'Administrador',  color: 'bg-blue-50 text-blue-700 border-blue-200',     icon: Shield   },
  employee: { label: 'Empleado',       color: 'bg-gray-50 text-gray-600 border-gray-200',     icon: Briefcase },
} as const;

export function AdminRoles() {
  const [entries, setEntries] = useState<RoleAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        setEntries(await rolesService.listAudit());
      } catch (e) {
        console.error('Error loading roles audit', e);
      } finally {
        setLoading(false);
      }
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#111111] tracking-tight flex items-center gap-3">
          <Shield className="text-[#69E7A8] w-7 h-7 shrink-0" /> Auditoría de Roles
        </h1>
        <p className="text-gray-400 mt-1 text-sm font-medium">Vista global de membresías en todas las empresas.</p>
      </div>

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: 'Empresas',       value: counts.tenants,   icon: Building2, color: 'text-[#69E7A8] bg-[#69E7A8]/10' },
            { label: 'Propietarios',   value: counts.owners,    icon: Crown,     color: 'text-amber-500 bg-amber-500/10'  },
            { label: 'Administradores', value: counts.admins,   icon: Shield,    color: 'text-blue-500 bg-blue-500/10'   },
            { label: 'Empleados',      value: counts.employees, icon: Briefcase, color: 'text-gray-500 bg-gray-500/10'   },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="p-4 sm:p-5 bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 sm:gap-4">
                <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${c.color}`}>
                  <Icon size={17} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">{c.label}</p>
                  <p className="text-xl sm:text-2xl font-black text-[#111111]">{c.value}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por usuario o empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-gray-200 bg-white text-sm font-medium text-[#111111] placeholder-gray-400 focus:outline-none focus:border-[#111111] transition-colors"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {(['', 'owner', 'admin', 'employee'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-4 h-11 rounded-xl text-xs font-bold border transition-all shrink-0 ${
                filterType === type
                  ? 'bg-[#111111] text-white border-[#111111]'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {type === '' ? 'Todos' : MEMBER_TYPE_META[type].label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Spinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Shield className="w-6 h-6" />} title="No se encontraron resultados." />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Desktop column headers */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_140px_100px] gap-4 px-6 py-3 border-b border-gray-100 bg-gray-50/60">
            {['Usuario', 'Empresa', 'Rol', 'Estado'].map(h => (
              <span key={h} className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{h}</span>
            ))}
          </div>

          <div className="divide-y divide-gray-50">
            {filtered.map((entry) => {
              const meta = MEMBER_TYPE_META[entry.member_type] ?? MEMBER_TYPE_META.employee;
              const RoleIcon = meta.icon;
              const initials = (entry.user_full_name || entry.user_email).charAt(0).toUpperCase();

              return (
                <div key={entry.member_id} className="px-4 sm:px-6 py-4 hover:bg-gray-50/50 transition-colors">
                  {/* Mobile layout */}
                  <div className="sm:hidden">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center font-black text-sm shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        {entry.user_full_name && (
                          <p className="text-sm font-bold text-[#111111] truncate">{entry.user_full_name}</p>
                        )}
                        <p className="text-xs text-gray-400 truncate">{entry.user_email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap pl-12">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 font-semibold">
                        <Building2 className="w-3 h-3 text-gray-300" /> {entry.tenant_name}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold border uppercase tracking-wider ${meta.color}`}>
                        <RoleIcon className="w-3 h-3" /> {meta.label}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border uppercase tracking-wider ${entry.is_active ? 'bg-[#69E7A8]/10 text-[#2a7a52] border-[#69E7A8]/30' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${entry.is_active ? 'bg-[#69E7A8]' : 'bg-gray-300'}`} />
                        {entry.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                  </div>

                  {/* Desktop layout */}
                  <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_140px_100px] gap-4 items-center">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center font-black text-sm shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        {entry.user_full_name && (
                          <p className="text-sm font-bold text-[#111111] truncate">{entry.user_full_name}</p>
                        )}
                        <p className="text-xs text-gray-400 truncate">{entry.user_email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="w-4 h-4 text-gray-300 shrink-0" />
                      <span className="text-sm font-semibold text-[#111111] truncate">{entry.tenant_name}</span>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border uppercase tracking-wider w-fit ${meta.color}`}>
                      <RoleIcon className="w-3 h-3" /> {meta.label}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border uppercase tracking-wider w-fit ${entry.is_active ? 'bg-[#69E7A8]/10 text-[#2a7a52] border-[#69E7A8]/30' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${entry.is_active ? 'bg-[#69E7A8]' : 'bg-gray-300'}`} />
                      {entry.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60">
            <p className="text-xs text-gray-400 font-medium">
              {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
              {filtered.length !== entries.length && ` de ${entries.length} total`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
