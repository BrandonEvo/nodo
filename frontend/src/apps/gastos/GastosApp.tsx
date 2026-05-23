import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, AlertTriangle, ChevronDown, ChevronUp,
  DollarSign, Users, Package, Wrench, TrendingDown, Banknote,
} from 'lucide-react';
import type { AppProps } from '../index';
import { gastosService, type ExpenseLine, type ExpenseSummary, CATEGORY_LABELS, CC_LABELS } from '@/services/gastos.service';

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const fmt = (n: number) =>
  'Q' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CATEGORY_ICONS: Record<string, typeof DollarSign> = {
  operating_expense: Wrench,
  owner_drawing: Users,
  financing_cost: Banknote,
};

const CC_ICONS: Record<string, typeof DollarSign> = {
  administrativos: Users,
  empaques: Package,
  produccion: Wrench,
  ventas: TrendingDown,
  mantenimiento: Wrench,
};

type FormData = {
  category: string;
  cost_center: string;
  concept: string;
  qty: string;
  unit_cost: string;
  notes: string;
};

const EMPTY_FORM: FormData = {
  category: 'operating_expense',
  cost_center: 'administrativos',
  concept: '',
  qty: '1',
  unit_cost: '',
  notes: '',
};

export function GastosApp(_props: AppProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await gastosService.getSummary(monthStr);
      setSummary(data);
    } catch {
      setError('Error al cargar gastos');
    } finally {
      setLoading(false);
    }
  }, [monthStr]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (line: ExpenseLine) => {
    setEditingId(line.id);
    setForm({
      category: line.category,
      cost_center: line.cost_center ?? '',
      concept: line.concept,
      qty: String(line.qty),
      unit_cost: String(line.unit_cost),
      notes: line.notes ?? '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.concept.trim() || !form.unit_cost) return;
    setSaving(true);
    try {
      const payload = {
        category: form.category,
        cost_center: form.cost_center || null,
        concept: form.concept.trim(),
        qty: parseFloat(form.qty) || 1,
        unit_cost: parseFloat(form.unit_cost),
        month: `${year}-${String(month).padStart(2, '0')}-01`,
        notes: form.notes || null,
      };
      if (editingId) {
        await gastosService.update(editingId, payload);
      } else {
        await gastosService.create(payload);
      }
      setShowForm(false);
      await load();
    } catch {
      setError('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await gastosService.remove(id);
      await load();
    } catch {
      setError('Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleCollapse = (key: string) =>
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  const categories = ['operating_expense', 'owner_drawing', 'financing_cost'] as const;

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-slate-600" />
          <h1 className="text-lg font-semibold text-slate-800">Gastos Generales (OPEX)</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      )}

      {/* Totales resumen */}
      {!loading && summary && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'OPEX Operativo', val: summary.totals.operating_expense },
              { label: 'Retiros Propietario', val: summary.totals.owner_drawing },
              { label: 'Costos Financieros', val: summary.totals.financing_cost },
              { label: 'Total Gastos', val: summary.totals.total, accent: true },
            ].map(({ label, val, accent }) => (
              <div
                key={label}
                className={`rounded-xl border p-4 ${accent ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
              >
                <p className={`text-xs font-medium mb-1 ${accent ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
                <p className={`text-lg font-bold ${accent ? 'text-white' : 'text-slate-800'}`}>{fmt(val)}</p>
              </div>
            ))}
          </div>

          {/* Secciones por categoría */}
          {categories.map(cat => {
            const lines: ExpenseLine[] = summary.expenses[cat] ?? [];
            const catTotal = lines.reduce((s, l) => s + l.total, 0);
            const Icon = CATEGORY_ICONS[cat] ?? DollarSign;
            const isOpen = !collapsed[cat];

            // Para operating_expense agrupar por cost_center
            const groups = cat === 'operating_expense'
              ? groupByCostCenter(lines)
              : { [cat]: lines };

            return (
              <div key={cat} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => toggleCollapse(cat)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-slate-500" />
                    <span className="font-semibold text-slate-700 text-sm">
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <span className="text-xs text-slate-400">({lines.length} líneas)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-800">{fmt(catTotal)}</span>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100">
                    {Object.entries(groups).map(([ccKey, ccLines]) => {
                      const ccTotal = ccLines.reduce((s, l) => s + l.total, 0);
                      const CCIcon = CC_ICONS[ccKey] ?? DollarSign;
                      return (
                        <div key={ccKey}>
                          {cat === 'operating_expense' && (
                            <div className="flex items-center justify-between px-5 py-2 bg-slate-50 border-b border-slate-100">
                              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">
                                <CCIcon className="w-3 h-3" />
                                {CC_LABELS[ccKey] ?? ccKey}
                              </div>
                              <span className="text-xs font-semibold text-slate-600">{fmt(ccTotal)}</span>
                            </div>
                          )}
                          <table className="w-full text-sm">
                            <tbody className="divide-y divide-slate-50">
                              {ccLines.map(line => (
                                <tr key={line.id} className="hover:bg-slate-50 transition-colors group">
                                  <td className="px-5 py-2.5 text-slate-700">{line.concept}</td>
                                  <td className="px-3 py-2.5 text-right text-slate-500 text-xs font-mono whitespace-nowrap">
                                    {line.qty} × {fmt(line.unit_cost)}
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-semibold text-slate-800 font-mono text-xs whitespace-nowrap">
                                    {fmt(line.total)}
                                  </td>
                                  <td className="px-3 py-2.5 text-right">
                                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={() => openEdit(line)}
                                        className="p-1 rounded hover:bg-blue-50 text-blue-500"
                                        title="Editar"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDelete(line.id)}
                                        disabled={deletingId === line.id}
                                        className="p-1 rounded hover:bg-red-50 text-red-400"
                                        title="Eliminar"
                                      >
                                        {deletingId === line.id
                                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          : <Trash2 className="w-3.5 h-3.5" />}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}

                    {lines.length === 0 && (
                      <p className="px-5 py-4 text-sm text-slate-400">Sin gastos registrados en esta categoría.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* Modal de formulario */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-800">
              {editingId ? 'Editar gasto' : 'Nuevo gasto'}
            </h2>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Categoría</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value, cost_center: e.target.value === 'operating_expense' ? 'administrativos' : '' }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                {form.category === 'operating_expense' && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Centro de costo</label>
                    <select
                      value={form.cost_center}
                      onChange={e => setForm(f => ({ ...f, cost_center: e.target.value }))}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {Object.entries(CC_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Concepto</label>
                <input
                  type="text"
                  value={form.concept}
                  onChange={e => setForm(f => ({ ...f, concept: e.target.value }))}
                  placeholder="Ej: Sueldo Administrador"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Cantidad</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.qty}
                    onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Costo unitario (Q)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unit_cost}
                    onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))}
                    placeholder="0.00"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {form.qty && form.unit_cost && (
                <p className="text-xs text-slate-500 text-right">
                  Total: <span className="font-semibold text-slate-700">{fmt(parseFloat(form.qty || '0') * parseFloat(form.unit_cost || '0'))}</span>
                </p>
              )}

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Notas (opcional)</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 text-sm border border-slate-200 text-slate-600 rounded-lg py-2 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.concept.trim() || !form.unit_cost}
                className="flex-1 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg py-2 transition-colors flex items-center justify-center gap-1.5"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingId ? 'Guardar cambios' : 'Crear gasto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function groupByCostCenter(lines: ExpenseLine[]): Record<string, ExpenseLine[]> {
  const result: Record<string, ExpenseLine[]> = {};
  for (const line of lines) {
    const key = line.cost_center ?? 'otros';
    if (!result[key]) result[key] = [];
    result[key].push(line);
  }
  return result;
}
