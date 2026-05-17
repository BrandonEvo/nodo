import { useState } from 'react';
import {
  Plane, Package2, Receipt, Settings2, ChevronDown, RotateCcw,
  TrendingUp, TrendingDown, DollarSign, Plus, Minus, Info,
  FileText, Sparkles,
} from 'lucide-react';
import type { AppProps } from '../index';
import { usePricingEngine } from './usePricingEngine';
import {
  CATEGORY_DAI_RATE, CATEGORY_LABEL, fmtGTQ, fmtUSD, fmtPct,
  type ItemCategory, type ProfitMode,
} from './pricingEngine';

// ─── Primitivos ───────────────────────────────────────────────────────────────

function FieldWrap({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{hint}</p>}
    </div>
  );
}

function NumInput({
  prefix, suffix, value, onChange, step = 0.01, min = 0, autoFocus, disabled,
}: {
  prefix?: string; suffix?: string; value: number; onChange: (v: number) => void;
  step?: number; min?: number; autoFocus?: boolean; disabled?: boolean;
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 pointer-events-none">{prefix}</span>
      )}
      <input
        type="number" inputMode="decimal" autoFocus={autoFocus} min={min} step={step}
        disabled={disabled}
        value={Number.isFinite(value) ? value : 0}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        onFocus={e => e.target.select()}
        className={`w-full h-11 ${prefix ? 'pl-8' : 'pl-4'} ${suffix ? 'pr-12' : 'pr-4'} bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-bold text-[#111] focus:border-[#111] focus:bg-white outline-none transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      />
      {suffix && (
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">{suffix}</span>
      )}
    </div>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center bg-slate-50 border-2 border-slate-200 rounded-xl h-11 overflow-hidden focus-within:border-[#111] transition-colors">
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))}
        className="h-full px-3 text-slate-500 hover:text-[#111] hover:bg-slate-100 active:scale-90 transition-all">
        <Minus size={16} />
      </button>
      <input type="number" min={1} value={value}
        onChange={e => onChange(Math.max(1, parseInt(e.target.value) || 1))}
        onFocus={e => e.target.select()}
        className="flex-1 h-full bg-transparent text-center text-sm font-black text-[#111] outline-none" />
      <button type="button" onClick={() => onChange(value + 1)}
        className="h-full px-3 text-slate-500 hover:text-[#111] hover:bg-slate-100 active:scale-90 transition-all">
        <Plus size={16} />
      </button>
    </div>
  );
}

function Toggle({ on, onLabel, offLabel, onChange }: {
  on: boolean; onLabel: string; offLabel: string; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 p-1.5 bg-slate-50 border-2 border-slate-200 rounded-xl">
      {[false, true].map(v => (
        <button key={String(v)} type="button" onClick={() => onChange(v)}
          className={`flex-1 h-9 rounded-lg text-xs font-bold transition-all ${on === v ? 'bg-[#111] text-white shadow-sm' : 'text-slate-500 hover:text-[#111]'}`}>
          {v ? onLabel : offLabel}
        </button>
      ))}
    </div>
  );
}

function Row({ label, value, bold, dim, amber }: {
  label: string; value: string; bold?: boolean; dim?: boolean; amber?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-1
      ${bold ? 'font-bold text-white' : dim ? 'text-slate-500' : amber ? 'text-amber-300 font-bold' : 'text-slate-300'}`}>
      <span className="text-[11px]">{label}</span>
      <span className="text-[12px] font-mono">{value}</span>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function SmartCalculator(_props: AppProps) {
  const { inputs, config, result, updateInput, updateConfig, reset } = usePricingEngine();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const hasSavings = inputs.useDeclaredValue && result.taxSavingsGTQ > 0;
  const declaredIsHigher = inputs.useDeclaredValue && inputs.declaredCostUSD > inputs.unitCostUSD;

  return (
    <div className="w-full max-w-7xl mx-auto">

      {/* ── HEADER ────────────────────────────────────────────────── */}
      <header className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#111] flex items-center justify-center">
            <Plane size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#111] leading-none">Importaciones</h1>
            <p className="text-xs font-medium text-slate-400 mt-1">Courier · Cálculo en tiempo real</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowConfig(s => !s)}
            className={`h-10 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border ${showConfig ? 'bg-[#111] text-white border-[#111]' : 'bg-white text-slate-600 hover:bg-slate-100 border-slate-200'}`}>
            <Settings2 size={14} /> Parámetros
          </button>
          <button onClick={reset}
            className="h-10 px-4 rounded-xl text-xs font-bold flex items-center gap-2 bg-white text-slate-600 hover:bg-red-50 hover:text-red-500 border border-slate-200 transition-all">
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </header>

      {/* ── CONFIG ─────────────────────────────────────────────────── */}
      {showConfig && (
        <div className="mb-6 bg-[#111] rounded-3xl p-6 space-y-4">
          <div className="flex items-start gap-2 mb-2">
            <Info size={14} className="text-[#69E7A8] mt-0.5 shrink-0" />
            <p className="text-[11px] text-slate-300">
              Tasas calibradas con factura real del courier (Q128.02 transporte, Q28.00 desaduanaje, Q7.20 seguro — IVA incluido).
              Ajusta si el courier cambia sus tarifas.
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: 'Tipo de Cambio', key: 'exchangeRate' as const, suffix: 'Q/$', step: 0.01 },
              { label: 'Transporte Courier', key: 'iccPoundRate' as const, suffix: '$/lb', step: 0.001 },
              { label: 'Desaduanaje', key: 'iccCustomsFee' as const, suffix: 'USD', step: 0.001 },
              { label: 'Seguro', key: 'insuranceRate' as const, suffix: '%', step: 0.0001, pct: true },
              { label: 'Flete CIF (SAT)', key: 'customsFreightRate' as const, suffix: '$/lb', step: 0.01 },
              { label: 'IVA SAT', key: 'ivaRate' as const, suffix: '%', step: 0.01, pct: true },
            ].map(f => (
              <div key={f.key}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{f.label}</p>
                <div className="flex items-center bg-white/5 border-2 border-white/10 rounded-xl focus-within:border-white/30 transition-colors">
                  <input type="number" step={f.step}
                    value={f.pct ? Number((config[f.key] * 100).toFixed(6)) : config[f.key]}
                    onChange={e => {
                      const v = parseFloat(e.target.value) || 0;
                      updateConfig(f.key, f.pct ? v / 100 : v);
                    }}
                    onFocus={e => e.target.select()}
                    className="flex-1 h-10 px-3 bg-transparent text-sm font-bold text-white outline-none" />
                  <span className="text-xs font-bold text-slate-400 pr-3">{f.suffix}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── LAYOUT ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

        {/* ── FORMULARIO ─────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-5">

          {/* Sección 1 — Producto */}
          <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center">
                <Package2 size={16} />
              </div>
              <h2 className="text-sm font-black text-[#111] uppercase tracking-wider">Producto</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FieldWrap label="Cantidad">
                <Stepper value={inputs.qty} onChange={v => updateInput('qty', v)} />
              </FieldWrap>
              <FieldWrap label="Precio Real en USA" hint="Todo incluido: costo + tax + envío USA">
                <NumInput prefix="$" value={inputs.unitCostUSD} onChange={v => updateInput('unitCostUSD', v)} autoFocus />
              </FieldWrap>
              <FieldWrap label="Peso Total del Lote" hint="Todas las unidades juntas">
                <NumInput suffix="lbs" step={0.1} value={inputs.totalWeightLbs} onChange={v => updateInput('totalWeightLbs', v)} />
              </FieldWrap>
            </div>

            <div className="mt-4">
              <FieldWrap label="Tipo de Artículo (Arancel DAI)">
                <div className="grid grid-cols-3 gap-2 bg-slate-50 border-2 border-slate-200 rounded-xl p-1.5">
                  {(Object.keys(CATEGORY_DAI_RATE) as ItemCategory[]).map(cat => (
                    <button key={cat} type="button" onClick={() => updateInput('itemCategory', cat)}
                      className={`h-10 rounded-lg text-[11px] font-bold transition-all leading-tight px-1 ${inputs.itemCategory === cat ? 'bg-[#111] text-white shadow-sm' : 'text-slate-500 hover:text-[#111]'}`}>
                      {cat === 'ropa' ? 'Ropa / Aseo' : cat === 'repuestos' ? 'Repuestos' : 'Electrónicos'}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">{CATEGORY_LABEL[inputs.itemCategory]}</p>
              </FieldWrap>
            </div>
          </section>

          {/* Sección 2 — Factura al Courier (Declarada) */}
          <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center">
                  <FileText size={16} />
                </div>
                <h2 className="text-sm font-black text-[#111] uppercase tracking-wider">Factura al Courier</h2>
              </div>
              {hasSavings && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg text-[10px] font-black text-amber-600 uppercase">
                  <Sparkles size={10} /> Ahorro {fmtGTQ(result.taxSavingsGTQ)}
                </span>
              )}
            </div>

            <Toggle
              off={false} on={inputs.useDeclaredValue}
              offLabel="Factura por valor real"
              onLabel="Declarar valor menor"
              onChange={v => {
                updateInput('useDeclaredValue', v);
                if (v && inputs.declaredCostUSD === 0) {
                  updateInput('declaredCostUSD', inputs.unitCostUSD);
                }
              }}
            />

            {inputs.useDeclaredValue && (
              <div className="mt-4 space-y-4">
                <div className="flex gap-4">
                  <FieldWrap label="Valor Real (referencia)" hint="Lo que realmente costó">
                    <NumInput prefix="$" value={inputs.unitCostUSD} onChange={() => {}} disabled />
                  </FieldWrap>
                  <FieldWrap label="Valor Declarado en Factura" hint="Lo que presentarás al courier">
                    <NumInput
                      prefix="$" step={0.01}
                      value={inputs.declaredCostUSD}
                      onChange={v => updateInput('declaredCostUSD', v)}
                    />
                  </FieldWrap>
                </div>

                {declaredIsHigher && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="text-xs font-bold text-red-600">
                      El valor declarado es mayor al real — no tiene sentido declararión mayor.
                    </p>
                  </div>
                )}

                {!declaredIsHigher && inputs.declaredCostUSD > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-amber-700 font-medium">Import si facturas ${(inputs.unitCostUSD * inputs.qty).toFixed(2)} (real)</span>
                      <span className="font-black text-amber-700">{fmtGTQ(result.importAtRealGTQ)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-amber-700 font-medium">Import si facturas ${(inputs.declaredCostUSD * inputs.qty).toFixed(2)} (declarado)</span>
                      <span className="font-black text-amber-700">{fmtGTQ(result.totalImportCostGTQ)}</span>
                    </div>
                    <div className="border-t border-amber-200 pt-1.5 flex justify-between text-xs">
                      <span className="font-black text-amber-800">Ahorro fiscal</span>
                      <span className="font-black text-amber-800">{fmtGTQ(result.taxSavingsGTQ)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Sección 3 — Estrategia de Venta */}
          <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center">
                <DollarSign size={16} />
              </div>
              <h2 className="text-sm font-black text-[#111] uppercase tracking-wider">Estrategia de Venta</h2>
            </div>

            <Toggle
              on={inputs.mode === 'fixed'}
              offLabel="Por Margen (%)"
              onLabel="Precio Fijo (Q)"
              onChange={v => updateInput('mode', v ? 'fixed' : 'margin')}
            />

            <div className="mt-4">
              {inputs.mode === 'margin' ? (
                <>
                  <FieldWrap label="Margen Objetivo" hint="Porcentaje sobre precio final de venta">
                    <NumInput suffix="%" step={0.5} value={inputs.targetMargin}
                      onChange={v => updateInput('targetMargin', Math.min(99.99, Math.max(0, v)))} />
                  </FieldWrap>
                  <input type="range" min="0" max="80" step="0.5"
                    value={inputs.targetMargin}
                    onChange={e => updateInput('targetMargin', parseFloat(e.target.value))}
                    className="w-full accent-[#111] mt-3" />
                  <div className="flex justify-between text-[10px] text-slate-400 font-bold mt-1">
                    {['0%','20%','40%','60%','80%'].map(l => <span key={l}>{l}</span>)}
                  </div>
                </>
              ) : (
                <FieldWrap label="Precio de Venta Fijo (Lote)" hint="Precio total en quetzales">
                  <NumInput prefix="Q" step={0.01} value={inputs.fixedSalePrice}
                    onChange={v => updateInput('fixedSalePrice', v)} />
                </FieldWrap>
              )}
            </div>
          </section>
        </div>

        {/* ── RECIBO STICKY ──────────────────────────────────────── */}
        <aside className="lg:col-span-2 lg:sticky lg:top-6">
          <div className="bg-[#111] rounded-3xl shadow-2xl overflow-hidden text-white">

            {/* Header */}
            <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt size={18} className="text-[#69E7A8]" />
                <h3 className="text-sm font-black uppercase tracking-wider">Resumen de Costos</h3>
              </div>
              <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase ${result.isViable ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`}>
                {result.isViable ? 'Rentable' : 'Pérdida'}
              </span>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* Desglose courier */}
              <div className="bg-white/5 rounded-2xl p-4 border border-white/5 space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Cobros Courier</p>
                <Row label="Transporte" value={fmtGTQ(result.freightGTQ)} />
                <Row label="Desaduanaje" value={fmtGTQ(result.desaduanajeGTQ)} />
                <Row label={`Seguro (${(config.insuranceRate * 100).toFixed(3)}%)`} value={fmtGTQ(result.seguroGTQ)} />
                <div className="border-t border-white/10 pt-2 mt-1">
                  <Row label={`Arancel (${(result.daiRate * 100).toFixed(0)}%)`} value={fmtGTQ(result.daiGTQ)} />
                  <Row label="IVA SAT (12%)" value={fmtGTQ(result.ivaGTQ)} />
                </div>
                <div className="border-t border-white/10 pt-2 mt-1">
                  <Row label="Total Importación" value={fmtGTQ(result.totalImportCostGTQ)} bold />
                </div>
              </div>

              {/* Ahorro por factura menor */}
              {hasSavings && (
                <div className="bg-amber-500/10 border border-amber-400/20 rounded-2xl p-4 space-y-1.5">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={13} className="text-amber-400" />
                    <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Ahorro por Factura Declarada</p>
                  </div>
                  <Row label="Import a valor real" value={fmtGTQ(result.importAtRealGTQ)} dim />
                  <Row label="Import a valor declarado" value={fmtGTQ(result.totalImportCostGTQ)} />
                  <div className="border-t border-amber-400/20 pt-2">
                    <Row label="AHORRO FISCAL" value={fmtGTQ(result.taxSavingsGTQ)} amber />
                  </div>
                </div>
              )}

              {/* Landed y utilidad */}
              <div className="space-y-1 bg-white/5 rounded-2xl p-4 border border-white/5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Costo Total (Landed)</p>
                <Row label="Producto real" value={fmtGTQ(result.realProductGTQ)} />
                <Row label="Importación (declarado)" value={fmtGTQ(result.totalImportCostGTQ)} />
                <div className="border-t border-white/10 pt-2 mt-1">
                  <Row label="Costo Landed" value={fmtGTQ(result.totalLandedCostGTQ)} bold />
                  <Row label={`Por unidad (${inputs.qty}u)`} value={fmtGTQ(result.unitLandedCostGTQ)} dim />
                </div>
              </div>

              {/* Utilidad */}
              <div className={`rounded-2xl p-4 border ${result.isViable ? 'bg-emerald-500/10 border-emerald-400/20' : 'bg-red-500/10 border-red-400/20'}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                    {inputs.mode === 'margin' ? 'Precio Sugerido' : 'Precio Final'}
                  </p>
                </div>
                <p className="text-2xl font-black text-white">{fmtGTQ(result.salePriceGTQ)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 mb-3">Margen real: {fmtPct(result.actualMargin)}</p>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Utilidad Neta</p>
                    <p className={`text-2xl font-black ${result.isViable ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmtGTQ(result.netProfitGTQ)}
                    </p>
                    <p className="text-[11px] text-slate-400">{fmtGTQ(result.unitProfitGTQ)}/u</p>
                  </div>
                  {result.isViable ? <TrendingUp size={28} className="text-emerald-400/40" /> : <TrendingDown size={28} className="text-red-400/40" />}
                </div>
              </div>
            </div>

            {/* Desglose CIF */}
            <button onClick={() => setShowBreakdown(s => !s)}
              className="w-full px-6 py-4 border-t border-white/10 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors">
              <span>Base CIF / Aduana</span>
              <ChevronDown size={14} className={`transition-transform ${showBreakdown ? 'rotate-180' : ''}`} />
            </button>

            {showBreakdown && (
              <div className="px-6 pb-5 space-y-0.5 border-t border-white/10 pt-4 bg-black/20">
                <Row label="Valor declarado (total)" value={fmtUSD(result.declaredProductUSD)} dim />
                <Row label={`Seguro CIF (${(config.insuranceRate * 100).toFixed(3)}%)`} value={fmtUSD(result.seguroUSD)} dim />
                <Row label={`Flete CIF ($${config.customsFreightRate}/lb)`} value={fmtUSD(inputs.totalWeightLbs * config.customsFreightRate)} dim />
                <div className="border-t border-white/10 my-2" />
                <Row label="Base CIF (aduana)" value={fmtGTQ(result.cifBaseGTQ)} bold />
                <Row label={`Arancel (${(result.daiRate * 100).toFixed(0)}%)`} value={fmtGTQ(result.daiGTQ)} />
                <Row label="IVA SAT (12%)" value={fmtGTQ(result.ivaGTQ)} />
                <div className="border-t border-white/10 mt-2 pt-2">
                  <Row label="Tipo de cambio" value={`Q${config.exchangeRate.toFixed(2)}/$`} dim />
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
