import { useState, useEffect, useCallback } from 'react';
import { ChefHat, Clock, PlayCircle, CheckCircle2, Plus, X, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import type { AppProps } from '../index';
import { cocinaService, type ProductionOrder } from '@/services/cocina.service';
import { recetasService, type Recipe } from '@/services/recetas.service';

type OrderStatus = 'pending' | 'en_proceso' | 'completed';

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending:    { label: 'Pendiente',  color: 'amber',   icon: Clock },
  en_proceso: { label: 'En Proceso', color: 'blue',    icon: PlayCircle },
  completed:  { label: 'Completado', color: 'emerald', icon: CheckCircle2 },
};

export function CocinaApp(_props: AppProps) {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<OrderStatus | 'all'>('all');
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showWaste, setShowWaste] = useState<string | null>(null);
  const [newOrder, setNewOrder] = useState({ recipe_id: '', quantity: 1 });
  const [waste, setWaste] = useState({ quantity: 1, reason: '' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, r] = await Promise.all([cocinaService.listOrders(), recetasService.list()]);
      setOrders(o);
      setRecipes(r);
    } catch {
      setError('Error al cargar producción');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStart = async (id: string) => {
    setSaving(id);
    try {
      const updated = await cocinaService.startOrder(id);
      setOrders(prev => prev.map(o => o.id === id ? updated : o));
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error al iniciar orden');
    } finally {
      setSaving(null);
    }
  };

  const handleComplete = async (id: string) => {
    setSaving(id);
    try {
      const updated = await cocinaService.completeOrder(id);
      setOrders(prev => prev.map(o => o.id === id ? updated : o));
      setExpandedId(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error al completar orden');
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await cocinaService.deleteOrder(id);
      setOrders(prev => prev.filter(o => o.id !== id));
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error al eliminar orden');
    }
  };

  const handleCreateOrder = async () => {
    if (!newOrder.recipe_id) return;
    setSaving('new');
    try {
      const created = await cocinaService.createOrder(newOrder.recipe_id, newOrder.quantity);
      setOrders(prev => [created, ...prev]);
      setShowNewOrder(false);
      setNewOrder({ recipe_id: '', quantity: 1 });
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error al crear orden');
    } finally {
      setSaving(null);
    }
  };

  const handleLogWaste = async (orderId: string) => {
    setSaving('waste');
    try {
      await cocinaService.logWaste(orderId, waste.quantity, waste.reason || undefined);
      setShowWaste(null);
      setWaste({ quantity: 1, reason: '' });
    } catch {
      setError('Error al registrar merma');
    } finally {
      setSaving(null);
    }
  };

  const columns: OrderStatus[] = ['pending', 'en_proceso', 'completed'];
  const filteredOrders = activeFilter === 'all' ? orders : orders.filter(o => o.status === activeFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-2xl flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}><X size={16} /></button>
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-600">
            <ChefHat size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#111]">Cocina</h1>
            <p className="text-xs text-slate-400 font-medium">Tablero de Producción</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {columns.map(status => {
            const cfg = STATUS_CONFIG[status];
            const count = orders.filter(o => o.status === status).length;
            return (
              <div key={status} className={`px-3 py-2 rounded-xl bg-${cfg.color}-50 border border-${cfg.color}-100 text-center hidden sm:block`}>
                <p className={`text-lg font-black text-${cfg.color}-600`}>{count}</p>
                <p className={`text-[9px] font-bold text-${cfg.color}-400 uppercase tracking-wider`}>{cfg.label}</p>
              </div>
            );
          })}
          <button
            onClick={() => setShowNewOrder(true)}
            className="h-11 px-4 bg-[#111] text-white text-sm font-bold rounded-2xl hover:bg-[#222] transition-all active:scale-95 flex items-center gap-2"
          >
            <Plus size={16} /> Nueva Orden
          </button>
        </div>
      </div>

      {/* ── MOBILE FILTER ── */}
      <div className="flex lg:hidden gap-2">
        {(['all', ...columns] as const).map(f => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              activeFilter === f ? 'bg-[#111] text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {f === 'all' ? 'Todos' : STATUS_CONFIG[f].label}
          </button>
        ))}
      </div>

      {/* ── DESKTOP KANBAN ── */}
      <div className="hidden lg:grid grid-cols-3 gap-6 flex-1 min-h-0">
        {columns.map(status => {
          const cfg = STATUS_CONFIG[status];
          const Icon = cfg.icon;
          const colOrders = orders.filter(o => o.status === status);
          return (
            <div key={status} className="flex flex-col bg-slate-50/50 rounded-3xl border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
                <Icon size={16} className={`text-${cfg.color}-500`} />
                <span className="text-sm font-black text-[#111]">{cfg.label}</span>
                <span className={`ml-auto text-xs font-bold text-${cfg.color}-500 bg-${cfg.color}-100 px-2 py-0.5 rounded-full`}>
                  {colOrders.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {colOrders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    expanded={expandedId === order.id}
                    saving={saving === order.id}
                    onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
                    onStart={() => handleStart(order.id)}
                    onComplete={() => handleComplete(order.id)}
                    onWaste={() => setShowWaste(order.id)}
                    onDelete={() => handleDelete(order.id)}
                  />
                ))}
                {colOrders.length === 0 && (
                  <div className="text-center py-10 text-slate-300">
                    <p className="text-xs font-bold">Sin órdenes</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MOBILE LIST ── */}
      <div className="lg:hidden flex-1 space-y-3 overflow-y-auto">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-16 text-slate-300">
            <ChefHat size={40} className="mx-auto mb-2" />
            <p className="text-sm font-bold">Sin órdenes</p>
          </div>
        ) : filteredOrders.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            expanded={expandedId === order.id}
            saving={saving === order.id}
            onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
            onStart={() => handleStart(order.id)}
            onComplete={() => handleComplete(order.id)}
            onWaste={() => setShowWaste(order.id)}
            onDelete={() => handleDelete(order.id)}
          />
        ))}
      </div>

      {/* ── MODAL: Nueva Orden ── */}
      {showNewOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowNewOrder(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-[#111]">Nueva Orden de Producción</h3>
              <button onClick={() => setShowNewOrder(false)} className="p-2 hover:bg-slate-100 rounded-xl"><X size={18} className="text-slate-400" /></button>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Receta</label>
              <select
                value={newOrder.recipe_id}
                onChange={e => setNewOrder(prev => ({ ...prev, recipe_id: e.target.value }))}
                className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-semibold text-[#111] focus:border-[#111] outline-none"
              >
                <option value="">Seleccionar receta…</option>
                {recipes.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Cantidad a producir</label>
              <input
                type="number"
                min="1"
                value={newOrder.quantity}
                onChange={e => setNewOrder(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-semibold text-[#111] focus:border-[#111] outline-none"
              />
            </div>
            <button
              onClick={handleCreateOrder}
              disabled={!newOrder.recipe_id || saving === 'new'}
              className="w-full h-14 rounded-2xl bg-[#111] text-white font-black text-base hover:bg-[#222] transition-all active:scale-[0.97] disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {saving === 'new' ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              CREAR ORDEN
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL: Merma ── */}
      {showWaste && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowWaste(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
                <AlertTriangle size={20} />
              </div>
              <h3 className="text-xl font-black text-[#111]">Reportar Merma</h3>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Cantidad dañada</label>
              <input
                type="number"
                min="1"
                value={waste.quantity}
                onChange={e => setWaste(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 1 }))}
                className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-semibold text-[#111] focus:border-[#111] outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Motivo (opcional)</label>
              <input
                type="text"
                value={waste.reason}
                onChange={e => setWaste(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Ej: Quemado en horno"
                className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-semibold text-[#111] focus:border-[#111] outline-none"
              />
            </div>
            <button
              onClick={() => handleLogWaste(showWaste)}
              disabled={saving === 'waste'}
              className="w-full h-14 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-black text-base transition-all active:scale-[0.97] disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {saving === 'waste' ? <Loader2 size={18} className="animate-spin" /> : <AlertTriangle size={18} />}
              REGISTRAR MERMA
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, expanded, saving, onToggle, onStart, onComplete, onWaste, onDelete }: {
  order: ProductionOrder; expanded: boolean; saving: boolean;
  onToggle: () => void; onStart: () => void; onComplete: () => void;
  onWaste: () => void; onDelete: () => void;
}) {
  const cfg = STATUS_CONFIG[order.status];
  const colorMap: Record<string, string> = {
    amber: 'bg-amber-500', blue: 'bg-blue-500', emerald: 'bg-emerald-500',
  };

  return (
    <div className={`bg-white rounded-2xl border transition-all overflow-hidden ${expanded ? 'border-[#111] shadow-lg' : 'border-slate-100 shadow-sm hover:shadow-md'}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 text-left">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full ${colorMap[cfg.color]} shrink-0`} />
          <div className="min-w-0">
            <p className="text-sm font-black text-[#111] truncate">{order.recipe_name}</p>
            <p className="text-xs text-slate-400 font-medium">×{order.quantity} unidades</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {order.status === 'pending' && (
            <button
              onClick={e => { e.stopPropagation(); onStart(); }}
              disabled={saving}
              className="px-3 py-1.5 rounded-xl bg-blue-500 text-white text-[11px] font-bold hover:bg-blue-600 transition-colors active:scale-95 disabled:opacity-50"
            >
              INICIAR
            </button>
          )}
          <span className="text-slate-300 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-4">
          {order.started_at && (
            <p className="text-xs text-slate-400">Iniciado: <span className="font-bold text-[#111]">{new Date(order.started_at).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}</span></p>
          )}
          {order.completed_at && (
            <p className="text-xs text-slate-400">Completado: <span className="font-bold text-emerald-600">{new Date(order.completed_at).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}</span></p>
          )}

          {order.status === 'en_proceso' && (
            <button
              onClick={onComplete}
              disabled={saving}
              className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-base tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} strokeWidth={2.5} />}
              REGISTRAR HORNEADA OK
            </button>
          )}

          {order.status === 'pending' && (
            <button
              onClick={onStart}
              disabled={saving}
              className="w-full h-14 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-black text-base tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={20} className="animate-spin" /> : <PlayCircle size={20} strokeWidth={2.5} />}
              INICIAR PRODUCCIÓN
            </button>
          )}

          <div className="flex gap-2">
            {order.status !== 'completed' && (
              <button
                onClick={onWaste}
                className="flex-1 h-11 rounded-xl border-2 border-red-200 text-red-500 text-sm font-bold hover:bg-red-50 transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <AlertTriangle size={15} /> REPORTAR MERMA
              </button>
            )}
            {order.status !== 'en_proceso' && (
              <button
                onClick={onDelete}
                className="p-3 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-red-400 transition-all active:scale-95"
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
