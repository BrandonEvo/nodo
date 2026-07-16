/**
 * "Consulta tu pedido" — el cliente recupera su pedido acumulado con su WhatsApp
 * + PIN de 4 dígitos, sin login ni el link directo. Al encontrarlo, redirige a
 * /mi-pedido/<order_token>.
 *
 * La búsqueda se acota al negocio: el catálogo enlaza con `?c=<public_token>` y,
 * si el cliente llega sin ese parámetro, se usa el último catálogo que visitó en
 * este navegador. Sin ninguno de los dos no se puede buscar, porque un mismo
 * (teléfono, PIN) podría existir en dos negocios distintos.
 */
import { useState } from 'react';
import { Loader2, ShoppingBag, AlertTriangle, ArrowRight, X, Compass } from 'lucide-react';
import { importCatalogService, LAST_CATALOG_KEY } from '@/services/import_catalog.service';
import { haptic } from '@/utils/haptic';

const UUID_RE = /^[0-9a-f-]{36}$/i;

function resolveCatalogToken(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get('c');
  if (fromUrl && UUID_RE.test(fromUrl)) return fromUrl;
  try {
    const remembered = localStorage.getItem(LAST_CATALOG_KEY);
    return remembered && UUID_RE.test(remembered) ? remembered : null;
  } catch { return null; }
}

const glassCard: React.CSSProperties = {
  background: 'var(--nodo-glass-bg-strong)',
  backdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
  WebkitBackdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
  border: '1px solid var(--nodo-glass-border)',
  boxShadow: 'var(--nodo-shadow-card)',
};

export function ImportOrderLookupPage() {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [catalogToken] = useState(resolveCatalogToken);

  const digits = phone.replace(/\D/g, '');
  const ok = digits.length >= 8 && /^\d{4}$/.test(pin);

  const submit = async () => {
    if (!ok || loading || !catalogToken) return;
    haptic.tap(); setLoading(true); setErr(null);
    try {
      const order = await importCatalogService.lookupOrder(phone.trim(), pin.trim(), catalogToken);
      haptic.confirm();
      window.location.href = `/mi-pedido/${order.order_token}`;
    } catch (e) {
      haptic.error();
      setErr((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'No encontramos un pedido con esos datos.');
      setLoading(false);
    }
  };

  const bg = (
    <div className="fixed inset-0 -z-10 pointer-events-none dark:opacity-40"
      style={{
        background:
          'radial-gradient(ellipse 80% 40% at 50% -10%, rgba(105,231,168,0.14) 0%, transparent 70%),'
          + 'radial-gradient(ellipse 60% 40% at 80% 80%, rgba(65,88,208,0.08) 0%, transparent 60%)',
      }} />
  );

  // Sin catálogo no sabemos en qué negocio buscar, y buscar en todos mezclaría
  // pedidos de empresas distintas.
  if (!catalogToken) {
    return (
      <>
        {bg}
        <div className="min-h-screen bg-nodo-canvas flex items-center justify-center px-4">
          <div className="w-full max-w-sm rounded-[32px] p-6 space-y-4 text-center" style={glassCard}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto bg-nodo-inset">
              <Compass size={26} className="text-nodo-dim" />
            </div>
            <h1 className="text-xl font-black text-nodo-ink">Abre el catálogo del negocio</h1>
            <p className="text-sm text-nodo-sub leading-snug">
              Para buscar tu pedido necesitamos saber a qué negocio le compraste.
              Entra desde el link del catálogo que te compartieron y toca
              «Consulta tu pedido» al final de la página.
            </p>
            <p className="text-center text-[10px] text-nodo-dim pt-1">Pedido seguro con Nodo</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {bg}

      <div className="min-h-screen bg-nodo-canvas flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-[32px] p-6 space-y-5" style={glassCard}>
          <div className="flex flex-col items-center text-center gap-2">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--nodo-iris)' }}>
              <ShoppingBag size={26} className="text-white" />
            </div>
            <h1 className="text-xl font-black text-nodo-ink">Consulta tu pedido</h1>
            <p className="text-sm text-nodo-sub leading-snug">
              Escribe tu WhatsApp y el PIN de 4 dígitos que te dimos al apartar.
            </p>
          </div>

          {err && (
            <div className="flex items-center gap-2 bg-nodo-danger-bg border border-nodo-danger-bd
                            text-nodo-danger-tx text-xs font-bold px-3 py-2.5 rounded-2xl">
              <AlertTriangle size={14} className="shrink-0" />
              <span className="flex-1">{err}</span>
              <button onClick={() => setErr(null)}><X size={12} /></button>
            </div>
          )}

          <div>
            <label className="nodo-label">Tu WhatsApp</label>
            <input type="tel" inputMode="tel" value={phone} autoFocus
              onChange={e => setPhone(e.target.value)}
              placeholder="+502 5555-1234" className="nodo-input" />
          </div>
          <div>
            <label className="nodo-label">PIN de 4 dígitos</label>
            <input type="text" inputMode="numeric" value={pin} maxLength={4}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder="1234"
              className="nodo-input text-center !text-2xl !font-black tracking-[0.5em] tabular-nums" />
          </div>

          <button onClick={submit} disabled={!ok || loading}
            className="w-full rounded-2xl font-black text-base flex items-center justify-center gap-2
                       active:scale-[0.97] transition-transform disabled:opacity-40"
            style={{ background: ok ? 'var(--nodo-iris)' : 'var(--nodo-inset)', color: ok ? 'white' : undefined, height: 54 }}>
            {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
            {loading ? 'Buscando…' : 'Ver mi pedido'}
          </button>

          <p className="text-center text-[10px] text-nodo-dim">Pedido seguro con Nodo</p>
        </div>
      </div>
    </>
  );
}
