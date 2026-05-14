import { useState } from 'react';
import { ChefHat, Clock, PlayCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import type { AppProps } from '../index';

// ── Mock Data ──
type OrderStatus = 'pendiente' | 'en_proceso' | 'completado';

interface Order {
  id: string;
  product: string;
  qty: number;
  status: OrderStatus;
  recipe: string[];
  ingredients: { name: string; amount: string }[];
  startedAt?: string;
  completedAt?: string;
}

const INITIAL_ORDERS: Order[] = [
  {
    id: '1', product: 'Pan Francés', qty: 50, status: 'pendiente',
    recipe: ['Mezclar harina, agua, sal y levadura', 'Amasar por 15 min', 'Dejar reposar 1h', 'Hornear 25 min a 200°C'],
    ingredients: [{ name: 'Harina', amount: '5 kg' }, { name: 'Agua', amount: '3 L' }, { name: 'Sal', amount: '100 g' }, { name: 'Levadura', amount: '50 g' }],
  },
  {
    id: '2', product: 'Concha', qty: 30, status: 'pendiente',
    recipe: ['Preparar masa dulce', 'Formar bolas', 'Colocar cobertura', 'Hornear 20 min a 180°C'],
    ingredients: [{ name: 'Harina', amount: '3 kg' }, { name: 'Azúcar', amount: '800 g' }, { name: 'Mantequilla', amount: '500 g' }, { name: 'Huevos', amount: '10 unid' }],
  },
  {
    id: '3', product: 'Polvorón', qty: 40, status: 'en_proceso',
    recipe: ['Mezclar manteca con azúcar', 'Añadir harina', 'Moldear', 'Hornear 15 min a 170°C'],
    ingredients: [{ name: 'Harina', amount: '2 kg' }, { name: 'Mantequilla', amount: '1 kg' }, { name: 'Azúcar glass', amount: '500 g' }],
    startedAt: '10:30 AM',
  },
  {
    id: '4', product: 'Cuerno', qty: 25, status: 'completado',
    recipe: ['Preparar masa hojaldrada', 'Cortar triángulos', 'Enrollar', 'Hornear 18 min a 190°C'],
    ingredients: [{ name: 'Harina', amount: '2 kg' }, { name: 'Mantequilla', amount: '800 g' }, { name: 'Leche', amount: '500 ml' }],
    startedAt: '08:00 AM', completedAt: '09:45 AM',
  },
  {
    id: '5', product: 'Dona', qty: 60, status: 'completado',
    recipe: ['Preparar masa', 'Cortar aros', 'Freír', 'Glasear'],
    ingredients: [{ name: 'Harina', amount: '3 kg' }, { name: 'Azúcar', amount: '400 g' }, { name: 'Huevos', amount: '8 unid' }, { name: 'Aceite', amount: '2 L' }],
    startedAt: '07:00 AM', completedAt: '08:30 AM',
  },
];

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'amber', icon: Clock },
  en_proceso: { label: 'En Proceso', color: 'blue', icon: PlayCircle },
  completado: { label: 'Completado', color: 'emerald', icon: CheckCircle2 },
};

export function CocinaApp(_props: AppProps) {
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<OrderStatus | 'all'>('all');

  const startOrder = (id: string) => {
    setOrders(prev => prev.map(o =>
      o.id === id ? { ...o, status: 'en_proceso' as OrderStatus, startedAt: new Date().toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' }) } : o
    ));
  };

  const completeOrder = (id: string) => {
    setOrders(prev => prev.map(o =>
      o.id === id ? { ...o, status: 'completado' as OrderStatus, completedAt: new Date().toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' }) } : o
    ));
    setExpandedId(null);
  };

  const columns: OrderStatus[] = ['pendiente', 'en_proceso', 'completado'];

  const filteredOrders = activeFilter === 'all'
    ? orders
    : orders.filter(o => o.status === activeFilter);

  return (
    <div className="flex flex-col h-full gap-6">
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
        {/* Stats */}
        <div className="flex items-center gap-3">
          {columns.map(status => {
            const cfg = STATUS_CONFIG[status];
            const count = orders.filter(o => o.status === status).length;
            return (
              <div key={status} className={`px-4 py-2 rounded-xl bg-${cfg.color}-50 border border-${cfg.color}-100 text-center`}>
                <p className={`text-lg font-black text-${cfg.color}-600`}>{count}</p>
                <p className={`text-[9px] font-bold text-${cfg.color}-400 uppercase tracking-wider`}>{cfg.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── MOBILE FILTER TABS ── */}
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

      {/* ── DESKTOP KANBAN (3 columns) ── */}
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
                <span className={`ml-auto text-xs font-bold text-${cfg.color}-500 bg-${cfg.color}-100 px-2 py-0.5 rounded-full`}>{colOrders.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {colOrders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    expanded={expandedId === order.id}
                    onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
                    onStart={() => startOrder(order.id)}
                    onComplete={() => completeOrder(order.id)}
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
        {filteredOrders.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            expanded={expandedId === order.id}
            onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
            onStart={() => startOrder(order.id)}
            onComplete={() => completeOrder(order.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── ORDER CARD COMPONENT ──
function OrderCard({ order, expanded, onToggle, onStart, onComplete }: {
  order: Order; expanded: boolean;
  onToggle: () => void; onStart: () => void; onComplete: () => void;
}) {
  const cfg = STATUS_CONFIG[order.status];
  return (
    <div className={`bg-white rounded-2xl border transition-all overflow-hidden ${
      expanded ? 'border-[#111] shadow-lg' : 'border-slate-100 shadow-sm hover:shadow-md'
    }`}>
      {/* Header */}
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 text-left">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full bg-${cfg.color}-500 shrink-0`} />
          <div className="min-w-0">
            <p className="text-sm font-black text-[#111] truncate">{order.product}</p>
            <p className="text-xs text-slate-400 font-medium">x{order.qty} unidades</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {order.status === 'pendiente' && (
            <button
              onClick={e => { e.stopPropagation(); onStart(); }}
              className="px-3 py-1.5 rounded-xl bg-blue-500 text-white text-[11px] font-bold hover:bg-blue-600 transition-colors active:scale-95"
            >
              INICIAR
            </button>
          )}
          {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-4">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Ingredientes</p>
            <div className="grid grid-cols-2 gap-2">
              {order.ingredients.map((ing, i) => (
                <div key={i} className="bg-slate-50 rounded-xl px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#111]">{ing.name}</span>
                  <span className="text-xs font-bold text-slate-500">{ing.amount}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Pasos</p>
            <ol className="space-y-1.5">
              {order.recipe.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                  <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0 mt-0.5">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {order.startedAt && (
            <p className="text-xs text-slate-400">Iniciado: <span className="font-bold text-[#111]">{order.startedAt}</span></p>
          )}
          {order.completedAt && (
            <p className="text-xs text-slate-400">Completado: <span className="font-bold text-emerald-600">{order.completedAt}</span></p>
          )}

          {order.status === 'en_proceso' && (
            <button
              onClick={onComplete}
              className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-base tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={20} strokeWidth={2.5} />
              FINALIZAR PRODUCCIÓN
            </button>
          )}

          {order.status === 'pendiente' && (
            <button
              onClick={onStart}
              className="w-full h-14 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-black text-base tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-2"
            >
              <PlayCircle size={20} strokeWidth={2.5} />
              INICIAR PRODUCCIÓN
            </button>
          )}
        </div>
      )}
    </div>
  );
}
