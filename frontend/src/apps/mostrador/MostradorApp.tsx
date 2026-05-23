import { useState, useEffect, useCallback } from 'react';
import { haptic } from '@/utils/haptic';
import {
  Plus, Minus, Banknote, CreditCard, X, Check, ShoppingBag, Loader2, Trash2, Store,
} from 'lucide-react';
import type { AppProps } from '../index';
import { mostradorService } from '@/services/mostrador.service';
import type { Recipe } from '@/services/recetas.service';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

type Freshness = 'fresco' | 'ayer';

interface CartItem {
  recipe: Recipe;
  qty: number;
  freshness: Freshness;
}

const getPrice = (recipe: Recipe, freshness: Freshness) =>
  freshness === 'ayer' ? recipe.sell_price * 0.6 : recipe.sell_price;

// ── ProductCard ───────────────────────────────────────────────────────────────
function ProductCard({
  product, qty, freshness, onAdd, onRemove,
}: {
  product: Recipe;
  qty: number;
  freshness: Freshness;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const price  = getPrice(product, freshness);
  const inCart = qty > 0;

  return (
    <div className={`relative flex flex-col bg-nodo-card rounded-3xl border overflow-hidden transition-all duration-150 ${
      inCart
        ? 'border-emerald-400/70 shadow-lg shadow-emerald-500/10'
        : 'border-nodo-line active:border-nodo-line-s'
    }`}>
      {/* Left accent strip when in cart */}
      {inCart && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-500 z-10" />}

      {/* Qty badge */}
      {inCart && (
        <span className="absolute top-3 right-3 w-6 h-6 rounded-full bg-emerald-500 text-white text-[11px] font-black flex items-center justify-center shadow z-10 select-none">
          {qty}
        </span>
      )}

      {/* AYER badge */}
      {freshness === 'ayer' && (
        <span className="absolute top-3 left-4 bg-amber-400/20 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded-md tracking-wide z-10">
          −40%
        </span>
      )}

      {/* Tap target — adds 1 to cart */}
      <button
        onClick={onAdd}
        className="flex-1 flex flex-col p-4 text-left active:bg-nodo-inset transition-colors min-h-[108px]"
      >
        <p className="text-xs font-bold text-nodo-ink leading-snug line-clamp-2 mt-0.5 pr-6">
          {product.name}
        </p>
        <div className="mt-auto pt-2">
          <p className="text-2xl font-black text-nodo-ink leading-none">
            Q{price.toFixed(2)}
          </p>
          {freshness === 'ayer' && (
            <p className="text-[10px] text-nodo-dim line-through mt-0.5">
              Q{product.sell_price.toFixed(2)}
            </p>
          )}
        </div>
      </button>

      {/* In-cart controls — appear when qty > 0 */}
      {inCart && (
        <div className="flex items-center px-3 pb-3 pt-1 gap-2">
          <button
            onClick={onRemove}
            className="w-9 h-9 rounded-xl bg-nodo-inset border border-nodo-line flex items-center justify-center active:scale-90 transition-transform text-nodo-ink"
          >
            <Minus size={13} strokeWidth={2.5} />
          </button>
          <span className="flex-1 text-center text-sm font-black text-nodo-ink select-none">{qty}</span>
          <button
            onClick={onAdd}
            className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center active:scale-90 transition-transform text-white"
          >
            <Plus size={13} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── CartRow (desktop panel) ───────────────────────────────────────────────────
function CartRow({
  item, onUpdate,
}: {
  item: CartItem;
  onUpdate: (id: string, freshness: Freshness, delta: number) => void;
}) {
  const price = getPrice(item.recipe, item.freshness);
  return (
    <div className="flex items-center gap-3 bg-nodo-inset rounded-2xl px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-nodo-ink truncate">{item.recipe.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-xs text-nodo-sub">Q{price.toFixed(2)}</p>
          {item.freshness === 'ayer' && (
            <span className="bg-amber-100 text-amber-700 text-[8px] font-bold px-1 py-0.5 rounded">AYER</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => onUpdate(item.recipe.id, item.freshness, -1)}
          className="w-7 h-7 rounded-lg bg-nodo-card border border-nodo-line flex items-center justify-center active:scale-90 transition-transform text-nodo-ink"
        >
          <Minus size={11} strokeWidth={3} />
        </button>
        <span className="w-6 text-center text-sm font-black text-nodo-ink select-none">{item.qty}</span>
        <button
          onClick={() => onUpdate(item.recipe.id, item.freshness, 1)}
          className="w-7 h-7 rounded-lg bg-nodo-card border border-nodo-line flex items-center justify-center active:scale-90 transition-transform text-nodo-ink"
        >
          <Plus size={11} strokeWidth={3} />
        </button>
      </div>
      <span className="text-sm font-black text-nodo-ink w-16 text-right shrink-0 tabular-nums">
        Q{(price * item.qty).toFixed(2)}
      </span>
    </div>
  );
}

// ── MostradorApp ──────────────────────────────────────────────────────────────
export function MostradorApp(_props: AppProps) {
  const [products, setProducts]         = useState<Recipe[]>([]);
  const [loading, setLoading]           = useState(true);
  const [cart, setCart]                 = useState<CartItem[]>([]);
  const [freshness, setFreshness]       = useState<Freshness>('fresco');
  const [showPayment, setShowPayment]   = useState(false);
  const [paymentDone, setPaymentDone]   = useState(false);
  const [paidTotal, setPaidTotal]       = useState(0);
  const [processing, setProcessing]     = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProducts(await mostradorService.listProducts()); }
    catch { setError('Error al cargar productos'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addToCart = (recipe: Recipe) => {
    haptic.tap();
    setCart(prev => {
      const existing = prev.find(c => c.recipe.id === recipe.id && c.freshness === freshness);
      if (existing) return prev.map(c =>
        c.recipe.id === recipe.id && c.freshness === freshness ? { ...c, qty: c.qty + 1 } : c
      );
      return [...prev, { recipe, qty: 1, freshness }];
    });
  };

  const updateQty = (recipeId: string, tag: Freshness, delta: number) => {
    setCart(prev =>
      prev
        .map(c => c.recipe.id === recipeId && c.freshness === tag ? { ...c, qty: c.qty + delta } : c)
        .filter(c => c.qty > 0)
    );
  };

  const total     = cart.reduce((sum, c) => sum + getPrice(c.recipe, c.freshness) * c.qty, 0);
  const itemCount = cart.reduce((sum, c) => sum + c.qty, 0);

  const handlePayment = async (method: string) => {
    if (cart.length === 0) return;
    setProcessing(true);
    setPaidTotal(total);
    try {
      await mostradorService.createSale(method, cart.map(c => ({
        recipe_id:     c.recipe.id,
        quantity:      c.qty,
        price:         getPrice(c.recipe, c.freshness),
        freshness_tag: c.freshness,
      })));
      haptic.confirm();
      setPaymentDone(true);
      setTimeout(() => {
        setCart([]);
        setShowPayment(false);
        setPaymentDone(false);
      }, 1800);
    } catch {
      haptic.error();
      setError('Error al procesar pago');
      setShowPayment(false);
    } finally {
      setProcessing(false);
    }
  };

  const FRESHNESS_OPTS = [
    { value: 'fresco' as Freshness, label: 'Fresco'   },
    { value: 'ayer'   as Freshness, label: 'Ayer −40%' },
  ];

  const displayProducts = freshness === 'ayer'
    ? products.map(p => ({ ...p, sell_price: p.sell_price })) // keep original, getPrice handles reduction
    : products;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-full gap-5 relative">
      {/* Error toast */}
      {error && (
        <div className="fixed top-4 right-4 z-[70] bg-nodo-danger-bg border border-nodo-danger-bd text-nodo-danger-tx text-sm font-medium px-4 py-3 rounded-2xl flex items-center gap-3 shadow-lg">
          {error}
          <button onClick={() => setError(null)}><X size={16} /></button>
        </div>
      )}

      {/* ── LEFT: Product Grid ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4 pt-1">
          <div>
            <h1 className="text-[28px] font-black text-nodo-ink leading-tight tracking-tight">Mostrador</h1>
            <p className="text-sm text-nodo-sub font-medium mt-0.5">Punto de venta</p>
          </div>

          {/* Cart summary — mobile only */}
          {cart.length > 0 && (
            <div className="lg:hidden flex flex-col items-end pt-1">
              <span className="text-2xl font-black text-nodo-ink tabular-nums">Q{total.toFixed(2)}</span>
              <span className="text-xs text-nodo-sub font-medium">{itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}</span>
            </div>
          )}
        </div>

        {/* Freshness filter */}
        <SegmentedControl
          options={FRESHNESS_OPTS}
          value={freshness}
          onChange={setFreshness}
          className="mb-4"
        />

        {/* Product grid */}
        {displayProducts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-nodo-card rounded-3xl border border-dashed border-nodo-line py-20 text-center">
            <Store size={40} className="text-nodo-dim mb-3 opacity-30" />
            <p className="text-nodo-sub font-bold text-sm">Sin productos disponibles</p>
            <p className="text-nodo-dim text-xs mt-1">Crea recetas en el módulo Recetas</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 flex-1 overflow-y-auto pb-28 lg:pb-4 content-start">
            {displayProducts.map(product => {
              const inCartItem = cart.find(c => c.recipe.id === product.id && c.freshness === freshness);
              return (
                <ProductCard
                  key={`${product.id}-${freshness}`}
                  product={product}
                  qty={inCartItem?.qty ?? 0}
                  freshness={freshness}
                  onAdd={() => addToCart(product)}
                  onRemove={() => updateQty(product.id, freshness, -1)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ── RIGHT: Cart Panel (desktop) ──────────────────────────────────── */}
      <div className="hidden lg:flex flex-col w-80 xl:w-96 bg-nodo-card rounded-3xl border border-nodo-line overflow-hidden shrink-0">

        {/* Cart header */}
        <div className="px-5 py-4 border-b border-nodo-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag size={17} className="text-nodo-sub" />
            <h2 className="text-sm font-black text-nodo-ink uppercase tracking-wider">Ticket</h2>
          </div>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="flex items-center gap-1 text-xs font-bold text-nodo-danger-tx active:opacity-70 transition-opacity"
            >
              <Trash2 size={12} /> Limpiar
            </button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <ShoppingBag size={36} className="text-nodo-dim mb-3 opacity-20" />
              <p className="text-xs font-bold text-nodo-dim">Toca un producto para añadir</p>
            </div>
          ) : (
            cart.map(item => (
              <CartRow
                key={`${item.recipe.id}-${item.freshness}`}
                item={item}
                onUpdate={updateQty}
              />
            ))
          )}
        </div>

        {/* Total + COBRAR */}
        <div className="border-t border-nodo-line px-5 py-5 space-y-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-bold text-nodo-sub uppercase tracking-wider">Total</span>
            <span className="text-4xl font-black text-nodo-ink tabular-nums">Q{total.toFixed(2)}</span>
          </div>
          <button
            onClick={() => setShowPayment(true)}
            disabled={cart.length === 0}
            className="w-full h-[60px] rounded-2xl bg-emerald-500 text-white font-black text-xl flex items-center justify-center gap-3 active:scale-[0.97] transition-transform disabled:opacity-25 shadow-lg shadow-emerald-500/20"
          >
            COBRAR
          </button>
        </div>
      </div>

      {/* ── MOBILE: Floating Cart Bar ─────────────────────────────────────── */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-20 left-4 right-4 z-40">
          <button
            onClick={() => setShowPayment(true)}
            className="w-full h-[60px] rounded-2xl bg-emerald-500 text-white shadow-xl shadow-emerald-500/30 flex items-center justify-between px-5 active:scale-[0.97] transition-transform"
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-white/25 flex items-center justify-center text-sm font-black select-none">
                {itemCount}
              </span>
              <span className="font-black text-base tracking-wide">COBRAR</span>
            </div>
            <span className="text-2xl font-black tabular-nums">Q{total.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* ── BottomSheet: Pago ─────────────────────────────────────────────── */}
      <BottomSheet
        open={showPayment}
        onClose={() => !paymentDone && !processing && setShowPayment(false)}
        title={paymentDone ? '¡Cobrado!' : 'Cobrar'}
        footer={paymentDone ? undefined : (
          <div className="flex gap-3">
            <button
              onClick={() => handlePayment('efectivo')}
              disabled={processing}
              className="flex-1 h-16 rounded-2xl bg-nodo-success-bg border-2 border-nodo-success-bd text-nodo-success-tx font-black text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-50"
            >
              {processing ? <Loader2 size={20} className="animate-spin" /> : <Banknote size={20} />}
              Efectivo
            </button>
            <button
              onClick={() => handlePayment('tarjeta')}
              disabled={processing}
              className="flex-1 h-16 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-50"
            >
              {processing ? <Loader2 size={20} className="animate-spin" /> : <CreditCard size={20} />}
              Tarjeta
            </button>
          </div>
        )}
      >
        {paymentDone ? (
          /* ── Success state ── */
          <div className="flex flex-col items-center justify-center py-10 space-y-5">
            <div className="w-24 h-24 rounded-full bg-nodo-success-bg border-2 border-nodo-success-bd flex items-center justify-center">
              <Check size={44} className="text-nodo-success-tx" strokeWidth={3} />
            </div>
            <p className="text-5xl font-black text-nodo-success-tx tabular-nums">Q{paidTotal.toFixed(2)}</p>
            <p className="text-sm text-nodo-sub font-medium">
              {itemCount} producto{itemCount !== 1 ? 's' : ''} vendido{itemCount !== 1 ? 's' : ''}
            </p>
          </div>
        ) : (
          /* ── Payment form ── */
          <>
            {/* Total hero */}
            <div className="bg-nodo-inset rounded-3xl px-6 py-7 text-center">
              <p className="text-xs font-bold text-nodo-sub uppercase tracking-widest mb-3">Total a cobrar</p>
              <p className="text-6xl font-black text-nodo-ink tabular-nums leading-none">Q{total.toFixed(2)}</p>
              <p className="text-sm text-nodo-sub mt-3">
                {itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}
              </p>
            </div>

            {/* Item breakdown */}
            <div className="space-y-0 border border-nodo-line rounded-2xl overflow-hidden">
              {cart.map((item, i) => (
                <div
                  key={`${item.recipe.id}-${item.freshness}`}
                  className={`flex items-center justify-between px-4 py-3 ${
                    i < cart.length - 1 ? 'border-b border-nodo-line' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-bold text-nodo-dim tabular-nums w-5 text-right shrink-0">
                      {item.qty}×
                    </span>
                    <span className="text-sm font-semibold text-nodo-ink truncate">{item.recipe.name}</span>
                    {item.freshness === 'ayer' && (
                      <span className="shrink-0 bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded-md">AYER</span>
                    )}
                  </div>
                  <span className="text-sm font-black text-nodo-ink shrink-0 ml-4 tabular-nums">
                    Q{(getPrice(item.recipe, item.freshness) * item.qty).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </BottomSheet>
    </div>
  );
}
