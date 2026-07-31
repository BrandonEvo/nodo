import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, AlertTriangle, ChevronDown, ChevronUp,
  DollarSign, Users, Package, Wrench, TrendingDown, Banknote, Check,
} from 'lucide-react';
import type { AppProps } from '../index';
import { useModuleChrome } from '@/components/chrome/ModuleChrome';
import { gastosService, type ExpenseLine, type ExpenseSummary, CATEGORY_LABELS, CC_LABELS } from '@/services/gastos.service';
import { BottomSheet } from '@/components/ui/BottomSheet';

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

  useModuleChrome('Gastos Generales (OPEX)');

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
        cost_center: form.category === 'operating_expense' ? form.cost_center : undefined,
        concept: form.concept.trim(),
        qty: parseFloat(form.qty) || 1,
        unit_cost: parseFloat(form.unit_cost),
        notes: form.notes.trim() || undefined,
        month: monthStr,
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
    <>
      {error && (
        <div className="fixed top-4 right-4 z-[70] flex items-center gap-3 bg-nodo-danger-bg border border-nodo-danger-bd text-nodo-danger-tx text-sm font-bold px-4 py-3 rounded-2xl shadow-lg max-w-xs">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0"><AlertTriangle size={14} /></button>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="nodo-select h-9 text-sm px-3"
            >
              {MONTHS.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="nodo-select h-9 text-sm px-3"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 bg-nodo-ink text-nodo-canvas text-sm font-bold px-3 h-9 rounded-xl transition-colors active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Agregar
            </button>
          </div>
        </div>

        {loading && (
          <div className="nodo-spinner-container">
            <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
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
                  className={`rounded-xl border p-4 ${accent ? 'bg-nodo-ink border-nodo-ink' : 'bg-nodo-card border-nodo-line'}`}
                >
                  <p className={`text-xs font-medium mb-1 ${accent ? 'text-nodo-canvas/50' : 'text-nodo-sub'}`}>{label}</p>
                  <p className={`text-lg font-bold tabular-nums ${accent ? 'text-nodo-canvas' : 'text-nodo-ink'}`}>{fmt(val)}</p>
                </div>
              ))}
            </div>

            {/* Secciones por categoría */}
            {categories.map(cat => {
              const lines: ExpenseLine[] = summary.expenses[cat] ?? [];
              const catTotal = lines.reduce((s, l) => s + l.total, 0);
              const Icon = CATEGORY_ICONS[cat] ?? DollarSign;
              const isOpen = !collapsed[cat];

              const groups = cat === 'operating_expense'
                ? groupByCostCenter(lines)
                : { [cat]: lines };

              return (
                <div key={cat} className="bg-nodo-card rounded-xl border border-nodo-line overflow-hidden">
                  <button
                    onClick={() => toggleCollapse(cat)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-nodo-inset transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-nodo-sub" />
                      <span className="font-semibold text-nodo-ink text-sm">
                        {CATEGORY_LABELS[cat]}
                      </span>
                      <span className="text-xs text-nodo-dim">({lines.length} líneas)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-nodo-ink tabular-nums">{fmt(catTotal)}</span>
                      {isOpen
                        ? <ChevronUp className="w-4 h-4 text-nodo-dim" />
                        : <ChevronDown className="w-4 h-4 text-nodo-dim" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-nodo-line">
                      {Object.entries(groups).map(([ccKey, ccLines]) => {
                        const ccTotal = ccLines.reduce((s, l) => s + l.total, 0);
                        const CCIcon = CC_ICONS[ccKey] ?? DollarSign;
                        return (
                          <div key={ccKey}>
                            {cat === 'operating_expense' && (
                              <div className="flex items-center justify-between px-5 py-2 bg-nodo-inset border-b border-nodo-line">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-nodo-sub uppercase tracking-wide">
                                  <CCIcon className="w-3 h-3" />
                                  {CC_LABELS[ccKey] ?? ccKey}
                                </div>
                                <span className="text-xs font-semibold text-nodo-sub tabular-nums">{fmt(ccTotal)}</span>
                              </div>
                            )}
                            <table className="w-full text-sm">
                              <tbody className="divide-y divide-nodo-line">
                                {ccLines.map(line => (
                                  <tr key={line.id} className="hover:bg-nodo-inset transition-colors group">
                                    <td className="px-5 py-2.5 text-nodo-ink">{line.concept}</td>
                                    <td className="px-3 py-2.5 text-right text-nodo-sub text-xs font-mono whitespace-nowrap">
                                      {line.qty} × {fmt(line.unit_cost)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-semibold text-nodo-ink font-mono text-xs whitespace-nowrap tabular-nums">
                                      {fmt(line.total)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right">
                                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                          onClick={() => openEdit(line)}
                                          className="p-1 rounded hover:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                          title="Editar"
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => handleDelete(line.id)}
                                          disabled={deletingId === line.id}
                                          className="p-1 rounded hover:bg-nodo-danger-bg text-nodo-danger-tx"
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
                        <p className="px-5 py-4 text-sm text-nodo-dim">Sin gastos registrados en esta categoría.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      <BottomSheet
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? 'Editar gasto' : 'Nuevo gasto'}
        footer={
          <button
            onClick={handleSave}
            disabled={saving || !form.concept.trim() || !form.unit_cost}
            className="nodo-btn-primary"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {editingId ? 'GUARDAR CAMBIOS' : 'CREAR GASTO'}
          </button>
        }
      >
        <div className="space-y-4 px-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="nodo-label">Categoría</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value, cost_center: e.target.value === 'operating_expense' ? 'administrativos' : '' }))}
                className="nodo-select"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            {form.category === 'operating_expense' && (
              <div>
                <label className="nodo-label">Centro de costo</label>
                <select
                  value={form.cost_center}
                  onChange={e => setForm(f => ({ ...f, cost_center: e.target.value }))}
                  className="nodo-select"
                >
                  {Object.entries(CC_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="nodo-label">Concepto</label>
            <input
              type="text"
              value={form.concept}
              onChange={e => setForm(f => ({ ...f, concept: e.target.value }))}
              placeholder="Ej: Sueldo Administrador"
              className="nodo-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="nodo-label">Cantidad</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.qty}
                onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                className="nodo-input-number"
              />
            </div>
            <div>
              <label className="nodo-label">Costo unitario (Q)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.unit_cost}
                onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))}
                placeholder="0.00"
                className="nodo-input-number"
              />
            </div>
          </div>

          {form.qty && form.unit_cost && (
            <p className="text-xs text-nodo-sub text-right">
              Total: <span className="font-semibold text-nodo-ink tabular-nums">{fmt(parseFloat(form.qty || '0') * parseFloat(form.unit_cost || '0'))}</span>
            </p>
          )}

          <div>
            <label className="nodo-label">Notas (opcional)</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="nodo-input"
            />
          </div>
        </div>
      </BottomSheet>
    </>
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
