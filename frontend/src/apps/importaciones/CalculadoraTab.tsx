import { useState } from 'react';
import {
  Package2, Settings2, ChevronDown, RotateCcw, TrendingUp,
  Plus, Minus, Info, FileText, Sparkles, Loader2, Check, BookmarkPlus,
} from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { usePricingEngine } from './usePricingEngine';
import { CATEGORY_DAI_RATE, fmtGTQ, fmtPct, suggestPrices, type ItemCategory } from './pricingEngine';
import { importacionesService } from '@/services/importaciones.service';
import { useNumericField } from './useNumericField';
import { ClientePicker } from './ClientePicker';
import { ImportFab } from './ImportFab';
import type { Cliente } from '@/services/import_clientes.service';

// ─── iOS Switch ───────────────────────────────────────────────────────────────
function IOSSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative w-[51px] h-[31px] rounded-full transition-colors duration-200 shrink-0 ${on ? 'bg-[#34C759]' : 'bg-nodo-line'}`}
    >
      <span className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-md transition-transform duration-200 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

// ─── FL label ─────────────────────────────────────────────────────────────────
function FL({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-1.5 select-none">
      {children}
    </p>
  );
}

// ─── NumInput ─────────────────────────────────────────────────────────────────
function NumInput({
  prefix, suffix, value, onChange, min = 0, disabled, xl,
}: {
  prefix?: string; suffix?: string; value: number; onChange: (v: number) => void;
  step?: number; min?: number; disabled?: boolean; xl?: boolean;
}) {
  const field = useNumericField({ value, onChange, min });
  return (
    <div className="relative">
      {prefix && (
        <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-bold text-nodo-dim pointer-events-none ${xl ? 'text-lg' : 'text-sm'}`}>
          {prefix}
        </span>
      )}
      <input
        type="text" inputMode="decimal"
        disabled={disabled}
        value={field.text}
        onChange={field.onChange}
        onFocus={field.onFocus}
        onBlur={field.onBlur}
        className={[
          'w-full rounded-2xl font-bold text-nodo-ink bg-nodo-inset border-2 border-nodo-line',
          'focus:border-nodo-ink outline-none transition-colors',
          '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
          xl ? 'h-14 text-2xl pl-9 pr-4' : 'h-11 text-sm',
          !xl && prefix ? 'pl-8' : !xl ? 'pl-4' : '',
          !xl && suffix ? 'pr-12' : '',
          disabled ? 'opacity-40 cursor-not-allowed' : '',
        ].join(' ')}
      />
      {suffix && !xl && (
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-nodo-dim pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

// ─── MiniStepper ──────────────────────────────────────────────────────────────
function MiniStepper({
  value, onChange, step = 1, min = 0, decimals, suffix, label,
}: {
  value: number; onChange: (v: number) => void;
  step?: number; min?: number; decimals?: number; suffix?: string; label?: string;
}) {
  const dec = decimals ?? (step < 1 ? Math.max(1, -Math.floor(Math.log10(step))) : 0);
  const snap = (n: number) => parseFloat(n.toFixed(dec));
  const field = useNumericField({ value, onChange, min, decimals: dec });

  return (
    <div className="flex flex-col gap-1.5">
      {label && <FL>{label}</FL>}
      <div className="flex items-center h-12 bg-nodo-inset border-2 border-nodo-line rounded-2xl overflow-hidden focus-within:border-nodo-ink transition-colors">
        <button
          type="button"
          onClick={() => onChange(snap(Math.max(min, value - step)))}
          className="h-full px-4 text-nodo-sub hover:text-nodo-ink hover:bg-nodo-raised active:scale-90 transition-all shrink-0"
        >
          <Minus size={15} />
        </button>
        <div className="flex-1 flex flex-col items-center justify-center leading-none min-w-0">
          <input
            type="text"
            inputMode="decimal"
            value={field.text}
            onChange={field.onChange}
            onFocus={field.onFocus}
            onBlur={field.onBlur}
            className="w-full text-center bg-transparent text-base font-black text-nodo-ink tabular-nums outline-none"
          />
          {suffix && <span className="text-[9px] font-bold text-nodo-dim mt-0.5 uppercase tracking-wide">{suffix}</span>}
        </div>
        <button
          type="button"
          onClick={() => onChange(snap(value + step))}
          className="h-full px-4 text-nodo-sub hover:text-nodo-ink hover:bg-nodo-raised active:scale-90 transition-all shrink-0"
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ on, onLabel, offLabel, onChange }: {
  on: boolean; onLabel: string; offLabel: string; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex p-1 bg-nodo-inset rounded-2xl gap-1">
      {([false, true] as const).map(v => (
        <button
          key={String(v)} type="button" onClick={() => onChange(v)}
          className={[
            'flex-1 py-2 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]',
            on === v ? 'bg-nodo-raised text-nodo-ink shadow-sm' : 'text-nodo-sub',
          ].join(' ')}
        >
          {v ? onLabel : offLabel}
        </button>
      ))}
    </div>
  );
}

// ─── Fila del desglose (hero iris) ────────────────────────────────────────────
function HRow({ label, value, bold, dim }: {
  label: string; value: string; bold?: boolean; dim?: boolean;
}) {
  return (
    <div className={`flex justify-between items-baseline ${dim ? 'opacity-60' : ''}`}>
      <span className={bold ? 'font-semibold' : 'opacity-80'}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold text-base' : 'font-semibold'}`}>{value}</span>
    </div>
  );
}

// ─── CalculadoraTab ────────────────────────────────────────────────────────────

export function CalculadoraTab({
  preselectedCliente = null,
  onSaved,
}: {
  preselectedCliente?: Cliente | null;
  onSaved?: () => void;
}) {
  const { inputs, config, result, updateInput, updateConfig, reset } = usePricingEngine();
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(preselectedCliente);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showConfig, setShowConfig]       = useState(false);

  const [showSaveSheet, setShowSaveSheet] = useState(false);
  const [saveName, setSaveName]           = useState('');
  const [saveLoading, setSaveLoading]     = useState(false);
  const [saveSuccess, setSaveSuccess]     = useState(false);

  const hasSavings     = inputs.useDeclaredValue && result.taxSavingsGTQ > 0;
  const declaredIsHigh = inputs.useDeclaredValue && inputs.declaredCostUSD > inputs.unitCostUSD;

  function openSaveSheet() {
    setSaveName('');
    setSaveSuccess(false);
    setShowSaveSheet(true);
  }

  async function handleSaveCotizacion() {
    if (!saveName.trim()) return;
    setSaveLoading(true);
    try {
      await importacionesService.create({
        product_name:    saveName.trim(),
        amazon_asin:     null,
        cliente_id:      selectedCliente?.id ?? null,
        inputs_snapshot: inputs as unknown as Record<string, unknown>,
        config_snapshot: config as unknown as Record<string, unknown>,
        result_snapshot: result as unknown as Record<string, unknown>,
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setShowSaveSheet(false);
        setSelectedCliente(null);
        onSaved?.();
      }, 900);
    } catch {
      // keep sheet open on error — user can retry
    } finally {
      setSaveLoading(false);
    }
  }

  return (
    <>
      <div className="w-full">
        {/* Resumen compacto fijo — solo móvil: Precio · Costo · Ganancia siempre a la vista */}
        <div className="lg:hidden sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-1 pb-3 mb-2 bg-nodo-canvas/80 backdrop-blur">
          <div className="rounded-2xl px-4 py-2.5 flex items-center gap-3"
            style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)', boxShadow: 'var(--nodo-shadow-fab)' }}>
            <div className="min-w-0 flex-1">
              <p className="text-[8px] font-bold uppercase tracking-wider opacity-70 leading-none">
                {inputs.mode === 'margin' ? 'Precio sugerido' : 'Precio final'}
              </p>
              <p className="text-xl font-black tabular-nums leading-tight mt-0.5 truncate">{fmtGTQ(result.salePriceGTQ)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[8px] font-bold uppercase tracking-wider opacity-70 leading-none">Costo</p>
              <p className="text-sm font-black tabular-nums leading-tight mt-0.5">{fmtGTQ(result.totalLandedCostGTQ)}</p>
            </div>
            <div className="w-px h-7 bg-white/20 shrink-0" />
            <div className="text-right shrink-0">
              <p className="text-[8px] font-bold uppercase tracking-wider opacity-70 leading-none">Ganancia</p>
              <p className={`text-sm font-black tabular-nums leading-tight mt-0.5 ${result.isViable ? '' : 'text-red-200'}`}>
                {fmtGTQ(result.netProfitGTQ)}
              </p>
            </div>
          </div>
        </div>

        {/* Parámetros del courier → chip engranaje compacto */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowConfig(true)}
            className="inline-flex items-center gap-2 pl-3 pr-3.5 py-2 rounded-full
                       bg-nodo-inset hover:bg-nodo-raised active:scale-[0.97]
                       transition-all text-nodo-sub"
          >
            <Settings2 className="w-4 h-4 text-nodo-dim" />
            <span className="text-xs font-semibold tabular-nums">
              Q{config.exchangeRate.toFixed(2)}/$ · ${config.iccPoundRate}/lb
            </span>
          </button>
        </div>

        {/* ─────────── Layout: inputs (izq) · resultado hero (der) ─────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-5 items-start">

          {/* ═══ IZQUIERDA: inputs ═══ */}
          <div className="flex flex-col gap-5">

            {/* ── PRODUCTO ── */}
            <div className="nodo-card p-5 lg:p-6 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Package2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-base font-bold text-nodo-ink tracking-tight">Producto</h3>
              </div>

              <div>
                <FL>Precio en USA por unidad — todo incluido</FL>
                <NumInput prefix="$" xl value={inputs.unitCostUSD}
                  onChange={v => updateInput('unitCostUSD', v)} />
                {inputs.qty > 1 && (
                  <p className="text-[11px] font-semibold text-nodo-sub mt-1.5 tabular-nums">
                    × {inputs.qty} unidades = ${(inputs.unitCostUSD * inputs.qty).toFixed(2)} en producto
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MiniStepper label="Peso del lote" value={inputs.totalWeightLbs}
                  onChange={v => updateInput('totalWeightLbs', v)}
                  step={0.1} min={0.1} decimals={1} suffix="lbs" />
                <MiniStepper label="Cantidad" value={inputs.qty}
                  onChange={v => updateInput('qty', v)} step={1} min={1} suffix="unid." />
              </div>
              <div>
                <FL>Tipo de artículo — arancel DAI</FL>
                <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-nodo-inset rounded-2xl">
                  {(Object.keys(CATEGORY_DAI_RATE) as ItemCategory[]).map(cat => {
                    const active = inputs.itemCategory === cat;
                    const rate   = CATEGORY_DAI_RATE[cat];
                    return (
                      <button key={cat} type="button"
                        onClick={() => updateInput('itemCategory', cat)}
                        className={`h-11 rounded-xl text-[11px] font-bold leading-tight transition-all flex flex-col items-center justify-center gap-0.5 ${active ? 'bg-nodo-raised text-nodo-ink shadow-sm' : 'text-nodo-sub hover:text-nodo-ink'}`}>
                        <span>{cat === 'ropa' ? 'Ropa / Aseo' : cat === 'repuestos' ? 'Repuestos' : 'Electrónicos'}</span>
                        <span className={`text-[9px] font-black ${active ? 'text-nodo-sub' : rate === 0 ? 'text-nodo-success-tx' : 'text-nodo-dim'}`}>
                          {(rate * 100).toFixed(0)}% DAI
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── VENTA ── */}
            <div className="nodo-card p-5 lg:p-6 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-base font-bold text-nodo-ink tracking-tight">Venta</h3>
              </div>

              <Toggle on={inputs.mode === 'fixed'} offLabel="Margen %" onLabel="Precio fijo Q"
                onChange={v => updateInput('mode', v ? 'fixed' : 'margin')} />

              {inputs.mode === 'margin' ? (
                <div>
                  <div className="flex items-baseline justify-between mb-3">
                    <label className="text-xs font-semibold text-nodo-sub uppercase tracking-wide px-1">
                      Margen objetivo
                    </label>
                    <span className="text-2xl font-black text-nodo-ink tabular-nums leading-none">
                      {inputs.targetMargin.toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range" min={0} max={80} step={0.5}
                    value={inputs.targetMargin}
                    onChange={e => updateInput('targetMargin', parseFloat(e.target.value))}
                    className="nodo-range"
                    style={{
                      background: `linear-gradient(to right, var(--nodo-iris-mid) ${(inputs.targetMargin / 80) * 100}%, var(--nodo-inset) ${(inputs.targetMargin / 80) * 100}%)`,
                    }}
                  />
                  <div className="flex justify-between text-[10px] font-semibold text-nodo-dim mt-1.5 px-0.5">
                    {['0%', '20%', '40%', '60%', '80%'].map(l => <span key={l}>{l}</span>)}
                  </div>
                </div>
              ) : (
                <div>
                  <FL>Precio de venta al cliente</FL>
                  <NumInput prefix="Q" value={inputs.fixedSalePrice}
                    onChange={v => updateInput('fixedSalePrice', v)} />
                </div>
              )}

              {/* Precios psicológicos — redondear a un número atractivo */}
              {suggestPrices(result.salePriceGTQ).length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest">Redondear a</span>
                  {suggestPrices(result.salePriceGTQ).map(p => {
                    const active = inputs.mode === 'fixed' && Math.abs(p - inputs.fixedSalePrice) < 0.005;
                    return (
                      <button key={p} type="button"
                        onClick={() => { updateInput('mode', 'fixed'); updateInput('fixedSalePrice', p); }}
                        className={`px-2.5 h-7 rounded-full text-xs font-black tabular-nums transition-transform active:scale-95
                                    ${active ? 'bg-nodo-ink text-nodo-canvas' : 'bg-nodo-inset text-nodo-ink'}`}>
                        {fmtGTQ(p)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── FACTURA AL COURIER ── */}
            <div className="nodo-card p-5 lg:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-nodo-warn-bg flex items-center justify-center">
                    <FileText className="w-4 h-4 text-nodo-warn-tx" />
                  </div>
                  <h3 className="text-base font-bold text-nodo-ink tracking-tight">Factura al courier</h3>
                </div>
                {hasSavings && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-nodo-warn-bg border border-nodo-warn-bd rounded-lg text-[9px] font-black text-nodo-warn-tx uppercase">
                    <Sparkles size={9} /> {fmtGTQ(result.taxSavingsGTQ)}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-nodo-ink">Declarar valor menor</p>
                  <p className="text-xs text-nodo-sub mt-0.5">Reduce impuestos declarando un valor más bajo</p>
                </div>
                <IOSSwitch
                  on={inputs.useDeclaredValue}
                  onChange={v => {
                    updateInput('useDeclaredValue', v);
                    if (v && inputs.declaredCostUSD === 0) updateInput('declaredCostUSD', inputs.unitCostUSD);
                  }}
                />
              </div>

              {inputs.useDeclaredValue && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><FL>Valor real (ref.)</FL><NumInput prefix="$" value={inputs.unitCostUSD} onChange={() => {}} disabled /></div>
                    <div><FL>Valor declarado</FL><NumInput prefix="$" value={inputs.declaredCostUSD} onChange={v => updateInput('declaredCostUSD', v)} /></div>
                  </div>
                  {declaredIsHigh ? (
                    <div className="bg-nodo-danger-bg border border-nodo-danger-bd rounded-xl p-3">
                      <p className="text-xs font-bold text-nodo-danger-tx">El declarado no puede ser mayor al real.</p>
                    </div>
                  ) : inputs.declaredCostUSD > 0 && (
                    <div className="bg-nodo-warn-bg border border-nodo-warn-bd rounded-xl p-3 space-y-1.5">
                      <div className="flex justify-between text-[11px]"><span className="text-nodo-warn-tx">Real ${(inputs.unitCostUSD * inputs.qty).toFixed(2)}</span><span className="font-black text-nodo-warn-tx tabular-nums">{fmtGTQ(result.importAtRealGTQ)}</span></div>
                      <div className="flex justify-between text-[11px]"><span className="text-nodo-warn-tx">Declarado ${(inputs.declaredCostUSD * inputs.qty).toFixed(2)}</span><span className="font-black text-nodo-warn-tx tabular-nums">{fmtGTQ(result.totalImportCostGTQ)}</span></div>
                      <div className="border-t border-nodo-warn-bd pt-1.5 flex justify-between text-[11px]"><span className="font-black text-nodo-warn-tx">Ahorro fiscal</span><span className="font-black text-nodo-warn-tx tabular-nums">{fmtGTQ(result.taxSavingsGTQ)}</span></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>{/* ═══ /IZQUIERDA ═══ */}

          {/* ═══ DERECHA: resultado hero (sticky) ═══ */}
          <div className="lg:sticky lg:top-4">
            <div className="rounded-3xl p-5 lg:p-6 space-y-4 lg:min-h-[520px] flex flex-col"
              style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)', boxShadow: 'var(--nodo-shadow-fab)' }}>

              {/* Header con precio */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold opacity-70 uppercase tracking-wider">
                    {inputs.mode === 'margin' ? 'Precio sugerido' : 'Precio final'}
                  </p>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${result.isViable ? 'bg-white/20' : 'bg-red-600/90 text-white'}`}>
                    {result.isViable ? 'Rentable' : 'Pérdida'}
                  </span>
                </div>
                <p className="text-3xl lg:text-4xl font-black tracking-tight tabular-nums mt-1">
                  {fmtGTQ(result.salePriceGTQ)}
                </p>
                <p className="text-sm opacity-70 mt-0.5">Margen real {fmtPct(result.actualMargin)}</p>
                <button
                  onClick={() => setShowBreakdown(v => !v)}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold
                             opacity-80 hover:opacity-100 active:scale-[0.97] transition-all"
                >
                  {showBreakdown ? 'Ocultar' : 'Ver'} desglose
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showBreakdown ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/10 backdrop-blur rounded-2xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">Costo</p>
                  <p className="text-lg font-black tabular-nums leading-tight mt-0.5">{fmtGTQ(result.totalLandedCostGTQ)}</p>
                  <p className="text-[11px] opacity-70 tabular-nums">{fmtGTQ(result.unitLandedCostGTQ)} / unidad</p>
                </div>
                <div className="bg-white/10 backdrop-blur rounded-2xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">Utilidad neta</p>
                  <p className="text-lg font-black tabular-nums leading-tight mt-0.5">{fmtGTQ(result.netProfitGTQ)}</p>
                  <p className="text-[11px] opacity-70 tabular-nums">{fmtGTQ(result.unitProfitGTQ)} / unidad</p>
                </div>
              </div>

              {/* Ahorro fiscal */}
              {hasSavings && (
                <div className="bg-white/10 backdrop-blur rounded-2xl px-3 py-2.5 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <p className="text-xs font-semibold flex-1">Ahorro fiscal por factura declarada</p>
                  <p className="text-sm font-black tabular-nums">{fmtGTQ(result.taxSavingsGTQ)}</p>
                </div>
              )}

              {/* Desglose (colapsable) */}
              {showBreakdown && (
                <div className="bg-white/10 backdrop-blur rounded-2xl p-3.5 space-y-2 text-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">Courier + aduana</p>
                  <HRow label="Transporte" value={fmtGTQ(result.freightGTQ)} />
                  <HRow label="Desaduanaje" value={fmtGTQ(result.desaduanajeGTQ)} />
                  <HRow label={`Seguro (${(config.insuranceRate * 100).toFixed(3)}%)`} value={fmtGTQ(result.seguroGTQ)} />
                  <HRow label={`Arancel DAI (${(result.daiRate * 100).toFixed(0)}%)`} value={fmtGTQ(result.daiGTQ)} />
                  <HRow label="IVA SAT 12%" value={fmtGTQ(result.ivaGTQ)} />
                  <div className="border-t border-white/20 pt-2">
                    <HRow label="Total importación" value={fmtGTQ(result.totalImportCostGTQ)} bold />
                  </div>

                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-70 pt-2">Costo</p>
                  <HRow label="Producto (real)" value={fmtGTQ(result.realProductGTQ)} />
                  <HRow label="Importación" value={fmtGTQ(result.totalImportCostGTQ)} />
                  <div className="border-t border-white/20 pt-2 space-y-2">
                    <HRow label="Costo total" value={fmtGTQ(result.totalLandedCostGTQ)} bold />
                    <HRow label={`Por unidad (${inputs.qty}u)`} value={fmtGTQ(result.unitLandedCostGTQ)} dim />
                  </div>

                  <div className="border-t border-white/20 pt-2 space-y-2">
                    <HRow label="Base CIF (aduana)" value={fmtGTQ(result.cifBaseGTQ)} dim />
                    <HRow label="Tipo de cambio" value={`Q${config.exchangeRate.toFixed(2)}/$`} dim />
                  </div>
                </div>
              )}

              {/* Acciones (desktop tiene guardar aquí; móvil usa el FAB) */}
              <div className="flex gap-2 pt-1 lg:mt-auto">
                <button
                  onClick={reset}
                  className="px-4 py-3 rounded-2xl bg-white/15 backdrop-blur font-semibold
                             active:scale-[0.97] active:bg-white/25 transition-all
                             flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="hidden sm:inline">Limpiar</span>
                </button>
                <button
                  onClick={openSaveSheet}
                  className="flex-1 px-4 py-3 rounded-2xl font-semibold transition-all
                             active:scale-[0.98] flex items-center justify-center gap-2
                             bg-nodo-card text-nodo-ink hover:bg-nodo-inset"
                >
                  <BookmarkPlus className="w-5 h-5" />
                  Guardar cotización
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FAB móvil: guardar al alcance del pulgar */}
      <ImportFab icon={<BookmarkPlus size={20} />} label="Guardar" onPress={openSaveSheet} />

      {/* ═══════════ BOTTOM SHEET: PARÁMETROS DEL COURIER ═══════════ */}
      <BottomSheet
        open={showConfig}
        onClose={() => setShowConfig(false)}
        title="Parámetros del courier"
        footer={
          <button onClick={() => setShowConfig(false)} className="nodo-btn-primary">
            <Check size={18} />
            LISTO
          </button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 p-3 bg-nodo-inset rounded-2xl">
            <Info size={13} className="text-nodo-success-tx mt-0.5 shrink-0" />
            <p className="text-[11px] text-nodo-sub leading-relaxed">
              Tasas calibradas con factura real ICC. Ajusta si el courier modifica sus tarifas.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(([
              { label: 'Tipo de Cambio', key: 'exchangeRate',      suffix: 'Q/$',  step: 0.01 },
              { label: 'Transporte ICC', key: 'iccPoundRate',       suffix: '$/lb', step: 0.001 },
              { label: 'Desaduanaje',   key: 'iccCustomsFee',       suffix: 'USD',  step: 0.001 },
              { label: 'Seguro',        key: 'insuranceRate',        suffix: '%',    step: 0.0001, pct: true },
              { label: 'Flete CIF SAT', key: 'customsFreightRate',  suffix: '$/lb', step: 0.01 },
              { label: 'IVA SAT',       key: 'ivaRate',              suffix: '%',    step: 0.01,   pct: true },
            ]) as Array<{ label: string; key: keyof typeof config; suffix: string; step: number; pct?: boolean }>)
              .map(f => (
                <div key={f.key}>
                  <FL>{f.label}</FL>
                  <div className="flex items-center h-11 bg-nodo-inset border-2 border-nodo-line rounded-2xl focus-within:border-nodo-ink transition-colors">
                    <input type="number" step={f.step}
                      value={f.pct ? Number((config[f.key] * 100).toFixed(6)) : config[f.key]}
                      onChange={e => { const v = parseFloat(e.target.value) || 0; updateConfig(f.key, f.pct ? v / 100 : v); }}
                      onFocus={e => e.target.select()}
                      className="flex-1 h-full px-3 bg-transparent text-sm font-bold text-nodo-ink outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[11px] font-bold text-nodo-dim pr-3">{f.suffix}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </BottomSheet>

      {/* ═══════════ BOTTOM SHEET: GUARDAR COTIZACIÓN ═══════════ */}
      <BottomSheet
        open={showSaveSheet}
        onClose={() => setShowSaveSheet(false)}
        title="Guardar cotización"
        footer={
          <button
            onClick={handleSaveCotizacion}
            disabled={!saveName.trim() || saveLoading || saveSuccess}
            className="w-full h-[52px] rounded-full font-bold text-base flex items-center justify-center gap-2.5
                       shadow-lg active:scale-[0.97] transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
          >
            {saveLoading
              ? <Loader2 size={18} className="animate-spin" />
              : saveSuccess
              ? <Check size={18} />
              : <BookmarkPlus size={18} />
            }
            {saveSuccess ? 'Guardada' : 'Guardar cotización'}
          </button>
        }
      >
        <div className="space-y-4">
          {/* Resumen del cálculo */}
          <div className={`rounded-2xl p-4 border ${result.isViable ? 'bg-nodo-success-bg border-nodo-success-bd' : 'bg-nodo-danger-bg border-nodo-danger-bd'}`}>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-0.5">Precio</p>
                <p className="text-lg font-black tabular-nums text-nodo-ink">{fmtGTQ(result.salePriceGTQ)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-0.5">Costo</p>
                <p className="text-lg font-black tabular-nums text-nodo-sub">{fmtGTQ(result.totalLandedCostGTQ)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-0.5">Margen</p>
                <p className="text-lg font-black tabular-nums text-nodo-sub">{fmtPct(result.actualMargin)}</p>
              </div>
            </div>
          </div>
          {/* Nombre del producto */}
          <div>
            <label className="nodo-label">Producto</label>
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Ej. Audífonos Sony WH-1000XM5"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSaveCotizacion()}
              className="nodo-input"
            />
          </div>
          {/* Cliente */}
          <div>
            <label className="nodo-label">
              Cliente <span className="text-nodo-dim normal-case font-medium">(opcional)</span>
            </label>
            <ClientePicker value={selectedCliente} onChange={setSelectedCliente} />
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
