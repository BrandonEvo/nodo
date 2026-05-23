import { useState, useEffect, useCallback, useMemo } from 'react';
import { haptic } from '@/utils/haptic';
import {
  Search, Plus, Minus, AlertTriangle, ChevronLeft, ChevronRight,
  Check, Warehouse, Loader2, X,
} from 'lucide-react';
import type { AppProps } from '../index';
import { bodegaService, type InventoryItem, type PriceHistoryEntry, type StockMovementEntry } from '@/services/bodega.service';
import { BottomSheet } from '@/components/ui/BottomSheet';

// ── Tipos internos ─────────────────────────────────────────────────────────
type SheetView = 'detail' | 'entrada' | 'ajuste' | 'nuevo';

interface SheetState {
  view: SheetView;
  item?: InventoryItem;
}

// ── Barra de progreso de stock ──────────────────────────────────────────────
function StockBar({ item }: { item: InventoryItem }) {
  const isLow = item.current_stock < item.minimum_stock;
  const cap   = Math.max(item.current_stock, item.minimum_stock * 3, 1);
  const pct   = Math.min(100, (item.current_stock / cap) * 100);
  return (
    <div className="h-1.5 bg-nodo-raised rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${isLow ? 'bg-red-500' : 'bg-emerald-400'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Componente principal ────────────────────────────────────────────────────
const UNITS = ['kg', 'g', 'L', 'ml', 'unidad', 'lb'];

export function BodegaApp(_props: AppProps) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');
  const [showOnlyLow, setShowOnlyLow] = useState(false);
  const [sheet, setSheet]         = useState<SheetState | null>(null);
  const [qty, setQty]             = useState('');
  const [unitCost, setUnitCost]   = useState('');
  const [showPrice, setShowPrice] = useState(false);
  const [newItem, setNewItem]     = useState({ name: '', unit: 'kg', minimum_stock: '', current_stock: '', category: '' });
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [movements, setMovements] = useState<StockMovementEntry[]>([]);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setInventory(await bodegaService.listItems()); }
    catch { setError('Error al cargar inventario'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const lowStock = useMemo(() => inventory.filter(i => i.current_stock < i.minimum_stock), [inventory]);

  const filtered = useMemo(() => {
    let list = inventory;
    if (search)      list = list.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    if (showOnlyLow) list = list.filter(i => i.current_stock < i.minimum_stock);
    return list;
  }, [inventory, search, showOnlyLow]);

  const grouped = useMemo(() => {
    if (search) return null; // flat list when searching
    const map: Record<string, InventoryItem[]> = {};
    for (const item of filtered) {
      const cat = item.category?.trim() || 'Sin categoría';
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    }
    return Object.entries(map).sort(([a], [b]) => {
      if (a === 'Sin categoría') return 1;
      if (b === 'Sin categoría') return -1;
      return a.localeCompare(b, 'es');
    });
  }, [filtered, search]);

  // ── Abrir sheet de ítem ──────────────────────────────────────────────────
  const openItem = (item: InventoryItem) => {
    setSheet({ view: 'detail', item });
    setQty(''); setUnitCost(''); setShowPrice(false);
    setPriceHistory([]); setMovements([]);
    bodegaService.getPriceHistory(item.id).then(setPriceHistory).catch(() => {});
    bodegaService.getMovements(item.id).then(setMovements).catch(() => {});
  };

  const goToAction = (view: 'entrada' | 'ajuste') => {
    setSheet(s => s ? { ...s, view } : null);
    setQty(''); setUnitCost(''); setShowPrice(false);
  };

  const closeSheet = () => {
    setSheet(null);
    setQty(''); setUnitCost(''); setShowPrice(false);
    setNewItem({ name: '', unit: 'kg', minimum_stock: '', current_stock: '', category: '' });
  };

  // ── Acciones ────────────────────────────────────────────────────────────
  const handleAdjust = async () => {
    if (!sheet?.item || !qty) return;
    const amount = parseFloat(qty);
    if (isNaN(amount) || amount <= 0) return;
    setSaving(true);
    try {
      const cost = parseFloat(unitCost);
      const updated = await bodegaService.adjustStock(sheet.item.id, {
        quantity: amount,
        adjust_type: sheet.view as 'entrada' | 'ajuste',
        ...(sheet.view === 'entrada' && !isNaN(cost) && cost > 0 ? { unit_cost: cost } : {}),
      });
      haptic.confirm();
      setInventory(prev => prev.map(i => i.id === updated.id ? updated : i));
      closeSheet();
    } catch {
      setError('Error al ajustar stock');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newItem.name.trim()) return;
    setSaving(true);
    try {
      const created = await bodegaService.createItem({
        name: newItem.name.trim(),
        unit: newItem.unit,
        current_stock: parseFloat(newItem.current_stock) || 0,
        minimum_stock: parseFloat(newItem.minimum_stock) || 0,
        category: newItem.category.trim() || null,
      });
      haptic.confirm();
      setInventory(prev => [...prev, created]);
      closeSheet();
    } catch {
      setError('Error al crear insumo');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await bodegaService.deleteItem(id);
      setInventory(prev => prev.filter(i => i.id !== id));
      closeSheet();
    } catch {
      setError('Error al eliminar insumo');
    }
  };

  // ── Título del sheet ─────────────────────────────────────────────────────
  const sheetTitle =
    sheet?.view === 'detail'  ? (sheet.item?.name ?? '')
    : sheet?.view === 'entrada' ? '+ Entrada de Stock'
    : sheet?.view === 'ajuste'  ? '− Ajuste de Stock'
    : 'Nuevo Insumo';

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  const item = sheet?.item;
  const isLow = item ? item.current_stock < item.minimum_stock : false;
  const newStock = item && qty
    ? sheet?.view === 'entrada'
      ? item.current_stock + (parseFloat(qty) || 0)
      : Math.max(0, item.current_stock - (parseFloat(qty) || 0))
    : null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full gap-4">

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-nodo-danger-bg border border-nodo-danger-bd text-nodo-danger-tx text-sm font-medium px-4 py-3 rounded-2xl">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={15} /></button>
        </div>
      )}

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black text-nodo-ink tracking-tight">Bodega</h1>
          <p className="text-sm text-nodo-sub mt-0.5">
            {inventory.length} insumos
            {lowStock.length > 0
              ? <span className="text-nodo-danger-tx"> · {lowStock.length} bajo mínimo</span>
              : <span className="text-nodo-success-tx"> · todo en orden</span>
            }
          </p>
        </div>
        <button
          onClick={() => setSheet({ view: 'nuevo' })}
          className="w-11 h-11 rounded-full bg-nodo-ink text-nodo-card flex items-center justify-center active:scale-90 transition-transform shadow-lg shadow-nodo-ink/20"
          title="Nuevo insumo"
        >
          <Plus size={20} strokeWidth={2.5} />
        </button>
      </div>

      {/* ── SEARCH ──────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-nodo-dim pointer-events-none" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setShowOnlyLow(false); }}
          placeholder="Buscar insumo…"
          className="w-full h-11 pl-11 pr-10 bg-nodo-inset rounded-2xl text-sm font-medium text-nodo-ink placeholder:text-nodo-dim outline-none focus:ring-2 focus:ring-nodo-ink/10 transition-all"
        />
        {(search || showOnlyLow) && (
          <button
            onClick={() => { setSearch(''); setShowOnlyLow(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-nodo-dim/20 flex items-center justify-center text-nodo-sub"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* ── ALERTA STOCK BAJO (compacta) ─────────────────────────────── */}
      {!showOnlyLow && !search && lowStock.length > 0 && (
        <button
          onClick={() => setShowOnlyLow(true)}
          className="flex items-center gap-3 bg-nodo-danger-bg border border-nodo-danger-bd rounded-2xl px-4 py-3 text-left w-full active:opacity-80 transition-opacity"
        >
          <AlertTriangle size={16} className="text-nodo-danger-tx shrink-0" />
          <span className="text-sm font-bold text-nodo-danger-tx flex-1">
            {lowStock.length} {lowStock.length === 1 ? 'insumo' : 'insumos'} bajo el mínimo
          </span>
          <span className="text-xs text-nodo-danger-tx/60 font-medium hidden sm:block truncate max-w-[140px]">
            {lowStock.slice(0, 2).map(i => i.name).join(', ')}{lowStock.length > 2 ? '…' : ''}
          </span>
          <ChevronRight size={14} className="text-nodo-danger-tx shrink-0" />
        </button>
      )}

      {/* ── LISTA ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <Warehouse size={36} className="text-nodo-dim" />
            <p className="text-nodo-sub font-bold text-sm">
              {showOnlyLow ? 'No hay insumos con stock bajo' : search ? 'Sin resultados' : 'No hay insumos'}
            </p>
            {!search && !showOnlyLow && (
              <button
                onClick={() => setSheet({ view: 'nuevo' })}
                className="px-5 py-2.5 bg-nodo-ink text-nodo-card text-sm font-bold rounded-xl active:opacity-90 transition-opacity"
              >
                + Añadir primer insumo
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4 pb-4">

            {/* ── Búsqueda / solo-bajos: cards individuales ── */}
            {(search || showOnlyLow) && filtered.map(i => (
              <ItemCard key={i.id} item={i} onTap={openItem} />
            ))}

            {/* ── Vista normal: grupos por categoría ── */}
            {grouped && !search && !showOnlyLow && grouped.map(([cat, items]) => {
              const anyLow = items.some(i => i.current_stock < i.minimum_stock);
              return (
                <div key={cat}>
                  {/* Encabezado de categoría */}
                  <div className="flex items-center gap-2 mb-2 px-1">
                    {anyLow && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />}
                    <span className="text-[11px] font-black text-nodo-dim uppercase tracking-widest flex-1">
                      {cat.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[11px] font-bold text-nodo-dim/50 tabular-nums">
                      {items.length}
                    </span>
                  </div>

                  {/* Card agrupado (iOS Settings style) */}
                  <div className="bg-nodo-card rounded-2xl border border-nodo-line overflow-hidden shadow-sm">
                    {items.map((item, idx) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        onTap={openItem}
                        hasDivider={idx < items.length - 1}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── BOTTOM SHEET ─────────────────────────────────────────────── */}
      <BottomSheet
        open={sheet !== null}
        onClose={closeSheet}
        title={sheetTitle}
        footer={
          /* Solo detail no tiene footer — los botones están en el contenido */
          sheet?.view !== 'detail' ? (
            <button
              onClick={sheet?.view === 'nuevo' ? handleCreate : handleAdjust}
              disabled={saving || (sheet?.view !== 'nuevo' && (!qty || parseFloat(qty) <= 0))}
              className={[
                'w-full h-14 rounded-2xl font-black text-base tracking-wide',
                'flex items-center justify-center gap-2 transition-all active:scale-[0.97]',
                'disabled:opacity-35 disabled:cursor-not-allowed',
                sheet?.view === 'entrada' ? 'bg-emerald-500 text-white'
                : sheet?.view === 'ajuste' ? 'bg-red-500 text-white'
                : 'bg-nodo-ink text-nodo-card',
              ].join(' ')}
            >
              {saving
                ? <Loader2 size={20} className="animate-spin" />
                : <Check size={20} strokeWidth={3} />}
              {sheet?.view === 'entrada' ? 'CONFIRMAR INGRESO'
                : sheet?.view === 'ajuste' ? 'CONFIRMAR AJUSTE'
                : 'CREAR INSUMO'}
            </button>
          ) : undefined
        }
      >

        {/* ─────────── DETALLE DE ÍTEM ─────────── */}
        {sheet?.view === 'detail' && item && (
          <div className="space-y-4">
            {/* Stock visual */}
            <div className="bg-nodo-inset rounded-2xl p-5 space-y-3">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-bold text-nodo-dim uppercase tracking-wider">Stock actual</p>
                  <p className="text-4xl font-black text-nodo-ink mt-1 tracking-tight">
                    {item.current_stock}
                    <span className="text-xl text-nodo-sub ml-1.5 font-bold">{item.unit}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-nodo-dim font-bold uppercase">Mínimo</p>
                  <p className="text-sm font-black text-nodo-sub">{item.minimum_stock} {item.unit}</p>
                </div>
              </div>
              <StockBar item={item} />
              {isLow && (
                <p className="text-xs font-bold text-nodo-danger-tx flex items-center gap-1.5">
                  <AlertTriangle size={12} /> Stock por debajo del mínimo
                </p>
              )}
            </div>

            {/* Último costo */}
            {item.last_unit_cost > 0 && (
              <div className="flex items-center justify-between px-1">
                <span className="text-sm text-nodo-sub">Último costo registrado</span>
                <span className="text-sm font-black text-nodo-ink">Q{item.last_unit_cost.toFixed(2)}/{item.unit}</span>
              </div>
            )}

            {/* Acciones principales */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => goToAction('entrada')}
                className="h-16 rounded-2xl bg-nodo-success-bg border border-nodo-success-bd text-nodo-success-tx font-black text-base flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Plus size={20} strokeWidth={2.5} />
                Entrada
              </button>
              <button
                onClick={() => goToAction('ajuste')}
                className="h-16 rounded-2xl bg-nodo-danger-bg border border-nodo-danger-bd text-nodo-danger-tx font-black text-base flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Minus size={20} strokeWidth={2.5} />
                Ajuste
              </button>
            </div>

            {/* Historial reciente de movimientos */}
            {movements.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-2 px-1">Últimos movimientos</p>
                <div className="rounded-2xl border border-nodo-line overflow-hidden divide-y divide-nodo-line">
                  {movements.slice(0, 5).map(mv => (
                    <div key={mv.id} className="flex items-center justify-between px-4 py-2.5 bg-nodo-card">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-black px-1.5 py-0.5 rounded-md ${mv.move_type === 'entrada' ? 'bg-nodo-success-bg text-nodo-success-tx' : 'bg-nodo-danger-bg text-nodo-danger-tx'}`}>
                          {mv.move_type === 'entrada' ? '+' : '−'}{mv.quantity} {item.unit}
                        </span>
                        <span className="text-xs text-nodo-sub">→ {mv.stock_after.toFixed(1)}</span>
                      </div>
                      <span className="text-[11px] text-nodo-dim">
                        {new Date(mv.recorded_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Eliminar */}
            <button
              onClick={() => handleDelete(item.id)}
              className="w-full py-3 text-sm font-bold text-nodo-danger-tx text-center rounded-2xl active:bg-nodo-danger-bg transition-colors"
            >
              Eliminar insumo
            </button>
          </div>
        )}

        {/* ─────────── ENTRADA / AJUSTE ─────────── */}
        {(sheet?.view === 'entrada' || sheet?.view === 'ajuste') && item && (
          <div className="space-y-5">
            {/* Back */}
            <button
              onClick={() => setSheet(s => s ? { ...s, view: 'detail' } : null)}
              className="flex items-center gap-1 text-sm font-bold text-nodo-sub -mt-1 active:opacity-60 transition-opacity"
            >
              <ChevronLeft size={16} /> {item.name}
            </button>

            {/* Stepper custom — sin spinner nativo */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-nodo-dim uppercase tracking-wider text-center">
                {sheet.view === 'entrada' ? 'Cantidad a ingresar' : 'Cantidad a reducir'} ({item.unit})
              </p>

              {/* Botones − / valor / + */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQty(v => String(Math.max(0, parseFloat(v) || 0) - 1 < 0 ? '' : Math.max(0, (parseFloat(v) || 0) - 1)))}
                  className="w-14 h-14 rounded-2xl bg-nodo-raised text-nodo-ink text-2xl font-black flex items-center justify-center active:scale-90 transition-transform shrink-0 select-none"
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="decimal"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  placeholder="0"
                  autoFocus
                  className="flex-1 h-14 text-center text-4xl font-black text-nodo-ink bg-nodo-inset rounded-2xl outline-none focus:ring-2 focus:ring-nodo-ink/15 transition-all placeholder:text-nodo-dim [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  onClick={() => setQty(v => String((parseFloat(v) || 0) + 1))}
                  className="w-14 h-14 rounded-2xl bg-nodo-ink text-nodo-card text-2xl font-black flex items-center justify-center active:scale-90 transition-transform shrink-0 select-none"
                >
                  +
                </button>
              </div>

              {/* Chips de cantidad rápida */}
              <div className="flex gap-2">
                {[0.5, 1, 5, 10, 25].map(n => (
                  <button
                    key={n}
                    onClick={() => setQty(v => String((parseFloat(v) || 0) + n))}
                    className="flex-1 h-10 rounded-xl bg-nodo-raised text-nodo-sub text-sm font-bold active:scale-95 active:bg-nodo-inset transition-transform"
                  >
                    +{n}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview nuevo stock */}
            {newStock !== null && (
              <div className="bg-nodo-inset rounded-2xl px-5 py-4 flex items-center justify-between">
                <div className="text-center flex-1">
                  <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">Actual</p>
                  <p className="text-lg font-black text-nodo-sub">{item.current_stock} {item.unit}</p>
                </div>
                <div className="text-nodo-dim text-xl font-light">→</div>
                <div className="text-center flex-1">
                  <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">Nuevo</p>
                  <p className={`text-lg font-black ${newStock < item.minimum_stock ? 'text-nodo-danger-tx' : 'text-nodo-success-tx'}`}>
                    {newStock.toFixed(1)} {item.unit}
                  </p>
                </div>
              </div>
            )}

            {/* Precio (solo entrada, colapsable) */}
            {sheet.view === 'entrada' && (
              <div>
                {!showPrice ? (
                  <button
                    onClick={() => setShowPrice(true)}
                    className="text-sm font-bold text-nodo-sub underline-offset-2 hover:underline active:opacity-60"
                  >
                    + Registrar precio por {item.unit}
                  </button>
                ) : (
                  <div>
                    <label className="text-xs font-bold text-nodo-dim uppercase tracking-wider mb-2 block">
                      Precio por {item.unit} (Q)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={unitCost}
                      onChange={e => setUnitCost(e.target.value)}
                      placeholder={item.last_unit_cost ? item.last_unit_cost.toFixed(2) : '0.00'}
                      className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line-s rounded-2xl text-sm font-semibold text-nodo-ink placeholder:text-nodo-dim focus:border-nodo-success-tx outline-none transition-colors"
                    />
                    {priceHistory.length > 0 && (
                      <p className="text-xs text-nodo-dim mt-1.5 px-1">
                        Último registrado: <span className="font-bold text-nodo-sub">Q{priceHistory[0].unit_cost.toFixed(2)}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─────────── NUEVO INSUMO ─────────── */}
        {sheet?.view === 'nuevo' && (
          <div className="space-y-5">
            {/* Nombre */}
            <div>
              <label className="text-xs font-bold text-nodo-dim uppercase tracking-wider mb-2 block">Nombre</label>
              <input
                type="text"
                value={newItem.name}
                onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Harina especial"
                autoFocus
                className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line-s rounded-2xl text-sm font-semibold text-nodo-ink placeholder:text-nodo-dim focus:border-nodo-ink outline-none transition-colors"
              />
            </div>

            {/* Unidad — pill selector */}
            <div>
              <label className="text-xs font-bold text-nodo-dim uppercase tracking-wider mb-2 block">Unidad</label>
              <div className="flex flex-wrap gap-2">
                {UNITS.map(u => (
                  <button
                    key={u}
                    onClick={() => setNewItem(p => ({ ...p, unit: u }))}
                    className={[
                      'px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95',
                      newItem.unit === u
                        ? 'bg-nodo-ink text-nodo-card shadow-sm'
                        : 'bg-nodo-raised text-nodo-sub hover:bg-nodo-inset',
                    ].join(' ')}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            {/* Stocks inicial y mínimo */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Stock inicial', key: 'current_stock', placeholder: '0' },
                { label: 'Stock mínimo', key: 'minimum_stock', placeholder: '5' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-bold text-nodo-dim uppercase tracking-wider mb-2 block">{f.label}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={(newItem as any)[f.key]}
                    onChange={e => setNewItem(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line-s rounded-2xl text-sm font-semibold text-nodo-ink placeholder:text-nodo-dim focus:border-nodo-ink outline-none transition-colors"
                  />
                </div>
              ))}
            </div>

            {/* Categoría (opcional) */}
            <div>
              <label className="text-xs font-bold text-nodo-dim uppercase tracking-wider mb-2 block">
                Categoría <span className="normal-case font-medium text-nodo-dim/60">— opcional</span>
              </label>
              <input
                type="text"
                value={newItem.category}
                onChange={e => setNewItem(p => ({ ...p, category: e.target.value }))}
                placeholder="Harinas, Lácteos, Endulzantes…"
                className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line-s rounded-2xl text-sm font-semibold text-nodo-ink placeholder:text-nodo-dim focus:border-nodo-ink outline-none transition-colors"
              />
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

// ── Helpers de stock ────────────────────────────────────────────────────────
function stockLevel(item: InventoryItem): 'low' | 'warn' | 'ok' {
  if (item.minimum_stock <= 0) return 'ok';
  const ratio = item.current_stock / item.minimum_stock;
  if (ratio < 1)   return 'low';
  if (ratio < 1.5) return 'warn';
  return 'ok';
}

const STRIP_COLOR  = { low: 'bg-red-500', warn: 'bg-amber-400', ok: 'bg-emerald-400' } as const;
const CHIP_COLOR   = {
  low:  'bg-nodo-danger-bg text-nodo-danger-tx',
  warn: 'bg-nodo-warn-bg  text-nodo-warn-tx',
  ok:   'bg-nodo-inset    text-nodo-sub',
} as const;

// ── Fila dentro de un grupo (iOS Settings style) ─────────────────────────────
function ItemRow({ item, onTap, hasDivider = true }: {
  item: InventoryItem;
  onTap: (item: InventoryItem) => void;
  hasDivider?: boolean;
}) {
  const level = stockLevel(item);
  return (
    <button
      onClick={() => onTap(item)}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-nodo-raised transition-colors ${hasDivider ? 'border-b border-nodo-line' : ''}`}
    >
      {/* Strip de color — nivel de stock */}
      <div className={`w-[3px] h-8 rounded-full shrink-0 ${STRIP_COLOR[level]}`} />

      {/* Nombre + subnota si está bajo */}
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-nodo-ink text-[15px] block truncate leading-tight">{item.name}</span>
        {level === 'low' && (
          <span className="text-[11px] font-bold text-nodo-danger-tx leading-none">bajo mínimo</span>
        )}
      </div>

      {/* Chip de stock */}
      <span className={`px-2.5 py-1 rounded-xl text-xs font-black shrink-0 ${CHIP_COLOR[level]}`}>
        {item.current_stock} {item.unit}
      </span>

      <ChevronRight size={13} className="text-nodo-dim shrink-0 opacity-40" />
    </button>
  );
}

// ── Card individual — usado en búsqueda / filtro bajos ───────────────────────
function ItemCard({ item, onTap }: { item: InventoryItem; onTap: (item: InventoryItem) => void }) {
  const level = stockLevel(item);
  return (
    <button
      onClick={() => onTap(item)}
      className="w-full bg-nodo-card border border-nodo-line rounded-2xl px-4 py-4 flex items-center gap-3 text-left active:bg-nodo-raised transition-colors shadow-sm"
    >
      <div className={`w-[3px] h-9 rounded-full shrink-0 ${STRIP_COLOR[level]}`} />
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-nodo-ink text-[15px] block truncate leading-tight">{item.name}</span>
        {item.category && (
          <span className="text-[11px] text-nodo-dim font-medium">{item.category.replace(/_/g, ' ')}</span>
        )}
      </div>
      <span className={`px-2.5 py-1 rounded-xl text-xs font-black shrink-0 ${CHIP_COLOR[level]}`}>
        {item.current_stock} {item.unit}
      </span>
      <ChevronRight size={13} className="text-nodo-dim shrink-0 opacity-40" />
    </button>
  );
}
