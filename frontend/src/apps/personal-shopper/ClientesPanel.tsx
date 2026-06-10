import { useMemo, useState } from 'react';
import {
  Search, X, Phone, Users, Plus, MessageCircle, Package2,
} from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Avatar } from '@/components/ui/Avatar';
import { buildWhatsAppUrl } from '@/lib/utils';
import type { ShopperOrder, OrderStatus } from '@/services/personal_shopper.service';

const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente:  'Pendiente',
  cotizado:   'Cotizado',
  aprobado:   'Aprobado',
  en_proceso: 'En proceso',
  entregado:  'Entregado',
  cancelado:  'Cancelado',
};

const fmt = (n: number) =>
  'Q' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface ClientEntry {
  key: string;
  name: string;
  phone: string | null;
  orders: ShopperOrder[];
  orderCount: number;
  activeCount: number;
  totalQuoted: number;
  totalDelivered: number;
}

// Directorio derivado de los pedidos — no existe tabla de clientes en este módulo
function buildClients(orders: ShopperOrder[]): ClientEntry[] {
  const map = new Map<string, ClientEntry>();
  for (const o of orders) {
    const key = o.client_name.trim().toLowerCase();
    if (!key) continue;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        key,
        name: o.client_name.trim(),
        phone: null,
        orders: [],
        orderCount: 0,
        activeCount: 0,
        totalQuoted: 0,
        totalDelivered: 0,
      };
      map.set(key, entry);
    }
    entry.orders.push(o);
    entry.orderCount += 1;
    if (o.status !== 'entregado' && o.status !== 'cancelado') entry.activeCount += 1;
    if (o.quoted_price != null) {
      entry.totalQuoted += o.quoted_price;
      if (o.status === 'entregado') entry.totalDelivered += o.quoted_price;
    }
    if (!entry.phone && o.client_phone) entry.phone = o.client_phone;
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function ClientesPanel({
  orders, onNewOrder, onOpenOrder,
}: {
  orders: ShopperOrder[];
  onNewOrder: (clientName: string, clientPhone: string | null) => void;
  onOpenOrder: (order: ShopperOrder) => void;
}) {
  const [search, setSearch] = useState('');
  const [profileKey, setProfileKey] = useState<string | null>(null);

  const clients = useMemo(() => buildClients(orders), [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q),
    );
  }, [clients, search]);

  const profile = profileKey ? clients.find(c => c.key === profileKey) ?? null : null;

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5 items-start">

        {/* ── Panel de control (sticky en desktop) ── */}
        <div className="nodo-card p-4 flex flex-col gap-4 xl:sticky xl:top-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-nodo-dim pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="nodo-input"
              style={{ paddingLeft: '2.75rem', paddingRight: '2.75rem' }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-nodo-raised
                           flex items-center justify-center active:scale-90 transition-transform"
              >
                <X className="w-3.5 h-3.5 text-nodo-sub" />
              </button>
            )}
          </div>
        </div>

        {/* ── Lista de clientes ── */}
        <div className="flex flex-col gap-4 min-w-0">
          {filtered.length === 0 ? (
            <div className="nodo-card p-10 text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-3xl flex items-center justify-center"
                style={{ background: 'var(--nodo-iris-soft)' }}>
                <Users className="w-10 h-10 text-nodo-sub" />
              </div>
              <p className="text-lg font-bold text-nodo-ink mb-1">
                {clients.length > 0 ? 'Sin resultados' : 'Aún no hay clientes'}
              </p>
              <p className="text-sm text-nodo-sub">
                {clients.length > 0
                  ? 'Prueba con otro nombre o teléfono'
                  : 'Los clientes aparecen aquí al crear pedidos'}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between px-1">
                <p className="nodo-section-label !mb-0">Clientes</p>
                <span className="text-xs font-bold text-nodo-dim tabular-nums">
                  {filtered.length} {filtered.length === 1 ? 'cliente' : 'clientes'}
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
                {filtered.map(c => (
                  <div
                    key={c.key}
                    onClick={() => setProfileKey(c.key)}
                    className="nodo-card p-4 cursor-pointer transition-all active:scale-[0.99] hover:border-nodo-line-s"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} size={48} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-nodo-ink truncate">{c.name}</p>
                        <p className="text-sm text-nodo-sub truncate mt-0.5">
                          {c.phone ?? 'Sin teléfono'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-black text-nodo-ink leading-tight tracking-tight tabular-nums">
                          {fmt(c.totalQuoted)}
                        </p>
                        <p className="text-xs text-nodo-dim">
                          {c.orderCount} {c.orderCount === 1 ? 'pedido' : 'pedidos'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══════════ BOTTOM SHEET: PERFIL DE CLIENTE ═══════════ */}
      <BottomSheet open={!!profile} onClose={() => setProfileKey(null)} title="Cliente">
        {profile && (
          <div className="space-y-5">
            {/* Encabezado */}
            <div className="flex items-center gap-3">
              <Avatar name={profile.name} size={56} />
              <div className="flex-1 min-w-0">
                <p className="text-xl font-black text-nodo-ink truncate">{profile.name}</p>
                <p className="text-sm text-nodo-sub font-medium flex items-center gap-1.5">
                  <Phone size={12} /> {profile.phone ?? 'Sin teléfono'}
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-nodo-inset rounded-2xl p-3">
                <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-0.5">Pedidos</p>
                <p className="text-2xl font-black text-nodo-ink tabular-nums">{profile.orderCount}</p>
                {profile.activeCount > 0 && (
                  <p className="text-[10px] font-semibold text-nodo-sub mt-0.5">
                    {profile.activeCount} {profile.activeCount === 1 ? 'activo' : 'activos'}
                  </p>
                )}
              </div>
              <div className="bg-nodo-inset rounded-2xl p-3">
                <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-0.5">Total cotizado</p>
                <p className="text-2xl font-black text-nodo-ink tabular-nums">{fmt(profile.totalQuoted)}</p>
                {profile.totalDelivered > 0 && (
                  <p className="text-[10px] font-semibold text-nodo-sub mt-0.5">
                    {fmt(profile.totalDelivered)} entregado
                  </p>
                )}
              </div>
            </div>

            {/* Acciones */}
            <div className="flex gap-2">
              {profile.phone && (
                <button
                  onClick={() =>
                    window.open(buildWhatsAppUrl(`Hola ${profile.name} 👋`, profile.phone), '_blank', 'noopener')
                  }
                  className="flex-1 h-11 rounded-full bg-[#25D366] text-white font-bold text-sm
                             flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
                >
                  <MessageCircle size={16} /> WhatsApp
                </button>
              )}
              <button
                onClick={() => {
                  onNewOrder(profile.name, profile.phone);
                  setProfileKey(null);
                }}
                className="flex-1 h-11 rounded-full font-bold text-sm flex items-center justify-center gap-2
                           active:scale-[0.97] transition-transform"
                style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
              >
                <Plus size={16} /> Nuevo pedido
              </button>
            </div>

            {/* Historial */}
            <div>
              <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1">Historial de pedidos</p>
              <div className="divide-y divide-nodo-line">
                {profile.orders.map(o => (
                  <button
                    key={o.id}
                    onClick={() => {
                      setProfileKey(null);
                      onOpenOrder(o);
                    }}
                    className="w-full flex items-center gap-3 py-2.5 text-left active:scale-[0.99] transition-transform"
                  >
                    <span className="w-8 h-8 rounded-xl bg-nodo-inset flex items-center justify-center shrink-0">
                      <Package2 size={14} className="text-nodo-sub" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-nodo-ink truncate">{o.product_description}</p>
                      <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">
                        {STATUS_LABELS[o.status]}
                      </p>
                    </div>
                    {o.quoted_price != null && (
                      <p className="text-sm font-black tabular-nums text-nodo-ink shrink-0">
                        {fmt(o.quoted_price)}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
