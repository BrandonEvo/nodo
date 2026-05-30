import { useState, useEffect, useCallback, useRef } from 'react';
import { BookOpen, Search, Plus, X, ChefHat, Loader2, Trash2, Package, TrendingUp, TrendingDown, Pencil, Check, AlertTriangle, BarChart3, ArrowUpDown, Printer, ArrowLeft } from 'lucide-react';
import type { AppProps } from '../index';
import { recetasService, type Recipe, type RecipeWithIngredients, type RecipeIngredientRead } from '@/services/recetas.service';
import { bodegaService, type InventoryItem } from '@/services/bodega.service';
import { RecipeFormModal, type RecipeFormValues } from './RecipeFormModal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { BottomSheet } from '@/components/ui/BottomSheet';

const VIEW_OPTS = [
  { value: 'recetario',     label: 'Recetario',    icon: <BookOpen size={14} /> },
  { value: 'rentabilidad',  label: 'Rentabilidad', icon: <BarChart3 size={14} /> },
];
const TAB_OPTS = [
  { value: 'costos', label: 'Costos' },
  { value: 'ficha',  label: 'Ficha técnica' },
];

export function RecetasApp(_props: AppProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selected, setSelected] = useState<RecipeWithIngredients | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search, setSearch] = useState('');
  const [showList, setShowList] = useState(true);
  const [showNewRecipe, setShowNewRecipe] = useState(false);
  const [showEditRecipe, setShowEditRecipe] = useState(false);
  const [activeTab, setActiveTab] = useState<'costos' | 'ficha'>('costos');
  const [showSimulator, setShowSimulator] = useState(false);
  const [simAdjustments, setSimAdjustments] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<'recetario' | 'rentabilidad'>('recetario');
  const [sortBy, setSortBy] = useState<'margin' | 'cost' | 'revenue' | 'name'>('margin');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [ingSearch, setIngSearch] = useState('');
  const [ingDropOpen, setIngDropOpen] = useState(false);

  const emptyRecipeForm: RecipeFormValues = {
    name: '', base_unit: 'unidades', estimated_yield: 1, sell_price: 0.0,
    description: '', instructions: '', bake_temp: '', bake_time: '', difficulty: '', icon: '',
  };
  const [newRecipe, setNewRecipe] = useState<RecipeFormValues>(emptyRecipeForm);
  const [editRecipe, setEditRecipe] = useState<RecipeFormValues>(emptyRecipeForm);
  const [newIng, setNewIng] = useState({ inventory_item_id: '', quantity: 1 });
  const [editingIngId, setEditingIngId] = useState<string | null>(null);
  const [editingIngQty, setEditingIngQty] = useState('');
  const [pendingRemove, setPendingRemove] = useState<{ recipeId: string; ingId: string; ing: RecipeIngredientRead } | null>(null);
  const pendingRemoveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setActiveTab('costos');
    setShowSimulator(false);
    setSimAdjustments({});
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
      const r = await recetasService.create({
        name: newRecipe.name,
        base_unit: newRecipe.base_unit,
        estimated_yield: newRecipe.estimated_yield,
        sell_price: newRecipe.sell_price,
        description: newRecipe.description || null,
        instructions: newRecipe.instructions || null,
        bake_temp: newRecipe.bake_temp ? parseFloat(String(newRecipe.bake_temp)) : null,
        bake_time: newRecipe.bake_time ? parseInt(String(newRecipe.bake_time)) : null,
        difficulty: newRecipe.difficulty || null,
        icon: newRecipe.icon || null,
      });
      setRecipes(prev => [...prev, r]);
      setShowNewRecipe(false);
      setNewRecipe(emptyRecipeForm);
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
      setNewIng({ inventory_item_id: '', quantity: 1 });
      setIngSearch('');
      showSuccessMsg('Ingrediente añadido');
    } catch {
      setError('Error al añadir ingrediente');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveIngredient = (ingId: string) => {
    if (!selected) return;
    if (pendingRemoveTimer.current && pendingRemove) {
      clearTimeout(pendingRemoveTimer.current);
      recetasService.removeIngredient(pendingRemove.recipeId, pendingRemove.ingId).catch(() => {});
      setPendingRemove(null);
      pendingRemoveTimer.current = null;
    }
    const ing = selected.ingredients.find(i => i.id === ingId);
    if (!ing) return;
    setSelected(prev => prev ? {
      ...prev,
      ingredients: prev.ingredients.filter(i => i.id !== ingId),
      estimated_cost: Math.max(0, prev.estimated_cost - ing.subtotal),
    } : null);
    const recipeId = selected.id;
    setPendingRemove({ recipeId, ingId, ing });
    pendingRemoveTimer.current = setTimeout(async () => {
      try {
        await recetasService.removeIngredient(recipeId, ingId);
      } catch {
        setSelected(prev => prev ? {
          ...prev,
          ingredients: [...prev.ingredients, ing],
          estimated_cost: prev.estimated_cost + ing.subtotal,
        } : null);
        setError('Error al eliminar ingrediente');
      }
      setPendingRemove(null);
      pendingRemoveTimer.current = null;
    }, 4000);
  };

  const handleUndoRemove = () => {
    if (!pendingRemoveTimer.current || !pendingRemove) return;
    clearTimeout(pendingRemoveTimer.current);
    pendingRemoveTimer.current = null;
    setSelected(prev => prev ? {
      ...prev,
      ingredients: [...prev.ingredients, pendingRemove.ing],
      estimated_cost: prev.estimated_cost + pendingRemove.ing.subtotal,
    } : null);
    setPendingRemove(null);
  };

  const handleDeleteRecipe = async (id: string) => {
    try {
      await recetasService.delete(id);
      setRecipes(prev => prev.filter(r => r.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch {
      setError('Error al eliminar receta');
    } finally {
      setConfirmDelete(null);
    }
  };

  const showSuccessMsg = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const openEditRecipe = () => {
    if (!selected) return;
    setEditRecipe({
      name: selected.name,
      base_unit: selected.base_unit,
      estimated_yield: selected.estimated_yield,
      sell_price: selected.sell_price,
      description: selected.description ?? '',
      instructions: selected.instructions ?? '',
      bake_temp: selected.bake_temp != null ? String(selected.bake_temp) : '',
      bake_time: selected.bake_time != null ? String(selected.bake_time) : '',
      difficulty: selected.difficulty ?? '',
      icon: selected.icon ?? '',
    });
    setShowEditRecipe(true);
  };

  const handleEditRecipe = async () => {
    if (!selected || !editRecipe.name.trim()) return;
    setSaving(true);
    try {
      const updated = await recetasService.update(selected.id, {
        name: editRecipe.name,
        base_unit: editRecipe.base_unit,
        estimated_yield: editRecipe.estimated_yield,
        sell_price: editRecipe.sell_price,
        description: editRecipe.description || null,
        instructions: editRecipe.instructions || null,
        bake_temp: editRecipe.bake_temp ? parseFloat(String(editRecipe.bake_temp)) : null,
        bake_time: editRecipe.bake_time ? parseInt(String(editRecipe.bake_time)) : null,
        difficulty: editRecipe.difficulty || null,
        icon: editRecipe.icon || null,
      });
      setRecipes(prev => prev.map(r => r.id === updated.id ? updated : r));
      setSelected(prev => prev ? { ...prev, ...updated } : null);
      setShowEditRecipe(false);
      showSuccessMsg('Receta actualizada');
    } catch {
      setError('Error al editar receta');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateIngQty = async (ingId: string) => {
    if (!selected) return;
    const qty = parseFloat(editingIngQty);
    if (isNaN(qty) || qty <= 0) { setEditingIngId(null); return; }
    try {
      const ing = selected.ingredients.find(i => i.id === ingId);
      if (!ing) return;
      const updated = await recetasService.updateIngredient(selected.id, ingId, {
        inventory_item_id: ing.inventory_item_id,
        quantity: qty,
      });
      setSelected(prev => prev ? {
        ...prev,
        ingredients: prev.ingredients.map(i => i.id === ingId ? updated : i),
        estimated_cost: prev.ingredients
          .map(i => i.id === ingId ? updated.subtotal : i.subtotal)
          .reduce((a, b) => a + b, 0),
      } : null);
      showSuccessMsg('Cantidad actualizada');
    } catch {
      setError('Error al actualizar cantidad');
    } finally {
      setEditingIngId(null);
      setEditingIngQty('');
    }
  };

  const handlePrintRecipe = () => {
    if (!selected) return;
    const yld = selected.estimated_yield || 1;
    const ventaLote = selected.sell_price * yld;
    const ganancia = ventaLote - selected.estimated_cost;
    const margin = ventaLote > 0 && selected.estimated_cost > 0 ? (ganancia / ventaLote) * 100 : null;
    const rows = selected.ingredients.map(ing => `
      <tr>
        <td>${ing.item_name}</td>
        <td class="center">${ing.quantity} ${ing.item_unit}</td>
        <td class="right">${ing.unit_cost > 0 ? `Q${ing.unit_cost.toFixed(2)}` : '—'}</td>
        <td class="right">${ing.subtotal > 0 ? `Q${ing.subtotal.toFixed(2)}` : '—'}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${selected.name}</title><style>
      *{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;padding:32px;max-width:720px;margin:0 auto}
      h1{font-size:26px;font-weight:900;margin-bottom:4px}.sub{color:#888;font-size:13px;margin-bottom:24px}
      .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}
      .card{border:1px solid #e2e8f0;border-radius:10px;padding:12px}.card-l{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin-bottom:4px}
      .card-v{font-size:20px;font-weight:900}.card-s{font-size:11px;color:#94a3b8;margin-top:2px}
      .g{border-color:#bbf7d0;background:#f0fdf4}.g .card-l{color:#16a34a}.g .card-v{color:#15803d}
      .b{border-color:#bfdbfe;background:#eff6ff}.b .card-l{color:#2563eb}.b .card-v{color:#1d4ed8}
      .v{border-color:#ddd6fe;background:#f5f3ff}.v .card-l{color:#7c3aed}.v .card-v{color:#6d28d9}
      .r{border-color:#fecaca;background:#fef2f2}.r .card-l,.r .card-v{color:#b91c1c}
      .a{border-color:#fde68a;background:#fffbeb}.a .card-l{color:#d97706}.a .card-v{color:#b45309}
      section{margin-bottom:20px}h2{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;padding-bottom:6px;border-bottom:1px solid #f1f5f9;margin-bottom:10px}
      table{width:100%;border-collapse:collapse}th{text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;padding:7px 10px;border-bottom:2px solid #e2e8f0}
      td{padding:7px 10px;font-size:13px;border-bottom:1px solid #f1f5f9}.right{text-align:right}.center{text-align:center}
      tfoot td{font-weight:900;font-size:13px;color:#15803d;border-top:2px solid #e2e8f0;border-bottom:none}
      .chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.chip{display:inline-block;border:1px solid #e2e8f0;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700}
      .desc{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;font-size:13px;line-height:1.6;color:#475569}
      .step{display:flex;gap:10px;margin-bottom:8px}.step-n{width:20px;height:20px;border-radius:50%;background:#111;color:#fff;font-size:10px;font-weight:900;text-align:center;line-height:20px;flex-shrink:0}
      .step-t{font-size:13px;color:#475569;line-height:1.5;padding-top:2px}
      .footer{margin-top:28px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;display:flex;justify-content:space-between}
      @media print{body{padding:16px}}
    </style></head><body>
      <h1>${selected.name}</h1>
      <p class="sub">Lote: ${selected.estimated_yield} ${selected.base_unit} &nbsp;·&nbsp; Precio venta: Q${selected.sell_price.toFixed(2)} por ${selected.base_unit}</p>
      <div class="grid">
        <div class="card g"><div class="card-l">Costo Lote</div><div class="card-v">Q${selected.estimated_cost.toFixed(2)}</div><div class="card-s">Q${(selected.estimated_cost/yld).toFixed(2)} por ${selected.base_unit}</div></div>
        <div class="card"><div class="card-l">Precio Venta</div><div class="card-v">Q${ventaLote.toFixed(2)}</div><div class="card-s">Q${selected.sell_price.toFixed(2)} por ${selected.base_unit}</div></div>
        <div class="card ${ganancia>=0?'b':'r'}"><div class="card-l">Ganancia</div><div class="card-v">${ganancia>=0?'+':''}Q${ganancia.toFixed(2)}</div><div class="card-s">por lote</div></div>
        <div class="card ${margin===null?'':margin>=30?'v':margin>=0?'a':'r'}"><div class="card-l">Margen</div><div class="card-v">${margin!==null?margin.toFixed(1)+'%':'—'}</div><div class="card-s">${margin===null?'Sin precio':margin>=30?'Saludable':margin>=0?'Bajo':'Pérdida'}</div></div>
      </div>
      ${selected.ingredients.length>0?`<section><h2>Ingredientes</h2><table><thead><tr><th>Insumo</th><th class="center">Cantidad</th><th class="right">Precio/U</th><th class="right">Subtotal</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3">Total costo lote</td><td class="right">Q${selected.estimated_cost.toFixed(2)}</td></tr></tfoot></table></section>`:''}
      ${(selected.bake_temp||selected.bake_time||selected.difficulty)?`<section><h2>Datos técnicos</h2><div class="chips">${selected.difficulty?`<span class="chip">${selected.difficulty==='fácil'?'● Fácil':selected.difficulty==='media'?'●● Media':'●●● Difícil'}</span>`:''} ${selected.bake_temp?`<span class="chip">🌡 ${selected.bake_temp}°C</span>`:''} ${selected.bake_time?`<span class="chip">⏱ ${selected.bake_time} min</span>`:''}</div></section>`:''}
      ${selected.description?`<section><h2>Descripción</h2><div class="desc">${selected.description}</div></section>`:''}
      ${selected.instructions?`<section><h2>Instrucciones</h2>${selected.instructions.split('\\n').filter((l:string)=>l.trim()).map((line:string,i:number)=>`<div class="step"><div class="step-n">${i+1}</div><div class="step-t">${line.trim()}</div></div>`).join('')}</section>`:''}
      <div class="footer"><span>Sistema Nodo</span><span>${new Date().toLocaleDateString('es-GT',{day:'2-digit',month:'long',year:'numeric'})}</span></div>
    </body></html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  const filtered = recipes.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const recipesSorted = [...recipes].map(r => {
    const ventaLote = r.sell_price * (r.estimated_yield || 1);
    const ganancia = ventaLote - r.estimated_cost;
    const margin = ventaLote > 0 && r.estimated_cost > 0 ? (ganancia / ventaLote) * 100 : null;
    return { ...r, ventaLote, ganancia, margin };
  }).sort((a, b) => {
    if (sortBy === 'name') return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    let va = 0, vb = 0;
    if (sortBy === 'margin') { va = a.margin ?? -Infinity; vb = b.margin ?? -Infinity; }
    if (sortBy === 'cost') { va = a.estimated_cost; vb = b.estimated_cost; }
    if (sortBy === 'revenue') { va = a.ventaLote; vb = b.ventaLote; }
    return sortDir === 'desc' ? vb - va : va - vb;
  });

  const profitCount = recipesSorted.filter(r => (r.margin ?? 0) >= 30).length;
  const lowCount    = recipesSorted.filter(r => r.margin !== null && r.margin >= 0 && r.margin < 30).length;
  const lossCount   = recipesSorted.filter(r => r.margin !== null && r.margin < 0).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-nodo-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full gap-4">

        {/* Toasts */}
        {error && (
          <div className="fixed top-4 right-4 z-[70] flex items-center gap-3 bg-nodo-danger-bg border border-nodo-danger-bd text-nodo-danger-tx text-sm font-bold px-4 py-3 rounded-2xl shadow-lg max-w-xs">
            <AlertTriangle size={16} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="shrink-0"><X size={14} /></button>
          </div>
        )}
        {success && (
          <div className="fixed top-4 right-4 z-[70] flex items-center gap-3 bg-nodo-success-bg border border-nodo-success-bd text-nodo-success-tx text-sm font-bold px-4 py-3 rounded-2xl shadow-lg max-w-xs">
            <Check size={16} className="shrink-0" />
            <span>{success}</span>
          </div>
        )}
        {pendingRemove && (
          <div className="fixed top-4 right-4 z-[70] flex items-center gap-3 bg-nodo-ink text-nodo-canvas text-sm font-medium px-4 py-3 rounded-2xl shadow-lg max-w-xs">
            <span className="text-nodo-canvas/70 flex-1">"{pendingRemove.ing.item_name}" eliminado</span>
            <button
              onClick={handleUndoRemove}
              className="text-nodo-canvas font-black text-xs border border-nodo-canvas/30 px-2.5 py-1 rounded-full active:bg-nodo-canvas/10 transition-colors shrink-0"
            >
              Deshacer
            </button>
          </div>
        )}

        {/* ── Header ── */}
        <div className="shrink-0">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <h1 className="text-[26px] font-black text-nodo-ink leading-tight">Recetario</h1>
              <p className="text-nodo-sub text-xs font-medium mt-0.5">
                {recipes.length} recetas
                {recipes.some(r => r.estimated_cost > 0)
                  ? ` · ${profitCount} saludables`
                  : ' · sin costos cargados'}
              </p>
            </div>
            <div className="flex-1 hidden sm:flex justify-center">
              <SegmentedControl
                options={VIEW_OPTS}
                value={viewMode}
                onChange={v => setViewMode(v as typeof viewMode)}
                size="sm"
              />
            </div>
            <button
              onClick={() => setShowNewRecipe(true)}
              className="w-11 h-11 rounded-full bg-nodo-primary text-nodo-on-primary flex items-center justify-center active:scale-90 transition-transform shrink-0"
              style={{ boxShadow: 'var(--nodo-shadow-fab)' }}
              title="Nueva receta"
            >
              <Plus size={18} strokeWidth={2.5} />
            </button>
          </div>
          <div className="sm:hidden mt-3">
            <SegmentedControl
              options={VIEW_OPTS}
              value={viewMode}
              onChange={v => setViewMode(v as typeof viewMode)}
              size="sm"
            />
          </div>
        </div>

        {/* ── VIEW: Recetario ── */}
        {viewMode === 'recetario' && (
          <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-4">

            {/* Left: Recipe List */}
            <div className={`lg:w-72 xl:w-80 shrink-0 flex flex-col bg-nodo-card rounded-3xl border border-nodo-line shadow-sm overflow-hidden ${showList ? '' : 'hidden lg:flex'}`}>
              <div className="p-4 border-b border-nodo-line space-y-3 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-nodo-dim pointer-events-none" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar receta..."
                    className="w-full h-10 pl-10 pr-4 bg-nodo-inset rounded-full text-sm font-semibold text-nodo-ink placeholder:text-nodo-dim focus:ring-2 focus:ring-nodo-primary/20 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-center px-4 gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-nodo-primary-soft flex items-center justify-center">
                      <BookOpen size={20} className="text-nodo-primary" />
                    </div>
                    <p className="text-xs font-bold text-nodo-dim">Sin recetas</p>
                  </div>
                ) : (
                  filtered.map(recipe => {
                    const isSelected = selected?.id === recipe.id;
                    const ventaLote = recipe.sell_price * recipe.estimated_yield;
                    const marginPct = ventaLote > 0 && recipe.estimated_cost > 0
                      ? ((ventaLote - recipe.estimated_cost) / ventaLote) * 100
                      : null;
                    return (
                      <button
                        key={recipe.id}
                        onClick={() => loadDetail(recipe.id)}
                        className={`w-full flex items-center gap-3 px-5 py-4 text-left transition-all border-b border-nodo-line last:border-0 ${
                          isSelected ? 'bg-nodo-primary' : 'hover:bg-nodo-inset'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? 'bg-white/20' : 'bg-nodo-primary-soft'}`}>
                          {recipe.icon
                            ? <span className="text-lg leading-none">{recipe.icon}</span>
                            : <ChefHat size={16} className={isSelected ? 'text-nodo-on-primary' : 'text-nodo-primary'} />
                          }
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-bold truncate ${isSelected ? 'text-nodo-on-primary' : 'text-nodo-ink'}`}>
                            {recipe.name}
                          </p>
                          <p className={`text-xs ${isSelected ? 'text-nodo-on-primary opacity-70' : 'text-nodo-sub'}`}>
                            {recipe.estimated_yield} {recipe.base_unit}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={`text-sm font-black tabular-nums ${isSelected ? 'text-nodo-on-primary' : 'text-nodo-ink'}`}>
                            Q{recipe.sell_price.toFixed(2)}
                          </p>
                          {marginPct !== null && (
                            <p className={`text-[10px] font-bold tabular-nums ${
                              marginPct >= 30 ? 'text-nodo-success-tx'
                              : marginPct >= 0 ? 'text-amber-500'
                              : 'text-nodo-danger-tx'
                            }`}>
                              {marginPct.toFixed(0)}%
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: Recipe Detail */}
            <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${!showList ? '' : 'hidden lg:flex'}`}>
              {loadingDetail ? (
                <div className="flex items-center justify-center h-64 bg-nodo-card rounded-3xl border border-nodo-line">
                  <Loader2 className="w-6 h-6 animate-spin text-nodo-primary" />
                </div>
              ) : selected ? (
                <div className="bg-nodo-card rounded-3xl border border-nodo-line shadow-sm flex-1 overflow-y-auto min-h-0 flex flex-col">
                  {/* Detail Header */}
                  <div className="px-6 lg:px-8 pt-6 lg:pt-8 border-b border-nodo-line shrink-0">
                    <div className="flex items-start justify-between gap-4 pb-5">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setShowList(true)}
                          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-full bg-nodo-inset text-nodo-sub active:scale-90 transition-transform"
                        >
                          <ArrowLeft size={18} />
                        </button>
                        {/* Ícono de receta con primary-soft */}
                        <div className="w-12 h-12 rounded-2xl bg-nodo-primary-soft flex items-center justify-center shrink-0">
                          {selected.icon
                            ? <span className="text-2xl leading-none">{selected.icon}</span>
                            : <ChefHat size={22} className="text-nodo-primary" />
                          }
                        </div>
                        <div>
                          <h2 className="text-xl font-black text-nodo-ink">{selected.name}</h2>
                          <p className="text-xs text-nodo-sub mt-0.5 tabular-nums whitespace-nowrap">
                            {selected.estimated_yield} {selected.base_unit} · Q{selected.sell_price.toFixed(2)} c/u
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={handlePrintRecipe}
                          className="w-9 h-9 flex items-center justify-center rounded-full text-nodo-sub hover:bg-nodo-inset transition-colors"
                          title="Imprimir"
                        >
                          <Printer size={17} />
                        </button>
                        <button
                          onClick={openEditRecipe}
                          className="w-9 h-9 flex items-center justify-center rounded-full text-nodo-sub hover:bg-nodo-inset transition-colors"
                          title="Editar"
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(selected.id)}
                          className="w-9 h-9 flex items-center justify-center rounded-full text-nodo-danger-tx hover:bg-nodo-danger-bg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </div>
                    <div className="pb-0">
                      <SegmentedControl
                        options={TAB_OPTS}
                        value={activeTab}
                        onChange={v => setActiveTab(v as typeof activeTab)}
                        size="sm"
                        className="mb-4"
                      />
                    </div>
                  </div>

                  {/* Tab: Costos */}
                  {activeTab === 'costos' && (
                    <div className="p-6 lg:p-8 space-y-6 flex-1 overflow-y-auto min-h-0">
                      {/* Alertas */}
                      {(() => {
                        const ventaLote = selected.sell_price * (selected.estimated_yield || 1);
                        const ganancia = ventaLote - selected.estimated_cost;
                        if (selected.estimated_cost > 0 && ganancia < 0) return (
                          <div className="flex items-start gap-3 bg-nodo-danger-bg border border-nodo-danger-bd rounded-2xl px-4 py-3">
                            <AlertTriangle size={15} className="text-nodo-danger-tx shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-bold text-nodo-danger-tx">Esta receta genera pérdida</p>
                              <p className="text-xs text-nodo-danger-tx/80 mt-0.5">
                                Costo del lote (Q{selected.estimated_cost.toFixed(2)}) supera el precio de venta (Q{ventaLote.toFixed(2)}).
                              </p>
                            </div>
                          </div>
                        );
                        if (selected.sell_price === 0 && selected.estimated_cost > 0) return (
                          <div className="flex items-start gap-3 bg-nodo-warn-bg border border-nodo-warn-bd rounded-2xl px-4 py-3">
                            <AlertTriangle size={15} className="text-nodo-warn-tx shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-bold text-nodo-warn-tx">Sin precio de venta registrado</p>
                              <p className="text-xs text-nodo-warn-tx/80 mt-0.5">Añade un precio de venta para calcular el margen real.</p>
                            </div>
                          </div>
                        );
                        return null;
                      })()}

                      {/* Resumen financiero — tarjeta única */}
                      {(() => {
                        const costTotal = selected.estimated_cost;
                        const yld = selected.estimated_yield || 1;
                        const costUnit = costTotal / yld;
                        const ventaLote = selected.sell_price * yld;
                        const gananciaLote = ventaLote - costTotal;
                        const marginPct = ventaLote > 0 ? (gananciaLote / ventaLote) * 100 : 0;
                        const profitable = gananciaLote >= 0;
                        const marginChip = marginPct >= 30
                          ? 'bg-violet-500/10 border-violet-500/20 text-violet-600 dark:text-violet-400'
                          : marginPct >= 0
                          ? 'bg-nodo-warn-bg border-nodo-warn-bd text-nodo-warn-tx'
                          : 'bg-nodo-danger-bg border-nodo-danger-bd text-nodo-danger-tx';
                        return (
                          <div className={`rounded-3xl p-5 ${profitable ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-nodo-danger-bg border border-nodo-danger-bd'}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className={`text-[10px] font-black uppercase tracking-wider mb-1 ${profitable ? 'text-blue-500' : 'text-nodo-danger-tx'}`}>
                                  Ganancia por lote
                                </p>
                                <p className={`text-[44px] font-black tabular-nums tracking-tight leading-none ${profitable ? 'text-blue-600 dark:text-blue-400' : 'text-nodo-danger-tx'}`}>
                                  {profitable ? '+' : ''}Q{gananciaLote.toFixed(2)}
                                </p>
                              </div>
                              <span className={`shrink-0 mt-1 px-3 py-1.5 rounded-full text-xs font-black border ${marginChip}`}>
                                {marginPct.toFixed(1)}% · {marginPct >= 30 ? 'Saludable' : marginPct >= 0 ? 'Bajo' : 'Pérdida'}
                              </span>
                            </div>
                            <div className={`flex gap-4 mt-3 pt-3 border-t ${profitable ? 'border-blue-500/10' : 'border-nodo-danger-tx/10'}`}>
                              <span className={`text-xs tabular-nums ${profitable ? 'text-blue-500/70' : 'text-nodo-danger-tx/70'}`}>
                                Costo: Q{costTotal.toFixed(2)}
                              </span>
                              <span className={`text-xs tabular-nums ${profitable ? 'text-blue-500/70' : 'text-nodo-danger-tx/70'}`}>
                                Venta: Q{ventaLote.toFixed(2)}
                              </span>
                              <span className={`text-xs tabular-nums ${profitable ? 'text-blue-500/70' : 'text-nodo-danger-tx/70'}`}>
                                Q{costUnit.toFixed(2)} / {selected.base_unit}
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Ingredientes */}
                      {(() => {
                        const selectedItem = inventory.find(i => i.id === newIng.inventory_item_id);
                        const filteredInv = inventory.filter(i =>
                          i.name.toLowerCase().includes(ingSearch.toLowerCase()) ||
                          (i.category ?? '').toLowerCase().includes(ingSearch.toLowerCase())
                        );
                        const groups = filteredInv.reduce<Record<string, typeof inventory>>((acc, i) => {
                          const cat = i.category ?? 'Sin categoría';
                          if (!acc[cat]) acc[cat] = [];
                          acc[cat].push(i);
                          return acc;
                        }, {});
                        return (
                          <div>
                            <p className="text-[10px] font-black text-nodo-dim uppercase tracking-wider mb-4">Ingredientes</p>
                            {selected.ingredients.length === 0 ? (
                              <div className="flex flex-col items-center py-6 mb-3 text-center gap-2">
                                <div className="w-12 h-12 rounded-2xl bg-nodo-primary-soft flex items-center justify-center">
                                  <Package size={20} className="text-nodo-primary" />
                                </div>
                                <p className="text-sm text-nodo-dim font-medium">Sin ingredientes — añade el primero abajo</p>
                              </div>
                            ) : (
                              <div className="bg-nodo-inset rounded-2xl border border-nodo-line overflow-hidden mb-3">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-nodo-line">
                                      <th className="text-left px-5 py-3 text-[10px] font-black text-nodo-dim uppercase tracking-wider">Insumo</th>
                                      <th className="text-center px-4 py-3 text-[10px] font-black text-nodo-dim uppercase tracking-wider">Cantidad</th>
                                      <th className="text-right px-4 py-3 text-[10px] font-black text-nodo-dim uppercase tracking-wider">Subtotal</th>
                                      <th className="px-3 py-3" />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {selected.ingredients.map(ing => (
                                      <tr key={ing.id} className="border-b border-nodo-line last:border-0 group">
                                        <td className="px-5 py-3 font-semibold text-nodo-ink">{ing.item_name}</td>
                                        <td className="px-4 py-3 text-center">
                                          {editingIngId === ing.id ? (
                                            <div className="flex items-center justify-center gap-1">
                                              <input
                                                type="number" min="0.01" step="0.01" autoFocus
                                                value={editingIngQty}
                                                onChange={e => setEditingIngQty(e.target.value)}
                                                onKeyDown={e => {
                                                  if (e.key === 'Enter') handleUpdateIngQty(ing.id);
                                                  if (e.key === 'Escape') { setEditingIngId(null); setEditingIngQty(''); }
                                                }}
                                                onBlur={() => handleUpdateIngQty(ing.id)}
                                                className="w-20 h-8 px-2 text-center text-sm font-bold border-2 border-nodo-primary rounded-xl outline-none bg-nodo-card text-nodo-ink"
                                              />
                                              <span className="text-xs text-nodo-sub">{ing.item_unit}</span>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() => { setEditingIngId(ing.id); setEditingIngQty(String(ing.quantity)); }}
                                              className="text-nodo-sub font-medium hover:text-nodo-ink hover:underline transition-colors"
                                              title="Clic para editar cantidad"
                                            >
                                              {ing.quantity} {ing.item_unit}
                                            </button>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-nodo-ink tabular-nums">
                                          {ing.subtotal > 0 ? `Q${ing.subtotal.toFixed(2)}` : <span className="text-nodo-dim font-medium">—</span>}
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                          <button
                                            onClick={() => handleRemoveIngredient(ing.id)}
                                            className="p-1.5 text-nodo-danger-tx/50 hover:text-nodo-danger-tx hover:bg-nodo-danger-bg rounded-full transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                          >
                                            <X size={14} />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t-2 border-nodo-line bg-nodo-card">
                                      <td colSpan={2} className="px-5 py-3 text-xs font-black text-nodo-dim uppercase tracking-wider">Total costo lote</td>
                                      <td className="px-4 py-3 text-right text-base font-black text-nodo-success-tx tabular-nums">Q{selected.estimated_cost.toFixed(2)}</td>
                                      <td className="px-3 py-3" />
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )}

                            {/* Inline add form */}
                            <div className="bg-nodo-card rounded-2xl border-2 border-dashed border-nodo-line p-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 relative">
                                  {selectedItem ? (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-nodo-primary rounded-xl h-10">
                                      <span className="text-sm font-bold text-nodo-on-primary flex-1 truncate">{selectedItem.name}</span>
                                      <span className="text-xs text-nodo-on-primary opacity-50 shrink-0">{selectedItem.unit}</span>
                                      <button
                                        onClick={() => { setNewIng(prev => ({ ...prev, inventory_item_id: '' })); setIngSearch(''); setIngDropOpen(true); }}
                                        className="text-nodo-on-primary opacity-50 hover:opacity-100 transition-opacity shrink-0"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-nodo-sub pointer-events-none" />
                                      <input
                                        value={ingSearch}
                                        onChange={e => { setIngSearch(e.target.value); setIngDropOpen(true); }}
                                        onFocus={() => setIngDropOpen(true)}
                                        onBlur={() => setTimeout(() => setIngDropOpen(false), 150)}
                                        placeholder="Buscar insumo de bodega..."
                                        className="w-full h-10 pl-9 pr-3 bg-nodo-inset border border-nodo-line rounded-xl text-sm font-semibold text-nodo-ink placeholder:text-nodo-dim focus:border-nodo-primary outline-none transition-colors"
                                      />
                                      {ingDropOpen && filteredInv.length > 0 && (
                                        <div className="absolute z-20 bottom-full mb-1 w-full bg-nodo-card border border-nodo-line-s rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                                          {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
                                            <div key={cat}>
                                              <p className="px-3 pt-2 pb-1 text-[10px] font-black text-nodo-dim uppercase tracking-wider">{cat}</p>
                                              {items.map(i => (
                                                <button
                                                  key={i.id}
                                                  onMouseDown={() => { setNewIng(prev => ({ ...prev, inventory_item_id: i.id })); setIngDropOpen(false); setIngSearch(''); }}
                                                  className="w-full text-left px-3 py-2 hover:bg-nodo-inset flex items-center justify-between gap-2 transition-colors"
                                                >
                                                  <span className="text-sm font-semibold text-nodo-ink">{i.name}</span>
                                                  <span className="text-xs text-nodo-sub">{i.unit}</span>
                                                </button>
                                              ))}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                                <input
                                  type="number" min="0.01" step="0.01"
                                  value={newIng.quantity}
                                  onChange={e => setNewIng(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                                  onKeyDown={e => { if (e.key === 'Enter' && newIng.inventory_item_id) handleAddIngredient(); }}
                                  placeholder={selectedItem?.unit ?? 'cant.'}
                                  className="w-16 sm:w-24 h-10 px-3 text-center bg-nodo-inset border border-nodo-line rounded-xl text-sm font-bold text-nodo-ink focus:border-nodo-primary outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <button
                                  onClick={handleAddIngredient}
                                  disabled={!newIng.inventory_item_id || saving}
                                  className="h-10 px-3 sm:px-4 bg-nodo-primary text-nodo-on-primary text-sm font-bold rounded-full active:scale-95 transition-transform disabled:opacity-30 flex items-center gap-1.5 shrink-0"
                                >
                                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                  Añadir
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Simulador */}
                      {selected.ingredients.length > 0 && (
                        <div>
                          <button
                            onClick={() => setShowSimulator(v => !v)}
                            className="flex items-center gap-2 text-xs font-bold text-nodo-sub hover:text-nodo-ink transition-colors"
                          >
                            <TrendingDown size={14} />
                            {showSimulator ? 'Ocultar simulador de precios' : 'Simular cambio de precios'}
                          </button>

                          {showSimulator && (
                            <div className="mt-4 bg-violet-500/10 border border-violet-500/20 rounded-2xl p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-black text-violet-600 dark:text-violet-400 uppercase tracking-wider">Simulador de precios</p>
                                <button
                                  onClick={() => setSimAdjustments({})}
                                  className="text-[10px] font-bold text-violet-400 hover:text-violet-600 dark:hover:text-violet-300 transition-colors"
                                >
                                  Resetear
                                </button>
                              </div>
                              <div className="space-y-2">
                                {selected.ingredients.filter(ing => ing.unit_cost > 0).map(ing => {
                                  const pct = simAdjustments[ing.id] ?? 0;
                                  const newCost = ing.unit_cost * (1 + pct / 100);
                                  return (
                                    <div key={ing.id} className="flex items-center gap-3">
                                      <span className="text-sm font-semibold text-nodo-ink flex-1 truncate min-w-0">{ing.item_name}</span>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <input
                                          type="number" min="-90" max="500" step="1"
                                          value={pct === 0 ? '' : pct}
                                          onChange={e => setSimAdjustments(prev => ({ ...prev, [ing.id]: parseFloat(e.target.value) || 0 }))}
                                          placeholder="0"
                                          className="w-16 h-8 px-2 text-center text-sm font-bold border-2 border-violet-500/30 bg-nodo-card rounded-xl outline-none focus:border-violet-500 transition-colors text-nodo-ink [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                        <span className="text-xs text-violet-500 font-bold">%</span>
                                      </div>
                                      <span className={`text-xs font-bold w-20 text-right shrink-0 tabular-nums ${
                                        pct > 0 ? 'text-nodo-danger-tx' : pct < 0 ? 'text-nodo-success-tx' : 'text-nodo-dim'
                                      }`}>
                                        Q{newCost.toFixed(2)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                              {(() => {
                                const simCost = selected.ingredients.reduce((sum, ing) => {
                                  const pct = simAdjustments[ing.id] ?? 0;
                                  return sum + ing.quantity * ing.unit_cost * (1 + pct / 100);
                                }, 0);
                                const yld = selected.estimated_yield || 1;
                                const ventaLote = selected.sell_price * yld;
                                const simGanancia = ventaLote - simCost;
                                const simMargin = ventaLote > 0 ? (simGanancia / ventaLote) * 100 : 0;
                                const delta = simCost - selected.estimated_cost;
                                return (
                                  <div className="bg-nodo-card rounded-xl p-3 flex items-center justify-between gap-4 border border-violet-500/20">
                                    <div className="text-center">
                                      <p className="text-[10px] font-black text-nodo-dim uppercase tracking-wider">Costo proyectado</p>
                                      <p className="text-lg font-black text-nodo-ink tabular-nums">Q{simCost.toFixed(2)}</p>
                                      <p className={`text-[10px] font-bold tabular-nums ${
                                        delta > 0 ? 'text-nodo-danger-tx' : delta < 0 ? 'text-nodo-success-tx' : 'text-nodo-dim'
                                      }`}>
                                        {delta > 0 ? '+' : ''}{delta !== 0 ? `Q${delta.toFixed(2)}` : 'sin cambio'}
                                      </p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-[10px] font-black text-nodo-dim uppercase tracking-wider">Margen proyectado</p>
                                      <p className={`text-lg font-black tabular-nums ${
                                        simMargin >= 30 ? 'text-violet-600 dark:text-violet-400'
                                        : simMargin >= 0 ? 'text-nodo-warn-tx' : 'text-nodo-danger-tx'
                                      }`}>{simMargin.toFixed(1)}%</p>
                                      <p className={`text-[10px] font-bold ${
                                        simMargin >= 30 ? 'text-violet-500' : simMargin >= 0 ? 'text-nodo-warn-tx' : 'text-nodo-danger-tx'
                                      }`}>
                                        {simMargin >= 30 ? 'Saludable' : simMargin >= 0 ? 'Bajo' : 'Pérdida'}
                                      </p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-[10px] font-black text-nodo-dim uppercase tracking-wider">Ganancia proyectada</p>
                                      <p className={`text-lg font-black tabular-nums ${
                                        simGanancia >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-nodo-danger-tx'
                                      }`}>
                                        {simGanancia >= 0 ? '+' : ''}Q{simGanancia.toFixed(2)}
                                      </p>
                                      <p className="text-[10px] text-nodo-dim font-medium">por lote</p>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab: Ficha técnica */}
                  {activeTab === 'ficha' && (
                    <div className="p-6 lg:p-8 flex-1 overflow-y-auto min-h-0">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black text-nodo-dim uppercase tracking-wider">Ficha técnica</p>
                          {!(selected.description || selected.bake_temp || selected.bake_time || selected.difficulty || selected.instructions) && (
                            <button
                              onClick={openEditRecipe}
                              className="text-xs font-bold text-nodo-sub hover:text-nodo-ink transition-colors flex items-center gap-1"
                            >
                              <Plus size={12} /> Añadir datos
                            </button>
                          )}
                        </div>

                        {!(selected.description || selected.bake_temp || selected.bake_time || selected.difficulty || selected.instructions) ? (
                          <button
                            onClick={openEditRecipe}
                            className="w-full text-left bg-nodo-inset border-2 border-dashed border-nodo-line rounded-2xl px-5 py-6 hover:border-nodo-primary/30 transition-all group"
                          >
                            <p className="text-sm font-semibold text-nodo-sub group-hover:text-nodo-ink transition-colors">
                              Sin instrucciones, temperatura ni notas aún
                            </p>
                            <p className="text-xs text-nodo-dim mt-1">Clic para añadir la ficha técnica</p>
                          </button>
                        ) : (
                          <>
                            {(selected.bake_temp || selected.bake_time || selected.difficulty) && (
                              <div className="flex flex-wrap gap-3">
                                {selected.difficulty && (
                                  <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                                    selected.difficulty === 'fácil' ? 'bg-nodo-success-bg text-nodo-success-tx border border-nodo-success-bd'
                                    : selected.difficulty === 'media' ? 'bg-nodo-warn-bg text-nodo-warn-tx border border-nodo-warn-bd'
                                    : 'bg-nodo-danger-bg text-nodo-danger-tx border border-nodo-danger-bd'
                                  }`}>
                                    {selected.difficulty === 'fácil' ? '● Fácil' : selected.difficulty === 'media' ? '●● Media' : '●●● Difícil'}
                                  </span>
                                )}
                                {selected.bake_temp && (
                                  <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                                    🌡 {selected.bake_temp}°C
                                  </span>
                                )}
                                {selected.bake_time && (
                                  <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                    ⏱ {selected.bake_time} min
                                  </span>
                                )}
                              </div>
                            )}

                            {selected.description && (
                              <div className="bg-nodo-inset rounded-2xl p-4 border border-nodo-line">
                                <p className="text-[10px] font-black text-nodo-dim uppercase tracking-wider mb-2">Descripción</p>
                                <p className="text-sm text-nodo-sub leading-relaxed">{selected.description}</p>
                              </div>
                            )}

                            {selected.instructions && (
                              <div className="bg-nodo-inset rounded-2xl p-4 border border-nodo-line">
                                <p className="text-[10px] font-black text-nodo-dim uppercase tracking-wider mb-3">Instrucciones</p>
                                <div className="space-y-2">
                                  {selected.instructions.split('\n').filter(l => l.trim()).map((line, i) => (
                                    <div key={i} className="flex gap-3">
                                      <span className="w-5 h-5 rounded-full bg-nodo-primary text-nodo-on-primary text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                                        {i + 1}
                                      </span>
                                      <p className="text-sm text-nodo-sub leading-relaxed">{line.trim()}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center bg-nodo-card rounded-3xl border border-nodo-line gap-3">
                  <div className="w-16 h-16 rounded-3xl bg-nodo-primary-soft flex items-center justify-center">
                    <BookOpen size={28} className="text-nodo-primary" />
                  </div>
                  <p className="text-sm font-bold text-nodo-dim">Selecciona una receta</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── VIEW: Rentabilidad ── */}
        {viewMode === 'rentabilidad' && (
          <div className="flex flex-col flex-1 min-h-0 gap-4 overflow-hidden">
            {/* KPI asimétrico — saludables como hero */}
            <div className="grid grid-cols-2 gap-3 shrink-0">
              <div className="col-span-2 bg-nodo-success-bg border border-nodo-success-bd rounded-3xl px-5 py-5">
                <p className="text-[10px] font-black text-nodo-success-tx uppercase tracking-wider">Recetas saludables ≥30%</p>
                <p className="text-[48px] font-black text-nodo-success-tx tabular-nums tracking-tight leading-none mt-1">{profitCount}</p>
              </div>
              <div className="bg-nodo-warn-bg border border-nodo-warn-bd rounded-3xl px-5 py-4">
                <p className="text-[10px] font-black text-nodo-warn-tx uppercase tracking-wider">Margen bajo</p>
                <p className="text-[32px] font-black text-nodo-warn-tx tabular-nums leading-none mt-1">{lowCount}</p>
              </div>
              <div className="bg-nodo-danger-bg border border-nodo-danger-bd rounded-3xl px-5 py-4">
                <p className="text-[10px] font-black text-nodo-danger-tx uppercase tracking-wider">En pérdida</p>
                <p className="text-[32px] font-black text-nodo-danger-tx tabular-nums leading-none mt-1">{lossCount}</p>
              </div>
            </div>

            {recipesSorted.length > 0 && recipesSorted.every(r => r.margin === null) && (
              <div className="flex items-start gap-3 bg-nodo-warn-bg border border-nodo-warn-bd rounded-2xl px-4 py-3 shrink-0">
                <AlertTriangle size={15} className="text-nodo-warn-tx shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-nodo-warn-tx">Los insumos no tienen precio en Bodega</p>
                  <p className="text-xs text-nodo-warn-tx mt-0.5 opacity-80">Añade precios a los insumos en el módulo de Bodega para calcular márgenes reales.</p>
                </div>
              </div>
            )}

            <div className="bg-nodo-card rounded-3xl border border-nodo-line shadow-sm flex-1 overflow-hidden flex flex-col">
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-nodo-card z-10 border-b border-nodo-line">
                    <tr>
                      <th className="text-left px-6 py-4">
                        <button onClick={() => toggleSort('name')} className="flex items-center gap-1.5 text-[10px] font-black text-nodo-dim uppercase tracking-wider hover:text-nodo-ink transition-colors">
                          Nombre {sortBy === 'name' ? <ArrowUpDown size={12} className="text-nodo-ink" /> : <ArrowUpDown size={12} className="opacity-30" />}
                        </button>
                      </th>
                      <th className="text-right px-4 py-4">
                        <button onClick={() => toggleSort('cost')} className="flex items-center gap-1.5 text-[10px] font-black text-nodo-dim uppercase tracking-wider hover:text-nodo-ink transition-colors ml-auto">
                          Costo Lote {sortBy === 'cost' ? <ArrowUpDown size={12} className="text-nodo-ink" /> : <ArrowUpDown size={12} className="opacity-30" />}
                        </button>
                      </th>
                      <th className="text-right px-4 py-4">
                        <button onClick={() => toggleSort('revenue')} className="flex items-center gap-1.5 text-[10px] font-black text-nodo-dim uppercase tracking-wider hover:text-nodo-ink transition-colors ml-auto">
                          Precio Venta {sortBy === 'revenue' ? <ArrowUpDown size={12} className="text-nodo-ink" /> : <ArrowUpDown size={12} className="opacity-30" />}
                        </button>
                      </th>
                      <th className="text-right px-4 py-4 text-[10px] font-black text-nodo-dim uppercase tracking-wider">Ganancia</th>
                      <th className="text-right px-4 py-4">
                        <button onClick={() => toggleSort('margin')} className="flex items-center gap-1.5 text-[10px] font-black text-nodo-dim uppercase tracking-wider hover:text-nodo-ink transition-colors ml-auto">
                          Margen % {sortBy === 'margin' ? <ArrowUpDown size={12} className="text-nodo-ink" /> : <ArrowUpDown size={12} className="opacity-30" />}
                        </button>
                      </th>
                      <th className="text-center px-4 py-4 text-[10px] font-black text-nodo-dim uppercase tracking-wider">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipesSorted.map(r => {
                      const profitable = r.ganancia >= 0;
                      const marginColor = r.margin === null ? 'text-nodo-dim'
                        : r.margin >= 30 ? 'text-nodo-success-tx'
                        : r.margin >= 0 ? 'text-amber-500'
                        : 'text-nodo-danger-tx';
                      const statusLabel = r.margin === null
                        ? { label: 'Sin precio', cls: 'bg-nodo-inset text-nodo-sub' }
                        : r.margin >= 30
                          ? { label: 'Saludable', cls: 'bg-nodo-success-bg text-nodo-success-tx border border-nodo-success-bd' }
                          : r.margin >= 0
                            ? { label: 'Margen bajo', cls: 'bg-nodo-warn-bg text-nodo-warn-tx border border-nodo-warn-bd' }
                            : { label: 'En pérdida', cls: 'bg-nodo-danger-bg text-nodo-danger-tx border border-nodo-danger-bd' };
                      return (
                        <tr
                          key={r.id}
                          onClick={() => { setViewMode('recetario'); loadDetail(r.id); }}
                          className="border-b border-nodo-line hover:bg-nodo-inset cursor-pointer transition-colors"
                        >
                          <td className="px-6 py-3.5 font-bold text-nodo-ink">{r.name}</td>
                          <td className="px-4 py-3.5 text-right text-nodo-sub font-medium tabular-nums">
                            {r.estimated_cost > 0 ? `Q${r.estimated_cost.toFixed(2)}` : <span className="text-nodo-dim">—</span>}
                          </td>
                          <td className="px-4 py-3.5 text-right text-nodo-sub font-medium tabular-nums">
                            {r.ventaLote > 0 ? `Q${r.ventaLote.toFixed(2)}` : <span className="text-nodo-dim">—</span>}
                          </td>
                          <td className={`px-4 py-3.5 text-right font-bold tabular-nums ${profitable ? 'text-blue-600 dark:text-blue-400' : 'text-nodo-danger-tx'}`}>
                            {r.estimated_cost > 0 && r.ventaLote > 0
                              ? `${profitable ? '+' : ''}Q${r.ganancia.toFixed(2)}`
                              : <span className="text-nodo-dim font-medium">—</span>}
                          </td>
                          <td className={`px-4 py-3.5 text-right font-black tabular-nums ${marginColor}`}>
                            {r.margin !== null ? `${r.margin.toFixed(1)}%` : '—'}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${statusLabel.cls}`}>
                              {statusLabel.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {recipesSorted.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-nodo-primary-soft flex items-center justify-center">
                      <BarChart3 size={20} className="text-nodo-primary" />
                    </div>
                    <p className="text-xs font-bold text-nodo-dim">Sin recetas para analizar</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── BottomSheet: Nueva Receta ── */}
      <RecipeFormModal
        open={showNewRecipe}
        mode="create"
        values={newRecipe}
        onChange={patch => setNewRecipe(prev => ({ ...prev, ...patch }))}
        onSubmit={handleCreate}
        onClose={() => { setShowNewRecipe(false); setNewRecipe(emptyRecipeForm); }}
        saving={saving}
      />

      {/* ── BottomSheet: Editar Receta ── */}
      <RecipeFormModal
        open={showEditRecipe && !!selected}
        mode="edit"
        values={editRecipe}
        onChange={patch => setEditRecipe(prev => ({ ...prev, ...patch }))}
        onSubmit={handleEditRecipe}
        onClose={() => setShowEditRecipe(false)}
        saving={saving}
      />

      {/* ── BottomSheet: Confirmar Eliminación ── */}
      <BottomSheet
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Eliminar receta"
        footer={
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmDelete(null)}
              className="flex-1 h-14 rounded-full border-2 border-nodo-line text-nodo-sub font-bold text-sm active:scale-[0.97] transition-transform"
            >
              Cancelar
            </button>
            <button
              onClick={() => confirmDelete && handleDeleteRecipe(confirmDelete)}
              className="flex-1 h-14 rounded-full bg-nodo-danger-tx text-white font-bold text-sm active:scale-[0.97] transition-transform"
            >
              Sí, eliminar
            </button>
          </div>
        }
      >
        <div className="flex flex-col items-center text-center gap-4 py-4">
          <div className="w-16 h-16 rounded-full bg-nodo-danger-bg border border-nodo-danger-bd flex items-center justify-center">
            <AlertTriangle size={28} className="text-nodo-danger-tx" />
          </div>
          <p className="text-nodo-sub text-sm leading-relaxed">
            Se eliminará <span className="font-bold text-nodo-ink">{recipes.find(r => r.id === confirmDelete)?.name}</span>. Esta acción no se puede deshacer.
          </p>
        </div>
      </BottomSheet>
    </>
  );
}
