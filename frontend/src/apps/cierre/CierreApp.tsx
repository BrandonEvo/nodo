import { useState, useEffect, useCallback } from 'react';
import { Lock, Banknote, CreditCard, Receipt, Check, AlertTriangle, ShoppingBag, ChefHat, Trash2, Loader2, X } from 'lucide-react';
import type { AppProps } from '../index';
import { cierreService, type ShiftSummary } from '@/services/cierre.service';

const DESTINO_OPTIONS = [
  { id: 'ayer', label: 'Ayer', icon: ShoppingBag, color: 'amber' },
  { id: 'cocina', label: 'Cocina', icon: ChefHat, color: 'orange' },
  { id: 'basura', label: 'Basura', icon: Trash2, color: 'red' },
];

// Sobrantes son locales (no tienen modelo en BD en esta versión)
const SOBRANTES_INIT = [
  { id: '1', name: 'Pan Francés', qty: 0, destino: null as string | null },
  { id: '2', name: 'Concha', qty: 0, destino: null as string | null },
];

export function CierreApp(_props: AppProps) {
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [efectivoContado, setEfectivoContado] = useState('');
  const [sobrantes, setSobrantes] = useState(SOBRANTES_INIT);
  const [cajaCerrada, setCajaCerrada] = useState(false);
  const [closedSummary, setClosedSummary] = useState<{ expected: number; actual: number; diff: number } | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await cierreService.getSummary();
      setSummary(s);
    } catch {
      setError('Error al cargar resumen de ventas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const contado = parseFloat(efectivoContado) || 0;
  const diferencia = summary ? contado - summary.efectivo : 0;

  const setDestino = (id: string, destino: string) => {
    setSobrantes(prev => prev.map(s => s.id === id ? { ...s, destino } : s));
  };

  const updateSobranteQty = (id: string, qty: number) => {
    setSobrantes(prev => prev.map(s => s.id === id ? { ...s, qty: Math.max(0, qty) } : s));
  };

  const allSobrantesAssigned = sobrantes.filter(s => s.qty > 0).every(s => s.destino !== null);
  const canClose = efectivoContado !== '' && (sobrantes.filter(s => s.qty > 0).length === 0 || allSobrantesAssigned);

  const handleCerrar = async () => {
    if (!summary) return;
    setSaving(true);
    try {
      await cierreService.closeShift(contado, notes || undefined);
      setClosedSummary({ expected: summary.efectivo, actual: contado, diff: diferencia });
      setCajaCerrada(true);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error al cerrar caja');
    } finally {
      setSaving(false);
    }
  };

  const dateStr = new Date().toLocaleDateString('es-GT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (cajaCerrada && closedSummary) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center">
          <Check size={48} className="text-emerald-500" strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-[#111]">Caja Cerrada</h1>
          <p className="text-slate-400 mt-2 text-sm capitalize">{dateStr}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-6 w-full max-w-sm">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Total ventas</span><span className="font-black text-[#111]">Q{(summary?.total ?? 0).toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Efectivo esperado</span><span className="font-black text-[#111]">Q{closedSummary.expected.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Efectivo contado</span><span className="font-black text-[#111]">Q{closedSummary.actual.toFixed(2)}</span></div>
            <div className="flex justify-between border-t border-slate-100 pt-3">
              <span className="text-slate-400">Diferencia</span>
              <span className={`font-black ${closedSummary.diff === 0 ? 'text-emerald-500' : closedSummary.diff > 0 ? 'text-amber-500' : 'text-red-500'}`}>
                Q{closedSummary.diff.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-2xl flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}><X size={16} /></button>
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-slate-800/10 flex items-center justify-center text-slate-700">
          <Lock size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-[#111]">Cierre de Turno</h1>
          <p className="text-xs text-slate-400 font-medium capitalize">{dateStr}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── LEFT: Sales Summary ── */}
        <div className="space-y-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Resumen de Ventas del Día</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Banknote size={16} className="text-emerald-500" />
                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Efectivo</span>
              </div>
              <p className="text-2xl font-black text-emerald-700">Q{(summary?.efectivo ?? 0).toFixed(2)}</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard size={16} className="text-blue-500" />
                <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Tarjeta</span>
              </div>
              <p className="text-2xl font-black text-blue-700">Q{(summary?.tarjeta ?? 0).toFixed(2)}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Receipt size={18} className="text-slate-400" />
              <div>
                <p className="text-sm font-bold text-[#111]">{summary?.tickets ?? 0} tickets</p>
                <p className="text-xs text-slate-400">Promedio Q{(summary?.promedio ?? 0).toFixed(2)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 font-bold uppercase">Total</p>
              <p className="text-2xl font-black text-[#111]">Q{(summary?.total ?? 0).toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Cash Count ── */}
        <div className="space-y-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Conteo de Caja</p>

          <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                ¿Cuánto efectivo hay en caja?
              </label>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-300">Q</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={efectivoContado}
                  onChange={e => setEfectivoContado(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-16 pl-12 pr-5 text-2xl font-black text-[#111] bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-[#111] focus:ring-0 outline-none transition-colors text-right"
                />
              </div>
            </div>

            {efectivoContado !== '' && summary && (
              <div className={`rounded-2xl p-5 flex items-center gap-4 ${
                diferencia === 0 ? 'bg-emerald-50 border border-emerald-200' :
                Math.abs(diferencia) < 5 ? 'bg-amber-50 border border-amber-200' :
                'bg-red-50 border border-red-200'
              }`}>
                {diferencia === 0 ? (
                  <Check size={24} className="text-emerald-500 shrink-0" strokeWidth={3} />
                ) : (
                  <AlertTriangle size={24} className={Math.abs(diferencia) < 5 ? 'text-amber-500' : 'text-red-500'} />
                )}
                <div>
                  <p className={`text-sm font-black ${diferencia === 0 ? 'text-emerald-700' : Math.abs(diferencia) < 5 ? 'text-amber-700' : 'text-red-700'}`}>
                    {diferencia === 0 ? '¡Cuadra perfecto!'
                      : diferencia > 0 ? `Sobrante: Q${diferencia.toFixed(2)}`
                      : `Faltante: Q${Math.abs(diferencia).toFixed(2)}`}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Esperado: Q{summary.efectivo.toFixed(2)} · Contado: Q{contado.toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Notas (opcional)</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Observaciones del turno…"
                className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-[#111] focus:border-[#111] outline-none transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── SOBRANTES ── */}
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">Destino de Sobrantes</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sobrantes.map(item => (
            <div key={item.id} className="bg-white rounded-2xl border border-slate-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-black text-[#111]">{item.name}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Sobraron:</span>
                  <input
                    type="number"
                    min="0"
                    value={item.qty}
                    onChange={e => updateSobranteQty(item.id, parseInt(e.target.value) || 0)}
                    className="w-16 h-8 text-center text-sm font-black text-[#111] bg-slate-50 border border-slate-200 rounded-lg outline-none"
                  />
                </div>
              </div>
              {item.qty > 0 && (
                <div className="flex gap-2">
                  {DESTINO_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    const isSelected = item.destino === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setDestino(item.id, opt.id)}
                        className={`flex-1 py-2.5 px-2 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-all active:scale-95 ${
                          isSelected
                            ? `bg-${opt.color}-500 text-white shadow-sm`
                            : `bg-${opt.color}-50 text-${opt.color}-600 border border-${opt.color}-200 hover:bg-${opt.color}-100`
                        }`}
                      >
                        <Icon size={12} /> {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── CLOSE BUTTON ── */}
      <button
        onClick={handleCerrar}
        disabled={!canClose || saving}
        className="w-full h-16 rounded-2xl bg-[#111] hover:bg-[#222] text-white font-black text-lg tracking-wide transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg"
      >
        {saving ? <Loader2 size={22} className="animate-spin" /> : <Check size={22} strokeWidth={3} />}
        FINALIZAR DÍA
      </button>
    </div>
  );
}
