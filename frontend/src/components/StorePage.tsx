import { useEffect, useMemo, useState } from 'react';
import { Loader2, Minus, Plus, ShoppingBag, Store, Tag, X } from 'lucide-react';
import { ventasService, type PublicCatalog, type PublicPromotion } from '@/services/ventas.service';
import { brandTheme } from '@/lib/utils';

interface Props {
  token: string;
}

const money = (n: number) => `Q${n.toFixed(2)}`;

function promoTag(p: PublicPromotion): string {
  if (p.promo_type === 'percent' && p.value) return `-${Math.round(p.value)}%`;
  if (p.promo_type === 'two_for_one') return '2x1';
  if (p.promo_type === 'bundle' && p.value) return `Combo ${money(p.value)}`;
  return 'OFERTA';
}

export function StorePage({ token }: Props) {
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [qty, setQty] = useState<Record<string, number>>({});
  const [showCheckout, setShowCheckout] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    ventasService.getPublicCatalog(token)
      .then(setCatalog)
      .catch(() => setError('Tienda no encontrada o link inválido.'))
      .finally(() => setLoading(false));
  }, [token]);

  const cart = useMemo(() => {
    if (!catalog) return { count: 0, total: 0 };
    let count = 0;
    let total = 0;
    for (const p of catalog.products) {
      const q = qty[p.id] ?? 0;
      count += q;
      total += q * p.price;
    }
    return { count, total };
  }, [catalog, qty]);

  const selectedItems = useMemo(
    () => (catalog?.products ?? []).filter(p => (qty[p.id] ?? 0) > 0),
    [catalog, qty],
  );

  // Promos de toda la tienda → banner; promos por producto → chip sobre la card
  const storePromos = useMemo(
    () => (catalog?.promotions ?? []).filter(p => !p.product_id),
    [catalog],
  );
  const promoByProduct = useMemo(() => {
    const map: Record<string, PublicPromotion> = {};
    for (const p of catalog?.promotions ?? []) {
      if (p.product_id) map[p.product_id] = p;
    }
    return map;
  }, [catalog]);

  const setProductQty = (id: string, value: number, max: number) => {
    setQty(prev => ({ ...prev, [id]: Math.max(0, Math.min(max, value)) }));
  };

  const handleSubmit = async () => {
    if (!catalog || cart.count === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const items = selectedItems.map(p => ({ product_id: p.id, qty: qty[p.id] }));
      const created = await ventasService.createPublicOrder(token, {
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        items,
      });
      window.location.href = `/pedido/${created.order_token}`;
    } catch (err: any) {
      setSubmitError(err?.response?.data?.detail ?? 'No se pudo crear el pedido. Intenta de nuevo.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error || !catalog) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 px-6">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <Store className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-gray-700 font-semibold text-center">{error}</p>
        <p className="text-gray-400 text-sm text-center">Verifica el link con el negocio.</p>
      </div>
    );
  }

  const brand = brandTheme(catalog.business_color);
  const canOrder = catalog.is_open && cart.count > 0;
  const formValid = name.trim().length >= 2 && phone.trim().length >= 6;

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Hero con branding del negocio */}
      <div className="relative overflow-hidden px-6 pt-12 pb-16" style={{ background: brand.gradient, color: brand.onBrand }}>
        {/* Círculos decorativos sutiles */}
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full pointer-events-none" style={{ background: brand.overlay }} />
        <div className="absolute -bottom-24 -left-10 w-48 h-48 rounded-full pointer-events-none" style={{ background: brand.overlay }} />

        <div className="relative max-w-md mx-auto flex flex-col items-center text-center">
          {catalog.business_logo_url ? (
            <img
              src={catalog.business_logo_url}
              alt={catalog.business_name ?? ''}
              className="w-20 h-20 rounded-[22px] object-contain bg-white p-1.5 shadow-xl"
            />
          ) : (
            <div className="w-20 h-20 rounded-[22px] bg-white shadow-xl flex items-center justify-center">
              <Store className="w-9 h-9" style={{ color: brand.base }} />
            </div>
          )}

          <h1 className="text-[26px] font-black tracking-tight leading-tight mt-3">
            {catalog.business_name ?? 'Tienda'}
          </h1>
          <p className="text-sm font-medium mt-0.5" style={{ opacity: 0.8 }}>
            Pide en línea y recoge en el local
          </p>

          <div
            className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold"
            style={{ background: brand.overlay }}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${catalog.is_open ? 'bg-emerald-400' : 'bg-red-400'}`}
            />
            {catalog.is_open
              ? `Abierto · ${catalog.products.length} producto${catalog.products.length !== 1 ? 's' : ''}`
              : 'Cerrado — no se aceptan pedidos por ahora'}
          </div>
        </div>
      </div>

      {/* Hoja de productos sobre el hero */}
      <div className="relative -mt-8 bg-gray-50 rounded-t-[32px] pt-6">
        <div className="max-w-md mx-auto px-4">
          {catalog.products.length === 0 ? (
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-10 text-center">
              <ShoppingBag className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-400">Aún no hay productos publicados</p>
            </div>
          ) : (
            <>
              {/* Banners de oferta de toda la tienda — gancho de entrada */}
              {storePromos.length > 0 && (
                <div className="flex flex-col gap-2.5 mb-4">
                  {storePromos.map((promo, idx) => (
                    <div
                      key={idx}
                      className="rounded-3xl p-4 flex items-center gap-3 shadow-lg"
                      style={{ background: brand.gradient, color: brand.onBrand }}
                    >
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                        style={{ background: brand.overlay }}
                      >
                        <Tag size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-black leading-tight">{promo.title}</p>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums"
                            style={{ background: brand.overlay }}
                          >
                            {promoTag(promo)}
                          </span>
                        </div>
                        {promo.description && (
                          <p className="text-[12px] mt-0.5" style={{ opacity: 0.85 }}>{promo.description}</p>
                        )}
                        {promo.urgency_text && (
                          <p className="text-[11px] font-bold mt-1 inline-flex items-center gap-1">
                            ⏳ {promo.urgency_text}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-3 px-1">
                Nuestros productos
              </p>
              <div className="grid grid-cols-2 gap-3">
                {catalog.products.map(p => {
                  const q = qty[p.id] ?? 0;
                  const soldOut = p.available <= 0;
                  const interactive = !soldOut && catalog.is_open;
                  const promo = promoByProduct[p.id];
                  const hasAnchor = p.compare_at_price != null && p.compare_at_price > p.price;
                  const savePct = hasAnchor
                    ? Math.round((1 - p.price / (p.compare_at_price as number)) * 100)
                    : 0;
                  return (
                    <div key={p.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                      {/* Imagen */}
                      <div className="relative aspect-square bg-gray-100">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            className={`absolute inset-0 w-full h-full object-cover ${soldOut ? 'grayscale opacity-60' : ''}`}
                          />
                        ) : (
                          <div
                            className="absolute inset-0 flex items-center justify-center text-4xl font-black"
                            style={{ background: brand.base + '14', color: soldOut ? '#9ca3af' : brand.base }}
                          >
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {/* Ganchos apilados arriba-izquierda */}
                        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
                          {!soldOut && p.badge && (
                            <span
                              className="text-[10px] font-black uppercase tracking-wide rounded-full px-2.5 py-1 shadow"
                              style={{ background: brand.base, color: brand.onBrand }}
                            >
                              {p.badge}
                            </span>
                          )}
                          {!soldOut && hasAnchor && (
                            <span className="bg-rose-500 text-white text-[10px] font-black rounded-full px-2.5 py-1 shadow tabular-nums">
                              -{savePct}%
                            </span>
                          )}
                          {!soldOut && promo && (
                            <span className="bg-emerald-500 text-white text-[10px] font-black rounded-full px-2.5 py-1 shadow tabular-nums">
                              {promoTag(promo)}
                            </span>
                          )}
                          {soldOut ? (
                            <span className="bg-gray-900/80 text-white text-[10px] font-bold uppercase tracking-wide rounded-full px-2.5 py-1">
                              Agotado
                            </span>
                          ) : p.available <= 3 ? (
                            <span className="bg-amber-500/95 text-white text-[10px] font-bold rounded-full px-2.5 py-1">
                              ¡Quedan {p.available}!
                            </span>
                          ) : null}
                        </div>
                        {q > 0 && (
                          <span
                            className="absolute top-2 right-2 w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center tabular-nums shadow"
                            style={{ background: brand.base, color: brand.onBrand }}
                          >
                            {q}
                          </span>
                        )}
                      </div>

                      {/* Info + acción */}
                      <div className="p-3 flex flex-col flex-1">
                        <p className="text-[13px] font-bold text-gray-900 leading-snug line-clamp-2">{p.name}</p>
                        {promo?.urgency_text ? (
                          <p className="text-[11px] text-rose-500 font-bold mt-0.5 line-clamp-1">⏳ {promo.urgency_text}</p>
                        ) : p.description ? (
                          <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{p.description}</p>
                        ) : null}
                        <div className="mt-auto pt-2.5 flex items-center justify-between gap-2">
                          <div className="flex flex-col leading-none min-w-0">
                            {hasAnchor && (
                              <span className="text-[11px] font-bold text-gray-400 line-through tabular-nums">
                                {money(p.compare_at_price as number)}
                              </span>
                            )}
                            <span className={`text-[15px] font-black tabular-nums ${hasAnchor ? 'text-rose-600' : 'text-gray-900'}`}>
                              {money(p.price)}
                            </span>
                          </div>
                          {interactive && (
                            q === 0 ? (
                              <button
                                onClick={() => setProductQty(p.id, 1, p.available)}
                                className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-md shrink-0"
                                style={{ background: brand.base, color: brand.onBrand }}
                              >
                                <Plus size={16} />
                              </button>
                            ) : (
                              <div
                                className="flex items-center gap-0.5 rounded-full p-1 shrink-0 shadow-md"
                                style={{ background: brand.base, color: brand.onBrand }}
                              >
                                <button
                                  onClick={() => setProductQty(p.id, q - 1, p.available)}
                                  className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                                  style={{ background: brand.overlay }}
                                >
                                  <Minus size={13} />
                                </button>
                                <span className="w-6 text-center text-sm font-black tabular-nums">{q}</span>
                                <button
                                  onClick={() => setProductQty(p.id, q + 1, p.available)}
                                  disabled={q >= p.available}
                                  className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30"
                                  style={{ background: brand.overlay }}
                                >
                                  <Plus size={13} />
                                </button>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="text-center py-7">
            <p className="text-xs text-gray-400">
              Powered by <span className="font-semibold text-gray-500">Nodo</span>
            </p>
          </div>
        </div>
      </div>

      {/* Barra inferior fija con total */}
      {canOrder && !showCheckout && (
        <div className="fixed bottom-0 inset-x-0 p-4 bg-white/90 backdrop-blur border-t border-gray-100" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
          <div className="max-w-md mx-auto">
            <button
              onClick={() => setShowCheckout(true)}
              className="w-full h-14 rounded-2xl font-black text-base flex items-center justify-between px-5 active:scale-[0.97] transition-transform shadow-lg"
              style={{ background: brand.base, color: brand.onBrand }}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-black tabular-nums"
                  style={{ background: brand.overlay }}
                >
                  {cart.count}
                </span>
                Hacer pedido
              </span>
              <span className="tabular-nums">{money(cart.total)}</span>
            </button>
          </div>
        </div>
      )}

      {/* Checkout: nombre + teléfono */}
      {showCheckout && (
        <div className="fixed inset-0 z-50" onClick={() => !submitting && setShowCheckout(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl p-6 max-w-md mx-auto max-h-[88dvh] overflow-y-auto"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                {catalog.business_logo_url && (
                  <img
                    src={catalog.business_logo_url}
                    alt=""
                    className="w-8 h-8 rounded-lg object-contain bg-gray-50 border border-gray-100 p-0.5"
                  />
                )}
                <h2 className="text-lg font-black text-gray-900">Confirma tu pedido</h2>
              </div>
              <button
                onClick={() => !submitting && setShowCheckout(false)}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500"
              >
                <X size={16} />
              </button>
            </div>

            {/* Resumen del pedido */}
            <div className="bg-gray-50 rounded-2xl p-4 mb-4">
              <div className="flex flex-col gap-2">
                {selectedItems.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-gray-700 truncate">
                      <span className="font-black text-gray-900 tabular-nums">{qty[p.id]}×</span> {p.name}
                    </span>
                    <span className="font-bold text-gray-900 tabular-nums shrink-0">{money(p.price * qty[p.id])}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                <span className="text-sm font-semibold text-gray-500">Total</span>
                <span className="text-lg font-black text-gray-900 tabular-nums">{money(cart.total)}</span>
              </div>
            </div>

            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Tu nombre</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nombre y apellido"
              className="w-full h-12 px-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm font-semibold text-gray-900 outline-none focus:border-gray-300 mb-3"
            />

            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Tu teléfono</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="5555 5555"
              className="w-full h-12 px-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm font-semibold text-gray-900 outline-none focus:border-gray-300 mb-4"
            />

            {submitError && (
              <p className="text-xs font-semibold text-red-500 mb-3">{submitError}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={!formValid || submitting}
              className="w-full h-14 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-30 shadow-lg"
              style={{ background: brand.base, color: brand.onBrand }}
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <ShoppingBag size={18} />}
              ENVIAR PEDIDO
            </button>
            <p className="text-[11px] text-gray-400 text-center mt-3">
              El negocio apartará tu pedido por un tiempo limitado.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
