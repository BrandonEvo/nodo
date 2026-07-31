/**
 * Vista de una reserva individual (link legacy /mis-pedidos/<client_token>).
 * Si la reserva pertenece a un pedido acumulado, redirige a "Mi pedido".
 */
import { useEffect, useState } from 'react';
import { Loader2, ShoppingBag } from 'lucide-react';
import { shopperCatalogService as svc } from '@/services/shopper_catalog.service';

interface Props { clientToken: string; }

export function ShopperReservationPage({ clientToken }: Props) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    svc.getClientReservation(clientToken)
      .then(r => {
        if (r.order_token) window.location.replace(`/mi-pedido/${r.order_token}`);
        else setError('No encontramos tu pedido.');
      })
      .catch(() => setError('No encontramos tu pedido.'));
  }, [clientToken]);

  return (
    <div className="min-h-screen bg-nodo-canvas flex flex-col items-center justify-center gap-3 px-6 text-center">
      {error ? (
        <>
          <ShoppingBag size={44} className="text-nodo-dim" />
          <p className="text-lg font-black text-nodo-ink">{error}</p>
        </>
      ) : (
        <>
          <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
          <p className="text-sm font-bold text-nodo-sub">Abriendo tu pedido…</p>
        </>
      )}
    </div>
  );
}
