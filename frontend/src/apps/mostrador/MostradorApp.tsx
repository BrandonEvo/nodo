import { useState, useEffect, useCallback, useRef } from 'react';
import { haptic } from '@/utils/haptic';
import {
  Plus, Minus, Banknote, CreditCard, X, Check, ShoppingBag, Loader2, Trash2, Store,
  Clock, RotateCcw,
} from 'lucide-react';
import type { AppProps } from '../index';
import { mostradorService, type Sale } from '@/services/mostrador.service';
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
  const initial = product.name.charAt(0).toUpperCase();

  return (
    <div className={`relative flex flex-col bg-nodo-card rounded-[20px] overflow-hidden transition-all duration-150 select-none shadow-sm ${
      inCart ? 'ring-2 ring-offset-1' : ''
    }`}
      style={inCart ? { '--tw-ring-color': 'var(--nodo-primary)' } as React.CSSProperties : undefined}
    >
      {/* Qty badge */}
      {inCart && (
        <span className="absolute top-2 right-2 min-w-[20px] h-5 px-1 rounded-full text-white text-[10px] font-black flex items-center justify-center z-10"
          style={{ backgroundColor: 'var(--nodo-primary)' }}>
          {qty}
        </span>
      )}

      {/* AYER badge */}
      {freshness === 'ayer' && (
        <span className="absolute top-2 left-2 bg-nodo-warn-bg text-nodo-warn-tx text-[8px] font-black px-1.5 py-0.5 rounded-md tracking-wide z-10">
          −40%
        </span>
      )}

      {/* Main tap area */}
      <button
        onClick={onAdd}
        className="flex flex-col items-center gap-1.5 pt-4 pb-2.5 px-2 active:bg-nodo-inset transition-colors w-full"
      >
        {/* Ícono flotante sobre tint del módulo */}
        <div className="w-14 h-14 rounded-[18px] bg-nodo-primary-softer flex items-center justify-center shrink-0">
          {product.icon
            ? <span className="text-[38px] leading-none">{product.icon}</span>
            : <span className="text-xl font-black text-nodo-primary">{initial}</span>
          }
        </div>

        <p className="text-[11px] font-bold text-nodo-ink text-center leading-tight line-clamp-2 w-full px-1">
          {product.name}
        </p>

        <p className="text-sm font-black text-nodo-ink tabular-nums leading-none">
          Q{price.toFixed(2)}
        </p>
        {freshness === 'ayer' && (
          <p className="text-[9px] text-nodo-dim line-through tabular-nums -mt-0.5">
            Q{product.sell_price.toFixed(2)}
          </p>
        )}
      </button>

      {/* Stepper inline — cuando está en carrito */}
      {inCart && (
        <div className="flex items-center gap-1 px-2 pb-2.5 pt-0.5">
          <button
            onClick={onRemove}
            className="flex-1 h-7 rounded-full bg-nodo-inset flex items-center justify-center active:scale-90 transition-transform"
          >
            <Minus size={11} strokeWidth={2.5} className="text-nodo-ink" />
          </button>
          <span className="w-7 text-center text-xs font-black text-nodo-ink tabular-nums">{qty}</span>
          <button
            onClick={onAdd}
            className="flex-1 h-7 rounded-full text-white flex items-center justify-center active:scale-90 transition-transform"
            style={{ backgroundColor: 'var(--nodo-primary)' }}
          >
            <Plus size={11} strokeWidth={2.5} />
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
            <span className="bg-nodo-warn-bg text-nodo-warn-tx text-[8px] font-bold px-1 py-0.5 rounded-md">AYER</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => onUpdate(item.recipe.id, item.freshness, -1)}
          className="w-7 h-7 rounded-full bg-nodo-card border border-nodo-line flex items-center justify-center active:scale-90 transition-transform text-nodo-ink"
        >
          <Minus size={11} strokeWidth={3} />
        </button>
        <span className="w-6 text-center text-sm font-black text-nodo-ink select-none tabular-nums">{item.qty}</span>
        <button
          onClick={() => onUpdate(item.recipe.id, item.freshness, 1)}
          className="w-7 h-7 rounded-full text-white flex items-center justify-center active:scale-90 transition-transform"
          style={{ backgroundColor: 'var(--nodo-primary)' }}
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

// ── SaleSummaryBar ────────────────────────────────────────────────────────────
function SaleSummaryBar({ sales }: { sales: Sale[] }) {
  const totalDay  = sales.reduce((s, v) => s + v.total, 0);
  const countEfec = sales.filter(s => s.payment_method === 'efectivo').length;
  const countTarj = sales.filter(s => s.payment_method === 'tarjeta').length;
  return (
    <div className="bg-nodo-primary-soft border border-nodo-primary-soft rounded-3xl px-5 py-4 flex items-center justify-between">
      <div>
        <p className="text-[10px] font-black text-nodo-primary uppercase tracking-wider">Total del día</p>
        <p className="text-3xl font-black text-nodo-primary tabular-nums leading-tight mt-1">Q{totalDay.toFixed(2)}</p>
      </div>
      <div className="text-right">
        <p className="text-[10px] font-black text-nodo-primary/60 uppercase tracking-wider">{sales.length} ventas</p>
        <p className="text-xs text-nodo-primary/60 font-medium mt-0.5">
          {countEfec > 0 && `${countEfec} efec`}
          {countEfec > 0 && countTarj > 0 && ' · '}
          {countTarj > 0 && `${countTarj} tarj`}
        </p>
      </div>
    </div>
  );
}

// ── SaleCard ──────────────────────────────────────────────────────────────────
function SaleCard({ sale, onCancel }: { sale: Sale; onCancel: () => void }) {
  const time = new Date(sale.created_at).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="bg-nodo-inset rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold text-nodo-dim tabular-nums shrink-0">{time}</span>
          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${
            sale.payment_method === 'tarjeta'
              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
              : 'bg-nodo-primary-softer text-nodo-primary'
          }`}>
            {sale.payment_method === 'tarjeta' ? 'Tarjeta' : 'Efectivo'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-black text-nodo-ink tabular-nums">Q{sale.total.toFixed(2)}</span>
          <button
            onClick={onCancel}
            className="w-7 h-7 rounded-full bg-nodo-danger-bg flex items-center justify-center active:scale-90 transition-transform"
            title="Anular venta"
          >
            <X size={12} className="text-nodo-danger-tx" />
          </button>
        </div>
      </div>
      {sale.items.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-2.5">
          {sale.items.map(item => (
            <span key={item.id} className="flex items-center gap-1 bg-nodo-card rounded-full px-2.5 py-1 text-[10px] font-semibold text-nodo-sub">
              {item.recipe_icon && <span>{item.recipe_icon}</span>}
              <span>{item.quantity}× {item.recipe_name}</span>
            </span>
          ))}
        </div>
      )}
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

  const [rightTab, setRightTab]         = useState<'ticket' | 'hoy'>('ticket');
  const [sales, setSales]               = useState<Sale[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [showHistory, setShowHistory]   = useState(false);
  const [undoSale, setUndoSale]         = useState<Sale | null>(null);
  const undoTimer                       = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProducts(await mostradorService.listProducts()); }
    catch { setError('Error al cargar productos'); }
    finally { setLoading(false); }
  }, []);

  const loadSales = useCallback(async () => {
    setLoadingSales(true);
    try { setSales(await mostradorService.listTodaySales()); }
    catch { /* silencioso */ }
    finally { setLoadingSales(false); }
  }, []);

  useEffect(() => { load(); loadSales(); }, [load, loadSales]);

  const handleCancelSale = (sale: Sale) => {
    setSales(prev => prev.filter(s => s.id !== sale.id));
    setUndoSale(sale);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(async () => {
      try { await mostradorService.cancelSale(sale.id); }
      catch { setSales(prev => [sale, ...prev]); }
      setUndoSale(null);
    }, 4000);
  };

  const handleUndoCancel = () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (undoSale) setSales(prev => [undoSale, ...prev].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ));
    setUndoSale(null);
  };

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
      loadSales();
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
    { value: 'fresco' as Freshness, label: 'Fresco'    },
    { value: 'ayer'   as Freshness, label: 'Ayer −40%' },
  ];

  const RIGHT_TAB_OPTS = [
    { value: 'ticket' as const, label: 'Ticket', icon: <ShoppingBag size={13} /> },
    { value: 'hoy'    as const, label: 'Hoy',    icon: <Clock size={13} /> },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-nodo-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-full gap-5 relative">

      {/* Toast error */}
      {error && (
        <div className="fixed top-4 right-4 z-[70] flex items-center gap-3 bg-nodo-danger-bg border border-nodo-danger-bd text-nodo-danger-tx text-sm font-bold px-4 py-3 rounded-2xl shadow-lg max-w-xs">
          <X size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      {/* Undo toast */}
      {undoSale && (
        <div className="fixed top-4 right-4 z-[70] flex items-center gap-3 bg-nodo-ink text-nodo-canvas text-sm font-medium px-4 py-3 rounded-2xl shadow-lg max-w-xs">
          <span className="text-nodo-canvas/70 flex-1">Venta anulada</span>
          <button
            onClick={handleUndoCancel}
            className="text-nodo-canvas font-black text-xs border border-nodo-canvas/30 px-2.5 py-1 rounded-full flex items-center gap-1 shrink-0"
          >
            <RotateCcw size={11} />
            Deshacer
          </button>
        </div>
      )}

      {/* ── LEFT: Product Grid ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            {/* Módulo pill */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-nodo-primary-soft mb-2">
              <Store size={12} className="text-nodo-primary" />
              <span className="text-[11px] font-black text-nodo-primary uppercase tracking-wider">Mostrador</span>
            </div>
            <h1 className="text-[28px] font-black text-nodo-ink leading-tight">Punto de Venta</h1>
            <p className="text-sm text-nodo-sub font-medium mt-0.5">
              {products.length} productos disponibles
            </p>
          </div>

          {/* Mobile: resumen carrito + botón historial */}
          <div className="lg:hidden flex items-center gap-2 pt-1 shrink-0">
            {cart.length > 0 && (
              <div className="flex flex-col items-end">
                <span className="text-xl font-black text-nodo-ink tabular-nums">Q{total.toFixed(2)}</span>
                <span className="text-xs text-nodo-sub font-medium">{itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}</span>
              </div>
            )}
            <button
              onClick={() => { setShowHistory(true); loadSales(); }}
              className="flex items-center justify-center relative w-11 h-11 rounded-full bg-nodo-primary-softer active:bg-nodo-primary-soft transition-colors"
            >
              <Clock size={18} className="text-nodo-primary" />
              {sales.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-[9px] font-black flex items-center justify-center"
                  style={{ backgroundColor: 'var(--nodo-primary)' }}>
                  {sales.length > 9 ? '9+' : sales.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Freshness filter */}
        <SegmentedControl
          options={FRESHNESS_OPTS}
          value={freshness}
          onChange={setFreshness}
          className="mb-4"
        />

        {/* Product grid */}
        {products.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-nodo-card rounded-3xl border border-dashed border-nodo-line py-20 text-center gap-3">
            <div className="w-16 h-16 rounded-3xl bg-nodo-primary-softer flex items-center justify-center">
              <Store size={28} className="text-nodo-primary" />
            </div>
            <p className="text-sm font-bold text-nodo-dim">Sin productos disponibles</p>
            <p className="text-xs text-nodo-dim/60">Crea recetas en el módulo Recetas</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 flex-1 overflow-y-auto pb-28 lg:pb-4 content-start">
            {products.map(product => {
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

      {/* ── RIGHT: Cart + Historial Panel (desktop) ─────────────────────── */}
      <div className="hidden lg:flex flex-col w-80 xl:w-96 bg-nodo-card rounded-3xl border border-nodo-line overflow-hidden shrink-0">

        {/* Tab bar con SegmentedControl */}
        <div className="px-4 pt-4 pb-3 border-b border-nodo-line shrink-0">
          <SegmentedControl
            options={RIGHT_TAB_OPTS}
            value={rightTab}
            onChange={v => { setRightTab(v); if (v === 'hoy') loadSales(); }}
            size="sm"
          />
        </div>

        {rightTab === 'ticket' ? (
          <>
            {/* Cart items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="w-14 h-14 rounded-3xl bg-nodo-primary-softer flex items-center justify-center mb-3">
                    <ShoppingBag size={24} className="text-nodo-primary" />
                  </div>
                  <p className="text-xs font-bold text-nodo-dim">Toca un producto para añadir</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-end pb-1">
                    <button
                      onClick={() => setCart([])}
                      className="flex items-center gap-1 text-xs font-bold text-nodo-danger-tx active:opacity-70 transition-opacity"
                    >
                      <Trash2 size={12} /> Limpiar
                    </button>
                  </div>
                  {cart.map(item => (
                    <CartRow
                      key={`${item.recipe.id}-${item.freshness}`}
                      item={item}
                      onUpdate={updateQty}
                    />
                  ))}
                </>
              )}
            </div>

            {/* Total + COBRAR */}
            <div className="border-t border-nodo-line px-5 py-5 space-y-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-black text-nodo-dim uppercase tracking-wider">Total</span>
                <span className="text-4xl font-black text-nodo-ink tabular-nums">Q{total.toFixed(2)}</span>
              </div>
              <button
                onClick={() => setShowPayment(true)}
                disabled={cart.length === 0}
                className="w-full h-[60px] rounded-full text-white font-black text-xl flex items-center justify-center gap-3 active:scale-[0.97] transition-transform disabled:opacity-25"
                style={{ backgroundColor: 'var(--nodo-primary)', boxShadow: '0 8px 24px var(--nodo-shadow-fab)' }}
              >
                Cobrar
              </button>
            </div>
          </>
        ) : (
          /* ── HOY tab ── */
          <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
            {loadingSales ? (
              <div className="flex items-center justify-center h-full py-12">
                <Loader2 size={24} className="animate-spin text-nodo-primary" />
              </div>
            ) : sales.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="w-14 h-14 rounded-3xl bg-nodo-primary-softer flex items-center justify-center mb-3">
                  <Clock size={24} className="text-nodo-primary" />
                </div>
                <p className="text-xs font-bold text-nodo-dim">Sin ventas hoy</p>
              </div>
            ) : (
              <>
                <SaleSummaryBar sales={sales} />
                {sales.map(sale => (
                  <SaleCard key={sale.id} sale={sale} onCancel={() => handleCancelSale(sale)} />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── BottomSheet: Historial (mobile) ──────────────────────────────── */}
      <BottomSheet
        open={showHistory}
        onClose={() => setShowHistory(false)}
        title="Ventas de hoy"
      >
        {loadingSales ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-nodo-primary" />
          </div>
        ) : sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="w-16 h-16 rounded-3xl bg-nodo-primary-softer flex items-center justify-center">
              <Clock size={28} className="text-nodo-primary" />
            </div>
            <p className="text-sm font-bold text-nodo-dim">Sin ventas registradas hoy</p>
          </div>
        ) : (
          <div className="space-y-3">
            <SaleSummaryBar sales={sales} />
            {sales.map(sale => (
              <SaleCard key={sale.id} sale={sale} onCancel={() => { handleCancelSale(sale); setShowHistory(false); }} />
            ))}
          </div>
        )}
      </BottomSheet>

      {/* ── MOBILE: FAB Cobrar ─────────────────────────────────────────────── */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-20 left-4 right-4 z-40">
          <button
            onClick={() => setShowPayment(true)}
            className="w-full h-[60px] rounded-full text-white flex items-center justify-between px-5 active:scale-[0.97] transition-transform"
            style={{ backgroundColor: 'var(--nodo-primary)', boxShadow: '0 8px 28px var(--nodo-shadow-fab)' }}
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-white/25 flex items-center justify-center text-sm font-black select-none">
                {itemCount}
              </span>
              <span className="font-black text-base tracking-wide">Cobrar</span>
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
              className="flex-1 h-16 rounded-full bg-nodo-primary-soft border-2 border-nodo-primary-soft text-nodo-primary font-black text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-50"
            >
              {processing ? <Loader2 size={20} className="animate-spin" /> : <Banknote size={20} />}
              Efectivo
            </button>
            <button
              onClick={() => handlePayment('tarjeta')}
              disabled={processing}
              className="flex-1 h-16 rounded-full bg-nodo-ink text-nodo-canvas font-black text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-50"
            >
              {processing ? <Loader2 size={20} className="animate-spin" /> : <CreditCard size={20} />}
              Tarjeta
            </button>
          </div>
        )}
      >
        {paymentDone ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-5">
            <div className="w-24 h-24 rounded-full bg-nodo-primary-soft border-2 border-nodo-primary-soft flex items-center justify-center">
              <Check size={44} className="text-nodo-primary" strokeWidth={3} />
            </div>
            <p className="text-5xl font-black text-nodo-primary tabular-nums">Q{paidTotal.toFixed(2)}</p>
            <p className="text-sm text-nodo-sub font-medium">
              {itemCount} producto{itemCount !== 1 ? 's' : ''} vendido{itemCount !== 1 ? 's' : ''}
            </p>
          </div>
        ) : (
          <>
            {/* Total hero */}
            <div className="bg-nodo-primary-softer rounded-3xl px-6 py-7 text-center">
              <p className="text-[10px] font-black text-nodo-primary uppercase tracking-widest mb-3">Total a cobrar</p>
              <p className="text-6xl font-black text-nodo-primary tabular-nums leading-none">Q{total.toFixed(2)}</p>
              <p className="text-sm text-nodo-primary/60 mt-3">
                {itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}
              </p>
            </div>

            {/* Item breakdown */}
            <div className="border border-nodo-line rounded-2xl overflow-hidden">
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
                      <span className="shrink-0 bg-nodo-warn-bg text-nodo-warn-tx text-[9px] font-bold px-1.5 py-0.5 rounded-md">AYER</span>
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
