/**
 * Recuperar el pedido con WhatsApp + clave de 4 dígitos, sin el link directo.
 * Llega desde el catálogo con ?c=<catalog_token> para acotar la búsqueda al negocio.
 */
import { useState } from 'react';
import { Loader2, ShoppingBag, KeyRound } from 'lucide-react';
import { shopperCatalogService as svc } from '@/services/shopper_catalog.service';

function catalogToken(): string | null {
  const p = new URLSearchParams(window.location.search).get('c');
  return p && /^[0-9a-f-]{36}$/i.test(p) ? p : null;
}

export function ShopperOrderLookupPage() {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ct = catalogToken();
  const valid = phone.replace(/\D/g, '').length >= 8 && /^\d{4}$/.test(pin);

  const submit = async () => {
    if (!valid || !ct) return;
    setBusy(true); setError(null);
    try {
      const order = await svc.lookupOrder(phone.trim(), pin.trim(), ct);
      window.location.href = `/mi-pedido/${order.order_token}`;
    } catch {
      setError('No encontramos un pedido con esos datos. Revisá tu número y tu clave.');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-nodo-canvas flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 rounded-2xl bg-nodo-primary text-nodo-on-primary flex items-center justify-center"><ShoppingBag size={26} /></div>
          <h1 className="text-2xl font-black text-nodo-ink">Ver mi pedido</h1>
          <p className="text-sm text-nodo-sub">Escribí tu número de WhatsApp y la clave de 4 números que te dimos al apartar.</p>
        </div>

        {!ct && <p className="text-sm font-bold text-nodo-danger-tx text-center">Abrí esta página desde el catálogo del negocio.</p>}

        <div><label className="nodo-label">Tu WhatsApp</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="5512 3456" className="nodo-input" inputMode="tel" /></div>
        <div><label className="nodo-label">Tu clave de 4 números</label><input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="0000" className="nodo-input-number tracking-[0.4em] text-center text-lg" inputMode="numeric" /></div>

        {error && <p className="text-sm font-bold text-nodo-danger-tx text-center">{error}</p>}

        <button onClick={submit} disabled={!valid || !ct || busy}
          className="w-full h-14 rounded-2xl bg-nodo-primary text-nodo-on-primary font-black active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />} VER MI PEDIDO
        </button>
      </div>
    </div>
  );
}
