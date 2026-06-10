import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Loader2, AlertTriangle,
  ShoppingBag, ClipboardList, CheckCircle2, Clock, XCircle,
  Search, Calculator, X, Check, Phone, Calendar, Sparkles, TrendingUp, Share2, Users,
} from 'lucide-react';
import type { AppProps } from '../index';
import { ShopperCalculator, type CalcResult } from './ShopperCalculator';
import { ClientesPanel } from './ClientesPanel';
import { TrackingTimeline, TrackingMiniBar } from './TrackingTimeline';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ShareSheet } from '@/components/ui/ShareSheet';
import { Avatar } from '@/components/ui/Avatar';
import { MoneyKpi } from '@/components/ui/MoneyKpi';
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

// Acentos intencionales por estado (informativos) — dark-mode aware
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

type Tab = 'pedidos' | 'calculadora' | 'clientes';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTES AUXILIARES
// ═══════════════════════════════════════════════════════════════════════════════

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

// CTA de marca — gradiente iris del tenant
function IrisButton({
  onClick, disabled, children,
}: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full h-[52px] rounded-full font-bold text-base flex items-center justify-center gap-2.5
                 shadow-lg active:scale-[0.97] transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
    >
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

export function PersonalShopperApp(_props: AppProps) {
  const [tab, setTab]                       = useState<Tab>('calculadora');
  const [orders, setOrders]                 = useState<ShopperOrder[]>([]);
  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  const [statusSheet, setStatusSheet]       = useState<ShopperOrder | null>(null);
  const [quickSheet, setQuickSheet]         = useState(false);
  const [editSheet, setEditSheet]           = useState<ShopperOrder | null>(null);
  const [clientSheet, setClientSheet]       = useState<{ result: CalcResult } | null>(null);
  const [trackingSheet, setTrackingSheet]   = useState<ShopperOrder | null>(null);

  const [form, setForm]                     = useState({ ...EMPTY_FORM });
  const [quickClient, setQuickClient]       = useState('');
  const [quickProduct, setQuickProduct]     = useState('');
  const [quickPrice, setQuickPrice]         = useState('');
  const [clientName, setClientName]         = useState('');
  const [clientPhone, setClientPhone]       = useState('');
  const [productNameInput, setProductNameInput] = useState('');

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

  const handleSaveQuote = (result: CalcResult) => {
    setClientSheet({ result });
    setProductNameInput(''); setClientName(''); setClientPhone('');
  };

  const confirmSaveQuote = async () => {
    if (!clientSheet || !clientName.trim() || !productNameInput.trim()) return;
    setSaving(true);
    try {
      const { result } = clientSheet;
      const created = await personalShopperService.create({
        client_name:         clientName.trim(),
        client_phone:        clientPhone.trim() || null,
        product_description: productNameInput.trim(),
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

  const invertido = activos.reduce((s, o) => s + (o.calc_total_cost_gtq ?? 0), 0);
  const ganancia  = activos.reduce((s, o) => {
    if (o.calc_profit_gtq != null) return s + o.calc_profit_gtq;
    if (o.quoted_price != null && o.calc_total_cost_gtq != null)
      return s + (o.quoted_price - o.calc_total_cost_gtq);
    return s;
  }, 0);
  const margenAgregado = valorActivos > 0 ? (ganancia / valorActivos) * 100 : 0;

  return (
    <>
      <div className="flex flex-col gap-5 pb-6 w-full max-w-5xl mx-auto">

        {/* ─────────── HEADER + TABS (una sola fila en desktop) ─────────── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--nodo-iris)', boxShadow: 'var(--nodo-shadow-fab)' }}
            >
              <ShoppingBag className="w-6 h-6" style={{ color: 'var(--nodo-on-iris)' }} />
            </div>
            <div>
              <h1 className="nodo-module-title">Personal Shopper</h1>
              <p className="nodo-module-subtitle">
                {activos.length === 0
                  ? 'Sin pedidos activos'
                  : `${activos.length} ${activos.length === 1 ? 'pedido activo' : 'pedidos activos'}`}
                {valorActivos > 0 && ` · ${fmt(valorActivos)}`}
              </p>
            </div>
          </div>
          <SegmentedControl
            options={[
              { value: 'calculadora', label: 'Calculadora', icon: <Calculator size={14} /> },
              { value: 'pedidos',     label: 'Pedidos',     icon: <ShoppingBag size={14} /> },
              { value: 'clientes',    label: 'Clientes',    icon: <Users size={14} /> },
            ]}
            value={tab}
            onChange={v => setTab(v as Tab)}
            size="sm"
            className="sm:w-[340px] shrink-0"
          />
        </div>

        {/* ─────────── TAB: CALCULADORA ─────────── */}
        {tab === 'calculadora' && (
          <ShopperCalculator onSaveQuote={handleSaveQuote} />
        )}

        {/* ─────────── TAB: PEDIDOS ─────────── */}
        {tab === 'pedidos' && (
          <>
          {/* ── KPIs financieros (pedidos activos) ── */}
          {orders.length > 0 && (
            <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
              <MoneyKpi
                label="Invertido"
                value={invertido}
                sub={`${activos.length} ${activos.length === 1 ? 'pedido activo' : 'pedidos activos'}`}
                chart="bars"
              />
              <MoneyKpi
                label="Pendiente"
                value={valorActivos}
                sub="por cobrar"
                chart="area"
              />
              <MoneyKpi
                label="Ganancia"
                value={ganancia}
                sub={ganancia > 0 ? `margen ${margenAgregado.toFixed(0)}%` : 'proyectada'}
                chart="area"
                trend={[5, 8, 7, 11, 10, 14, 15, 18]}
              />
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5 items-start">

            {/* ── Panel de control (sticky en desktop) ── */}
            <div className="nodo-card p-4 flex flex-col gap-4 xl:sticky xl:top-4">

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-nodo-dim pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar cliente o producto"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="nodo-input"
                  style={{ paddingLeft: '2.75rem', paddingRight: '2.75rem' }}
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-nodo-raised
                               flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <X className="w-3.5 h-3.5 text-nodo-sub" />
                  </button>
                )}
              </div>

              {/* Filter chips — scroll horizontal en mobile, wrap en desktop */}
              <div className="overflow-x-auto scrollbar-none -mx-1 xl:mx-0 xl:overflow-visible">
                <div className="flex gap-2 px-1 pb-1 w-max xl:w-auto xl:flex-wrap xl:px-0">
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

              {/* Nuevo pedido — botón visible en desktop (el FAB es de mobile) */}
              <button
                onClick={() => setQuickSheet(true)}
                className="hidden xl:flex w-full h-12 rounded-full font-bold text-sm items-center justify-center gap-2
                           shadow-lg active:scale-[0.97] transition-transform"
                style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
              >
                <Plus className="w-4 h-4" strokeWidth={2.5} />
                Nuevo pedido
              </button>
            </div>

            {/* ── Lista de pedidos ── */}
            <div className="flex flex-col gap-4 min-w-0">

              {/* Error */}
              {error && (
                <div className="bg-nodo-danger-bg border border-nodo-danger-bd rounded-2xl px-4 py-3
                                flex items-center gap-3 text-sm text-nodo-danger-tx">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="flex-1 font-semibold">{error}</span>
                  <button
                    onClick={() => setError(null)}
                    className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {loading ? (
                <div className="nodo-spinner-container flex-col gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
                  <p className="text-sm text-nodo-dim">Cargando pedidos…</p>
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState hasOrders={orders.length > 0} onCreate={() => setQuickSheet(true)} />
              ) : (
                <>
                  <div className="flex items-baseline justify-between px-1">
                    <p className="nodo-section-label !mb-0">
                      {filterStatus === 'todos' ? 'Todos los pedidos' : STATUS_LABELS[filterStatus]}
                    </p>
                    <span className="text-xs font-bold text-nodo-dim tabular-nums">
                      {filtered.length} {filtered.length === 1 ? 'pedido' : 'pedidos'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2.5">
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
                </>
              )}
            </div>
          </div>
          </>
        )}

        {/* ─────────── TAB: CLIENTES ─────────── */}
        {tab === 'clientes' && (
          <ClientesPanel
            orders={orders}
            onNewOrder={(clientName) => {
              setQuickClient(clientName);
              setQuickSheet(true);
            }}
            onOpenOrder={openEdit}
          />
        )}

        {/* ─────────── FAB ─────────── */}
        {tab === 'pedidos' && (
          <button
            onClick={() => setQuickSheet(true)}
            className="fixed bottom-24 right-5 z-40 w-14 h-14 rounded-full xl:hidden
                       flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: 'var(--nodo-iris)', boxShadow: 'var(--nodo-shadow-fab)' }}
            aria-label="Nuevo pedido"
          >
            <Plus className="w-7 h-7" style={{ color: 'var(--nodo-on-iris)' }} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* ═══════════ BOTTOM SHEET: SELECCIÓN DE ESTADO ═══════════ */}
      <BottomSheet open={!!statusSheet} onClose={() => setStatusSheet(null)} title="Cambiar estado">
        {statusSheet && (
          <>
            <div className="bg-nodo-inset rounded-2xl p-4 mb-4 flex items-center gap-3">
              <Avatar name={statusSheet.client_name} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-nodo-ink truncate">{statusSheet.client_name}</p>
                <p className="text-sm text-nodo-sub truncate">{statusSheet.product_description}</p>
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
                                  : 'bg-nodo-inset hover:bg-nodo-raised'}`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center
                                     ${t.bg} ${t.darkBg}`}>
                      <Icon className={`w-5 h-5 ${t.text} ${t.darkText}`} />
                    </div>
                    <span className={`flex-1 text-left font-semibold
                                      ${isCurrent ? `${t.text} ${t.darkText}` : 'text-nodo-ink'}`}>
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
      <BottomSheet
        open={quickSheet}
        onClose={() => setQuickSheet(false)}
        title="Nuevo pedido"
        footer={
          <IrisButton
            onClick={handleQuickCreate}
            disabled={saving || !quickClient.trim() || !quickProduct.trim()}
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            Crear pedido
          </IrisButton>
        }
      >
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
        <p className="text-xs text-nodo-dim px-1">
          Los detalles adicionales (teléfono, fecha, notas) se completan editando el pedido.
        </p>
      </BottomSheet>

      {/* ═══════════ BOTTOM SHEET: EDITAR PEDIDO ═══════════ */}
      <BottomSheet
        open={!!editSheet}
        onClose={() => setEditSheet(null)}
        title="Editar pedido"
        footer={editSheet ? (
          <div className="flex gap-2">
            <button
              onClick={() => handleDelete(editSheet.id)}
              className="w-[52px] h-[52px] shrink-0 rounded-full bg-nodo-danger-bg border border-nodo-danger-bd
                         text-nodo-danger-tx flex items-center justify-center
                         active:scale-[0.95] transition-transform"
              aria-label="Eliminar pedido"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <IrisButton
              onClick={handleSaveEdit}
              disabled={saving || !form.client_name.trim() || !form.product_description.trim()}
            >
              {saving && <Loader2 className="w-5 h-5 animate-spin" />}
              Guardar cambios
            </IrisButton>
          </div>
        ) : undefined}
      >
        {editSheet && (
          <>
            <div className="bg-nodo-inset rounded-2xl p-4 flex items-center gap-3">
              <Avatar name={form.client_name || editSheet.client_name} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-nodo-ink truncate">
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
              <label className="nodo-label">Estado</label>
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
                                    : 'bg-nodo-inset text-nodo-sub hover:bg-nodo-raised'}`}
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
          </>
        )}
      </BottomSheet>

      {/* ═══════════ BOTTOM SHEET: TRACKING ═══════════ */}
      <BottomSheet
        open={!!trackingSheet}
        onClose={() => setTrackingSheet(null)}
        title={trackingSheet ? `Rastreo — ${trackingSheet.client_name}` : 'Rastreo'}
      >
        {trackingSheet && (
          <>
            <div className="bg-nodo-inset rounded-2xl px-4 py-3 flex items-center gap-3">
              <Avatar name={trackingSheet.client_name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-nodo-ink text-sm truncate">
                  {trackingSheet.product_description}
                </p>
                {trackingSheet.quoted_price != null && (
                  <p className="text-xs text-nodo-sub mt-0.5">
                    {fmt(trackingSheet.quoted_price)}
                  </p>
                )}
              </div>
            </div>

            <TrackingTimeline
              order={trackingSheet}
              onUpdate={handleTrackingUpdate}
            />
          </>
        )}
      </BottomSheet>

      {/* ═══════════ BOTTOM SHEET: CLIENTE PARA COTIZACIÓN ═══════════ */}
      <BottomSheet
        open={!!clientSheet}
        onClose={() => setClientSheet(null)}
        title="Guardar cotización"
        footer={
          <IrisButton
            onClick={confirmSaveQuote}
            disabled={saving || !clientName.trim() || !productNameInput.trim()}
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            Guardar cotización
          </IrisButton>
        }
      >
        {clientSheet && (
          <>
            <div className="rounded-2xl p-4 space-y-2 border border-nodo-line"
              style={{ background: 'var(--nodo-iris-soft)' }}>
              <div className="flex items-baseline gap-1.5">
                <TrendingUp className="w-4 h-4 text-nodo-sub" />
                <span className="text-sm text-nodo-sub">Precio cotizado:</span>
                <span className="text-lg font-black text-nodo-ink tabular-nums">
                  {fmt(clientSheet.result.sale_price_gtq)}
                </span>
              </div>
              <div className="text-xs text-nodo-sub">
                Margen: <strong>{clientSheet.result.margin_pct.toFixed(1)}%</strong> ·
                Ganancia: <strong className="text-nodo-success-tx">
                  {fmt(clientSheet.result.profit_gtq)}
                </strong>
              </div>
            </div>
            <SheetInput
              label="Producto"
              required
              value={productNameInput}
              onChange={setProductNameInput}
              placeholder="Ej. Air Jordan 1 Retro"
              autoFocus
              onEnter={confirmSaveQuote}
            />
            <SheetInput
              label="Nombre del cliente"
              required
              value={clientName}
              onChange={setClientName}
              placeholder="Ej. María García"
              onEnter={confirmSaveQuote}
            />
            <SheetInput
              label="Teléfono (opcional)"
              value={clientPhone}
              onChange={setClientPhone}
              placeholder="5555-1234"
              onEnter={confirmSaveQuote}
            />
          </>
        )}
      </BottomSheet>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTES
// ═══════════════════════════════════════════════════════════════════════════════

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
    : 'bg-nodo-ink text-nodo-canvas';
  const inactiveClass = 'bg-nodo-inset text-nodo-sub hover:bg-nodo-raised';

  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold
                  transition-all active:scale-[0.96] flex items-center gap-1.5
                  ${active ? activeClass : inactiveClass}`}
    >
      {label}
      {count > 0 && (
        <span className={`text-xs px-1.5 py-0.5 rounded-full tabular-nums
                          ${active ? 'bg-white/30 dark:bg-black/20' : 'bg-nodo-inset'}`}>
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
  const [showShare, setShowShare] = useState(false);
  const trackingUrl = `${window.location.origin}/tracking/${order.tracking_token}`;

  return (
    <>
    <div
      onClick={onCardClick}
      className="nodo-card p-4 cursor-pointer transition-all active:scale-[0.99]
                 hover:border-nodo-line-s hover:bg-nodo-raised/40"
    >
      <div className="flex items-start gap-3">
        <Avatar name={order.client_name} size={48} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-nodo-ink truncate">{order.client_name}</p>
              <p className="text-sm text-nodo-sub truncate mt-0.5">{order.product_description}</p>
            </div>
            {order.quoted_price != null && (
              <div className="text-right shrink-0">
                <p className="text-lg font-black text-nodo-ink leading-tight tracking-tight tabular-nums">
                  {fmt(order.quoted_price)}
                </p>
                <p className="text-xs text-nodo-dim">
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
              <span className="inline-flex items-center gap-1 text-xs text-nodo-dim">
                <Phone className="w-3 h-3" />
                {order.client_phone}
              </span>
            )}
            {order.delivery_date && (
              <span className="inline-flex items-center gap-1 text-xs text-nodo-dim">
                <Calendar className="w-3 h-3" />
                {order.delivery_date}
              </span>
            )}
            {/* Compartir + tracking */}
            <div className="ml-auto flex items-center gap-1.5">
              {order.tracking_token && (
                <button
                  onClick={e => { e.stopPropagation(); setShowShare(true); }}
                  title="Compartir link de tracking"
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full
                             bg-nodo-inset text-nodo-dim hover:text-nodo-ink hover:bg-nodo-raised
                             active:scale-95 transition-all"
                >
                  <Share2 className="w-3 h-3" />
                  Compartir
                </button>
              )}
              <div onClick={e => { e.stopPropagation(); onTrackingClick(); }}>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full cursor-pointer
                                  ${hasTracking
                                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                    : 'bg-nodo-inset text-nodo-dim'}`}>
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

    {order.tracking_token && (
      <ShareSheet
        open={showShare}
        onClose={() => setShowShare(false)}
        url={trackingUrl}
        productName={order.product_description}
        clienteName={order.client_name}
        clientePhone={order.client_phone}
      />
    )}
    </>
  );
}

function EmptyState({ hasOrders, onCreate }: { hasOrders: boolean; onCreate: () => void }) {
  return (
    <div className="nodo-card p-10 text-center">
      <div className="w-20 h-20 mx-auto mb-4 rounded-3xl flex items-center justify-center"
        style={{ background: 'var(--nodo-iris-soft)' }}>
        <ShoppingBag className="w-10 h-10 text-nodo-sub" />
      </div>
      <p className="text-lg font-bold text-nodo-ink mb-1">
        {hasOrders ? 'Sin resultados' : 'Aún no hay pedidos'}
      </p>
      <p className="text-sm text-nodo-sub mb-5">
        {hasOrders
          ? 'Prueba con otro filtro o búsqueda'
          : 'Crea tu primer pedido personalizado'}
      </p>
      {!hasOrders && (
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-2 px-5 h-12 rounded-full font-bold text-sm
                     shadow-lg active:scale-[0.97] transition-transform"
          style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
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
      <label className="nodo-label">
        {label} {required && <span className="text-nodo-danger-tx">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onKeyDown={e => onEnter && e.key === 'Enter' && onEnter()}
        className={type === 'number' ? 'nodo-input-number' : 'nodo-input'}
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
      <label className="nodo-label">
        {label} {required && <span className="text-nodo-danger-tx">*</span>}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="nodo-textarea"
      />
    </div>
  );
}
