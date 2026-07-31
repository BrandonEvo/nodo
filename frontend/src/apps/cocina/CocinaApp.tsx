import { useState, useEffect, useCallback } from 'react';
import { haptic } from '@/utils/haptic';
import {
  ChefHat, PlayCircle, CheckCircle2, Plus, Minus, AlertTriangle,
  Loader2, Trash2, Package, TrendingUp, ChevronDown, ChevronUp, LayoutGrid, X,
  Clock,
} from 'lucide-react';
import type { AppProps } from '../index';
import { useModuleChrome, ModuleActions } from '@/components/chrome/ModuleChrome';
import { cocinaService, type ProductionOrder, type OrderPreview, type MatrixResponse } from '@/services/cocina.service';
import { recetasService, type Recipe } from '@/services/recetas.service';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const fmtQ   = (n: number) => 'Q' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtLbs = (n: number) => n.toLocaleString('es-GT', { maximumFractionDigits: 1 });

type OrderStatus = 'pending' | 'en_proceso' | 'completed';

const STATUS_CFG: Record<OrderStatus, { label: string; badge: string; colHeader: string }> = {
  pending:    { label: 'Pendiente',  badge: 'text-nodo-primary bg-nodo-primary-soft border-nodo-primary-soft',    colHeader: 'bg-nodo-primary-softer' },
  en_proceso: { label: 'En Proceso', badge: 'text-nodo-warn-tx bg-nodo-warn-bg border-nodo-warn-bd',             colHeader: 'bg-nodo-warn-bg'     },
  completed:  { label: 'Listo',      badge: 'text-nodo-success-tx bg-nodo-success-bg border-nodo-success-bd',    colHeader: 'bg-nodo-success-bg'  },
};

// ── MatrizTab ─────────────────────────────────────────────────────────────────
function MatrizTab() {
  const now = new Date();
  const [year, setYear]     = useState(now.getFullYear());
  const [month, setMonth]   = useState(now.getMonth() + 1);
  const [matriz, setMatriz] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [view, setView] = useState<'venta' | 'utilidad' | 'costo' | 'harina_lbs'>('venta');
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
    { value: 'harina_lbs' as const, label: 'Harina'   },
  ];

  const cellVal = (cell: MatrixResponse['grand_totals'] | undefined) => {
    if (!cell) return null;
    const v = cell[view];
    return view === 'harina_lbs' ? fmtLbs(v) + ' lbs' : fmtQ(v);
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
          className="h-10 px-3 bg-nodo-inset border border-nodo-line rounded-full text-sm font-semibold text-nodo-ink focus:outline-none focus:border-nodo-primary"
        >
          {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="h-10 px-3 bg-nodo-inset border border-nodo-line rounded-full text-sm font-semibold text-nodo-ink focus:outline-none focus:border-nodo-primary"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <SegmentedControl options={VIEW_OPTS} value={view} onChange={setView} size="sm" className="flex-1 min-w-[220px]" />
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-nodo-primary" />
        </div>
      )}
      {error && (
        <div className="text-sm text-nodo-danger-tx bg-nodo-danger-bg border border-nodo-danger-bd rounded-2xl px-4 py-3">
          {error}
        </div>
      )}

      {!loading && matriz && (
        <>
          {matriz.recipes.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-3xl bg-nodo-primary-softer flex items-center justify-center mx-auto mb-3">
                <LayoutGrid className="w-7 h-7 text-nodo-primary" />
              </div>
              <p className="text-sm font-bold text-nodo-dim">Sin producción en {MONTHS[month - 1]} {year}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[20px] border border-nodo-line bg-nodo-card">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="border-b border-nodo-line">
                    <th className="sticky left-0 z-10 bg-nodo-primary-softer px-4 py-2.5 text-left font-black text-nodo-primary min-w-[140px]">Producto</th>
                    {matriz.days.map(d => (
                      <th key={d} className="px-2 py-2.5 text-center font-bold text-nodo-dim min-w-[56px]">{d}</th>
                    ))}
                    <th className="px-3 py-2.5 text-right font-black text-nodo-ink min-w-[72px]">Total</th>
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
                                {view === 'harina_lbs' ? fmtLbs(val) : fmtQ(val)}
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
                    <td className="sticky left-0 z-10 bg-nodo-raised px-4 py-2.5 text-nodo-sub text-[10px] font-black uppercase tracking-wider">Total Día</td>
                    {matriz.days.map(d => {
                      const cell = matriz.daily_totals[String(d)];
                      const val  = cell ? cell[view] : null;
                      return (
                        <td key={d} className="px-2 py-2.5 text-center font-mono font-bold text-nodo-ink">
                          {val != null && val > 0 ? (view === 'harina_lbs' ? fmtLbs(val) : fmtQ(val)) : '—'}
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

          {/* Grand total cards — asimétrico MASA v2 */}
          {matriz.recipes.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {/* Utilidad — hero full-width */}
              <div className={`col-span-2 rounded-3xl p-5 ${matriz.grand_totals.utilidad >= 0 ? 'bg-nodo-success-bg' : 'bg-nodo-danger-bg'}`}>
                <p className={`text-[10px] font-black uppercase tracking-wider ${matriz.grand_totals.utilidad >= 0 ? 'text-nodo-success-tx' : 'text-nodo-danger-tx'}`}>
                  Utilidad del Período
                </p>
                <p className={`text-[48px] font-black tabular-nums tracking-tight leading-none mt-2 ${matriz.grand_totals.utilidad >= 0 ? 'text-nodo-success-tx' : 'text-nodo-danger-tx'}`}>
                  {fmtQ(matriz.grand_totals.utilidad)}
                </p>
              </div>
              {/* Venta */}
              <div className="bg-nodo-primary-soft rounded-3xl p-4">
                <p className="text-[10px] font-black text-nodo-primary uppercase tracking-wider">Venta Total</p>
                <p className="text-2xl font-black text-nodo-primary tabular-nums mt-1">{fmtQ(matriz.grand_totals.venta)}</p>
              </div>
              {/* Costo */}
              <div className="bg-nodo-primary-softer rounded-3xl p-4">
                <p className="text-[10px] font-black text-nodo-primary uppercase tracking-wider">Costo Total</p>
                <p className="text-2xl font-black text-nodo-primary tabular-nums mt-1">{fmtQ(matriz.grand_totals.costo)}</p>
              </div>
              {/* Harina — fila completa */}
              <div className="col-span-2 bg-nodo-primary-softer rounded-3xl px-5 py-4 flex items-center justify-between">
                <p className="text-[10px] font-black text-nodo-primary uppercase tracking-wider">Harina Total</p>
                <p className="text-xl font-black text-nodo-primary tabular-nums">{fmtLbs(matriz.grand_totals.harina_lbs)} lbs</p>
              </div>
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
  const pendingCount    = orders.filter(o => o.status === 'pending').length;
  const inProgressCount = orders.filter(o => o.status === 'en_proceso').length;

  const activeCount = orders.filter(o => o.status !== 'completed').length;
  useModuleChrome('Producción', `${activeCount} orden${activeCount === 1 ? '' : 'es'} activa${activeCount === 1 ? '' : 's'}`);

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
        <Loader2 className="w-8 h-8 animate-spin text-nodo-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">

      {/* Toast error */}
      {error && (
        <div className="fixed top-4 right-4 z-[70] flex items-center gap-3 bg-nodo-danger-bg border border-nodo-danger-bd text-nodo-danger-tx text-sm font-bold px-4 py-3 rounded-2xl shadow-lg max-w-xs">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      <ModuleActions>
        {activeTab === 'produccion' && (
          <button
            onClick={() => setShowNewOrder(true)}
            className="nodo-appbar-action"
            aria-label="Nueva orden"
          >
            <Plus size={18} />
          </button>
        )}
      </ModuleActions>

      {/* ── KPI cards (órdenes activas) ──────────────────────────────────────── */}
      {orders.length > 0 && activeTab === 'produccion' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-nodo-primary-soft rounded-3xl p-4">
            <p className="text-[10px] font-black text-nodo-primary uppercase tracking-wider">Pendientes</p>
            <p className="text-[40px] font-black text-nodo-primary tabular-nums tracking-tight leading-none mt-1">{pendingCount}</p>
          </div>
          <div className={`rounded-3xl p-4 ${inProgressCount > 0 ? 'bg-nodo-warn-bg' : 'bg-nodo-success-bg'}`}>
            <p className={`text-[10px] font-black uppercase tracking-wider ${inProgressCount > 0 ? 'text-nodo-warn-tx' : 'text-nodo-success-tx'}`}>
              En Proceso
            </p>
            <p className={`text-[40px] font-black tabular-nums tracking-tight leading-none mt-1 ${inProgressCount > 0 ? 'text-nodo-warn-tx' : 'text-nodo-success-tx'}`}>
              {inProgressCount}
            </p>
          </div>
        </div>
      )}

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
          <SegmentedControl options={FILTER_OPTS} value={activeFilter} onChange={setActiveFilter} size="sm" />

          {/* Desktop Kanban */}
          <div className="hidden lg:grid grid-cols-3 gap-4 flex-1 min-h-0">
            {columns.map(status => {
              const cfg       = STATUS_CFG[status];
              const colOrders = orders.filter(o => o.status === status);
              return (
                <div key={status} className="flex flex-col bg-nodo-inset rounded-[20px] border border-nodo-line overflow-hidden">
                  <div className={`flex items-center gap-2.5 px-4 py-3 border-b border-nodo-line ${cfg.colHeader}`}>
                    <span className="text-sm font-black text-nodo-ink">{cfg.label}</span>
                    <span className={`ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full border ${cfg.badge}`}>
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
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-16 h-16 rounded-3xl bg-nodo-primary-softer flex items-center justify-center">
                  <ChefHat size={28} className="text-nodo-primary" />
                </div>
                <p className="text-sm font-bold text-nodo-dim">Sin órdenes</p>
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
            className="w-full h-14 rounded-full text-white font-black text-base transition-all active:scale-[0.97] disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--nodo-primary)', boxShadow: '0 6px 20px var(--nodo-shadow-fab)' }}
          >
            {saving === 'new' ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            Crear orden
          </button>
        }
      >
        {/* Receta */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-nodo-dim uppercase tracking-wider block">Receta</label>
          <select
            value={newOrder.recipe_id}
            onChange={e => setNewOrder(prev => ({ ...prev, recipe_id: e.target.value }))}
            className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:outline-none focus:border-nodo-primary transition-colors"
          >
            <option value="">Seleccionar receta…</option>
            {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        {/* Stepper de lotes */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-nodo-dim uppercase tracking-wider block">Lotes a producir</label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setNewOrder(prev => ({ ...prev, quantity: Math.max(1, prev.quantity - 1) }))}
              className="w-14 h-14 rounded-full bg-nodo-raised border border-nodo-line flex items-center justify-center active:scale-95 transition-transform text-nodo-ink"
            >
              <Minus size={20} />
            </button>
            <div className="flex-1 text-center">
              <span className="text-4xl font-black text-nodo-ink tabular-nums">{newOrder.quantity}</span>
              <span className="text-sm text-nodo-sub ml-2">{newOrder.quantity === 1 ? 'lote' : 'lotes'}</span>
            </div>
            <button
              onClick={() => setNewOrder(prev => ({ ...prev, quantity: prev.quantity + 1 }))}
              className="w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-transform text-white"
              style={{ backgroundColor: 'var(--nodo-primary)' }}
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Ingredientes preview */}
        {newOrder.recipe_id && (
          <div className="bg-nodo-inset rounded-[20px] border border-nodo-line overflow-hidden">
            {previewLoading ? (
              <div className="flex items-center justify-center py-6 gap-2 text-nodo-sub">
                <Loader2 size={16} className="animate-spin text-nodo-primary" />
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
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ing.sufficient ? 'bg-nodo-success-tx' : 'bg-nodo-danger-tx'}`} />
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
            className="w-full h-14 rounded-full bg-nodo-danger-tx text-white font-black text-base transition-all active:scale-[0.97] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving === 'waste' ? <Loader2 size={18} className="animate-spin" /> : <AlertTriangle size={18} />}
            Registrar merma
          </button>
        }
      >
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-nodo-dim uppercase tracking-wider block">Cantidad dañada</label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setWaste(prev => ({ ...prev, quantity: Math.max(1, prev.quantity - 1) }))}
              className="w-14 h-14 rounded-full bg-nodo-raised border border-nodo-line flex items-center justify-center active:scale-95 transition-transform text-nodo-ink"
            >
              <Minus size={20} />
            </button>
            <div className="flex-1 text-center">
              <span className="text-4xl font-black text-nodo-ink tabular-nums">{waste.quantity}</span>
            </div>
            <button
              onClick={() => setWaste(prev => ({ ...prev, quantity: prev.quantity + 1 }))}
              className="w-14 h-14 rounded-full bg-nodo-danger-tx text-white flex items-center justify-center active:scale-95 transition-transform"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-nodo-dim uppercase tracking-wider block">Motivo (opcional)</label>
          <input
            type="text"
            value={waste.reason}
            onChange={e => setWaste(prev => ({ ...prev, reason: e.target.value }))}
            placeholder="Ej: Quemado en horno"
            className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink placeholder:text-nodo-dim focus:outline-none focus:border-nodo-danger-tx transition-colors"
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
  const cfg           = STATUS_CFG[order.status];
  const expectedUnits = recipe ? Math.round(recipe.estimated_yield * order.quantity) : null;
  const displayUnits  = actualUnits ?? expectedUnits ?? 0;

  const iconBg =
    order.status === 'pending'    ? 'bg-nodo-primary-softer'  :
    order.status === 'en_proceso' ? 'bg-nodo-warn-bg'       :
    'bg-nodo-success-bg';

  const iconColor =
    order.status === 'pending'    ? 'text-nodo-primary' :
    order.status === 'en_proceso' ? 'text-nodo-warn-tx'     :
    'text-nodo-success-tx';

  const IconComp = order.status === 'pending' ? ChefHat : order.status === 'en_proceso' ? Clock : CheckCircle2;

  return (
    <div className={`bg-nodo-card rounded-[20px] border overflow-hidden transition-shadow ${
      expanded ? 'border-nodo-line-s shadow-md' : 'border-nodo-line shadow-sm'
    }`}>
      {/* Row header */}
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
        {/* Ícono de estado flotante */}
        <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center ${iconBg}`}>
          <IconComp size={17} className={iconColor} />
        </div>

        <div className="flex-1 min-w-0">
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
              className="px-3 py-1.5 rounded-full text-white text-[11px] font-bold active:scale-95 transition-transform disabled:opacity-50"
              style={{ backgroundColor: 'var(--nodo-primary)' }}
            >
              Iniciar
            </button>
          )}
          {expanded ? <ChevronUp size={16} className="text-nodo-dim" /> : <ChevronDown size={16} className="text-nodo-dim" />}
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

          {/* Stepper unidades — en proceso */}
          {order.status === 'en_proceso' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-nodo-dim uppercase tracking-wider block">
                Unidades producidas
                {expectedUnits && (
                  <span className="ml-1.5 font-medium normal-case text-nodo-dim">(est. {expectedUnits})</span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onActualUnitsChange(Math.max(0, displayUnits - 1))}
                  className="w-12 h-12 rounded-full bg-nodo-raised border border-nodo-line flex items-center justify-center active:scale-95 transition-transform text-nodo-ink"
                >
                  <Minus size={18} />
                </button>
                <input
                  type="number"
                  min="0"
                  value={displayUnits}
                  onChange={e => onActualUnitsChange(parseInt(e.target.value) || 0)}
                  className="flex-1 h-12 px-3 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-center text-base font-black text-nodo-ink focus:outline-none focus:border-nodo-primary transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  onClick={() => onActualUnitsChange(displayUnits + 1)}
                  className="w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-transform text-white"
                  style={{ backgroundColor: 'var(--nodo-primary)' }}
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Completado — unidades reales */}
          {order.status === 'completed' && order.actual_units != null && (
            <div className="flex items-center justify-between bg-nodo-success-bg border border-nodo-success-bd rounded-full px-5 py-3">
              <span className="text-xs font-black text-nodo-success-tx uppercase tracking-wider">Producido</span>
              <span className="text-sm font-black text-nodo-success-tx">{order.actual_units} uds.</span>
            </div>
          )}

          {/* Acción primaria */}
          {order.status === 'en_proceso' && (
            <button
              onClick={onComplete}
              disabled={saving}
              className="w-full h-14 rounded-full text-white font-black text-base tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-2 disabled:opacity-50 bg-nodo-success-tx"
              style={{ boxShadow: '0 6px 20px rgba(22,163,74,0.30)' }}
            >
              {saving ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} strokeWidth={2.5} />}
              Horneada OK
            </button>
          )}
          {order.status === 'pending' && (
            <button
              onClick={onStart}
              disabled={saving}
              className="w-full h-14 rounded-full text-white font-black text-base tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: 'var(--nodo-primary)', boxShadow: '0 6px 20px var(--nodo-shadow-fab)' }}
            >
              {saving ? <Loader2 size={20} className="animate-spin" /> : <PlayCircle size={20} strokeWidth={2.5} />}
              Iniciar producción
            </button>
          )}

          {/* Acciones secundarias */}
          <div className="flex gap-2">
            {order.status !== 'completed' && (
              <button
                onClick={onWaste}
                className="flex-1 h-11 rounded-full border-2 border-nodo-danger-bd text-nodo-danger-tx text-sm font-bold active:scale-95 transition-transform flex items-center justify-center gap-1.5"
              >
                <AlertTriangle size={15} /> Merma
              </button>
            )}
            {order.status !== 'en_proceso' && (
              <button
                onClick={onDelete}
                className="p-3 rounded-full border border-nodo-line text-nodo-dim active:scale-95 transition-transform"
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
