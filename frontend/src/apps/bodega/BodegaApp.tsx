import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Minus, AlertTriangle, ArrowUpDown, X, Check, Warehouse, Loader2, Trash2 } from 'lucide-react';
import type { AppProps } from '../index';
import { bodegaService, type InventoryItem } from '@/services/bodega.service';

type PanelType = 'entrada' | 'ajuste' | 'nuevo';

interface SidePanel {
  type: PanelType;
  item?: InventoryItem;
}

export function BodegaApp(_props: AppProps) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sidePanel, setSidePanel] = useState<SidePanel | null>(null);
  const [qty, setQty] = useState('');
  const [newItem, setNewItem] = useState({ name: '', unit: 'kg', minimum_stock: 0, current_stock: 0, category: '' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await bodegaService.listItems();
      setInventory(items);
    } catch {
      setError('Error al cargar inventario');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const lowStock = inventory.filter(i => i.current_stock < i.minimum_stock);

  const filtered = inventory.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdjust = async () => {
    if (!sidePanel?.item || !qty) return;
    const amount = parseFloat(qty);
    if (isNaN(amount) || amount <= 0) return;
    setSaving(true);
    try {
      const updated = await bodegaService.adjustStock(sidePanel.item.id, {
        quantity: amount,
        adjust_type: sidePanel.type as 'entrada' | 'ajuste',
      });
      setInventory(prev => prev.map(i => i.id === updated.id ? updated : i));
      setSidePanel(null);
      setQty('');
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
        unit: newItem.unit || 'kg',
        current_stock: newItem.current_stock,
        minimum_stock: newItem.minimum_stock,
        category: newItem.category || null,
      });
      setInventory(prev => [...prev, created]);
      setSidePanel(null);
      setNewItem({ name: '', unit: 'kg', minimum_stock: 0, current_stock: 0, category: '' });
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
    } catch {
      setError('Error al eliminar insumo');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-6 relative">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-2xl flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}><X size={16} /></button>
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600">
            <Warehouse size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#111]">Bodega</h1>
            <p className="text-xs text-slate-400 font-medium">Inventario y Materia Prima</p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar ingrediente..."
              className="w-full h-11 pl-11 pr-4 bg-white border border-slate-200 rounded-2xl text-sm font-medium text-[#111] placeholder:text-slate-400 focus:ring-2 focus:ring-[#111]/5 focus:border-slate-300 outline-none transition-all"
            />
          </div>
          <button
            onClick={() => setSidePanel({ type: 'nuevo' })}
            className="h-11 px-4 bg-[#111] text-white text-sm font-bold rounded-2xl hover:bg-[#222] transition-all active:scale-95 flex items-center gap-2 shrink-0"
          >
            <Plus size={16} strokeWidth={2.5} /> Nuevo
          </button>
        </div>
      </div>

      {/* ── ALERT CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-red-500/15 flex items-center justify-center text-red-500 shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-2xl font-black text-red-600">{lowStock.length}</p>
            <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Stock Bajo</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
            <ArrowUpDown size={20} />
          </div>
          <div>
            <p className="text-2xl font-black text-[#111]">{inventory.length}</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Insumos Totales</p>
          </div>
        </div>
      </div>

      {/* ── INVENTORY TABLE ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm flex-1 overflow-hidden flex flex-col">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 py-20 text-center">
            <Warehouse size={40} className="text-slate-200 mb-3" />
            <p className="text-slate-400 font-bold">No hay insumos registrados</p>
            <button
              onClick={() => setSidePanel({ type: 'nuevo' })}
              className="mt-4 px-5 py-2.5 bg-[#111] text-white text-sm font-bold rounded-xl hover:bg-[#222] transition-all active:scale-95"
            >
              + Añadir primer insumo
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ingrediente</th>
                  <th className="text-center px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Stock Actual</th>
                  <th className="text-center px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Mínimo</th>
                  <th className="text-center px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden md:table-cell">Categoría</th>
                  <th className="text-center px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ajustar</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const isLow = item.current_stock < item.minimum_stock;
                  return (
                    <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {isLow && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />}
                          <span className="font-bold text-[#111]">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`font-black text-base ${isLow ? 'text-red-500' : 'text-[#111]'}`}>
                          {item.current_stock}
                        </span>
                        <span className="text-slate-400 text-xs ml-1">{item.unit}</span>
                      </td>
                      <td className="px-4 py-4 text-center hidden sm:table-cell text-slate-400 font-semibold">
                        {item.minimum_stock} {item.unit}
                      </td>
                      <td className="px-4 py-4 text-center hidden md:table-cell">
                        {item.category ? (
                          <span className="bg-slate-100 text-slate-500 px-2.5 py-1 rounded-lg text-[11px] font-bold">{item.category}</span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => { setSidePanel({ type: 'entrada', item }); setQty(''); }}
                            className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all active:scale-95"
                            title="Entrada de stock"
                          >
                            <Plus size={16} strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={() => { setSidePanel({ type: 'ajuste', item }); setQty(''); }}
                            className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-all active:scale-95"
                            title="Ajuste (reducir)"
                          >
                            <Minus size={16} strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-all active:scale-95 opacity-0 group-hover:opacity-100"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SIDE PANEL ── */}
      {sidePanel && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSidePanel(null)}>
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-black text-[#111]">
                {sidePanel.type === 'entrada' ? '+ Entrada de Stock'
                  : sidePanel.type === 'ajuste' ? '- Ajuste de Stock'
                  : '+ Nuevo Insumo'}
              </h3>
              <button onClick={() => setSidePanel(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="flex-1 p-6 space-y-5 overflow-y-auto">
              {sidePanel.type === 'nuevo' ? (
                <>
                  {[
                    { label: 'Nombre del insumo', key: 'name', placeholder: 'Ej: Harina', type: 'text' },
                    { label: 'Unidad', key: 'unit', placeholder: 'kg, litro, unidad…', type: 'text' },
                    { label: 'Categoría (opcional)', key: 'category', placeholder: 'Base, Lácteos…', type: 'text' },
                    { label: 'Stock inicial', key: 'current_stock', placeholder: '0', type: 'number' },
                    { label: 'Stock mínimo', key: 'minimum_stock', placeholder: '0', type: 'number' },
                  ].map(field => (
                    <div key={field.key}>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">{field.label}</label>
                      <input
                        type={field.type}
                        value={(newItem as any)[field.key]}
                        onChange={e => setNewItem(prev => ({ ...prev, [field.key]: field.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-semibold text-[#111] focus:border-[#111] outline-none transition-colors"
                      />
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div className="bg-slate-50 rounded-2xl p-5">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Ingrediente</p>
                    <p className="text-xl font-black text-[#111]">{sidePanel.item?.name}</p>
                    <p className="text-sm text-slate-400 mt-1">
                      Stock actual: <span className="font-bold text-[#111]">{sidePanel.item?.current_stock} {sidePanel.item?.unit}</span>
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                      Cantidad ({sidePanel.item?.unit})
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={qty}
                      onChange={e => setQty(e.target.value)}
                      placeholder="0"
                      autoFocus
                      className="w-full h-16 text-center text-3xl font-black text-[#111] bg-white border-2 border-slate-200 rounded-2xl focus:border-[#111] focus:ring-0 outline-none transition-colors"
                    />
                  </div>
                  {qty && parseFloat(qty) > 0 && sidePanel.item && (
                    <div className="bg-slate-50 rounded-2xl p-4 text-center">
                      <p className="text-xs text-slate-400 font-medium">Nuevo stock</p>
                      <p className="text-2xl font-black text-[#111] mt-1">
                        {sidePanel.type === 'entrada'
                          ? (sidePanel.item.current_stock + parseFloat(qty)).toFixed(2)
                          : Math.max(0, sidePanel.item.current_stock - parseFloat(qty)).toFixed(2)
                        } {sidePanel.item.unit}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-6 border-t border-slate-100">
              <button
                onClick={sidePanel.type === 'nuevo' ? handleCreate : handleAdjust}
                disabled={saving || (sidePanel.type !== 'nuevo' && (!qty || parseFloat(qty) <= 0))}
                className={`w-full h-14 rounded-2xl font-black text-lg tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                  sidePanel.type === 'entrada' ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : sidePanel.type === 'ajuste' ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-[#111] hover:bg-[#222] text-white'
                }`}
              >
                {saving ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} strokeWidth={3} />}
                {sidePanel.type === 'entrada' ? 'CONFIRMAR INGRESO'
                  : sidePanel.type === 'ajuste' ? 'CONFIRMAR AJUSTE'
                  : 'CREAR INSUMO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
