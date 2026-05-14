import { useState } from 'react';
import { Store, Plus, Minus, Trash2, CreditCard, Banknote, X, Check, ShoppingBag } from 'lucide-react';
import type { AppProps } from '../index';

// ── Mock Products ──
type FreshnessTag = 'fresco' | 'ayer' | 'todos';

interface Product {
  id: string;
  name: string;
  emoji: string;
  price: number;
  tag: 'fresco' | 'ayer';
}

interface CartItem {
  product: Product;
  qty: number;
}

const PRODUCTS: Product[] = [
  { id: '1', name: 'Pan Francés', emoji: '🥖', price: 1.50, tag: 'fresco' },
  { id: '2', name: 'Concha', emoji: '🥐', price: 5.00, tag: 'fresco' },
  { id: '3', name: 'Dona', emoji: '🍩', price: 4.50, tag: 'fresco' },
  { id: '4', name: 'Cupcake', emoji: '🧁', price: 8.00, tag: 'fresco' },
  { id: '5', name: 'Café', emoji: '☕', price: 10.00, tag: 'fresco' },
  { id: '6', name: 'Pan Integral', emoji: '🍞', price: 6.00, tag: 'fresco' },
  { id: '7', name: 'Polvorón', emoji: '🍪', price: 3.00, tag: 'fresco' },
  { id: '8', name: 'Cuerno', emoji: '🥮', price: 4.00, tag: 'fresco' },
  { id: '9', name: 'Biscocho', emoji: '🎂', price: 12.00, tag: 'fresco' },
  { id: '10', name: 'Galleta', emoji: '🍘', price: 2.50, tag: 'ayer' },
  { id: '11', name: 'Pan Francés', emoji: '🥖', price: 1.00, tag: 'ayer' },
  { id: '12', name: 'Concha', emoji: '🥐', price: 3.50, tag: 'ayer' },
];

export function MostradorApp(_props: AppProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [filter, setFilter] = useState<FreshnessTag>('fresco');
  const [showPayment, setShowPayment] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);

  const filtered = filter === 'todos' ? PRODUCTS : PRODUCTS.filter(p => p.tag === filter);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(c => c.product.id === product.id);
      if (existing) return prev.map(c => c.product.id === product.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { product, qty: 1 }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(prev => prev
      .map(c => c.product.id === productId ? { ...c, qty: c.qty + delta } : c)
      .filter(c => c.qty > 0)
    );
  };

  const total = cart.reduce((sum, c) => sum + c.product.price * c.qty, 0);
  const itemCount = cart.reduce((sum, c) => sum + c.qty, 0);

  const handlePayment = (method: string) => {
    setPaymentDone(true);
    setTimeout(() => {
      setCart([]);
      setShowPayment(false);
      setPaymentDone(false);
    }, 1500);
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 relative">
      {/* ── LEFT: Product Grid ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
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
          {[
            { id: 'fresco' as FreshnessTag, label: '🌟 Fresco', desc: 'Del día' },
            { id: 'ayer' as FreshnessTag, label: '🟡 Ayer', desc: 'Rebajado' },
            { id: 'todos' as FreshnessTag, label: 'Todos', desc: '' },
          ].map(f => (
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
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 flex-1 overflow-y-auto pb-24 lg:pb-4">
          {filtered.map(product => {
            const inCart = cart.find(c => c.product.id === product.id);
            return (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className={`relative flex flex-col items-center justify-center p-4 sm:p-5 bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all active:scale-95 group ${
                  inCart ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-100'
                }`}
              >
                <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">{product.emoji}</span>
                <span className="text-xs font-bold text-[#111] text-center leading-tight">{product.name}</span>
                <span className="text-sm font-black text-[#111] mt-1">Q{product.price.toFixed(2)}</span>
                {product.tag === 'ayer' && (
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
      </div>

      {/* ── RIGHT: Cart Panel (Desktop) ── */}
      <div className="hidden lg:flex flex-col w-80 xl:w-96 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden shrink-0">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} className="text-slate-400" />
            <h2 className="text-sm font-black text-[#111] uppercase tracking-wider">Carrito</h2>
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
              <div key={item.product.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <span className="text-xl">{item.product.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#111] truncate">{item.product.name}</p>
                  <p className="text-xs text-slate-400">Q{item.product.price.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => updateQty(item.product.id, -1)} className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 active:scale-90">
                    <Minus size={12} strokeWidth={3} />
                  </button>
                  <span className="w-7 text-center text-sm font-black text-[#111]">{item.qty}</span>
                  <button onClick={() => updateQty(item.product.id, 1)} className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 active:scale-90">
                    <Plus size={12} strokeWidth={3} />
                  </button>
                </div>
                <span className="text-sm font-black text-[#111] w-16 text-right">Q{(item.product.price * item.qty).toFixed(2)}</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !paymentDone && setShowPayment(false)}>
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
                <p className="text-4xl font-black text-[#111] mb-8">Q{total.toFixed(2)}</p>

                <div className="space-y-3">
                  <button
                    onClick={() => handlePayment('efectivo')}
                    className="w-full h-16 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-base flex items-center justify-center gap-3 transition-all active:scale-[0.97]"
                  >
                    <Banknote size={22} /> Efectivo
                  </button>
                  <button
                    onClick={() => handlePayment('tarjeta')}
                    className="w-full h-16 rounded-2xl bg-[#111] hover:bg-[#222] text-white font-black text-base flex items-center justify-center gap-3 transition-all active:scale-[0.97]"
                  >
                    <CreditCard size={22} /> Tarjeta
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
