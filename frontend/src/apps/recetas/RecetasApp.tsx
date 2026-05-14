import { useState } from 'react';
import { BookOpen, Search, Copy, Pencil, Check, X, DollarSign, Clock, ChefHat } from 'lucide-react';
import type { AppProps } from '../index';

// ── Mock Data ──
interface Recipe {
  id: string;
  name: string;
  emoji: string;
  yield: string;
  time: string;
  ingredients: { name: string; amount: string; unit: string; cost: number }[];
  steps: string[];
}

const MOCK_RECIPES: Recipe[] = [
  {
    id: '1', name: 'Pan Francés', emoji: '🥖', yield: '50 unidades', time: '2h 30min',
    ingredients: [
      { name: 'Harina', amount: '5', unit: 'kg', cost: 12.50 },
      { name: 'Agua', amount: '3', unit: 'L', cost: 0.50 },
      { name: 'Sal', amount: '100', unit: 'g', cost: 0.40 },
      { name: 'Levadura', amount: '50', unit: 'g', cost: 3.00 },
    ],
    steps: ['Mezclar harina, agua, sal y levadura hasta formar masa homogénea', 'Amasar por 15 minutos hasta obtener elasticidad', 'Dejar reposar 1 hora cubierto con paño húmedo', 'Dividir en porciones de 80g y dar forma alargada', 'Realizar cortes diagonales en la superficie', 'Hornear 25 minutos a 200°C con vapor'],
  },
  {
    id: '2', name: 'Concha', emoji: '🥐', yield: '30 unidades', time: '3h',
    ingredients: [
      { name: 'Harina', amount: '3', unit: 'kg', cost: 7.50 },
      { name: 'Azúcar', amount: '800', unit: 'g', cost: 4.00 },
      { name: 'Mantequilla', amount: '500', unit: 'g', cost: 15.00 },
      { name: 'Huevos', amount: '10', unit: 'unid', cost: 8.00 },
      { name: 'Vainilla', amount: '20', unit: 'ml', cost: 1.50 },
    ],
    steps: ['Preparar masa dulce con harina, azúcar, mantequilla y huevos', 'Amasar 20 minutos hasta obtener textura suave', 'Dejar fermentar 1.5 horas', 'Preparar cobertura con mantequilla, azúcar glass y harina', 'Formar bolas de 70g y cubrir con cobertura marcando patrón', 'Hornear 20 minutos a 180°C'],
  },
  {
    id: '3', name: 'Polvorón', emoji: '🍪', yield: '40 unidades', time: '1h 30min',
    ingredients: [
      { name: 'Harina', amount: '2', unit: 'kg', cost: 5.00 },
      { name: 'Mantequilla', amount: '1', unit: 'kg', cost: 30.00 },
      { name: 'Azúcar glass', amount: '500', unit: 'g', cost: 5.00 },
      { name: 'Canela', amount: '15', unit: 'g', cost: 2.00 },
    ],
    steps: ['Cremar mantequilla con azúcar glass', 'Incorporar harina y canela', 'Mezclar hasta obtener masa arenosa', 'Moldear en formas ovaladas', 'Hornear 15 minutos a 170°C', 'Espolvorear con azúcar glass al enfriar'],
  },
  {
    id: '4', name: 'Cuerno', emoji: '🥮', yield: '25 unidades', time: '4h',
    ingredients: [
      { name: 'Harina', amount: '2', unit: 'kg', cost: 5.00 },
      { name: 'Mantequilla', amount: '800', unit: 'g', cost: 24.00 },
      { name: 'Leche', amount: '500', unit: 'ml', cost: 3.00 },
      { name: 'Huevos', amount: '4', unit: 'unid', cost: 3.20 },
      { name: 'Azúcar', amount: '200', unit: 'g', cost: 1.00 },
    ],
    steps: ['Preparar masa base con harina, leche y huevos', 'Laminar con mantequilla (técnica hojaldrada)', 'Refrigerar 30 min entre cada laminado (3 veces)', 'Estirar y cortar triángulos', 'Enrollar del lado ancho al angosto dando forma de cuerno', 'Barnizar con huevo y hornear 18 min a 190°C'],
  },
  {
    id: '5', name: 'Dona', emoji: '🍩', yield: '60 unidades', time: '2h',
    ingredients: [
      { name: 'Harina', amount: '3', unit: 'kg', cost: 7.50 },
      { name: 'Azúcar', amount: '400', unit: 'g', cost: 2.00 },
      { name: 'Huevos', amount: '8', unit: 'unid', cost: 6.40 },
      { name: 'Aceite', amount: '2', unit: 'L', cost: 18.00 },
      { name: 'Levadura', amount: '40', unit: 'g', cost: 2.40 },
    ],
    steps: ['Preparar masa con harina, azúcar, huevos y levadura', 'Amasar 10 minutos', 'Reposar 45 minutos', 'Estirar y cortar aros con cortador', 'Freír en aceite a 180°C por ambos lados', 'Glasear o cubrir con azúcar y canela'],
  },
  {
    id: '6', name: 'Pan Integral', emoji: '🍞', yield: '20 unidades', time: '3h',
    ingredients: [
      { name: 'Harina integral', amount: '3', unit: 'kg', cost: 10.50 },
      { name: 'Miel', amount: '200', unit: 'ml', cost: 8.00 },
      { name: 'Aceite de oliva', amount: '150', unit: 'ml', cost: 6.00 },
      { name: 'Levadura', amount: '30', unit: 'g', cost: 1.80 },
      { name: 'Sal', amount: '50', unit: 'g', cost: 0.20 },
    ],
    steps: ['Activar levadura en agua tibia con miel', 'Mezclar con harina integral, aceite y sal', 'Amasar 15 minutos', 'Reposar 1.5 horas', 'Formar panes y colocar en molde', 'Hornear 35 minutos a 190°C'],
  },
];

export function RecetasApp(_props: AppProps) {
  const [recipes] = useState<Recipe[]>(MOCK_RECIPES);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_RECIPES[0]?.id || null);
  const [showList, setShowList] = useState(true); // mobile toggle

  const filtered = recipes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  const selected = recipes.find(r => r.id === selectedId);
  const totalCost = selected ? selected.ingredients.reduce((sum, i) => sum + i.cost, 0) : 0;

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setShowList(false); // mobile: show detail
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6">
      {/* ── LEFT: Recipe List ── */}
      <div className={`lg:w-72 xl:w-80 shrink-0 flex flex-col bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden ${showList ? '' : 'hidden lg:flex'}`}>
        {/* Search */}
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar receta..."
              className="w-full h-10 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-[#111] placeholder:text-slate-400 focus:ring-2 focus:ring-[#111]/5 focus:border-slate-300 outline-none transition-all"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map(recipe => (
            <button
              key={recipe.id}
              onClick={() => handleSelect(recipe.id)}
              className={`w-full flex items-center gap-3 px-5 py-4 text-left transition-all border-b border-slate-50 ${
                selectedId === recipe.id
                  ? 'bg-[#111] text-white'
                  : 'hover:bg-slate-50 text-[#111]'
              }`}
            >
              <span className="text-2xl">{recipe.emoji}</span>
              <div className="min-w-0">
                <p className={`text-sm font-bold truncate ${selectedId === recipe.id ? 'text-white' : 'text-[#111]'}`}>{recipe.name}</p>
                <p className={`text-xs ${selectedId === recipe.id ? 'text-white/60' : 'text-slate-400'}`}>{recipe.yield}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── RIGHT: Recipe Detail ── */}
      <div className={`flex-1 flex flex-col min-w-0 ${!showList ? '' : 'hidden lg:flex'}`}>
        {selected ? (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm flex-1 overflow-y-auto">
            {/* Detail Header */}
            <div className="p-6 lg:p-8 border-b border-slate-100">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  {/* Mobile back button */}
                  <button onClick={() => setShowList(true)} className="lg:hidden p-2 -ml-2 hover:bg-slate-100 rounded-xl text-slate-400">
                    ← 
                  </button>
                  <span className="text-5xl">{selected.emoji}</span>
                  <div>
                    <h2 className="text-2xl font-black text-[#111]">{selected.name}</h2>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                        <ChefHat size={12} /> {selected.yield}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                        <Clock size={12} /> {selected.time}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition-colors flex items-center gap-1.5 active:scale-95">
                    <Copy size={14} /> Duplicar
                  </button>
                  <button className="px-4 py-2 rounded-xl bg-[#111] text-white text-xs font-bold hover:bg-[#222] transition-colors flex items-center gap-1.5 active:scale-95">
                    <Pencil size={14} /> Editar
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 lg:p-8 space-y-8">
              {/* Cost Card */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600">
                    <DollarSign size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-500 uppercase tracking-wider">Costo Estimado</p>
                    <p className="text-sm text-emerald-600 font-medium">{selected.ingredients.length} ingredientes</p>
                  </div>
                </div>
                <p className="text-3xl font-black text-emerald-700">Q{totalCost.toFixed(2)}</p>
              </div>

              {/* Ingredients */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">Ingredientes</p>
                <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Insumo</th>
                        <th className="text-center px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cantidad</th>
                        <th className="text-right px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Costo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.ingredients.map((ing, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="px-5 py-3 font-semibold text-[#111]">{ing.name}</td>
                          <td className="px-4 py-3 text-center text-slate-500 font-medium">{ing.amount} {ing.unit}</td>
                          <td className="px-5 py-3 text-right font-bold text-[#111]">Q{ing.cost.toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="bg-white">
                        <td colSpan={2} className="px-5 py-3 text-right font-bold text-slate-400 text-xs uppercase tracking-wider">Total</td>
                        <td className="px-5 py-3 text-right font-black text-[#111] text-base">Q{totalCost.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Steps */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">Pasos de Elaboración</p>
                <div className="space-y-3">
                  {selected.steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-4 group">
                      <div className="w-8 h-8 rounded-xl bg-[#111] text-white flex items-center justify-center text-xs font-black shrink-0 group-hover:scale-110 transition-transform">
                        {i + 1}
                      </div>
                      <p className="text-sm text-slate-600 font-medium pt-1.5 leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <BookOpen size={48} className="text-slate-200 mb-4" />
            <p className="text-sm font-bold text-slate-300">Selecciona una receta</p>
          </div>
        )}
      </div>
    </div>
  );
}
