import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, Clock, HandCoins, Inbox, Loader2,
  PackageCheck, Phone, Store, X,
} from 'lucide-react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { StoreMonitor, StoreOrder } from '@/services/ventas.service';

export type OrderAction = 'confirm' | 'reject' | 'deliver' | 'charge' | 'cancel';

interface Props {
  monitor: StoreMonitor;
  onAction: (orderId: string, action: OrderAction) => Promise<void>;
  onGoToProducts: () => void;
}

type Tab = 'nuevos' | 'entregar' | 'cobrar' | 'cerrados';

const TAB_OPTS = [
  { value: 'nuevos' as Tab, label: 'Nuevos' },
  { value: 'entregar' as Tab, label: 'Entregar' },
  { value: 'cobrar' as Tab, label: 'Cobrar' },
  { value: 'cerrados' as Tab, label: 'Cerrados' },
];

const money = (n: number) =>
  'Q' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CLOSED_LABELS: Record<string, string> = {
  entregado: 'Entregado',
  rechazado: 'Rechazado',
  expirado: 'Expirado',
  cancelado: 'Cancelado',
};

function tabOf(order: StoreOrder): Tab {
  if (order.status === 'solicitado') return 'nuevos';
  if (order.status === 'apartado') return 'entregar';
  if (order.status === 'entregado' && !order.paid_at) return 'cobrar';
  return 'cerrados';
}

function CountdownChip({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState('');
  useEffect(() => {
    const tick = () => {
      const ms = new Date(expiresAt + 'Z').getTime() - Date.now();
      if (ms <= 0) { setLeft('0:00'); return; }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setLeft(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return (
    <span className="inline-flex items-center gap-1 bg-nodo-warn-bg border border-nodo-warn-bd text-nodo-warn-tx rounded-lg px-2 py-1 text-xs font-black tabular-nums">
      <Clock size={11} />
      {left}
    </span>
  );
}

export function MonitorPedidos({ monitor, onAction, onGoToProducts }: Props) {
  const [tab, setTab] = useState<Tab>('nuevos');
  const [busyId, setBusyId] = useState<string | null>(null);

  const { kpis } = monitor;

  const filtered = useMemo(
    () => monitor.orders.filter(o => tabOf(o) === tab),
    [monitor.orders, tab],
  );

  const run = async (orderId: string, action: OrderAction) => {
    setBusyId(orderId);
    try {
      await onAction(orderId, action);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-nodo-md p-4 bg-nodo-pastel-yellow">
          <p className="text-[10px] font-semibold text-nodo-sub">NUEVOS</p>
          <p className="text-2xl font-black text-nodo-ink tabular-nums">{kpis.nuevos}</p>
        </div>
        <div className="rounded-nodo-md p-4 bg-nodo-pastel-blue">
          <p className="text-[10px] font-semibold text-nodo-sub">POR ENTREGAR</p>
          <p className="text-2xl font-black text-nodo-ink tabular-nums">{kpis.por_entregar}</p>
        </div>
        <div className="rounded-nodo-md p-4 bg-nodo-pastel-mint">
          <p className="text-[10px] font-semibold text-nodo-sub">POR COBRAR</p>
          <p className="text-2xl font-black text-nodo-ink tabular-nums">{kpis.por_cobrar}</p>
        </div>
      </div>

      {/* Hero: dinero del día + inversión en stock */}
      <div className="rounded-nodo-lg p-5 bg-nodo-primary" style={{ boxShadow: 'var(--nodo-shadow-hero)' }}>
        <p className="text-[10px] font-semibold text-nodo-on-primary opacity-70">COBRADO HOY</p>
        <p className="text-[40px] leading-tight font-black text-nodo-on-primary tabular-nums tracking-tighter">
          {money(kpis.cobrado_hoy)}
        </p>
        <div className="flex items-center gap-6 mt-3 pt-3 border-t border-current/15">
          <div>
            <p className="text-[9px] font-bold text-nodo-on-primary opacity-60 uppercase tracking-[0.14em]">Ganancia hoy</p>
            <p className="text-lg font-black text-nodo-on-primary tabular-nums">{money(kpis.ganancia_hoy)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-nodo-on-primary opacity-60 uppercase tracking-[0.14em]">Invertido en stock</p>
            <p className="text-lg font-black text-nodo-on-primary tabular-nums">{money(kpis.invertido)}</p>
          </div>
        </div>
      </div>

      {kpis.stock_critico > 0 && (
        <button
          onClick={onGoToProducts}
          className="flex items-center gap-2 bg-nodo-warn-bg border border-nodo-warn-bd text-nodo-warn-tx rounded-2xl px-4 py-2.5 text-xs font-bold active:scale-[0.98] transition-transform"
        >
          <AlertTriangle size={14} className="shrink-0" />
          {kpis.stock_critico} producto{kpis.stock_critico > 1 ? 's' : ''} con stock crítico — toca para revisar
        </button>
      )}

      <SegmentedControl options={TAB_OPTS} value={tab} onChange={t => setTab(t)} size="sm" />

      {/* Lista de pedidos */}
      {filtered.length === 0 ? (
        <div className="nodo-empty-state">
          <Inbox size={32} className="text-nodo-dim mb-2" />
          <p className="text-sm font-bold text-nodo-dim">
            {tab === 'nuevos' ? 'Sin pedidos nuevos — comparte el link de tu tienda' : 'Nada por aquí'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(order => {
            const busy = busyId === order.id;
            const closed = tabOf(order) === 'cerrados';
            return (
              <div key={order.id} className={`nodo-card p-4 ${closed ? 'opacity-70' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xl font-black text-nodo-ink tabular-nums tracking-tight">
                        {order.short_code}
                      </span>
                      {order.channel === 'mostrador' && (
                        <span className="inline-flex items-center gap-1 bg-nodo-inset border border-nodo-line text-nodo-sub rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase">
                          <Store size={10} /> Mostrador
                        </span>
                      )}
                      {order.paid_at && (
                        <span className="inline-flex items-center gap-1 bg-nodo-success-bg border border-nodo-success-bd text-nodo-success-tx rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase">
                          <Check size={10} /> Pagado
                        </span>
                      )}
                      {closed && (
                        <span className="bg-nodo-inset border border-nodo-line text-nodo-sub rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase">
                          {CLOSED_LABELS[order.status] ?? order.status}
                        </span>
                      )}
                    </div>
                    {order.customer_name && (
                      <p className="text-sm font-semibold text-nodo-ink mt-1 truncate">
                        {order.customer_name}
                        {order.customer_phone && (
                          <a
                            href={`tel:${order.customer_phone}`}
                            className="inline-flex items-center gap-1 text-xs text-nodo-sub font-medium ml-2"
                          >
                            <Phone size={11} /> {order.customer_phone}
                          </a>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {order.status === 'solicitado' && order.expires_at && (
                      <CountdownChip expiresAt={order.expires_at} />
                    )}
                    <span className="text-lg font-black text-nodo-ink tabular-nums">{money(order.total)}</span>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-col gap-0.5">
                  {order.items.map((item, i) => (
                    <p key={i} className="text-xs text-nodo-sub font-medium">
                      <span className="font-black text-nodo-ink tabular-nums">{item.qty}×</span> {item.product_name}
                    </p>
                  ))}
                </div>

                {/* Acción contextual: un tap por transición */}
                {!closed && (
                  <div className="flex items-center gap-2 mt-3">
                    {order.status === 'solicitado' && (
                      <>
                        <button
                          onClick={() => run(order.id, 'confirm')}
                          disabled={busy}
                          className="flex-1 h-11 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-sm active:scale-[0.97] transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                          CONFIRMAR
                        </button>
                        <button
                          onClick={() => run(order.id, 'reject')}
                          disabled={busy}
                          className="h-11 px-4 rounded-2xl border-2 border-nodo-danger-bd text-nodo-danger-tx font-bold text-sm active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center"
                        >
                          <X size={16} />
                        </button>
                      </>
                    )}
                    {order.status === 'apartado' && (
                      <>
                        <button
                          onClick={() => run(order.id, 'deliver')}
                          disabled={busy}
                          className="flex-1 h-11 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-sm active:scale-[0.97] transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                          {busy ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />}
                          ENTREGAR
                        </button>
                        <button
                          onClick={() => run(order.id, 'cancel')}
                          disabled={busy}
                          className="h-11 px-4 rounded-2xl border-2 border-nodo-line text-nodo-sub font-bold text-sm active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center"
                        >
                          <X size={16} />
                        </button>
                      </>
                    )}
                    {order.status === 'entregado' && !order.paid_at && (
                      <button
                        onClick={() => run(order.id, 'charge')}
                        disabled={busy}
                        className="flex-1 h-11 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-sm active:scale-[0.97] transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        {busy ? <Loader2 size={16} className="animate-spin" /> : <HandCoins size={16} />}
                        COBRAR {money(order.total)}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
