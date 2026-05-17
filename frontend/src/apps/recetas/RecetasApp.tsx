import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Search, Plus, X, DollarSign, ChefHat, Loader2, Trash2, Package } from 'lucide-react';
import type { AppProps } from '../index';
import { recetasService, type Recipe, type RecipeWithIngredients } from '@/services/recetas.service';
import { bodegaService, type InventoryItem } from '@/services/bodega.service';

export function RecetasApp(_props: AppProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selected, setSelected] = useState<RecipeWithIngredients | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search, setSearch] = useState('');
  const [showList, setShowList] = useState(true);
  const [showNewRecipe, setShowNewRecipe] = useState(false);
  const [showAddIng, setShowAddIng] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newRecipe, setNewRecipe] = useState({ name: '', base_unit: 'unidades', estimated_yield: 1, sell_price: 0 });
  const [newIng, setNewIng] = useState({ inventory_item_id: '', quantity: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, inv] = await Promise.all([recetasService.list(), bodegaService.listItems()]);
      setRecipes(r);
      setInventory(inv);
      if (r.length > 0 && !selected) loadDetail(r[0].id);
    } catch {
      setError('Error al cargar recetas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const detail = await recetasService.getWithIngredients(id);
      setSelected(detail);
      setShowList(false);
    } catch {
      setError('Error al cargar detalle');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCreate = async () => {
    if (!newRecipe.name.trim()) return;
    setSaving(true);
    try {
      const r = await recetasService.create(newRecipe);
      setRecipes(prev => [...prev, r]);
      setShowNewRecipe(false);
      setNewRecipe({ name: '', base_unit: 'unidades', estimated_yield: 1, sell_price: 0 });
      loadDetail(r.id);
    } catch {
      setError('Error al crear receta');
    } finally {
      setSaving(false);
    }
  };

  const handleAddIngredient = async () => {
    if (!selected || !newIng.inventory_item_id) return;
    setSaving(true);
    try {
      await recetasService.addIngredient(selected.id, {
        inventory_item_id: newIng.inventory_item_id,
        quantity: newIng.quantity,
      });
      await loadDetail(selected.id);
      setShowAddIng(false);
      setNewIng({ inventory_item_id: '', quantity: 1 });
    } catch {
      setError('Error al añadir ingrediente');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveIngredient = async (ingId: string) => {
    if (!selected) return;
    try {
      await recetasService.removeIngredient(selected.id, ingId);
      setSelected(prev => prev ? { ...prev, ingredients: prev.ingredients.filter(i => i.id !== ingId) } : null);
    } catch {
      setError('Error al quitar ingrediente');
    }
  };

  const handleDeleteRecipe = async (id: string) => {
    try {
      await recetasService.delete(id);
      setRecipes(prev => prev.filter(r => r.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch {
      setError('Error al eliminar receta');
    }
  };

  const filtered = recipes.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#111]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6">
      {error && (
        <div className="fixed top-4 right-4 z-50 bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-2xl flex items-center gap-3 shadow-lg">
          {error}
          <button onClick={() => setError(null)}><X size={16} /></button>
        </div>
      )}

      {/* ── LEFT: Recipe List ── */}
      <div className={`lg:w-72 xl:w-80 shrink-0 flex flex-col bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden ${showList ? '' : 'hidden lg:flex'}`}>
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar receta..."
              className="w-full h-10 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-[#111] placeholder:text-slate-400 focus:ring-2 focus:ring-[#111]/5 focus:border-slate-300 outline-none transition-all"
            />
          </div>
          <button
            onClick={() => setShowNewRecipe(true)}
            className="w-full h-10 bg-[#111] text-white text-sm font-bold rounded-xl hover:bg-[#222] transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <Plus size={16} /> Nueva Receta
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-4">
              <BookOpen size={32} className="text-slate-200 mb-2" />
              <p className="text-xs font-bold text-slate-300">Sin recetas</p>
            </div>
          ) : (
            filtered.map(recipe => (
              <button
                key={recipe.id}
                onClick={() => loadDetail(recipe.id)}
                className={`w-full flex items-center gap-3 px-5 py-4 text-left transition-all border-b border-slate-50 ${
                  selected?.id === recipe.id ? 'bg-[#111] text-white' : 'hover:bg-slate-50 text-[#111]'
                }`}
              >
                <ChefHat size={18} className={selected?.id === recipe.id ? 'text-white/60' : 'text-slate-300'} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-bold truncate ${selected?.id === recipe.id ? 'text-white' : 'text-[#111]'}`}>
                    {recipe.name}
                  </p>
                  <p className={`text-xs ${selected?.id === recipe.id ? 'text-white/60' : 'text-slate-400'}`}>
                    {recipe.estimated_yield} {recipe.base_unit} · Q{recipe.sell_price.toFixed(2)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT: Recipe Detail ── */}
      <div className={`flex-1 flex flex-col min-w-0 ${!showList ? '' : 'hidden lg:flex'}`}>
        {loadingDetail ? (
          <div className="flex items-center justify-center h-64 bg-white rounded-3xl border border-slate-100">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : selected ? (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm flex-1 overflow-y-auto">
            {/* Detail Header */}
            <div className="p-6 lg:p-8 border-b border-slate-100">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button onClick={() => setShowList(true)} className="lg:hidden p-2 -ml-2 hover:bg-slate-100 rounded-xl text-slate-400">←</button>
                  <div className="w-14 h-14 rounded-2xl bg-[#111]/5 flex items-center justify-center">
                    <ChefHat size={28} className="text-[#111]" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-[#111]">{selected.name}</h2>
                    <p className="text-sm text-slate-400 mt-0.5">{selected.estimated_yield} {selected.base_unit} · Venta: Q{selected.sell_price.toFixed(2)}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteRecipe(selected.id)}
                  className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-colors"
                  title="Eliminar receta"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            <div className="p-6 lg:p-8 space-y-6">
              {/* Cost Card */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600">
                    <DollarSign size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-500 uppercase tracking-wider">Costo Estimado</p>
                    <p className="text-xs text-emerald-600">{selected.ingredients.length} ingredientes</p>
                  </div>
                </div>
                <p className="text-3xl font-black text-emerald-700">Q{selected.estimated_cost.toFixed(2)}</p>
              </div>

              {/* Ingredients */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ingredientes</p>
                  <button
                    onClick={() => setShowAddIng(true)}
                    className="px-3 py-1.5 bg-[#111] text-white text-xs font-bold rounded-xl hover:bg-[#222] transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    <Plus size={13} /> Añadir
                  </button>
                </div>

                {selected.ingredients.length === 0 ? (
                  <div className="bg-slate-50 rounded-2xl p-8 text-center border border-dashed border-slate-200">
                    <Package size={32} className="text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400 font-medium">Sin ingredientes aún</p>
                  </div>
                ) : (
                  <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Insumo</th>
                          <th className="text-center px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cantidad</th>
                          <th className="px-3 py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.ingredients.map(ing => (
                          <tr key={ing.id} className="border-b border-slate-100 last:border-0 group">
                            <td className="px-5 py-3 font-semibold text-[#111]">{ing.item_name}</td>
                            <td className="px-4 py-3 text-center text-slate-500 font-medium">
                              {ing.quantity} {ing.item_unit}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <button
                                onClick={() => handleRemoveIngredient(ing.id)}
                                className="p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              >
                                <X size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center bg-white rounded-3xl border border-slate-100">
            <BookOpen size={48} className="text-slate-200 mb-4" />
            <p className="text-sm font-bold text-slate-300">Selecciona una receta</p>
          </div>
        )}
      </div>

      {/* ── MODAL: Nueva Receta ── */}
      {showNewRecipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowNewRecipe(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-[#111]">Nueva Receta</h3>
              <button onClick={() => setShowNewRecipe(false)} className="p-2 hover:bg-slate-100 rounded-xl"><X size={18} className="text-slate-400" /></button>
            </div>
            {[
              { label: 'Nombre', key: 'name', placeholder: 'Pan Francés', type: 'text' },
              { label: 'Unidad base', key: 'base_unit', placeholder: 'unidades, kg…', type: 'text' },
              { label: 'Rendimiento estimado', key: 'estimated_yield', placeholder: '50', type: 'number' },
              { label: 'Precio de venta (Q)', key: 'sell_price', placeholder: '1.50', type: 'number' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">{f.label}</label>
                <input
                  type={f.type}
                  value={(newRecipe as any)[f.key]}
                  onChange={e => setNewRecipe(prev => ({ ...prev, [f.key]: f.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-semibold text-[#111] focus:border-[#111] outline-none transition-colors"
                />
              </div>
            ))}
            <button
              onClick={handleCreate}
              disabled={!newRecipe.name.trim() || saving}
              className="w-full h-14 rounded-2xl bg-[#111] text-white font-black text-base hover:bg-[#222] transition-all active:scale-[0.97] disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              CREAR RECETA
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL: Añadir Ingrediente ── */}
      {showAddIng && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowAddIng(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-[#111]">Añadir Ingrediente</h3>
              <button onClick={() => setShowAddIng(false)} className="p-2 hover:bg-slate-100 rounded-xl"><X size={18} className="text-slate-400" /></button>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Insumo (de Bodega)</label>
              <select
                value={newIng.inventory_item_id}
                onChange={e => setNewIng(prev => ({ ...prev, inventory_item_id: e.target.value }))}
                className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-semibold text-[#111] focus:border-[#111] outline-none transition-colors"
              >
                <option value="">Seleccionar insumo…</option>
                {inventory.map(i => (
                  <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Cantidad</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={newIng.quantity}
                onChange={e => setNewIng(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-semibold text-[#111] focus:border-[#111] outline-none transition-colors"
              />
            </div>
            <button
              onClick={handleAddIngredient}
              disabled={!newIng.inventory_item_id || saving}
              className="w-full h-14 rounded-2xl bg-[#111] text-white font-black text-base hover:bg-[#222] transition-all active:scale-[0.97] disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              AÑADIR INGREDIENTE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
