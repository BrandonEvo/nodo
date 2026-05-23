import { useState, useEffect, useCallback } from 'react';
import { Lock, Banknote, CreditCard, Receipt, Check, AlertTriangle, ShoppingBag, ChefHat, Trash2, Loader2, X, Package, Minus, Plus } from 'lucide-react';
import { haptic } from '@/utils/haptic';
import type { AppProps } from '../index';
import { cierreService, type ShiftSummary } from '@/services/cierre.service';
import { recetasService } from '@/services/recetas.service';
import { BottomSheet } from '@/components/ui/BottomSheet';

const DESTINO_OPTIONS = [
  { id: 'ayer' as const,   label: 'Ayer −40%', icon: ShoppingBag, selected: 'bg-amber-500 text-white' },
  { id: 'cocina' as const, label: 'Cocina',    icon: ChefHat,     selected: 'bg-orange-500 text-white' },
  { id: 'basura' as const, label: 'Basura',    icon: Trash2,      selected: 'bg-red-500 text-white' },
];

type DestinoId = 'ayer' | 'cocina' | 'basura';
type Sobrante = { id: string; name: string; qty: number; destino: DestinoId | null };

export function CierreApp(_props: AppProps) {
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [efectivoContado, setEfectivoContado] = useState('');
  const [sobrantes, setSobrantes] = useState<Sobrante[]>([]);
  const [showSobrantes, setShowSobrantes] = useState(false);
  const [cajaCerrada, setCajaCerrada] = useState(false);
  const [closedSummary, setClosedSummary] = useState<{ expected: number; actual: number; diff: number } | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, recipes] = await Promise.all([cierreService.getSummary(), recetasService.list()]);
      setSummary(s);
      setSobrantes(recipes.map(r => ({ id: r.id, name: r.name, qty: 0, destino: null })));
    } catch {
      setError('Error al cargar resumen de ventas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const contado = parseFloat(efectivoContado) || 0;
  const diferencia = summary ? contado - summary.efectivo : 0;

  const setDestino = (id: string, destino: DestinoId) =>
    setSobrantes(prev => prev.map(s => s.id === id ? { ...s, destino } : s));

  const updateQty = (id: string, qty: number) =>
    setSobrantes(prev => prev.map(s =>
      s.id === id ? { ...s, qty: Math.max(0, qty), destino: qty <= 0 ? null : s.destino } : s
    ));

  const sobrantesConQty = sobrantes.filter(s => s.qty > 0);
  const allAssigned = sobrantesConQty.every(s => s.destino !== null);
  const canClose = efectivoContado !== '' && (sobrantesConQty.length === 0 || allAssigned);

  const handleCerrar = async () => {
    if (!summary) return;
    setSaving(true);
    try {
      await cierreService.closeShift(contado, notes || undefined);
      haptic.done();
      setClosedSummary({ expected: summary.efectivo, actual: contado, diff: diferencia });
      setCajaCerrada(true);
    } catch (e: any) {
      haptic.error();
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
        <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
      </div>
    );
  }

  if (cajaCerrada && closedSummary) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-6 px-4">
        <div className="w-24 h-24 rounded-full bg-nodo-success-bg border-2 border-nodo-success-bd flex items-center justify-center">
          <Check size={48} className="text-nodo-success-tx" strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-[32px] font-black text-nodo-ink">Caja Cerrada</h1>
          <p className="text-nodo-sub text-sm font-medium mt-1 capitalize">{dateStr}</p>
        </div>
        <div className="bg-nodo-card border border-nodo-line rounded-3xl p-6 w-full max-w-sm shadow-sm">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-nodo-sub">Total ventas</span>
              <span className="font-black text-nodo-ink tabular-nums">Q{(summary?.total ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-nodo-sub">Efectivo esperado</span>
              <span className="font-black text-nodo-ink tabular-nums">Q{closedSummary.expected.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-nodo-sub">Efectivo contado</span>
              <span className="font-black text-nodo-ink tabular-nums">Q{closedSummary.actual.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm pt-3 border-t border-nodo-line">
              <span className="text-nodo-sub">Diferencia</span>
              <span className={`font-black tabular-nums ${
                closedSummary.diff === 0 ? 'text-nodo-success-tx' :
                closedSummary.diff > 0 ? 'text-amber-500' : 'text-nodo-danger-tx'
              }`}>
                {closedSummary.diff >= 0 ? '+' : ''}Q{closedSummary.diff.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const diffCfg = diferencia === 0
    ? { card: 'bg-nodo-success-bg border-nodo-success-bd', icon: 'text-nodo-success-tx', text: 'text-nodo-success-tx' }
    : Math.abs(diferencia) < 5
    ? { card: 'bg-amber-500/10 border-amber-500/20', icon: 'text-amber-500', text: 'text-amber-600 dark:text-amber-400' }
    : { card: 'bg-nodo-danger-bg border-nodo-danger-bd', icon: 'text-nodo-danger-tx', text: 'text-nodo-danger-tx' };

  return (
    <>
      <div className="flex flex-col gap-6 pb-6">

        {/* Error toast */}
        {error && (
          <div className="fixed top-4 right-4 z-[70] flex items-center gap-3 bg-nodo-danger-bg border border-nodo-danger-bd text-nodo-danger-tx text-sm font-bold px-4 py-3 rounded-2xl shadow-lg max-w-xs">
            <AlertTriangle size={16} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="shrink-0 active:scale-90 transition-transform">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Header */}
        <div>
          <h1 className="text-[28px] font-black text-nodo-ink leading-tight">Cierre de Turno</h1>
          <p className="text-nodo-sub text-sm font-medium mt-1 capitalize">{dateStr}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Ventas del Día ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">Ventas del Día</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-nodo-success-bg border border-nodo-success-bd rounded-3xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Banknote size={16} className="text-nodo-success-tx" />
                  <span className="text-[10px] font-bold text-nodo-success-tx uppercase tracking-wider">Efectivo</span>
                </div>
                <p className="text-2xl font-black text-nodo-success-tx tabular-nums">
                  Q{(summary?.efectivo ?? 0).toFixed(2)}
                </p>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-3xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard size={16} className="text-blue-500" />
                  <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Tarjeta</span>
                </div>
                <p className="text-2xl font-black text-blue-600 dark:text-blue-400 tabular-nums">
                  Q{(summary?.tarjeta ?? 0).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="bg-nodo-card border border-nodo-line rounded-3xl p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-nodo-inset flex items-center justify-center">
                  <Receipt size={18} className="text-nodo-sub" />
                </div>
                <div>
                  <p className="text-sm font-black text-nodo-ink">{summary?.tickets ?? 0} tickets</p>
                  <p className="text-xs text-nodo-sub tabular-nums">Promedio Q{(summary?.promedio ?? 0).toFixed(2)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1">Total</p>
                <p className="text-3xl font-black text-nodo-ink tabular-nums">Q{(summary?.total ?? 0).toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* ── Conteo de Caja ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">Conteo de Caja</p>

            <div className="bg-nodo-card border border-nodo-line rounded-3xl p-5 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-2 block">
                  ¿Cuánto efectivo hay en caja?
                </label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-xl font-black text-nodo-dim pointer-events-none">Q</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={efectivoContado}
                    onChange={e => setEfectivoContado(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-16 pl-12 pr-5 text-2xl font-black text-nodo-ink bg-nodo-inset border-2 border-nodo-line rounded-2xl focus:border-nodo-ink focus:ring-0 outline-none transition-colors text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>

              {efectivoContado !== '' && summary && (
                <div className={`rounded-2xl p-4 flex items-center gap-4 border ${diffCfg.card}`}>
                  {diferencia === 0
                    ? <Check size={22} className={diffCfg.icon} strokeWidth={3} />
                    : <AlertTriangle size={22} className={diffCfg.icon} />
                  }
                  <div>
                    <p className={`text-sm font-black ${diffCfg.text}`}>
                      {diferencia === 0 ? '¡Cuadra perfecto!'
                        : diferencia > 0 ? `Sobrante: Q${diferencia.toFixed(2)}`
                        : `Faltante: Q${Math.abs(diferencia).toFixed(2)}`}
                    </p>
                    <p className="text-xs text-nodo-sub mt-0.5 tabular-nums">
                      Esperado Q{summary.efectivo.toFixed(2)} · Contado Q{contado.toFixed(2)}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-2 block">
                  Notas (opcional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Observaciones del turno…"
                  className="w-full h-11 px-4 bg-nodo-inset border border-nodo-line rounded-xl text-sm font-medium text-nodo-ink placeholder:text-nodo-dim focus:border-nodo-ink outline-none transition-colors"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Sobrantes ── */}
        <div>
          <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-3">Sobrantes</p>
          <button
            onClick={() => setShowSobrantes(true)}
            className="w-full bg-nodo-card border border-nodo-line rounded-3xl p-5 flex items-center justify-between active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-nodo-inset flex items-center justify-center">
                <Package size={18} className="text-nodo-sub" />
              </div>
              <div className="text-left">
                <p className="text-sm font-black text-nodo-ink">Destino de Sobrantes</p>
                <p className="text-xs text-nodo-sub mt-0.5">
                  {sobrantesConQty.length === 0
                    ? 'Sin sobrantes registrados'
                    : `${sobrantesConQty.length} producto${sobrantesConQty.length > 1 ? 's' : ''} · ${allAssigned ? 'Completo ✓' : 'Pendiente asignar'}`}
                </p>
              </div>
            </div>
            <span className={`text-xs font-bold px-3 py-1.5 rounded-xl ${
              sobrantesConQty.length > 0 && !allAssigned
                ? 'bg-nodo-warn-bg text-nodo-warn-tx border border-nodo-warn-bd'
                : 'bg-nodo-inset text-nodo-sub'
            }`}>
              {sobrantesConQty.length > 0 && !allAssigned ? 'Asignar' : 'Editar'}
            </span>
          </button>
        </div>

        {/* ── Cerrar Caja ── */}
        <button
          onClick={handleCerrar}
          disabled={!canClose || saving}
          className="w-full h-[60px] rounded-3xl bg-nodo-ink text-nodo-canvas font-black text-base tracking-wide transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg"
        >
          {saving
            ? <Loader2 size={20} className="animate-spin" />
            : <Lock size={20} strokeWidth={2.5} />
          }
          CERRAR CAJA
        </button>
      </div>

      {/* ── BottomSheet: Sobrantes ── */}
      <BottomSheet
        open={showSobrantes}
        onClose={() => setShowSobrantes(false)}
        title="Sobrantes del Día"
        footer={
          <button
            onClick={() => setShowSobrantes(false)}
            className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base tracking-wide active:scale-[0.97] transition-transform"
          >
            Listo
          </button>
        }
      >
        <div className="space-y-3">
          {sobrantes.map(item => (
            <div key={item.id} className="bg-nodo-inset rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-black text-nodo-ink flex-1 leading-snug">{item.name}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => updateQty(item.id, item.qty - 1)}
                    className="w-8 h-8 rounded-xl bg-nodo-card border border-nodo-line flex items-center justify-center text-nodo-ink active:scale-90 transition-transform"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center text-sm font-black text-nodo-ink tabular-nums">{item.qty}</span>
                  <button
                    onClick={() => updateQty(item.id, item.qty + 1)}
                    className="w-8 h-8 rounded-xl bg-nodo-ink flex items-center justify-center text-nodo-canvas active:scale-90 transition-transform"
                  >
                    <Plus size={14} />
                  </button>
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
                        className={`flex-1 py-2 px-2 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-all active:scale-95 ${
                          isSelected ? opt.selected : 'bg-nodo-card border border-nodo-line text-nodo-sub'
                        }`}
                      >
                        <Icon size={11} /> {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
