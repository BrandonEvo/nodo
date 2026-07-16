/**
 * AdminPresence — Monitor de usuarios conectados (solo superadmin).
 * Muestra cuántos usuarios están en línea ahora, en qué app están, y de qué
 * empresa. Se alimenta del heartbeat que el AppShell envía cada 60s; la ventana
 * "en línea" es de 2 minutos. Auto-refresh cada 15s.
 */
import { useState, useEffect, useCallback } from 'react';
import { Radio, RefreshCw, Users, Building2, Loader2, Circle } from 'lucide-react';
import { presenceService, type PresenceSnapshot } from '@/services/presence.service';

// app_key (= activeTab del AppShell) → etiqueta legible.
const APP_LABELS: Record<string, string> = {
  home: 'Inicio',
  admin_home: 'Panel maestro',
  admin_tenants: 'Admin · Empresas',
  admin_users: 'Admin · Usuarios',
  admin_modules: 'Admin · Módulos',
  admin_subscriptions: 'Admin · Planes',
  admin_roles: 'Admin · Roles',
  admin_platform_config: 'Admin · Config',
  admin_presence: 'Admin · En línea',
  admin_backups: 'Admin · Cartuchera',
  mgmt_employees: 'Equipo',
  settings: 'Configuración',
  profile: 'Perfil',
  subscription: 'Suscripción',
  calc: 'Calculadora',
  bodega: 'Bodega',
  cocina: 'Cocina',
  mostrador: 'Mostrador',
  cierre: 'Cierre',
  recetas: 'Recetas',
  importaciones: 'Importaciones',
  autos: 'Autos',
  reportes: 'Reportes',
  gastos: 'Gastos',
  'personal-shopper': 'Personal Shopper',
  ventas: 'Ventas',
  citas: 'Citas',
};

const appLabel = (key?: string | null) => {
  if (!key) return 'Inicio';
  return APP_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
};

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 10) return 'ahora';
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  return `hace ${m} min`;
}

function BreakdownRow({ label, count, max, icon }: {
  label: string; count: number; max: number; icon?: React.ReactNode;
}) {
  const pct = max > 0 ? Math.max(8, (count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 sm:w-36 shrink-0 flex items-center gap-1.5 min-w-0">
        {icon}
        <span className="text-xs font-bold text-nodo-ink truncate">{label}</span>
      </div>
      <div className="flex-1 h-2 rounded-full bg-nodo-inset overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, background: 'var(--nodo-iris)' }} />
      </div>
      <span className="w-6 text-right text-sm font-black text-nodo-ink tabular-nums">{count}</span>
    </div>
  );
}

export function AdminPresence() {
  const [snap, setSnap] = useState<PresenceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    try { setSnap(await presenceService.getOnline()); }
    catch { /* silencioso */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 15_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
    </div>
  );

  const total = snap?.total_online ?? 0;
  const maxApp = Math.max(1, ...(snap?.apps.map(a => a.count) ?? [1]));
  const maxTenant = Math.max(1, ...(snap?.tenants.map(t => t.count) ?? [1]));

  return (
    <div className="flex flex-col gap-5 pb-8 w-full max-w-2xl lg:max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-[28px] font-black text-nodo-ink leading-tight">En línea</h1>
          <p className="text-nodo-sub text-sm font-medium mt-0.5">
            Usuarios activos · ventana de {snap?.window_minutes ?? 2} min
          </p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-nodo-inset hover:bg-nodo-raised transition-colors disabled:opacity-40">
          <RefreshCw size={15} className={`text-nodo-sub ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Hero: total en línea */}
      <div className="relative overflow-hidden rounded-[28px] p-6 text-nodo-on-primary"
        style={{ background: 'var(--nodo-iris)', boxShadow: 'var(--nodo-shadow-fab)' }}>
        <div className="absolute -right-4 -top-6 opacity-20"><Radio size={120} strokeWidth={1.2} /></div>
        <div className="relative flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.18em]">En vivo</span>
            </div>
            <p className="text-[68px] leading-none font-black tabular-nums tracking-tighter">{total}</p>
            <p className="text-sm font-bold opacity-90 mt-1">
              {total === 1 ? 'usuario conectado ahora' : 'usuarios conectados ahora'}
            </p>
          </div>
        </div>
      </div>

      {total === 0 ? (
        <div className="nodo-card p-10 flex flex-col items-center text-center gap-2">
          <Users size={32} className="text-nodo-dim" />
          <p className="text-sm font-bold text-nodo-dim">Nadie conectado en este momento</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Por app */}
          <div className="nodo-card p-5">
            <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-[0.14em] mb-4">Por app abierta</p>
            <div className="flex flex-col gap-3">
              {snap?.apps.map(a => (
                <BreakdownRow key={a.app_key} label={appLabel(a.app_key)} count={a.count} max={maxApp} />
              ))}
            </div>
          </div>

          {/* Por empresa */}
          <div className="nodo-card p-5">
            <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-[0.14em] mb-4">Por empresa</p>
            <div className="flex flex-col gap-3">
              {snap?.tenants.map(t => (
                <BreakdownRow key={t.tenant_name} label={t.tenant_name} count={t.count} max={maxTenant}
                  icon={<Building2 size={12} className="text-nodo-dim shrink-0" />} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Lista de usuarios */}
      {total > 0 && (
        <div className="nodo-card overflow-hidden">
          <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-[0.14em] px-5 pt-4 pb-2">
            Detalle ({total})
          </p>
          <div className="divide-y divide-nodo-line">
            {snap?.users.map((u, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0"
                  style={{ background: u.is_superuser ? 'var(--nodo-ink)' : 'var(--nodo-iris)' }}>
                  {(u.full_name || u.email).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-nodo-ink truncate">
                    {u.full_name || u.email}
                    {u.is_superuser && <span className="ml-1.5 text-[9px] font-black text-nodo-dim uppercase">core</span>}
                  </p>
                  <p className="text-[11px] text-nodo-sub truncate">
                    {u.tenant_name ?? '—'} · {appLabel(u.app_key)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Circle size={7} className="fill-emerald-400 text-emerald-400" />
                  <span className="text-[11px] font-semibold text-nodo-dim tabular-nums">{relTime(u.last_seen)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
