import { useState } from 'react';
import { Search, Plus, Minus, AlertTriangle, Clock, ArrowUpDown, X, Check, Warehouse } from 'lucide-react';
import type { AppProps } from '../index';

// ── Mock Data ──
const MOCK_INVENTORY = [
  { id: '1', name: 'Harina', unit: 'kg', stock: 120, minStock: 50, expiry: '2026-06-15', category: 'Base' },
  { id: '2', name: 'Azúcar', unit: 'kg', stock: 8, minStock: 20, expiry: '2026-08-01', category: 'Base' },
  { id: '3', name: 'Mantequilla', unit: 'kg', stock: 5, minStock: 10, expiry: '2026-05-20', category: 'Lácteos' },
  { id: '4', name: 'Huevos', unit: 'unidad', stock: 200, minStock: 100, expiry: '2026-05-25', category: 'Frescos' },
  { id: '5', name: 'Levadura', unit: 'kg', stock: 3, minStock: 5, expiry: '2026-05-18', category: 'Fermentos' },
  { id: '6', name: 'Sal', unit: 'kg', stock: 15, minStock: 5, expiry: '2027-01-01', category: 'Base' },
  { id: '7', name: 'Leche', unit: 'litro', stock: 12, minStock: 15, expiry: '2026-05-16', category: 'Lácteos' },
  { id: '8', name: 'Chocolate', unit: 'kg', stock: 4, minStock: 8, expiry: '2026-07-10', category: 'Saborizantes' },
  { id: '9', name: 'Vainilla', unit: 'litro', stock: 2, minStock: 1, expiry: '2026-12-01', category: 'Saborizantes' },
  { id: '10', name: 'Canela', unit: 'kg', stock: 1, minStock: 2, expiry: '2027-03-01', category: 'Especias' },
];

const MOCK_MOVEMENTS = [
  { item: 'Harina', qty: '+50 kg', time: 'Hace 2h', type: 'entrada' },
  { item: 'Azúcar', qty: '-10 kg', time: 'Hace 4h', type: 'salida' },
  { item: 'Huevos', qty: '+100 unid', time: 'Ayer', type: 'entrada' },
  { item: 'Mantequilla', qty: '-3 kg', time: 'Ayer', type: 'salida' },
];

interface SidePanel {
  type: 'entrada' | 'ajuste';
  item: typeof MOCK_INVENTORY[0];
}

export function BodegaApp(_props: AppProps) {
  const [inventory, setInventory] = useState(MOCK_INVENTORY);
  const [search, setSearch] = useState('');
  const [sidePanel, setSidePanel] = useState<SidePanel | null>(null);
  const [qty, setQty] = useState('');

  const lowStock = inventory.filter(i => i.stock < i.minStock);
  const expiringSoon = inventory.filter(i => {
    const days = (new Date(i.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days < 10 && days > 0;
  });

  const filtered = inventory.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleConfirm = () => {
    if (!sidePanel || !qty) return;
    const amount = parseInt(qty);
    if (isNaN(amount) || amount <= 0) return;

    setInventory(prev => prev.map(item => {
      if (item.id === sidePanel.item.id) {
        const newStock = sidePanel.type === 'entrada'
          ? item.stock + amount
          : Math.max(0, item.stock - amount);
        return { ...item, stock: newStock };
      }
      return item;
    }));
    setSidePanel(null);
    setQty('');
  };

  return (
    <div className="flex flex-col h-full gap-6 relative">
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
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar ingrediente..."
            className="w-full h-11 pl-11 pr-4 bg-white border border-slate-200 rounded-2xl text-sm font-medium text-[#111] placeholder:text-slate-400 focus:ring-2 focus:ring-[#111]/5 focus:border-slate-300 outline-none transition-all"
          />
        </div>
      </div>

      {/* ── ALERT CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-red-500/15 flex items-center justify-center text-red-500 shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-2xl font-black text-red-600">{lowStock.length}</p>
            <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Stock Bajo</p>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-500 shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-2xl font-black text-amber-600">{expiringSoon.length}</p>
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">Por Vencer</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <ArrowUpDown size={14} className="text-slate-400" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Últimos Movimientos</p>
          </div>
          <div className="space-y-1.5">
            {MOCK_MOVEMENTS.slice(0, 3).map((m, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#111]">{m.item}</span>
                <span className={`font-bold ${m.type === 'entrada' ? 'text-emerald-500' : 'text-red-400'}`}>
                  {m.qty}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── INVENTORY TABLE ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ingrediente</th>
                <th className="text-left px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Categoría</th>
                <th className="text-center px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Stock</th>
                <th className="text-center px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Mín.</th>
                <th className="text-center px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden md:table-cell">Vence</th>
                <th className="text-center px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const isLow = item.stock < item.minStock;
                return (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {isLow && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />}
                        <span className="font-bold text-[#111]">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <span className="bg-slate-100 text-slate-500 px-2.5 py-1 rounded-lg text-[11px] font-bold">{item.category}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`font-black text-base ${isLow ? 'text-red-500' : 'text-[#111]'}`}>
                        {item.stock}
                      </span>
                      <span className="text-slate-400 text-xs ml-1">{item.unit}</span>
                    </td>
                    <td className="px-4 py-4 text-center hidden sm:table-cell text-slate-400 font-semibold">{item.minStock}</td>
                    <td className="px-4 py-4 text-center hidden md:table-cell text-slate-400 font-medium text-xs">
                      {new Date(item.expiry).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => { setSidePanel({ type: 'entrada', item }); setQty(''); }}
                          className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all active:scale-95"
                          title="Entrada"
                        >
                          <Plus size={16} strokeWidth={2.5} />
                        </button>
                        <button
                          onClick={() => { setSidePanel({ type: 'ajuste', item }); setQty(''); }}
                          className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-all active:scale-95"
                          title="Ajuste"
                        >
                          <Minus size={16} strokeWidth={2.5} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SIDE PANEL (Contextual) ── */}
      {sidePanel && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSidePanel(null)}>
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-black text-[#111]">
                {sidePanel.type === 'entrada' ? '+ Entrada' : '- Ajuste de Stock'}
              </h3>
              <button onClick={() => setSidePanel(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="flex-1 p-6 space-y-6">
              <div className="bg-slate-50 rounded-2xl p-5">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Ingrediente</p>
                <p className="text-xl font-black text-[#111]">{sidePanel.item.name}</p>
                <p className="text-sm text-slate-400 mt-1">
                  Stock actual: <span className="font-bold text-[#111]">{sidePanel.item.stock} {sidePanel.item.unit}</span>
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                  Cantidad ({sidePanel.item.unit})
                </label>
                <input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  placeholder="0"
                  autoFocus
                  className="w-full h-16 text-center text-3xl font-black text-[#111] bg-white border-2 border-slate-200 rounded-2xl focus:border-[#111] focus:ring-0 outline-none transition-colors"
                />
              </div>

              {qty && parseInt(qty) > 0 && (
                <div className="bg-slate-50 rounded-2xl p-4 text-center">
                  <p className="text-xs text-slate-400 font-medium">Nuevo stock</p>
                  <p className="text-2xl font-black text-[#111] mt-1">
                    {sidePanel.type === 'entrada'
                      ? sidePanel.item.stock + parseInt(qty)
                      : Math.max(0, sidePanel.item.stock - parseInt(qty))
                    } {sidePanel.item.unit}
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100">
              <button
                onClick={handleConfirm}
                disabled={!qty || parseInt(qty) <= 0}
                className={`w-full h-14 rounded-2xl font-black text-lg tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                  sidePanel.type === 'entrada'
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                    : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
              >
                <Check size={20} strokeWidth={3} />
                {sidePanel.type === 'entrada' ? 'CONFIRMAR INGRESO' : 'CONFIRMAR AJUSTE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
