import { useState } from 'react';
import {
  Plane, Package2, Receipt, Settings2, ChevronDown, ChevronRight,
  RotateCcw, TrendingUp, TrendingDown, DollarSign, Plus, Minus,
  Info, FileText, Sparkles,
} from 'lucide-react';
import type { AppProps } from '../index';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { usePricingEngine } from './usePricingEngine';
import {
  CATEGORY_DAI_RATE, fmtGTQ, fmtUSD, fmtPct,
  type ItemCategory,
} from './pricingEngine';

// ─── Primitivos compartidos ───────────────────────────────────────────────────

function FL({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-1.5 select-none">
      {children}
    </p>
  );
}

function NumInput({
  prefix, suffix, value, onChange, step = 0.01, min = 0, autoFocus, disabled, xl,
}: {
  prefix?: string; suffix?: string; value: number; onChange: (v: number) => void;
  step?: number; min?: number; autoFocus?: boolean; disabled?: boolean; xl?: boolean;
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-bold text-nodo-dim pointer-events-none ${xl ? 'text-lg' : 'text-sm'}`}>
          {prefix}
        </span>
      )}
      <input
        type="number" inputMode="decimal" autoFocus={autoFocus} min={min} step={step}
        disabled={disabled}
        value={Number.isFinite(value) ? value : 0}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        onFocus={e => e.target.select()}
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

/** Stepper táctil — sin teclado, botones grandes */
function MiniStepper({
  value, onChange, step = 1, min = 0, decimals, suffix, label,
}: {
  value: number; onChange: (v: number) => void;
  step?: number; min?: number; decimals?: number; suffix?: string; label?: string;
}) {
  const dec = decimals ?? (step < 1 ? Math.max(1, -Math.floor(Math.log10(step))) : 0);
  const snap = (n: number) => parseFloat(n.toFixed(dec));

  return (
    <div className="flex flex-col gap-1.5">
      {label && <FL>{label}</FL>}
      <div className="flex items-center h-12 bg-nodo-inset border-2 border-nodo-line rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => onChange(snap(Math.max(min, value - step)))}
          className="h-full px-4 text-nodo-sub hover:text-nodo-ink hover:bg-nodo-raised active:scale-90 transition-all shrink-0"
        >
          <Minus size={15} />
        </button>
        <div className="flex-1 flex flex-col items-center justify-center leading-none">
          <span className="text-base font-black text-nodo-ink tabular-nums">{value.toFixed(dec)}</span>
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

function Toggle({ on, onLabel, offLabel, onChange }: {
  on: boolean; onLabel: string; offLabel: string; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex p-1 bg-nodo-inset border-2 border-nodo-line rounded-xl gap-1">
      {([false, true] as const).map(v => (
        <button
          key={String(v)} type="button" onClick={() => onChange(v)}
          className={[
            'flex-1 h-8 rounded-lg text-[11px] font-bold transition-all',
            on === v ? 'bg-nodo-ink text-nodo-canvas shadow-sm' : 'text-nodo-sub hover:text-nodo-ink',
          ].join(' ')}
        >
          {v ? onLabel : offLabel}
        </button>
      ))}
    </div>
  );
}

// ─── Fila para aside oscuro (siempre dark, usa white-based text) ─────────────

function Row({ label, value, bold, dim, accent }: {
  label: string; value: string; bold?: boolean; dim?: boolean; accent?: boolean;
}) {
  return (
    <div className={[
      'flex items-center justify-between py-1',
      bold ? 'font-bold text-white' : dim ? 'text-white/50' : accent ? 'text-amber-300 font-bold' : 'text-white/75',
    ].join(' ')}>
      <span className="text-[11px]">{label}</span>
      <span className="text-[12px] font-mono tabular-nums">{value}</span>
    </div>
  );
}

// ─── Fila para BottomSheet (bg-nodo-card) ─────────────────────────────────────

function SRow({ label, value, bold, dim, accent }: {
  label: string; value: string; bold?: boolean; dim?: boolean; accent?: boolean;
}) {
  return (
    <div className={[
      'flex items-center justify-between py-1',
      bold   ? 'font-bold text-nodo-ink'      :
      dim    ? 'text-nodo-sub'                :
      accent ? 'text-nodo-warn-tx font-bold'  :
               'text-nodo-sub',
    ].join(' ')}>
      <span className="text-[11px]">{label}</span>
      <span className="text-[12px] font-mono tabular-nums">{value}</span>
    </div>
  );
}

// ─── Desglose en BottomSheet — fondo claro, tokens estándar ──────────────────

function ReceiptSheet({
  result, config, inputs, showBreakdown, onToggleBreakdown,
}: {
  result: ReturnType<typeof usePricingEngine>['result'];
  config: ReturnType<typeof usePricingEngine>['config'];
  inputs: ReturnType<typeof usePricingEngine>['inputs'];
  showBreakdown: boolean;
  onToggleBreakdown: () => void;
}) {
  const hasSavings = inputs.useDeclaredValue && result.taxSavingsGTQ > 0;

  return (
    <div className="space-y-3">

      {/* Precio + Utilidad — protagonistas */}
      <div className={`rounded-2xl p-4 border ${result.isViable ? 'bg-nodo-success-bg border-nodo-success-bd' : 'bg-nodo-danger-bg border-nodo-danger-bd'}`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-0.5">
              {inputs.mode === 'margin' ? 'Precio Sugerido' : 'Precio Final'}
            </p>
            <p className="text-4xl font-black text-nodo-ink tabular-nums leading-none">
              {fmtGTQ(result.salePriceGTQ)}
            </p>
            <p className="text-[10px] text-nodo-sub mt-1">Margen real: {fmtPct(result.actualMargin)}</p>
          </div>
          <span className={`mt-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${result.isViable ? 'bg-nodo-success-bg text-nodo-success-tx border border-nodo-success-bd' : 'bg-nodo-danger-bg text-nodo-danger-tx border border-nodo-danger-bd'}`}>
            {result.isViable ? 'Rentable' : 'Pérdida'}
          </span>
        </div>
        <div className="border-t border-nodo-line mt-3 pt-3 flex items-end justify-between">
          <div>
            <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-0.5">Utilidad Neta</p>
            <p className={`text-2xl font-black tabular-nums ${result.isViable ? 'text-nodo-success-tx' : 'text-nodo-danger-tx'}`}>
              {fmtGTQ(result.netProfitGTQ)}
            </p>
            <p className="text-[10px] text-nodo-sub tabular-nums">{fmtGTQ(result.unitProfitGTQ)} / unidad</p>
          </div>
          {result.isViable
            ? <TrendingUp size={28} className="text-nodo-success-tx opacity-30 mb-1" />
            : <TrendingDown size={28} className="text-nodo-danger-tx opacity-30 mb-1" />
          }
        </div>
      </div>

      {/* Courier + Aduana */}
      <div className="bg-nodo-inset rounded-2xl p-4 border border-nodo-line space-y-0.5">
        <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-2">Courier + Aduana</p>
        <SRow label="Transporte" value={fmtGTQ(result.freightGTQ)} />
        <SRow label="Desaduanaje" value={fmtGTQ(result.desaduanajeGTQ)} />
        <SRow label={`Seguro (${(config.insuranceRate * 100).toFixed(3)}%)`} value={fmtGTQ(result.seguroGTQ)} />
        <div className="border-t border-nodo-line pt-2 mt-1 space-y-0.5">
          <SRow label={`Arancel DAI (${(result.daiRate * 100).toFixed(0)}%)`} value={fmtGTQ(result.daiGTQ)} />
          <SRow label="IVA SAT 12%" value={fmtGTQ(result.ivaGTQ)} />
        </div>
        <div className="border-t border-nodo-line pt-2 mt-1">
          <SRow label="Total Importación" value={fmtGTQ(result.totalImportCostGTQ)} bold />
        </div>
      </div>

      {/* Ahorro por factura declarada */}
      {hasSavings && (
        <div className="bg-nodo-warn-bg border border-nodo-warn-bd rounded-2xl p-4 space-y-0.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={11} className="text-nodo-warn-tx" />
            <p className="text-[9px] font-bold text-nodo-warn-tx uppercase tracking-widest">Ahorro por Factura Declarada</p>
          </div>
          <SRow label={`Real ($${(inputs.unitCostUSD * inputs.qty).toFixed(2)})`} value={fmtGTQ(result.importAtRealGTQ)} dim />
          <SRow label={`Declarado ($${(inputs.declaredCostUSD * inputs.qty).toFixed(2)})`} value={fmtGTQ(result.totalImportCostGTQ)} />
          <div className="border-t border-nodo-warn-bd pt-2 mt-1">
            <SRow label="AHORRO FISCAL" value={fmtGTQ(result.taxSavingsGTQ)} accent />
          </div>
        </div>
      )}

      {/* Costo Landed */}
      <div className="bg-nodo-inset rounded-2xl p-4 border border-nodo-line space-y-0.5">
        <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-2">Costo Landed</p>
        <SRow label="Producto (real)" value={fmtGTQ(result.realProductGTQ)} />
        <SRow label="Importación" value={fmtGTQ(result.totalImportCostGTQ)} />
        <div className="border-t border-nodo-line pt-2 mt-1 space-y-0.5">
          <SRow label="Landed total" value={fmtGTQ(result.totalLandedCostGTQ)} bold />
          <SRow label={`Por unidad (${inputs.qty}u)`} value={fmtGTQ(result.unitLandedCostGTQ)} dim />
        </div>
      </div>

      {/* Desglose CIF expandible */}
      <button
        onClick={onToggleBreakdown}
        className="w-full px-4 py-3 bg-nodo-inset border border-nodo-line rounded-2xl flex items-center justify-between text-[11px] font-bold text-nodo-sub hover:text-nodo-ink hover:bg-nodo-raised transition-colors"
      >
        <span className="uppercase tracking-wider">Base CIF / Aduana</span>
        <ChevronDown size={13} className={`transition-transform duration-200 ${showBreakdown ? 'rotate-180' : ''}`} />
      </button>

      {showBreakdown && (
        <div className="bg-nodo-inset rounded-2xl p-4 border border-nodo-line space-y-0.5">
          <SRow label="Valor declarado total" value={fmtUSD(result.declaredProductUSD)} dim />
          <SRow label={`Seguro CIF (${(config.insuranceRate * 100).toFixed(3)}%)`} value={fmtUSD(result.seguroUSD)} dim />
          <SRow label={`Flete CIF ($${config.customsFreightRate}/lb)`} value={fmtUSD(inputs.totalWeightLbs * config.customsFreightRate)} dim />
          <div className="border-t border-nodo-line my-2" />
          <SRow label="Base CIF (aduana)" value={fmtGTQ(result.cifBaseGTQ)} bold />
          <SRow label={`Arancel (${(result.daiRate * 100).toFixed(0)}%)`} value={fmtGTQ(result.daiGTQ)} />
          <SRow label="IVA SAT 12%" value={fmtGTQ(result.ivaGTQ)} />
          <div className="border-t border-nodo-line mt-2 pt-2">
            <SRow label="Tipo de cambio" value={`Q${config.exchangeRate.toFixed(2)}/$`} dim />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Desglose en aside desktop — fondo oscuro ────────────────────────────────

function ReceiptFull({
  result, config, inputs, showBreakdown, onToggleBreakdown,
}: {
  result: ReturnType<typeof usePricingEngine>['result'];
  config: ReturnType<typeof usePricingEngine>['config'];
  inputs: ReturnType<typeof usePricingEngine>['inputs'];
  showBreakdown: boolean;
  onToggleBreakdown: () => void;
}) {
  const hasSavings = inputs.useDeclaredValue && result.taxSavingsGTQ > 0;

  return (
    <div className="bg-[#111111] dark:bg-[#1C1C1E] rounded-3xl overflow-hidden shadow-2xl">
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt size={15} className="text-[#69E7A8]" />
          <span className="text-sm font-black text-white uppercase tracking-wider">Desglose</span>
        </div>
        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${result.isViable ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`}>
          {result.isViable ? 'Rentable' : 'Pérdida'}
        </span>
      </div>

      <div className="px-5 py-4 space-y-3">
        <div className="bg-white/5 rounded-2xl p-3.5 border border-white/8 space-y-0.5">
          <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-2">Courier + Aduana</p>
          <Row label="Transporte" value={fmtGTQ(result.freightGTQ)} />
          <Row label="Desaduanaje" value={fmtGTQ(result.desaduanajeGTQ)} />
          <Row label={`Seguro (${(config.insuranceRate * 100).toFixed(3)}%)`} value={fmtGTQ(result.seguroGTQ)} />
          <div className="border-t border-white/10 pt-2 mt-1 space-y-0.5">
            <Row label={`Arancel DAI (${(result.daiRate * 100).toFixed(0)}%)`} value={fmtGTQ(result.daiGTQ)} />
            <Row label="IVA SAT 12%" value={fmtGTQ(result.ivaGTQ)} />
          </div>
          <div className="border-t border-white/10 pt-2 mt-1">
            <Row label="Total Importación" value={fmtGTQ(result.totalImportCostGTQ)} bold />
          </div>
        </div>

        {hasSavings && (
          <div className="bg-amber-500/10 border border-amber-400/20 rounded-2xl p-3.5 space-y-0.5">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={11} className="text-amber-400" />
              <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">Ahorro por Factura Declarada</p>
            </div>
            <Row label={`Real ($${(inputs.unitCostUSD * inputs.qty).toFixed(2)})`} value={fmtGTQ(result.importAtRealGTQ)} dim />
            <Row label={`Declarado ($${(inputs.declaredCostUSD * inputs.qty).toFixed(2)})`} value={fmtGTQ(result.totalImportCostGTQ)} />
            <div className="border-t border-amber-400/20 pt-2 mt-1">
              <Row label="AHORRO FISCAL" value={fmtGTQ(result.taxSavingsGTQ)} accent />
            </div>
          </div>
        )}

        <div className="bg-white/5 rounded-2xl p-3.5 border border-white/8 space-y-0.5">
          <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-2">Costo Landed</p>
          <Row label="Producto (real)" value={fmtGTQ(result.realProductGTQ)} />
          <Row label="Importación" value={fmtGTQ(result.totalImportCostGTQ)} />
          <div className="border-t border-white/10 pt-2 mt-1 space-y-0.5">
            <Row label="Landed total" value={fmtGTQ(result.totalLandedCostGTQ)} bold />
            <Row label={`Por unidad (${inputs.qty}u)`} value={fmtGTQ(result.unitLandedCostGTQ)} dim />
          </div>
        </div>

        <div className={`rounded-2xl p-3.5 border ${result.isViable ? 'bg-emerald-500/10 border-emerald-400/20' : 'bg-red-500/10 border-red-400/20'}`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
                {inputs.mode === 'margin' ? 'Precio Sugerido' : 'Precio Final'}
              </p>
              <p className="text-3xl font-black text-white tabular-nums mt-0.5">{fmtGTQ(result.salePriceGTQ)}</p>
              <p className="text-[10px] text-white/40 mt-0.5">Margen: {fmtPct(result.actualMargin)}</p>
            </div>
            {result.isViable ? <TrendingUp size={22} className="text-emerald-400/50 mt-1" /> : <TrendingDown size={22} className="text-red-400/50 mt-1" />}
          </div>
          <div className="border-t border-white/10 mt-3 pt-3">
            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-0.5">Utilidad Neta</p>
            <p className={`text-2xl font-black tabular-nums ${result.isViable ? 'text-emerald-400' : 'text-red-400'}`}>{fmtGTQ(result.netProfitGTQ)}</p>
            <p className="text-[10px] text-white/40 tabular-nums">{fmtGTQ(result.unitProfitGTQ)} / unidad</p>
          </div>
        </div>
      </div>

      <button
        onClick={onToggleBreakdown}
        className="w-full px-5 py-3 border-t border-white/10 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-white/40 hover:text-white/70 transition-colors"
      >
        <span>Base CIF / Aduana</span>
        <ChevronDown size={13} className={`transition-transform duration-200 ${showBreakdown ? 'rotate-180' : ''}`} />
      </button>

      {showBreakdown && (
        <div className="px-5 pb-5 pt-3 space-y-0.5 border-t border-white/10 bg-white/5">
          <Row label="Valor declarado total" value={fmtUSD(result.declaredProductUSD)} dim />
          <Row label={`Seguro CIF (${(config.insuranceRate * 100).toFixed(3)}%)`} value={fmtUSD(result.seguroUSD)} dim />
          <Row label={`Flete CIF ($${config.customsFreightRate}/lb)`} value={fmtUSD(inputs.totalWeightLbs * config.customsFreightRate)} dim />
          <div className="border-t border-white/10 my-2" />
          <Row label="Base CIF (aduana)" value={fmtGTQ(result.cifBaseGTQ)} bold />
          <Row label={`Arancel (${(result.daiRate * 100).toFixed(0)}%)`} value={fmtGTQ(result.daiGTQ)} />
          <Row label="IVA SAT 12%" value={fmtGTQ(result.ivaGTQ)} />
          <div className="border-t border-white/10 mt-2 pt-2">
            <Row label="Tipo de cambio" value={`Q${config.exchangeRate.toFixed(2)}/$`} dim />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function SmartCalculator(_props: AppProps) {
  const { inputs, config, result, updateInput, updateConfig, reset } = usePricingEngine();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showReceipt, setShowReceipt]     = useState(false);
  const [showConfig, setShowConfig]       = useState(false);

  const hasSavings      = inputs.useDeclaredValue && result.taxSavingsGTQ > 0;
  const declaredIsHigh  = inputs.useDeclaredValue && inputs.declaredCostUSD > inputs.unitCostUSD;

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-3">

      {/* ════════════════════════════════════════════════════════
          ZONA RESULTADOS — mobile: tarjeta oscura con header integrado
          desktop: solo el header clásico (el aside maneja los resultados)
          ════════════════════════════════════════════════════════ */}

      {/* Mobile: result card (header + output combinados) */}
      <div className="lg:hidden bg-[#111111] dark:bg-[#1C1C1E] rounded-3xl overflow-hidden shadow-xl">

        {/* Header strip */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Plane size={15} className="text-white" />
            </div>
            <div>
              <p className="text-white font-black text-sm leading-none">Importaciones</p>
              <p className="text-white/40 text-[10px] font-medium mt-0.5">Courier GT</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowConfig(true)}
              className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/15 transition-colors"
            >
              <Settings2 size={14} />
            </button>
            <button
              onClick={reset}
              className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/15 transition-colors"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/8 mx-4" />

        {/* Output — toca para ver desglose */}
        <button
          onClick={() => setShowReceipt(true)}
          className="w-full px-4 py-3.5 flex items-center justify-between active:bg-white/5 transition-colors"
        >
          <div className="text-left">
            <p className="text-white/50 text-[9px] font-bold uppercase tracking-widest mb-0.5">
              {inputs.mode === 'margin' ? 'Precio Sugerido' : 'Precio Final'}
            </p>
            <p className="text-white font-black text-4xl tabular-nums leading-none">
              {fmtGTQ(result.salePriceGTQ)}
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              <p className={`text-sm font-black tabular-nums ${result.isViable ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtGTQ(result.netProfitGTQ)}
              </p>
              <span className="text-white/40 text-[10px] font-bold">utilidad</span>
              <span className="text-white/40 text-[10px]">·</span>
              <span className="text-white/40 text-[10px] font-bold tabular-nums">{fmtPct(result.actualMargin)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${result.isViable ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`}>
              {result.isViable ? 'Rentable' : 'Pérdida'}
            </span>
            <ChevronRight size={14} className="text-white/30" />
          </div>
        </button>
      </div>

      {/* Desktop: header clásico */}
      <div className="hidden lg:flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-nodo-ink flex items-center justify-center shrink-0">
            <Plane size={19} className="text-nodo-canvas" />
          </div>
          <div>
            <h1 className="text-[28px] font-black text-nodo-ink leading-none">Importaciones</h1>
            <p className="text-xs font-medium text-nodo-dim mt-0.5">Courier GT · cálculo en tiempo real</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig(s => !s)}
            className={`h-10 px-4 rounded-xl flex items-center gap-2 text-xs font-bold border transition-colors ${showConfig ? 'bg-nodo-ink text-nodo-canvas border-nodo-ink' : 'bg-nodo-card text-nodo-sub border-nodo-line hover:bg-nodo-inset'}`}
          >
            <Settings2 size={14} /> Parámetros
          </button>
          <button
            onClick={reset}
            className="h-10 px-4 rounded-xl flex items-center gap-2 text-xs font-bold bg-nodo-card text-nodo-sub border border-nodo-line hover:bg-nodo-danger-bg hover:text-nodo-danger-tx hover:border-nodo-danger-bd transition-colors"
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          LAYOUT PRINCIPAL
          ════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 lg:gap-5 items-start">

        {/* ── FORMULARIO ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-3">

          {/* ── Mobile: tarjeta única compacta ── */}
          <div className="lg:hidden bg-nodo-card rounded-3xl border border-nodo-line shadow-sm overflow-hidden">

            {/* ① PRECIO — protagonista absoluto */}
            <div className="px-4 pt-4 pb-3">
              <FL>Precio en USA — todo incluido</FL>
              <NumInput
                prefix="$" xl
                value={inputs.unitCostUSD}
                onChange={v => updateInput('unitCostUSD', v)}
                autoFocus
              />
            </div>

            {/* ② CATEGORÍA — afecta directamente el arancel */}
            <div className="px-4 pb-3">
              <FL>Tipo de artículo — Arancel DAI</FL>
              <div className="grid grid-cols-3 gap-1 p-1 bg-nodo-inset border-2 border-nodo-line rounded-xl">
                {(Object.keys(CATEGORY_DAI_RATE) as ItemCategory[]).map(cat => {
                  const active = inputs.itemCategory === cat;
                  const rate   = CATEGORY_DAI_RATE[cat];
                  return (
                    <button
                      key={cat} type="button"
                      onClick={() => updateInput('itemCategory', cat)}
                      className={[
                        'h-9 rounded-lg text-[10px] font-bold leading-tight px-0.5 transition-all flex flex-col items-center justify-center gap-0.5',
                        active ? 'bg-nodo-ink text-nodo-canvas shadow-sm' : 'text-nodo-sub hover:text-nodo-ink',
                      ].join(' ')}
                    >
                      <span>{cat === 'ropa' ? 'Ropa' : cat === 'repuestos' ? 'Repuestos' : 'Electrón.'}</span>
                      <span className={`text-[8px] font-black ${active ? 'text-nodo-sub' : rate === 0 ? 'text-nodo-success-tx' : 'text-nodo-dim'}`}>
                        {(rate * 100).toFixed(0)}% DAI
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-nodo-line mx-4" />

            {/* ③ FACTURA — declarar o valor real */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <FileText size={11} className="text-nodo-warn-tx shrink-0" />
                <FL>Factura al courier</FL>
                {hasSavings && (
                  <span className="ml-auto flex items-center gap-1 text-[9px] font-black text-nodo-warn-tx bg-nodo-warn-bg border border-nodo-warn-bd px-1.5 py-0.5 rounded-md">
                    <Sparkles size={8} /> {fmtGTQ(result.taxSavingsGTQ)}
                  </span>
                )}
              </div>
              <Toggle
                on={inputs.useDeclaredValue}
                offLabel="Valor real"
                onLabel="Declarar menor"
                onChange={v => {
                  updateInput('useDeclaredValue', v);
                  if (v && inputs.declaredCostUSD === 0) updateInput('declaredCostUSD', inputs.unitCostUSD);
                }}
              />
              {inputs.useDeclaredValue && (
                <div className="mt-2.5 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FL>Real (ref.)</FL>
                      <NumInput prefix="$" value={inputs.unitCostUSD} onChange={() => {}} disabled />
                    </div>
                    <div>
                      <FL>Declarado</FL>
                      <NumInput prefix="$" step={0.01} value={inputs.declaredCostUSD}
                        onChange={v => updateInput('declaredCostUSD', v)} />
                    </div>
                  </div>
                  {declaredIsHigh ? (
                    <div className="bg-nodo-danger-bg border border-nodo-danger-bd rounded-xl p-2">
                      <p className="text-[11px] font-bold text-nodo-danger-tx">El declarado no puede ser mayor al real.</p>
                    </div>
                  ) : inputs.declaredCostUSD > 0 && (
                    <div className="bg-nodo-warn-bg border border-nodo-warn-bd rounded-xl p-2.5 space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-nodo-warn-tx">Real ${(inputs.unitCostUSD * inputs.qty).toFixed(2)}</span>
                        <span className="font-black text-nodo-warn-tx tabular-nums">{fmtGTQ(result.importAtRealGTQ)}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-nodo-warn-tx">Declarado ${(inputs.declaredCostUSD * inputs.qty).toFixed(2)}</span>
                        <span className="font-black text-nodo-warn-tx tabular-nums">{fmtGTQ(result.totalImportCostGTQ)}</span>
                      </div>
                      <div className="border-t border-nodo-warn-bd pt-1 flex justify-between text-[10px]">
                        <span className="font-black text-nodo-warn-tx">Ahorro fiscal</span>
                        <span className="font-black text-nodo-warn-tx tabular-nums">{fmtGTQ(result.taxSavingsGTQ)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="h-px bg-nodo-line mx-4" />

            {/* ④ ESTRATEGIA DE VENTA */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={11} className="text-emerald-500 shrink-0" />
                <FL>Estrategia de venta</FL>
              </div>
              <Toggle
                on={inputs.mode === 'fixed'}
                offLabel="Por Margen %"
                onLabel="Precio Fijo Q"
                onChange={v => updateInput('mode', v ? 'fixed' : 'margin')}
              />
              <div className="mt-2.5">
                {inputs.mode === 'margin' ? (
                  <div className="space-y-2">
                    <NumInput
                      suffix="%" step={0.5}
                      value={inputs.targetMargin}
                      onChange={v => updateInput('targetMargin', Math.min(99.99, Math.max(0, v)))}
                    />
                    <input
                      type="range" min="0" max="80" step="0.5"
                      value={inputs.targetMargin}
                      onChange={e => updateInput('targetMargin', parseFloat(e.target.value))}
                      className="w-full accent-current h-1.5 cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-nodo-dim font-bold -mt-1">
                      {['0%', '20%', '40%', '60%', '80%'].map(l => <span key={l}>{l}</span>)}
                    </div>
                  </div>
                ) : (
                  <NumInput prefix="Q" step={0.01} value={inputs.fixedSalePrice}
                    onChange={v => updateInput('fixedSalePrice', v)} />
                )}
              </div>
            </div>

            {/* Divider con label — separa zona thumb */}
            <div className="flex items-center gap-3 px-4">
              <div className="h-px flex-1 bg-nodo-line" />
              <span className="text-[8px] font-bold text-nodo-dim uppercase tracking-widest py-0.5">Ajuste de lote</span>
              <div className="h-px flex-1 bg-nodo-line" />
            </div>

            {/* ⑤ PESO + CANTIDAD — zona del pulgar, siempre accesibles */}
            <div className="px-4 pt-2 pb-4 grid grid-cols-2 gap-3">
              <MiniStepper
                label="Peso del lote"
                value={inputs.totalWeightLbs}
                onChange={v => updateInput('totalWeightLbs', v)}
                step={0.1} min={0.1} decimals={1} suffix="lbs"
              />
              <MiniStepper
                label="Cantidad"
                value={inputs.qty}
                onChange={v => updateInput('qty', v)}
                step={1} min={1} suffix="unid."
              />
            </div>
          </div>

          {/* ── Desktop: tres tarjetas ── */}
          <div className="hidden lg:flex flex-col gap-4">

            <section className="bg-nodo-card rounded-3xl border border-nodo-line shadow-sm p-6">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Package2 size={15} />
                </div>
                <h2 className="text-sm font-black text-nodo-ink uppercase tracking-wider">Producto</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <FL>Precio Real en USA — todo incluido</FL>
                  <NumInput prefix="$" xl value={inputs.unitCostUSD}
                    onChange={v => updateInput('unitCostUSD', v)} autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <MiniStepper label="Peso del lote" value={inputs.totalWeightLbs}
                    onChange={v => updateInput('totalWeightLbs', v)}
                    step={0.1} min={0.1} decimals={1} suffix="lbs" />
                  <MiniStepper label="Cantidad" value={inputs.qty}
                    onChange={v => updateInput('qty', v)} step={1} min={1} suffix="unid." />
                </div>
                <div>
                  <FL>Tipo de Artículo — Arancel DAI</FL>
                  <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-nodo-inset border-2 border-nodo-line rounded-2xl">
                    {(Object.keys(CATEGORY_DAI_RATE) as ItemCategory[]).map(cat => {
                      const active = inputs.itemCategory === cat;
                      const rate   = CATEGORY_DAI_RATE[cat];
                      return (
                        <button key={cat} type="button"
                          onClick={() => updateInput('itemCategory', cat)}
                          className={`h-11 rounded-xl text-[11px] font-bold leading-tight transition-all flex flex-col items-center justify-center gap-0.5 ${active ? 'bg-nodo-ink text-nodo-canvas shadow-sm' : 'text-nodo-sub hover:text-nodo-ink'}`}>
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
            </section>

            <section className="bg-nodo-card rounded-3xl border border-nodo-line shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-nodo-warn-bg text-nodo-warn-tx flex items-center justify-center">
                    <FileText size={15} />
                  </div>
                  <h2 className="text-sm font-black text-nodo-ink uppercase tracking-wider">Factura al Courier</h2>
                </div>
                {hasSavings && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-nodo-warn-bg border border-nodo-warn-bd rounded-lg text-[9px] font-black text-nodo-warn-tx uppercase">
                    <Sparkles size={9} /> {fmtGTQ(result.taxSavingsGTQ)}
                  </span>
                )}
              </div>
              <div className="space-y-3">
                <Toggle on={inputs.useDeclaredValue} offLabel="Valor real" onLabel="Declarar menor"
                  onChange={v => { updateInput('useDeclaredValue', v); if (v && inputs.declaredCostUSD === 0) updateInput('declaredCostUSD', inputs.unitCostUSD); }} />
                {inputs.useDeclaredValue && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><FL>Valor real (ref.)</FL><NumInput prefix="$" value={inputs.unitCostUSD} onChange={() => {}} disabled /></div>
                      <div><FL>Valor declarado</FL><NumInput prefix="$" step={0.01} value={inputs.declaredCostUSD} onChange={v => updateInput('declaredCostUSD', v)} /></div>
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
            </section>

            <section className="bg-nodo-card rounded-3xl border border-nodo-line shadow-sm p-6">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <DollarSign size={15} />
                </div>
                <h2 className="text-sm font-black text-nodo-ink uppercase tracking-wider">Estrategia de Venta</h2>
              </div>
              <div className="space-y-3">
                <Toggle on={inputs.mode === 'fixed'} offLabel="Por Margen %" onLabel="Precio Fijo Q"
                  onChange={v => updateInput('mode', v ? 'fixed' : 'margin')} />
                {inputs.mode === 'margin' ? (
                  <div className="space-y-2">
                    <NumInput suffix="%" step={0.5} value={inputs.targetMargin}
                      onChange={v => updateInput('targetMargin', Math.min(99.99, Math.max(0, v)))} />
                    <input type="range" min="0" max="80" step="0.5" value={inputs.targetMargin}
                      onChange={e => updateInput('targetMargin', parseFloat(e.target.value))}
                      className="w-full accent-current h-1.5 cursor-pointer" />
                    <div className="flex justify-between text-[9px] text-nodo-dim font-bold">
                      {['0%','20%','40%','60%','80%'].map(l => <span key={l}>{l}</span>)}
                    </div>
                  </div>
                ) : (
                  <NumInput prefix="Q" step={0.01} value={inputs.fixedSalePrice}
                    onChange={v => updateInput('fixedSalePrice', v)} />
                )}
              </div>
            </section>
          </div>
        </div>

        {/* ── RECIBO ASIDE — solo desktop ── */}
        <aside className="hidden lg:block lg:col-span-2 lg:sticky lg:top-6">
          <ReceiptFull
            result={result} config={config} inputs={inputs}
            showBreakdown={showBreakdown}
            onToggleBreakdown={() => setShowBreakdown(s => !s)}
          />
        </aside>
      </div>

      {/* ── BottomSheet: Desglose completo (mobile) ──────────────────────── */}
      <BottomSheet open={showReceipt} onClose={() => setShowReceipt(false)} title="Desglose de Costos">
        <ReceiptSheet
          result={result} config={config} inputs={inputs}
          showBreakdown={showBreakdown}
          onToggleBreakdown={() => setShowBreakdown(s => !s)}
        />
      </BottomSheet>

      {/* ── BottomSheet: Parámetros del courier ──────────────────────────── */}
      <BottomSheet open={showConfig} onClose={() => setShowConfig(false)} title="Parámetros del Courier">
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 p-3 bg-nodo-inset rounded-2xl">
            <Info size={13} className="text-[#69E7A8] mt-0.5 shrink-0" />
            <p className="text-[11px] text-nodo-sub leading-relaxed">
              Tasas calibradas con factura real ICC. Ajusta si el courier modifica sus tarifas.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(([
              { label: 'Tipo de Cambio', key: 'exchangeRate',       suffix: 'Q/$',  step: 0.01 },
              { label: 'Transporte ICC', key: 'iccPoundRate',        suffix: '$/lb', step: 0.001 },
              { label: 'Desaduanaje',    key: 'iccCustomsFee',       suffix: 'USD',  step: 0.001 },
              { label: 'Seguro',         key: 'insuranceRate',       suffix: '%',    step: 0.0001, pct: true },
              { label: 'Flete CIF SAT',  key: 'customsFreightRate',  suffix: '$/lb', step: 0.01 },
              { label: 'IVA SAT',        key: 'ivaRate',             suffix: '%',    step: 0.01,   pct: true },
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
    </div>
  );
}
