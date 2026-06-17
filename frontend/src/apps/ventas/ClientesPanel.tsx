import { useEffect, useState } from 'react';
import { Check, Loader2, Phone, Users } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ventasService, type StoreClient, type StoreOrder } from '@/services/ventas.service';

interface Props {
  onError: (msg: string) => void;
}

const money = (n: number) =>
  'Q' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_LABELS: Record<string, string> = {
  solicitado: 'Solicitado',
  apartado: 'Apartado',
  entregado: 'Entregado',
  rechazado: 'Rechazado',
  expirado: 'Expirado',
  cancelado: 'Cancelado',
};

const fmtDate = (iso: string) =>
  new Date(iso + 'Z').toLocaleDateString('es-GT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function ClientesPanel({ onError }: Props) {
  const [clients, setClients] = useState<StoreClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StoreClient | null>(null);
  const [history, setHistory] = useState<StoreOrder[] | null>(null);

  useEffect(() => {
    ventasService.listClients()
      .then(setClients)
      .catch(() => onError('Error al cargar clientes'))
      .finally(() => setLoading(false));
  }, [onError]);

  const openClient = async (client: StoreClient) => {
    setSelected(client);
    setHistory(null);
    try {
      setHistory(await ventasService.listOrders(client.customer_phone));
    } catch {
      onError('Error al cargar el historial');
      setSelected(null);
    }
  };

  if (loading) {
    return (
      <div className="nodo-spinner-container">
        <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
      </div>
    );
  }

  return (
    <>
      {clients.length === 0 ? (
        <div className="nodo-empty-state">
          <Users size={32} className="text-nodo-dim mb-2" />
          <p className="text-sm font-bold text-nodo-dim">
            Aún no hay clientes — llegan solos con cada pedido del catálogo
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {clients.map(client => (
            <button
              key={client.customer_phone}
              onClick={() => openClient(client)}
              className="nodo-card p-4 flex items-center gap-4 text-left active:scale-[0.99] transition-transform"
            >
              <div className="w-12 h-12 rounded-2xl bg-nodo-primary-soft flex items-center justify-center text-lg font-black text-nodo-ink shrink-0">
                {(client.customer_name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-nodo-ink truncate">{client.customer_name}</p>
                <p className="text-xs text-nodo-sub mt-0.5 tabular-nums">
                  {client.orders_count} pedido{client.orders_count !== 1 ? 's' : ''} · último {fmtDate(client.last_order_at)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] font-semibold text-nodo-sub">PAGADO</p>
                <p className="text-base font-black text-nodo-ink tabular-nums">{money(client.total_paid)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <BottomSheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.customer_name ?? 'Cliente'}
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-nodo-inset border border-nodo-line rounded-2xl px-4 py-3">
              <a
                href={`tel:${selected.customer_phone}`}
                className="flex items-center gap-2 text-sm font-bold text-nodo-ink"
              >
                <Phone size={14} className="text-nodo-sub" />
                {selected.customer_phone}
              </a>
              <div className="text-right">
                <p className="text-[10px] font-semibold text-nodo-sub">TOTAL PAGADO</p>
                <p className="text-sm font-black text-nodo-ink tabular-nums">{money(selected.total_paid)}</p>
              </div>
            </div>

            <p className="nodo-section-label">Historial de pedidos</p>

            {history === null ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="w-6 h-6 animate-spin text-nodo-sub" />
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {history.map(order => (
                  <div key={order.id} className="bg-nodo-inset border border-nodo-line rounded-2xl p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-nodo-ink tabular-nums">{order.short_code}</span>
                        <span className="bg-nodo-card border border-nodo-line text-nodo-sub rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase">
                          {STATUS_LABELS[order.status] ?? order.status}
                        </span>
                        {order.paid_at && (
                          <span className="inline-flex items-center gap-1 bg-nodo-success-bg border border-nodo-success-bd text-nodo-success-tx rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase">
                            <Check size={10} /> Pagado
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-black text-nodo-ink tabular-nums shrink-0">{money(order.total)}</span>
                    </div>
                    <p className="text-[11px] text-nodo-dim mt-1">{fmtDate(order.created_at)}</p>
                    <div className="mt-1.5 flex flex-col gap-0.5">
                      {order.items.map((item, i) => (
                        <p key={i} className="text-xs text-nodo-sub font-medium">
                          <span className="font-black text-nodo-ink tabular-nums">{item.qty}×</span> {item.product_name}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </>
  );
}
