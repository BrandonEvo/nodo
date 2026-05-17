import { useState, useEffect, useCallback } from 'react';
import { Store, Plus, Minus, Trash2, CreditCard, Banknote, X, Check, ShoppingBag, Loader2 } from 'lucide-react';
import type { AppProps } from '../index';
import { mostradorService } from '@/services/mostrador.service';
import type { Recipe } from '@/services/recetas.service';

type FreshnessTag = 'fresco' | 'ayer' | 'todos';

interface CartItem {
  recipe: Recipe;
  qty: number;
  freshness: 'fresco' | 'ayer';
}

export function MostradorApp(_props: AppProps) {
  const [products, setProducts] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [filter, setFilter] = useState<FreshnessTag>('fresco');
  const [showPayment, setShowPayment] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await mostradorService.listProducts();
      setProducts(p);
    } catch {
      setError('Error al cargar productos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // En Mostrador, los productos "ayer" son recetas con el mismo nombre pero precio reducido.
  // El tag freshness se determina al agregar al carrito.
  const addToCart = (recipe: Recipe, freshness: 'fresco' | 'ayer' = 'fresco') => {
    setCart(prev => {
      const existing = prev.find(c => c.recipe.id === recipe.id && c.freshness === freshness);
      if (existing) return prev.map(c => (c.recipe.id === recipe.id && c.freshness === freshness) ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { recipe, qty: 1, freshness }];
    });
  };

  const updateQty = (recipeId: string, freshness: 'fresco' | 'ayer', delta: number) => {
    setCart(prev =>
      prev
        .map(c => c.recipe.id === recipeId && c.freshness === freshness ? { ...c, qty: c.qty + delta } : c)
        .filter(c => c.qty > 0)
    );
  };

  const getPrice = (recipe: Recipe, freshness: 'fresco' | 'ayer') =>
    freshness === 'ayer' ? recipe.sell_price * 0.6 : recipe.sell_price;

  const total = cart.reduce((sum, c) => sum + getPrice(c.recipe, c.freshness) * c.qty, 0);
  const itemCount = cart.reduce((sum, c) => sum + c.qty, 0);

  const handlePayment = async (method: string) => {
    if (cart.length === 0) return;
    setProcessingPayment(true);
    try {
      await mostradorService.createSale(method, cart.map(c => ({
        recipe_id: c.recipe.id,
        quantity: c.qty,
        price: getPrice(c.recipe, c.freshness),
        freshness_tag: c.freshness,
      })));
      setPaymentDone(true);
      setTimeout(() => {
        setCart([]);
        setShowPayment(false);
        setPaymentDone(false);
      }, 1500);
    } catch {
      setError('Error al procesar pago');
      setShowPayment(false);
    } finally {
      setProcessingPayment(false);
    }
  };

  const frescoProducts = products;
  const ayerProducts = products.map(p => ({ ...p, sell_price: p.sell_price * 0.6 }));
  const displayProducts = filter === 'todos' ? products : filter === 'ayer' ? ayerProducts : frescoProducts;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 relative">
      {error && (
        <div className="fixed top-4 right-4 z-50 bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-2xl flex items-center gap-3 shadow-lg">
          {error}
          <button onClick={() => setError(null)}><X size={16} /></button>
        </div>
      )}

      {/* ── LEFT: Product Grid (70%) ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-600">
              <Store size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-[#111]">Mostrador</h1>
              <p className="text-xs text-slate-400 font-medium">Punto de Venta</p>
            </div>
          </div>
        </div>

        {/* Freshness Filter */}
        <div className="flex gap-2 mb-5">
          {([
            { id: 'fresco' as FreshnessTag, label: '🌟 Fresco', desc: 'Precio normal' },
            { id: 'ayer' as FreshnessTag, label: '🟡 Ayer', desc: '40% descuento' },
            { id: 'todos' as FreshnessTag, label: 'Todos', desc: '' },
          ]).map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                filter === f.id ? 'bg-[#111] text-white shadow-lg' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        {displayProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 bg-white rounded-3xl border border-dashed border-slate-200 py-20 text-center">
            <Store size={40} className="text-slate-200 mb-3" />
            <p className="text-slate-400 font-bold text-sm">Sin productos disponibles</p>
            <p className="text-slate-300 text-xs mt-1">Crea recetas en el módulo Recetas para verlas aquí</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 flex-1 overflow-y-auto pb-24 lg:pb-4">
            {displayProducts.map(product => {
              const tag = filter === 'ayer' ? 'ayer' : 'fresco';
              const inCart = cart.find(c => c.recipe.id === product.id && c.freshness === tag);
              const price = filter === 'ayer' ? product.sell_price * 0.6 : product.sell_price;
              return (
                <button
                  key={`${product.id}-${tag}`}
                  onClick={() => addToCart(product, tag)}
                  className={`relative flex flex-col items-center justify-center p-4 sm:p-5 bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all active:scale-95 group ${
                    inCart ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-100'
                  }`}
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110 ${inCart ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                    <Store size={24} className={inCart ? 'text-emerald-500' : 'text-slate-400'} />
                  </div>
                  <span className="text-xs font-bold text-[#111] text-center leading-tight">{product.name}</span>
                  <span className="text-sm font-black text-[#111] mt-1">Q{price.toFixed(2)}</span>
                  {filter === 'ayer' && (
                    <span className="absolute top-2 right-2 bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded-md">AYER</span>
                  )}
                  {inCart && (
                    <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm">
                      {inCart.qty}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── RIGHT: Cart Panel (30%, Desktop) ── */}
      <div className="hidden lg:flex flex-col w-80 xl:w-96 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden shrink-0">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} className="text-slate-400" />
            <h2 className="text-sm font-black text-[#111] uppercase tracking-wider">Ticket</h2>
          </div>
          <span className="text-xs font-bold text-slate-400">{itemCount} items</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <ShoppingBag size={32} className="text-slate-200 mb-2" />
              <p className="text-xs font-bold text-slate-300">Vacío</p>
              <p className="text-[10px] text-slate-300 mt-1">Toca un producto para añadir</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={`${item.recipe.id}-${item.freshness}`} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#111] truncate">{item.recipe.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs text-slate-400">Q{getPrice(item.recipe, item.freshness).toFixed(2)}</p>
                    {item.freshness === 'ayer' && (
                      <span className="bg-amber-100 text-amber-700 text-[8px] font-bold px-1 py-0.5 rounded">AYER</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => updateQty(item.recipe.id, item.freshness, -1)} className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 active:scale-90">
                    <Minus size={12} strokeWidth={3} />
                  </button>
                  <span className="w-7 text-center text-sm font-black text-[#111]">{item.qty}</span>
                  <button onClick={() => updateQty(item.recipe.id, item.freshness, 1)} className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 active:scale-90">
                    <Plus size={12} strokeWidth={3} />
                  </button>
                </div>
                <span className="text-sm font-black text-[#111] w-16 text-right">Q{(getPrice(item.recipe, item.freshness) * item.qty).toFixed(2)}</span>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-slate-100 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Total</span>
            <span className="text-3xl font-black text-[#111]">Q{total.toFixed(2)}</span>
          </div>
          <button
            onClick={() => setShowPayment(true)}
            disabled={cart.length === 0}
            className="w-full h-16 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-lg tracking-wide transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20"
          >
            💰 COBRAR
          </button>
        </div>
      </div>

      {/* ── MOBILE: Floating Cart Bar ── */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-20 left-4 right-4 z-40">
          <button
            onClick={() => setShowPayment(true)}
            className="w-full h-16 rounded-2xl bg-emerald-500 text-white font-black text-base shadow-xl shadow-emerald-500/30 flex items-center justify-between px-6 active:scale-[0.97] transition-transform"
          >
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-sm font-black">{itemCount}</span>
              <span>COBRAR</span>
            </div>
            <span className="text-xl">Q{total.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* ── PAYMENT MODAL ── */}
      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !paymentDone && !processingPayment && setShowPayment(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl text-center" onClick={e => e.stopPropagation()}>
            {paymentDone ? (
              <div className="py-8 space-y-4">
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <Check size={40} className="text-emerald-500" strokeWidth={3} />
                </div>
                <h3 className="text-2xl font-black text-[#111]">¡Cobrado!</h3>
                <p className="text-slate-400 font-medium">Q{total.toFixed(2)}</p>
              </div>
            ) : (
              <>
                <button onClick={() => setShowPayment(false)} className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-xl">
                  <X size={18} className="text-slate-400" />
                </button>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total a cobrar</p>
                <p className="text-4xl font-black text-[#111] mb-2">Q{total.toFixed(2)}</p>
                <p className="text-xs text-slate-400 mb-8">{itemCount} producto{itemCount !== 1 ? 's' : ''}</p>
                <div className="space-y-3">
                  <button
                    onClick={() => handlePayment('efectivo')}
                    disabled={processingPayment}
                    className="w-full h-16 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-base flex items-center justify-center gap-3 transition-all active:scale-[0.97] disabled:opacity-50"
                  >
                    {processingPayment ? <Loader2 size={22} className="animate-spin" /> : <Banknote size={22} />}
                    Efectivo
                  </button>
                  <button
                    onClick={() => handlePayment('tarjeta')}
                    disabled={processingPayment}
                    className="w-full h-16 rounded-2xl bg-[#111] hover:bg-[#222] text-white font-black text-base flex items-center justify-center gap-3 transition-all active:scale-[0.97] disabled:opacity-50"
                  >
                    {processingPayment ? <Loader2 size={22} className="animate-spin" /> : <CreditCard size={22} />}
                    Tarjeta
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
