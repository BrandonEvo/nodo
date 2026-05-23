import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  Plus, Trash2, Loader2, AlertTriangle,
  ShoppingBag, ClipboardList, CheckCircle2, Clock, XCircle,
  Search, Calculator, X, Check, Phone, Calendar, Sparkles, TrendingUp, Link2,
} from 'lucide-react';
import type { AppProps } from '../index';
import { ShopperCalculator, type CalcResult } from './ShopperCalculator';
import { TrackingTimeline, TrackingMiniBar } from './TrackingTimeline';
import {
  personalShopperService,
  type ShopperOrder,
  type OrderStatus,
} from '@/services/personal_shopper.service';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTES VISUALES
// ═══════════════════════════════════════════════════════════════════════════════

const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente:  'Pendiente',
  cotizado:   'Cotizado',
  aprobado:   'Aprobado',
  en_proceso: 'En proceso',
  entregado:  'Entregado',
  cancelado:  'Cancelado',
};

// Paleta iOS-style con dark mode variants
const STATUS_THEME: Record<OrderStatus, {
  bg: string; text: string; dot: string; ring: string;
  darkBg: string; darkText: string; darkRing: string;
}> = {
  pendiente:  { bg: 'bg-amber-100',   text: 'text-amber-800',   dot: 'bg-amber-500',   ring: 'ring-amber-200',   darkBg: 'dark:bg-amber-500/20',   darkText: 'dark:text-amber-300',   darkRing: 'dark:ring-amber-500/30'   },
  cotizado:   { bg: 'bg-sky-100',     text: 'text-sky-800',     dot: 'bg-sky-500',     ring: 'ring-sky-200',     darkBg: 'dark:bg-sky-500/20',     darkText: 'dark:text-sky-300',     darkRing: 'dark:ring-sky-500/30'     },
  aprobado:   { bg: 'bg-violet-100',  text: 'text-violet-800',  dot: 'bg-violet-500',  ring: 'ring-violet-200',  darkBg: 'dark:bg-violet-500/20',  darkText: 'dark:text-violet-300',  darkRing: 'dark:ring-violet-500/30'  },
  en_proceso: { bg: 'bg-fuchsia-100', text: 'text-fuchsia-800', dot: 'bg-fuchsia-500', ring: 'ring-fuchsia-200', darkBg: 'dark:bg-fuchsia-500/20', darkText: 'dark:text-fuchsia-300', darkRing: 'dark:ring-fuchsia-500/30' },
  entregado:  { bg: 'bg-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500', ring: 'ring-emerald-200', darkBg: 'dark:bg-emerald-500/20', darkText: 'dark:text-emerald-300', darkRing: 'dark:ring-emerald-500/30' },
  cancelado:  { bg: 'bg-rose-100',    text: 'text-rose-800',    dot: 'bg-rose-500',    ring: 'ring-rose-200',    darkBg: 'dark:bg-rose-500/20',    darkText: 'dark:text-rose-300',    darkRing: 'dark:ring-rose-500/30'    },
};

const STATUS_ICONS: Record<OrderStatus, typeof Clock> = {
  pendiente:  Clock,
  cotizado:   ClipboardList,
  aprobado:   CheckCircle2,
  en_proceso: ShoppingBag,
  entregado:  Sparkles,
  cancelado:  XCircle,
};

const ALL_STATUSES: OrderStatus[] = [
  'pendiente', 'cotizado', 'aprobado', 'en_proceso', 'entregado', 'cancelado',
];

const AVATAR_GRADIENTS = [
  'from-rose-400 to-pink-500',
  'from-fuchsia-400 to-purple-500',
  'from-amber-400 to-rose-500',
  'from-sky-400 to-indigo-500',
  'from-emerald-400 to-teal-500',
  'from-orange-400 to-pink-500',
  'from-violet-400 to-fuchsia-500',
];

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getGradient = (name: string) => {
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
};

const fmt = (n: number) =>
  'Q' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EMPTY_FORM = {
  client_name: '',
  client_phone: '',
  product_description: '',
  quantity: '1',
  unit: 'unidades',
  delivery_date: '',
  status: 'pendiente' as OrderStatus,
  quoted_price: '',
  notes: '',
};

type Tab = 'pedidos' | 'calculadora';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTES AUXILIARES
// ═══════════════════════════════════════════════════════════════════════════════

function BottomSheet({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-[fade-in_200ms_ease-out]"
        onClick={onClose}
      />
      <div
        className="relative bg-white dark:bg-[#1C1C1E] rounded-t-3xl shadow-2xl max-h-[92dvh]
                   flex flex-col animate-[slide-up_300ms_cubic-bezier(0.32,0.72,0,1)]"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-[#3A3A3C]" />
        </div>
        {title && (
          <div className="px-6 pt-3 pb-2 flex items-center justify-between shrink-0">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{title}</h2>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-gray-100 dark:bg-[#2C2C2E] flex items-center
                         justify-center active:scale-95 transition-all"
            >
              <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 pt-2"
             style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px) + 1rem)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <div
      className={`shrink-0 rounded-full bg-gradient-to-br ${getGradient(name)}
                  flex items-center justify-center text-white font-bold shadow-sm`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {getInitials(name)}
    </div>
  );
}

function StatusPill({
  status, onClick, size = 'sm',
}: { status: OrderStatus; onClick?: () => void; size?: 'sm' | 'md' }) {
  const t = STATUS_THEME[status];
  const Icon = STATUS_ICONS[status];
  const classes = size === 'md'
    ? 'px-3 py-1.5 text-sm gap-1.5'
    : 'px-2.5 py-1 text-xs gap-1';
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`inline-flex items-center rounded-full font-semibold
                  ${t.bg} ${t.text} ${t.darkBg} ${t.darkText} ${classes}
                  ${onClick ? 'active:scale-95 active:opacity-80 transition-all cursor-pointer' : 'cursor-default'}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
      {STATUS_LABELS[status]}
      {onClick && <Icon className="w-3 h-3 opacity-60" />}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

export function PersonalShopperApp(_props: AppProps) {
  const [tab, setTab]                       = useState<Tab>('pedidos');
  const [orders, setOrders]                 = useState<ShopperOrder[]>([]);
  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  const [statusSheet, setStatusSheet]       = useState<ShopperOrder | null>(null);
  const [quickSheet, setQuickSheet]         = useState(false);
  const [editSheet, setEditSheet]           = useState<ShopperOrder | null>(null);
  const [clientSheet, setClientSheet]       = useState<{ result: CalcResult; productName: string } | null>(null);
  const [trackingSheet, setTrackingSheet]   = useState<ShopperOrder | null>(null);

  const [form, setForm]                     = useState({ ...EMPTY_FORM });
  const [quickClient, setQuickClient]       = useState('');
  const [quickProduct, setQuickProduct]     = useState('');
  const [quickPrice, setQuickPrice]         = useState('');
  const [clientName, setClientName]         = useState('');
  const [clientPhone, setClientPhone]       = useState('');

  const [search, setSearch]                 = useState('');
  const [filterStatus, setFilterStatus]     = useState<OrderStatus | 'todos'>('todos');

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrders(await personalShopperService.list());
    } catch {
      setError('No se pudieron cargar los pedidos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const handleQuickStatus = async (orderId: string, newStatus: OrderStatus) => {
    setStatusSheet(null);
    try {
      const updated = await personalShopperService.update(orderId, { status: newStatus });
      setOrders(prev => prev.map(o => o.id === orderId ? updated : o));
    } catch {
      setError('No se pudo actualizar el estado.');
    }
  };

  const handleQuickCreate = async () => {
    if (!quickClient.trim() || !quickProduct.trim()) return;
    setSaving(true);
    try {
      const created = await personalShopperService.create({
        client_name:         quickClient.trim(),
        product_description: quickProduct.trim(),
        quoted_price:        quickPrice !== '' ? Number(quickPrice) : null,
        status:              'pendiente',
      });
      setOrders(prev => [created, ...prev]);
      setQuickClient(''); setQuickProduct(''); setQuickPrice('');
      setQuickSheet(false);
    } catch {
      setError('Error al crear el pedido.');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (order: ShopperOrder) => {
    setForm({
      client_name:         order.client_name,
      client_phone:        order.client_phone ?? '',
      product_description: order.product_description,
      quantity:            String(order.quantity),
      unit:                order.unit,
      delivery_date:       order.delivery_date ?? '',
      status:              order.status,
      quoted_price:        order.quoted_price != null ? String(order.quoted_price) : '',
      notes:               order.notes ?? '',
    });
    setEditSheet(order);
  };

  const handleSaveEdit = async () => {
    if (!editSheet) return;
    if (!form.client_name.trim() || !form.product_description.trim()) return;
    setSaving(true);
    try {
      const payload = {
        client_name:         form.client_name.trim(),
        client_phone:        form.client_phone.trim() || null,
        product_description: form.product_description.trim(),
        quantity:            Number(form.quantity) || 1,
        unit:                form.unit.trim() || 'unidades',
        delivery_date:       form.delivery_date || null,
        status:              form.status,
        quoted_price:        form.quoted_price !== '' ? Number(form.quoted_price) : null,
        notes:               form.notes.trim() || null,
      };
      const updated = await personalShopperService.update(editSheet.id, payload);
      setOrders(prev => prev.map(o => o.id === editSheet.id ? updated : o));
      setEditSheet(null);
    } catch {
      setError('Error al guardar los cambios.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este pedido?')) return;
    try {
      await personalShopperService.remove(id);
      setOrders(prev => prev.filter(o => o.id !== id));
      setEditSheet(null);
    } catch {
      setError('No se pudo eliminar el pedido.');
    }
  };

  const handleTrackingUpdate = (updated: ShopperOrder) => {
    setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
    setTrackingSheet(updated);
  };

  const handleSaveQuote = (result: CalcResult, productName: string) => {
    setClientSheet({ result, productName });
    setClientName(''); setClientPhone('');
  };

  const confirmSaveQuote = async () => {
    if (!clientSheet || !clientName.trim()) return;
    setSaving(true);
    try {
      const { result, productName } = clientSheet;
      const created = await personalShopperService.create({
        client_name:         clientName.trim(),
        client_phone:        clientPhone.trim() || null,
        product_description: productName,
        quantity:            1,
        unit:                'unidades',
        status:              'cotizado',
        quoted_price:        result.sale_price_gtq,
        calc: {
          product_price_usd: result.product_price_usd,
          tax_usd:           result.tax_usd,
          shipping_usd:      result.shipping_usd,
          total_cost_usd:    result.total_cost_usd,
          total_cost_gtq:    result.total_cost_gtq,
          profit_gtq:        result.profit_gtq,
          margin_pct:        result.margin_pct,
          exchange_rate:     result.exchange_rate,
          tax_rate:          result.tax_rate,
          weight_lbs:        result.weight_lbs,
          cost_per_lb:       result.cost_per_lb,
        },
      });
      setOrders(prev => [created, ...prev]);
      setClientSheet(null);
      setTab('pedidos');
    } catch {
      setError('No se pudo guardar la cotización.');
    } finally {
      setSaving(false);
    }
  };

  const statusCounts = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {} as Partial<Record<OrderStatus, number>>);

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || o.client_name.toLowerCase().includes(q)
      || o.product_description.toLowerCase().includes(q);
    return matchSearch && (filterStatus === 'todos' || o.status === filterStatus);
  });

  const activos      = orders.filter(o => o.status !== 'cancelado' && o.status !== 'entregado');
  const valorActivos = activos.reduce((s, o) => s + (o.quoted_price ?? 0), 0);
  const pendientes   = statusCounts.pendiente ?? 0;
  const enProceso    = statusCounts.en_proceso ?? 0;
  const entregados   = statusCounts.entregado ?? 0;

  return (
    <div className="min-h-screen bg-[#F2F2F7] dark:bg-black -m-4 sm:-m-6">
      <style>{`
        @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes fade-in  { from { opacity: 0; } to { opacity: 1; } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { scrollbar-width: none; }
      `}</style>

      <div className="max-w-2xl mx-auto pb-32">

        {/* ─────────── HEADER ─────────── */}
        <header className="px-5 pt-6 pb-3">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500
                            flex items-center justify-center shadow-lg shadow-pink-500/30">
              <ShoppingBag className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-[28px] font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
                Personal Shopper
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {activos.length === 0
                  ? 'Sin pedidos activos'
                  : `${activos.length} ${activos.length === 1 ? 'pedido activo' : 'pedidos activos'}`}
                {valorActivos > 0 && ` · ${fmt(valorActivos)}`}
              </p>
            </div>
          </div>
        </header>

        {/* ─────────── SEGMENTED CONTROL ─────────── */}
        <div className="px-5 mb-5">
          <div className="bg-gray-200/70 dark:bg-[#2C2C2E] backdrop-blur rounded-2xl p-1 flex gap-1">
            {([
              { key: 'pedidos',     label: 'Pedidos',     Icon: ShoppingBag },
              { key: 'calculadora', label: 'Calculadora', Icon: Calculator  },
            ] as const).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                            text-sm font-semibold transition-all active:scale-[0.98]
                            ${tab === key
                              ? 'bg-white dark:bg-[#3A3A3C] text-gray-900 dark:text-white shadow-sm'
                              : 'text-gray-600 dark:text-gray-400'}`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ─────────── TAB: CALCULADORA ─────────── */}
        {tab === 'calculadora' && (
          <div className="px-5">
            <ShopperCalculator onSaveQuote={handleSaveQuote} />
          </div>
        )}

        {/* ─────────── TAB: PEDIDOS ─────────── */}
        {tab === 'pedidos' && (
          <div className="space-y-5">

            {/* Stats grid */}
            {orders.length > 0 && (
              <div className="px-5 grid grid-cols-3 gap-2.5">
                <StatCard label="Pendientes" value={pendientes} Icon={Clock}       tint="amber" />
                <StatCard label="En proceso" value={enProceso}  Icon={ShoppingBag} tint="fuchsia" />
                <StatCard label="Entregados" value={entregados} Icon={Sparkles}    tint="emerald" />
              </div>
            )}

            {/* Search */}
            <div className="px-5">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="Buscar cliente o producto"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white dark:bg-[#1C1C1E] rounded-2xl text-sm
                             text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600
                             border-0 shadow-sm dark:shadow-none
                             focus:outline-none focus:ring-2 focus:ring-pink-400 dark:focus:ring-pink-500/60"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full
                               bg-gray-200 dark:bg-[#3A3A3C] flex items-center justify-center
                               active:scale-95 transition-all"
                  >
                    <X className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
                  </button>
                )}
              </div>
            </div>

            {/* Filter chips */}
            <div className="overflow-x-auto no-scrollbar">
              <div className="flex gap-2 px-5 pb-1 w-max">
                <FilterChip
                  label="Todos"
                  count={orders.length}
                  active={filterStatus === 'todos'}
                  onClick={() => setFilterStatus('todos')}
                />
                {ALL_STATUSES.map(s => (
                  <FilterChip
                    key={s}
                    label={STATUS_LABELS[s]}
                    count={statusCounts[s] ?? 0}
                    active={filterStatus === s}
                    status={s}
                    onClick={() => setFilterStatus(filterStatus === s ? 'todos' : s)}
                  />
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="px-5">
                <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20
                                rounded-2xl px-4 py-3 flex items-center gap-3 text-sm
                                text-rose-700 dark:text-rose-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{error}</span>
                  <button
                    onClick={() => setError(null)}
                    className="w-7 h-7 rounded-full bg-rose-100 dark:bg-rose-500/20
                               flex items-center justify-center active:scale-95 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Lista de pedidos */}
            <div className="px-5">
              {loading ? (
                <div className="flex flex-col items-center py-20 text-gray-400 dark:text-gray-600">
                  <Loader2 className="w-8 h-8 animate-spin text-pink-500 mb-3" />
                  <p className="text-sm">Cargando pedidos…</p>
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState hasOrders={orders.length > 0} onCreate={() => setQuickSheet(true)} />
              ) : (
                <div className="space-y-2.5">
                  {filtered.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onStatusClick={() => setStatusSheet(order)}
                      onCardClick={() => openEdit(order)}
                      onTrackingClick={() => setTrackingSheet(order)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─────────── FAB ─────────── */}
        {tab === 'pedidos' && (
          <button
            onClick={() => setQuickSheet(true)}
            className="fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full lg:bottom-6
                       bg-gradient-to-br from-pink-500 to-rose-600
                       shadow-xl shadow-pink-500/40 dark:shadow-pink-500/20
                       flex items-center justify-center
                       active:scale-90 hover:shadow-pink-500/60 transition-all"
            aria-label="Nuevo pedido"
          >
            <Plus className="w-7 h-7 text-white" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* ═══════════ BOTTOM SHEET: SELECCIÓN DE ESTADO ═══════════ */}
      <BottomSheet open={!!statusSheet} onClose={() => setStatusSheet(null)} title="Cambiar estado">
        {statusSheet && (
          <>
            <div className="bg-gray-100 dark:bg-[#2C2C2E] rounded-2xl p-4 mb-4 flex items-center gap-3">
              <Avatar name={statusSheet.client_name} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 dark:text-white truncate">{statusSheet.client_name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{statusSheet.product_description}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {ALL_STATUSES.map(s => {
                const t = STATUS_THEME[s];
                const Icon = STATUS_ICONS[s];
                const isCurrent = statusSheet.status === s;
                return (
                  <button
                    key={s}
                    onClick={() => handleQuickStatus(statusSheet.id, s)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl
                                transition-all active:scale-[0.98]
                                ${isCurrent
                                  ? `${t.bg} ${t.darkBg} ring-2 ${t.ring} ${t.darkRing}`
                                  : 'bg-gray-50 dark:bg-[#2C2C2E] hover:bg-gray-100 dark:hover:bg-[#3A3A3C]'}`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center
                                     ${t.bg} ${t.darkBg}`}>
                      <Icon className={`w-5 h-5 ${t.text} ${t.darkText}`} />
                    </div>
                    <span className={`flex-1 text-left font-semibold
                                      ${isCurrent
                                        ? `${t.text} ${t.darkText}`
                                        : 'text-gray-800 dark:text-gray-200'}`}>
                      {STATUS_LABELS[s]}
                    </span>
                    {isCurrent && (
                      <div className={`w-6 h-6 rounded-full ${t.dot} flex items-center justify-center`}>
                        <Check className="w-4 h-4 text-white" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </BottomSheet>

      {/* ═══════════ BOTTOM SHEET: NUEVO PEDIDO RÁPIDO ═══════════ */}
      <BottomSheet open={quickSheet} onClose={() => setQuickSheet(false)} title="Nuevo pedido">
        <div className="space-y-4">
          <SheetInput
            label="Nombre del cliente"
            required
            value={quickClient}
            onChange={setQuickClient}
            placeholder="Ej. María García"
            autoFocus
            onEnter={handleQuickCreate}
          />
          <SheetInput
            label="¿Qué necesita?"
            required
            value={quickProduct}
            onChange={setQuickProduct}
            placeholder="Ej. Pastel de chocolate"
            onEnter={handleQuickCreate}
          />
          <SheetInput
            label="Precio cotizado (opcional)"
            value={quickPrice}
            onChange={setQuickPrice}
            type="number"
            placeholder="Q 0.00"
            onEnter={handleQuickCreate}
          />
          <p className="text-xs text-gray-400 dark:text-gray-600 px-1">
            Los detalles adicionales (teléfono, fecha, notas) se completan editando el pedido.
          </p>
          <button
            onClick={handleQuickCreate}
            disabled={saving || !quickClient.trim() || !quickProduct.trim()}
            className="w-full py-4 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600
                       text-white font-semibold shadow-lg shadow-pink-500/30
                       active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed
                       transition-all flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            Crear pedido
          </button>
        </div>
      </BottomSheet>

      {/* ═══════════ BOTTOM SHEET: EDITAR PEDIDO ═══════════ */}
      <BottomSheet open={!!editSheet} onClose={() => setEditSheet(null)} title="Editar pedido">
        {editSheet && (
          <div className="space-y-4">
            <div className="bg-gray-100 dark:bg-[#2C2C2E] rounded-2xl p-4 flex items-center gap-3">
              <Avatar name={form.client_name || editSheet.client_name} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 dark:text-white truncate">
                  {form.client_name || 'Sin nombre'}
                </p>
                <StatusPill status={form.status} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SheetInput
                label="Cliente"
                required
                value={form.client_name}
                onChange={v => setForm(f => ({ ...f, client_name: v }))}
              />
              <SheetInput
                label="Teléfono"
                value={form.client_phone}
                onChange={v => setForm(f => ({ ...f, client_phone: v }))}
                placeholder="5555-1234"
              />
            </div>

            <SheetTextarea
              label="Descripción del pedido"
              required
              value={form.product_description}
              onChange={v => setForm(f => ({ ...f, product_description: v }))}
            />

            <div className="grid grid-cols-2 gap-3">
              <SheetInput
                label="Cantidad"
                type="number"
                value={form.quantity}
                onChange={v => setForm(f => ({ ...f, quantity: v }))}
              />
              <SheetInput
                label="Unidad"
                value={form.unit}
                onChange={v => setForm(f => ({ ...f, unit: v }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SheetInput
                label="Fecha entrega"
                type="date"
                value={form.delivery_date}
                onChange={v => setForm(f => ({ ...f, delivery_date: v }))}
              />
              <SheetInput
                label="Precio (Q)"
                type="number"
                value={form.quoted_price}
                onChange={v => setForm(f => ({ ...f, quoted_price: v }))}
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-500
                                 mb-2 px-1 uppercase tracking-wide">
                Estado
              </label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_STATUSES.map(s => {
                  const t = STATUS_THEME[s];
                  const isActive = form.status === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setForm(f => ({ ...f, status: s }))}
                      className={`px-3 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.97]
                                  ${isActive
                                    ? `${t.bg} ${t.text} ${t.darkBg} ${t.darkText} ring-2 ${t.ring} ${t.darkRing}`
                                    : 'bg-gray-100 dark:bg-[#2C2C2E] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#3A3A3C]'}`}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  );
                })}
              </div>
            </div>

            <SheetTextarea
              label="Notas"
              value={form.notes}
              onChange={v => setForm(f => ({ ...f, notes: v }))}
              placeholder="Alergias, preferencias…"
            />

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => handleDelete(editSheet.id)}
                className="px-4 py-3.5 rounded-2xl bg-rose-50 dark:bg-rose-500/10
                           text-rose-600 dark:text-rose-400 font-semibold
                           active:scale-[0.97] transition-all"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving || !form.client_name.trim() || !form.product_description.trim()}
                className="flex-1 py-3.5 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600
                           text-white font-semibold shadow-lg shadow-pink-500/30
                           active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed
                           transition-all flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-5 h-5 animate-spin" />}
                Guardar cambios
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* ═══════════ BOTTOM SHEET: CLIENTE PARA COTIZACIÓN ═══════════ */}
      {/* ═══════════ BOTTOM SHEET: TRACKING ═══════════ */}
      <BottomSheet
        open={!!trackingSheet}
        onClose={() => setTrackingSheet(null)}
        title={trackingSheet ? `Rastreo — ${trackingSheet.client_name}` : 'Rastreo'}
      >
        {trackingSheet && (
          <div className="space-y-4">
            {/* Product summary */}
            <div className="bg-gray-50 dark:bg-[#2C2C2E] rounded-2xl px-4 py-3 flex items-center gap-3">
              <Avatar name={trackingSheet.client_name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                  {trackingSheet.product_description}
                </p>
                {trackingSheet.quoted_price != null && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {fmt(trackingSheet.quoted_price)}
                  </p>
                )}
              </div>
            </div>

            <TrackingTimeline
              order={trackingSheet}
              onUpdate={handleTrackingUpdate}
            />
          </div>
        )}
      </BottomSheet>

      {/* ═══════════ BOTTOM SHEET: CLIENTE PARA COTIZACIÓN ═══════════ */}
      <BottomSheet open={!!clientSheet} onClose={() => setClientSheet(null)} title="Guardar cotización">
        {clientSheet && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-pink-50 to-rose-50
                            dark:from-pink-500/10 dark:to-rose-500/10
                            border border-pink-100 dark:border-pink-500/20
                            rounded-2xl p-4 space-y-2">
              <p className="font-semibold text-gray-900 dark:text-white">{clientSheet.productName}</p>
              <div className="flex items-baseline gap-1">
                <TrendingUp className="w-4 h-4 text-pink-500" />
                <span className="text-sm text-gray-500 dark:text-gray-400">Precio cotizado:</span>
                <span className="text-lg font-bold text-pink-600 dark:text-pink-400">
                  {fmt(clientSheet.result.sale_price_gtq)}
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Margen: <strong>{clientSheet.result.margin_pct.toFixed(1)}%</strong> ·
                Ganancia: <strong className="text-emerald-600 dark:text-emerald-400">
                  {fmt(clientSheet.result.profit_gtq)}
                </strong>
              </div>
            </div>
            <SheetInput
              label="Nombre del cliente"
              required
              value={clientName}
              onChange={setClientName}
              placeholder="Ej. María García"
              autoFocus
              onEnter={confirmSaveQuote}
            />
            <SheetInput
              label="Teléfono (opcional)"
              value={clientPhone}
              onChange={setClientPhone}
              placeholder="5555-1234"
              onEnter={confirmSaveQuote}
            />
            <button
              onClick={confirmSaveQuote}
              disabled={saving || !clientName.trim()}
              className="w-full py-4 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600
                         text-white font-semibold shadow-lg shadow-pink-500/30
                         active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed
                         transition-all flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              Guardar cotización
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTES
// ═══════════════════════════════════════════════════════════════════════════════

function StatCard({
  label, value, Icon, tint,
}: { label: string; value: number; Icon: typeof Clock; tint: 'amber' | 'fuchsia' | 'emerald' }) {
  const tints = {
    amber:   { bg: 'bg-amber-100 dark:bg-amber-500/15',   text: 'text-amber-700 dark:text-amber-400'   },
    fuchsia: { bg: 'bg-fuchsia-100 dark:bg-fuchsia-500/15', text: 'text-fuchsia-700 dark:text-fuchsia-400' },
    emerald: { bg: 'bg-emerald-100 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-400' },
  };
  const t = tints[tint];
  return (
    <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl p-3 shadow-sm dark:shadow-none">
      <div className={`w-8 h-8 rounded-lg ${t.bg} flex items-center justify-center mb-2`}>
        <Icon className={`w-4 h-4 ${t.text}`} />
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function FilterChip({
  label, count, active, onClick, status,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  status?: OrderStatus;
}) {
  const t = status ? STATUS_THEME[status] : null;

  const activeClass = t
    ? `${t.bg} ${t.text} ${t.darkBg} ${t.darkText} ring-2 ${t.ring} ${t.darkRing}`
    : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900';
  const inactiveClass = 'bg-white dark:bg-[#1C1C1E] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#2C2C2E]';

  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold shadow-sm dark:shadow-none
                  transition-all active:scale-[0.96] flex items-center gap-1.5
                  ${active ? activeClass : inactiveClass}`}
    >
      {label}
      {count > 0 && (
        <span className={`text-xs px-1.5 py-0.5 rounded-full
                          ${active ? 'bg-white/30 dark:bg-black/20' : 'bg-gray-100 dark:bg-[#2C2C2E]'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function OrderCard({
  order, onStatusClick, onCardClick, onTrackingClick,
}: {
  order: ShopperOrder;
  onStatusClick: () => void;
  onCardClick: () => void;
  onTrackingClick: () => void;
}) {
  const hasTracking = order.tracking_status !== null;
  const [copied, setCopied] = useState(false);

  const copyTrackingLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!order.tracking_token) return;
    const url = `${window.location.origin}/tracking/${order.tracking_token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      onClick={onCardClick}
      className="bg-white dark:bg-[#1C1C1E] rounded-3xl p-4 shadow-sm dark:shadow-none
                 active:scale-[0.99] active:bg-gray-50 dark:active:bg-[#2C2C2E]
                 transition-all cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <Avatar name={order.client_name} size={48} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white truncate">{order.client_name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">{order.product_description}</p>
            </div>
            {order.quoted_price != null && (
              <div className="text-right shrink-0">
                <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight tracking-tight">
                  {fmt(order.quoted_price)}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-600">
                  {order.quantity} {order.unit}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <div onClick={e => { e.stopPropagation(); onStatusClick(); }}>
              <StatusPill status={order.status} onClick={onStatusClick} />
            </div>
            {order.client_phone && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-500">
                <Phone className="w-3 h-3" />
                {order.client_phone}
              </span>
            )}
            {order.delivery_date && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-500">
                <Calendar className="w-3 h-3" />
                {order.delivery_date}
              </span>
            )}
            {/* Tracking + copy-link buttons */}
            <div className="ml-auto flex items-center gap-1.5">
              {order.tracking_token && (
                <button
                  onClick={copyTrackingLink}
                  className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full transition-all
                              ${copied
                                ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500'}`}
                >
                  {copied ? <Check className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
                  {copied ? 'Copiado' : 'Link'}
                </button>
              )}
              <div onClick={e => { e.stopPropagation(); onTrackingClick(); }}>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full
                                  ${hasTracking
                                    ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400'
                                    : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-600'}`}>
                  ✈️ Rastrear
                </span>
              </div>
            </div>
          </div>

          {/* Mini tracking bar */}
          <TrackingMiniBar status={order.tracking_status} />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ hasOrders, onCreate }: { hasOrders: boolean; onCreate: () => void }) {
  return (
    <div className="bg-white dark:bg-[#1C1C1E] rounded-3xl p-10 text-center">
      <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-pink-100 to-rose-200
                      dark:from-pink-500/20 dark:to-rose-500/20 flex items-center justify-center">
        <ShoppingBag className="w-10 h-10 text-pink-500" />
      </div>
      <p className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
        {hasOrders ? 'Sin resultados' : 'Aún no hay pedidos'}
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
        {hasOrders
          ? 'Prueba con otro filtro o búsqueda'
          : 'Crea tu primer pedido personalizado'}
      </p>
      {!hasOrders && (
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl
                     bg-gradient-to-br from-pink-500 to-rose-600 text-white font-semibold
                     shadow-lg shadow-pink-500/30 active:scale-[0.97] transition-all"
        >
          <Plus className="w-4 h-4" />
          Crear primer pedido
        </button>
      )}
    </div>
  );
}

function SheetInput({
  label, value, onChange, required, placeholder, type = 'text', autoFocus, onEnter,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-500
                         mb-1.5 px-1 uppercase tracking-wide">
        {label} {required && <span className="text-pink-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onKeyDown={e => onEnter && e.key === 'Enter' && onEnter()}
        className="w-full px-4 py-3 bg-gray-100 dark:bg-[#2C2C2E] rounded-2xl
                   text-sm font-medium text-gray-900 dark:text-white
                   placeholder:text-gray-400 dark:placeholder:text-gray-600 border-0
                   focus:outline-none focus:ring-2 focus:ring-pink-400 dark:focus:ring-pink-500/60
                   focus:bg-white dark:focus:bg-[#3A3A3C]
                   [color-scheme:light] dark:[color-scheme:dark]"
      />
    </div>
  );
}

function SheetTextarea({
  label, value, onChange, required, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-500
                         mb-1.5 px-1 uppercase tracking-wide">
        {label} {required && <span className="text-pink-500">*</span>}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full px-4 py-3 bg-gray-100 dark:bg-[#2C2C2E] rounded-2xl
                   text-sm font-medium text-gray-900 dark:text-white
                   placeholder:text-gray-400 dark:placeholder:text-gray-600 border-0 resize-none
                   focus:outline-none focus:ring-2 focus:ring-pink-400 dark:focus:ring-pink-500/60
                   focus:bg-white dark:focus:bg-[#3A3A3C]"
      />
    </div>
  );
}
