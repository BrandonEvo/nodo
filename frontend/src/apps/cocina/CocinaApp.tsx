import { useState, useEffect, useCallback } from 'react';
import { haptic } from '@/utils/haptic';
import {
  ChefHat, Clock, PlayCircle, CheckCircle2, Plus, Minus, AlertTriangle,
  Loader2, Trash2, Package, TrendingUp, ChevronDown, ChevronUp, LayoutGrid, X,
} from 'lucide-react';
import type { AppProps } from '../index';
import { cocinaService, type ProductionOrder, type OrderPreview, type MatrixResponse } from '@/services/cocina.service';
import { recetasService, type Recipe } from '@/services/recetas.service';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const fmtQ  = (n: number) => 'Q' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtLbs = (n: number) => n.toLocaleString('es-GT', { maximumFractionDigits: 1 });

type OrderStatus = 'pending' | 'en_proceso' | 'completed';

const STATUS_CFG: Record<OrderStatus, { label: string; strip: string; badge: string }> = {
  pending:    { label: 'Pendiente',  strip: 'bg-amber-400',   badge: 'text-amber-700 bg-amber-50 border-amber-200'     },
  en_proceso: { label: 'En Proceso', strip: 'bg-blue-500',    badge: 'text-blue-700 bg-blue-50 border-blue-200'       },
  completed:  { label: 'Listo',      strip: 'bg-emerald-500', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
};

// ── MatrizTab ─────────────────────────────────────────────────────────────────
function MatrizTab() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [matriz, setMatriz] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [view, setView] = useState<'venta' | 'utilidad' | 'costo' | 'harina'>('venta');
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setMatriz(await cocinaService.getMatriz(year, month)); }
    catch { setError('Error al cargar matriz'); }
    finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const VIEW_OPTS = [
    { value: 'venta'    as const, label: 'Venta'    },
    { value: 'utilidad' as const, label: 'Utilidad' },
    { value: 'costo'    as const, label: 'Costo'    },
    { value: 'harina'   as const, label: 'Harina'   },
  ];

  const cellVal = (cell: MatrixResponse['grand_totals'] | undefined) => {
    if (!cell) return null;
    const v = cell[view];
    return view === 'harina' ? fmtLbs(v) + ' lbs' : fmtQ(v);
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
          className="h-10 px-3 bg-nodo-inset border border-nodo-line rounded-xl text-sm font-semibold text-nodo-ink focus:outline-none"
        >
          {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="h-10 px-3 bg-nodo-inset border border-nodo-line rounded-xl text-sm font-semibold text-nodo-ink focus:outline-none"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <SegmentedControl options={VIEW_OPTS} value={view} onChange={setView} size="sm" className="flex-1 min-w-[220px]" />
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
        </div>
      )}
      {error && (
        <div className="text-sm text-nodo-danger-tx bg-nodo-danger-bg border border-nodo-danger-bd rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {!loading && matriz && (
        <>
          {matriz.recipes.length === 0 ? (
            <div className="text-center py-16 text-nodo-dim">
              <LayoutGrid className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Sin producción en {MONTHS[month - 1]} {year}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-nodo-line bg-nodo-card">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="border-b border-nodo-line">
                    <th className="sticky left-0 z-10 bg-nodo-inset px-4 py-2.5 text-left font-bold text-nodo-sub min-w-[140px]">Producto</th>
                    {matriz.days.map(d => (
                      <th key={d} className="px-2 py-2.5 text-center font-bold text-nodo-dim min-w-[56px]">{d}</th>
                    ))}
                    <th className="px-3 py-2.5 text-right font-bold text-nodo-ink min-w-[72px]">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nodo-line">
                  {matriz.recipes.map((recipe, ri) => (
                    <tr key={recipe.recipe_id}>
                      <td className={`sticky left-0 z-10 px-4 py-2 font-semibold text-nodo-ink truncate max-w-[140px] ${ri % 2 === 0 ? 'bg-nodo-card' : 'bg-nodo-inset'}`}>
                        {recipe.recipe_name}
                      </td>
                      {matriz.days.map(d => {
                        const cell = recipe.days[String(d)];
                        const val  = cell ? cell[view] : null;
                        return (
                          <td key={d} className="px-2 py-2 text-center font-mono">
                            {val != null && val > 0 ? (
                              <span className={view === 'utilidad' && val < 0 ? 'text-nodo-danger-tx' : 'text-nodo-ink'}>
                                {view === 'harina' ? fmtLbs(val) : fmtQ(val)}
                              </span>
                            ) : (
                              <span className="text-nodo-dim opacity-40">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-bold font-mono text-nodo-ink">
                        {cellVal(recipe.totals)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-nodo-line-s bg-nodo-raised">
                    <td className="sticky left-0 z-10 bg-nodo-raised px-4 py-2.5 text-nodo-sub text-[10px] font-black uppercase tracking-wider">TOTAL DÍA</td>
                    {matriz.days.map(d => {
                      const cell = matriz.daily_totals[String(d)];
                      const val  = cell ? cell[view] : null;
                      return (
                        <td key={d} className="px-2 py-2.5 text-center font-mono font-bold text-nodo-ink">
                          {val != null && val > 0 ? (view === 'harina' ? fmtLbs(val) : fmtQ(val)) : '—'}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right font-black font-mono text-nodo-ink">
                      {cellVal(matriz.grand_totals)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Grand total cards */}
          {matriz.recipes.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Harina Total', val: fmtLbs(matriz.grand_totals.harina_lbs) + ' lbs', accent: null },
                { label: 'Costo Total',  val: fmtQ(matriz.grand_totals.costo),                  accent: null },
                { label: 'Venta Total',  val: fmtQ(matriz.grand_totals.venta),                  accent: null },
                { label: 'Utilidad',     val: fmtQ(matriz.grand_totals.utilidad),                accent: matriz.grand_totals.utilidad >= 0 },
              ].map(({ label, val, accent }) => (
                <div key={label} className="bg-nodo-card rounded-2xl border border-nodo-line px-4 py-3">
                  <p className="text-xs text-nodo-sub mb-1">{label}</p>
                  <p className={`text-sm font-bold font-mono ${
                    accent === false ? 'text-nodo-danger-tx' : accent === true ? 'text-nodo-success-tx' : 'text-nodo-ink'
                  }`}>{val}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── CocinaApp ─────────────────────────────────────────────────────────────────
export function CocinaApp(_props: AppProps) {
  const [activeTab, setActiveTab]       = useState<'produccion' | 'matriz'>('produccion');
  const [orders, setOrders]             = useState<ProductionOrder[]>([]);
  const [recipes, setRecipes]           = useState<Recipe[]>([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState<string | null>(null);
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<OrderStatus | 'all'>('all');
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showWaste, setShowWaste]       = useState<string | null>(null);
  const [newOrder, setNewOrder]         = useState({ recipe_id: '', quantity: 1 });
  const [preview, setPreview]           = useState<OrderPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [waste, setWaste]               = useState({ quantity: 1, reason: '' });
  const [actualUnits, setActualUnits]   = useState<Record<string, number>>({});
  const [error, setError]               = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, r] = await Promise.all([cocinaService.listOrders(), recetasService.list()]);
      setOrders(o); setRecipes(r);
    } catch { setError('Error al cargar producción'); }
    finally   { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!newOrder.recipe_id || newOrder.quantity < 1) { setPreview(null); return; }
    let cancelled = false;
    setPreviewLoading(true);
    cocinaService.getPreview(newOrder.recipe_id, newOrder.quantity)
      .then(data  => { if (!cancelled) setPreview(data); })
      .catch(()   => { if (!cancelled) setPreview(null); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [newOrder.recipe_id, newOrder.quantity]);

  const handleStart = async (id: string) => {
    setSaving(id);
    try {
      const updated = await cocinaService.startOrder(id);
      haptic.confirm();
      setOrders(prev => prev.map(o => o.id === id ? updated : o));
      const order  = orders.find(o => o.id === id);
      const recipe = order ? recipes.find(r => r.id === order.recipe_id) : null;
      if (order && recipe) setActualUnits(prev => ({ ...prev, [id]: Math.round(recipe.estimated_yield * order.quantity) }));
    } catch (e: any) { setError(e?.response?.data?.detail || 'Error al iniciar orden'); }
    finally { setSaving(null); }
  };

  const handleComplete = async (id: string) => {
    setSaving(id);
    try {
      const updated = await cocinaService.completeOrder(id, actualUnits[id]);
      haptic.confirm();
      setOrders(prev => prev.map(o => o.id === id ? updated : o));
      setExpandedId(null);
    } catch (e: any) { setError(e?.response?.data?.detail || 'Error al completar orden'); }
    finally { setSaving(null); }
  };

  const handleDelete = async (id: string) => {
    try {
      await cocinaService.deleteOrder(id);
      setOrders(prev => prev.filter(o => o.id !== id));
    } catch (e: any) { setError(e?.response?.data?.detail || 'Error al eliminar orden'); }
  };

  const handleCreateOrder = async () => {
    if (!newOrder.recipe_id) return;
    setSaving('new');
    try {
      const created = await cocinaService.createOrder(newOrder.recipe_id, newOrder.quantity);
      setOrders(prev => [created, ...prev]);
      setShowNewOrder(false);
      setNewOrder({ recipe_id: '', quantity: 1 });
      setPreview(null);
    } catch (e: any) { setError(e?.response?.data?.detail || 'Error al crear orden'); }
    finally { setSaving(null); }
  };

  const handleLogWaste = async (orderId: string) => {
    setSaving('waste');
    try {
      await cocinaService.logWaste(orderId, waste.quantity, waste.reason || undefined);
      setShowWaste(null);
      setWaste({ quantity: 1, reason: '' });
    } catch { setError('Error al registrar merma'); }
    finally { setSaving(null); }
  };

  const handleCloseNewOrder = () => {
    setShowNewOrder(false);
    setNewOrder({ recipe_id: '', quantity: 1 });
    setPreview(null);
  };

  const columns: OrderStatus[]  = ['pending', 'en_proceso', 'completed'];
  const filteredOrders = activeFilter === 'all' ? orders : orders.filter(o => o.status === activeFilter);
  const hasStockWarning = preview?.ingredients.some(i => !i.sufficient) ?? false;

  const TAB_OPTS = [
    { value: 'produccion' as const, label: 'Producción', icon: <ChefHat size={13} /> },
    { value: 'matriz'     as const, label: 'Matriz',     icon: <LayoutGrid size={13} /> },
  ];

  const FILTER_OPTS = [
    { value: 'all'        as const, label: 'Todos'      },
    { value: 'pending'    as const, label: 'Pendiente'  },
    { value: 'en_proceso' as const, label: 'En proceso' },
    { value: 'completed'  as const, label: 'Listo'      },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Error banner */}
      {error && (
        <div className="bg-nodo-danger-bg border border-nodo-danger-bd text-nodo-danger-tx text-sm font-medium px-4 py-3 rounded-2xl flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="ml-2 shrink-0"><X size={16} /></button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 pt-1">
        <div>
          <h1 className="text-[28px] font-black text-nodo-ink leading-tight tracking-tight">Cocina</h1>
          <p className="text-sm text-nodo-sub font-medium mt-0.5">
            {orders.filter(o => o.status !== 'completed').length} órdenes activas
          </p>
        </div>

        <div className="flex items-center gap-2 pt-1">
          {/* Status counters — desktop */}
          <div className="hidden sm:flex items-center gap-2">
            {columns.map(status => {
              const cfg   = STATUS_CFG[status];
              const count = orders.filter(o => o.status === status).length;
              return (
                <div key={status} className={`px-3 py-1.5 rounded-xl border ${cfg.badge} text-center min-w-[52px]`}>
                  <p className="text-sm font-black">{count}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider">{cfg.label}</p>
                </div>
              );
            })}
          </div>

          {activeTab === 'produccion' && (
            <button
              onClick={() => setShowNewOrder(true)}
              className="w-11 h-11 rounded-full bg-nodo-ink text-nodo-canvas flex items-center justify-center active:scale-95 transition-transform shadow-md"
              aria-label="Nueva orden"
            >
              <Plus size={20} />
            </button>
          )}
        </div>
      </div>

      {/* ── Tab selector ── */}
      <SegmentedControl options={TAB_OPTS} value={activeTab} onChange={setActiveTab} />

      {/* ── Tab: Matriz ── */}
      {activeTab === 'matriz' && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <MatrizTab />
        </div>
      )}

      {/* ── Tab: Producción ── */}
      {activeTab === 'produccion' && (
        <>
          {/* Status filter */}
          <SegmentedControl options={FILTER_OPTS} value={activeFilter} onChange={setActiveFilter} size="sm" />

          {/* Desktop Kanban */}
          <div className="hidden lg:grid grid-cols-3 gap-4 flex-1 min-h-0">
            {columns.map(status => {
              const cfg       = STATUS_CFG[status];
              const colOrders = orders.filter(o => o.status === status);
              return (
                <div key={status} className="flex flex-col bg-nodo-inset rounded-2xl border border-nodo-line overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-nodo-line">
                    <div className={`w-2 h-2 rounded-full ${cfg.strip}`} />
                    <span className="text-sm font-black text-nodo-ink">{cfg.label}</span>
                    <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                      {colOrders.length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {colOrders.map(order => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        recipe={recipes.find(r => r.id === order.recipe_id) ?? null}
                        expanded={expandedId === order.id}
                        saving={saving === order.id}
                        actualUnits={actualUnits[order.id]}
                        onActualUnitsChange={v => setActualUnits(prev => ({ ...prev, [order.id]: v }))}
                        onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
                        onStart={() => handleStart(order.id)}
                        onComplete={() => handleComplete(order.id)}
                        onWaste={() => setShowWaste(order.id)}
                        onDelete={() => handleDelete(order.id)}
                      />
                    ))}
                    {colOrders.length === 0 && (
                      <div className="text-center py-10 text-nodo-dim">
                        <p className="text-xs font-bold">Sin órdenes</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile list */}
          <div className="lg:hidden flex-1 overflow-y-auto min-h-0 space-y-2 pb-2">
            {filteredOrders.length === 0 ? (
              <div className="text-center py-16 text-nodo-dim">
                <ChefHat size={40} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm font-bold">Sin órdenes</p>
              </div>
            ) : filteredOrders.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                recipe={recipes.find(r => r.id === order.recipe_id) ?? null}
                expanded={expandedId === order.id}
                saving={saving === order.id}
                actualUnits={actualUnits[order.id]}
                onActualUnitsChange={v => setActualUnits(prev => ({ ...prev, [order.id]: v }))}
                onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
                onStart={() => handleStart(order.id)}
                onComplete={() => handleComplete(order.id)}
                onWaste={() => setShowWaste(order.id)}
                onDelete={() => handleDelete(order.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* ── BottomSheet: Nueva Orden ── */}
      <BottomSheet
        open={showNewOrder}
        onClose={handleCloseNewOrder}
        title="Nueva Orden"
        footer={
          <button
            onClick={handleCreateOrder}
            disabled={!newOrder.recipe_id || saving === 'new'}
            className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base transition-all active:scale-[0.97] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving === 'new' ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            CREAR ORDEN
          </button>
        }
      >
        {/* Recipe selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-nodo-sub uppercase tracking-wider block">Receta</label>
          <select
            value={newOrder.recipe_id}
            onChange={e => setNewOrder(prev => ({ ...prev, recipe_id: e.target.value }))}
            className="w-full h-12 px-4 bg-nodo-inset border border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:outline-none focus:border-nodo-line-s"
          >
            <option value="">Seleccionar receta…</option>
            {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        {/* Quantity stepper */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-nodo-sub uppercase tracking-wider block">Lotes a producir</label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setNewOrder(prev => ({ ...prev, quantity: Math.max(1, prev.quantity - 1) }))}
              className="w-14 h-14 rounded-2xl bg-nodo-inset border border-nodo-line flex items-center justify-center active:scale-95 transition-transform text-nodo-ink"
            >
              <Minus size={20} />
            </button>
            <div className="flex-1 text-center">
              <span className="text-4xl font-black text-nodo-ink">{newOrder.quantity}</span>
              <span className="text-sm text-nodo-sub ml-2">{newOrder.quantity === 1 ? 'lote' : 'lotes'}</span>
            </div>
            <button
              onClick={() => setNewOrder(prev => ({ ...prev, quantity: prev.quantity + 1 }))}
              className="w-14 h-14 rounded-2xl bg-nodo-inset border border-nodo-line flex items-center justify-center active:scale-95 transition-transform text-nodo-ink"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Ingredient preview */}
        {newOrder.recipe_id && (
          <div className="bg-nodo-inset rounded-2xl border border-nodo-line overflow-hidden">
            {previewLoading ? (
              <div className="flex items-center justify-center py-6 gap-2 text-nodo-sub">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-xs font-bold">Verificando stock…</span>
              </div>
            ) : preview ? (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-nodo-line">
                  <div className="flex items-center gap-2 text-nodo-sub">
                    <TrendingUp size={14} />
                    <span className="text-xs font-bold uppercase tracking-wider">Costo estimado</span>
                  </div>
                  <span className="text-sm font-black text-nodo-ink">{fmtQ(preview.estimated_cost)}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-b border-nodo-line">
                  <div className="flex items-center gap-2 text-nodo-sub">
                    <Package size={14} />
                    <span className="text-xs font-bold uppercase tracking-wider">Unidades esperadas</span>
                  </div>
                  <span className="text-sm font-black text-nodo-ink">{preview.total_units} uds.</span>
                </div>

                {hasStockWarning && (
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-nodo-warn-bg border-b border-nodo-warn-bd">
                    <AlertTriangle size={14} className="text-nodo-warn-tx shrink-0" />
                    <span className="text-xs font-bold text-nodo-warn-tx">Stock insuficiente en algunos ingredientes</span>
                  </div>
                )}

                <div className="divide-y divide-nodo-line">
                  {preview.ingredients.map((ing, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ing.sufficient ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <span className="text-xs font-semibold text-nodo-ink truncate">{ing.name}</span>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <span className={`text-xs font-bold ${ing.sufficient ? 'text-nodo-sub' : 'text-nodo-danger-tx'}`}>
                          {ing.required.toFixed(2)} {ing.unit}
                        </span>
                        {!ing.sufficient && (
                          <span className="block text-[10px] text-nodo-danger-tx font-medium">
                            disponible: {ing.available.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        )}
      </BottomSheet>

      {/* ── BottomSheet: Merma ── */}
      <BottomSheet
        open={!!showWaste}
        onClose={() => setShowWaste(null)}
        title="Reportar Merma"
        footer={
          <button
            onClick={() => showWaste && handleLogWaste(showWaste)}
            disabled={saving === 'waste'}
            className="w-full h-14 rounded-2xl bg-nodo-danger-tx text-white font-black text-base transition-all active:scale-[0.97] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving === 'waste' ? <Loader2 size={18} className="animate-spin" /> : <AlertTriangle size={18} />}
            REGISTRAR MERMA
          </button>
        }
      >
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-nodo-sub uppercase tracking-wider block">Cantidad dañada</label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setWaste(prev => ({ ...prev, quantity: Math.max(1, prev.quantity - 1) }))}
              className="w-14 h-14 rounded-2xl bg-nodo-inset border border-nodo-line flex items-center justify-center active:scale-95 transition-transform text-nodo-ink"
            >
              <Minus size={20} />
            </button>
            <div className="flex-1 text-center">
              <span className="text-4xl font-black text-nodo-ink">{waste.quantity}</span>
            </div>
            <button
              onClick={() => setWaste(prev => ({ ...prev, quantity: prev.quantity + 1 }))}
              className="w-14 h-14 rounded-2xl bg-nodo-inset border border-nodo-line flex items-center justify-center active:scale-95 transition-transform text-nodo-ink"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-nodo-sub uppercase tracking-wider block">Motivo (opcional)</label>
          <input
            type="text"
            value={waste.reason}
            onChange={e => setWaste(prev => ({ ...prev, reason: e.target.value }))}
            placeholder="Ej: Quemado en horno"
            className="w-full h-12 px-4 bg-nodo-inset border border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink placeholder:text-nodo-dim focus:outline-none focus:border-nodo-line-s"
          />
        </div>
      </BottomSheet>
    </div>
  );
}

// ── OrderCard ─────────────────────────────────────────────────────────────────
function OrderCard({
  order, recipe, expanded, saving, actualUnits, onActualUnitsChange,
  onToggle, onStart, onComplete, onWaste, onDelete,
}: {
  order: ProductionOrder;
  recipe: Recipe | null;
  expanded: boolean;
  saving: boolean;
  actualUnits: number | undefined;
  onActualUnitsChange: (v: number) => void;
  onToggle: () => void;
  onStart: () => void;
  onComplete: () => void;
  onWaste: () => void;
  onDelete: () => void;
}) {
  const cfg          = STATUS_CFG[order.status];
  const expectedUnits = recipe ? Math.round(recipe.estimated_yield * order.quantity) : null;
  const displayUnits  = actualUnits ?? expectedUnits ?? 0;

  return (
    <div className={`bg-nodo-card rounded-2xl border overflow-hidden transition-shadow ${
      expanded ? 'border-nodo-line-s shadow-md' : 'border-nodo-line'
    }`}>
      {/* Row header */}
      <button onClick={onToggle} className="w-full flex items-center text-left">
        <div className={`w-[3px] self-stretch shrink-0 ${cfg.strip}`} />
        <div className="flex-1 flex items-center justify-between px-4 py-3.5 gap-3 min-w-0">
          <div className="min-w-0">
            <p className="text-sm font-black text-nodo-ink truncate">{order.recipe_name}</p>
            <p className="text-xs text-nodo-sub font-medium mt-0.5">
              ×{order.quantity} {order.quantity === 1 ? 'lote' : 'lotes'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${cfg.badge}`}>
              {cfg.label}
            </span>
            {order.status === 'pending' && (
              <button
                onClick={e => { e.stopPropagation(); onStart(); }}
                disabled={saving}
                className="px-3 py-1.5 rounded-xl bg-blue-500 text-white text-[11px] font-bold active:scale-95 transition-transform disabled:opacity-50"
              >
                INICIAR
              </button>
            )}
            {expanded
              ? <ChevronUp size={16} className="text-nodo-dim" />
              : <ChevronDown size={16} className="text-nodo-dim" />
            }
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-3 border-t border-nodo-line">
          {order.started_at && (
            <p className="text-xs text-nodo-sub">
              Iniciado: <span className="font-bold text-nodo-ink">
                {new Date(order.started_at).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </p>
          )}
          {order.completed_at && (
            <p className="text-xs text-nodo-sub">
              Completado: <span className="font-bold text-nodo-success-tx">
                {new Date(order.completed_at).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </p>
          )}

          {/* Units stepper — en proceso */}
          {order.status === 'en_proceso' && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-nodo-sub uppercase tracking-wider block">
                Unidades producidas
                {expectedUnits && (
                  <span className="ml-1.5 font-medium normal-case text-nodo-dim">(estimado: {expectedUnits})</span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onActualUnitsChange(Math.max(0, displayUnits - 1))}
                  className="w-12 h-12 rounded-xl bg-nodo-inset border border-nodo-line flex items-center justify-center active:scale-95 transition-transform text-nodo-ink"
                >
                  <Minus size={18} />
                </button>
                <input
                  type="number"
                  min="0"
                  value={displayUnits}
                  onChange={e => onActualUnitsChange(parseInt(e.target.value) || 0)}
                  className="flex-1 h-12 px-3 bg-nodo-inset border border-nodo-line rounded-xl text-center text-base font-black text-nodo-ink focus:outline-none focus:border-nodo-line-s [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  onClick={() => onActualUnitsChange(displayUnits + 1)}
                  className="w-12 h-12 rounded-xl bg-nodo-inset border border-nodo-line flex items-center justify-center active:scale-95 transition-transform text-nodo-ink"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Actual units — completed */}
          {order.status === 'completed' && order.actual_units != null && (
            <div className="flex items-center justify-between bg-nodo-success-bg border border-nodo-success-bd rounded-xl px-4 py-2.5">
              <span className="text-xs font-bold text-nodo-success-tx uppercase tracking-wider">Producido</span>
              <span className="text-sm font-black text-nodo-success-tx">{order.actual_units} uds.</span>
            </div>
          )}

          {/* Primary action */}
          {order.status === 'en_proceso' && (
            <button
              onClick={onComplete}
              disabled={saving}
              className="w-full h-14 rounded-2xl bg-emerald-500 text-white font-black text-base tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} strokeWidth={2.5} />}
              REGISTRAR HORNEADA OK
            </button>
          )}
          {order.status === 'pending' && (
            <button
              onClick={onStart}
              disabled={saving}
              className="w-full h-14 rounded-2xl bg-blue-500 text-white font-black text-base tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={20} className="animate-spin" /> : <PlayCircle size={20} strokeWidth={2.5} />}
              INICIAR PRODUCCIÓN
            </button>
          )}

          {/* Secondary actions */}
          <div className="flex gap-2">
            {order.status !== 'completed' && (
              <button
                onClick={onWaste}
                className="flex-1 h-11 rounded-xl border-2 border-nodo-danger-bd text-nodo-danger-tx text-sm font-bold active:scale-95 transition-transform flex items-center justify-center gap-1.5"
              >
                <AlertTriangle size={15} /> MERMA
              </button>
            )}
            {order.status !== 'en_proceso' && (
              <button
                onClick={onDelete}
                className="p-3 rounded-xl border border-nodo-line text-nodo-dim active:scale-95 transition-transform"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
