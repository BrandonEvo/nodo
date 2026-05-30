import { useState } from 'react';
import {
  Plane, Package2, Receipt, Settings2, ChevronDown, ChevronRight,
  RotateCcw, TrendingUp, TrendingDown, DollarSign, Plus, Minus,
  Info, FileText, Sparkles, Search, Loader2, X, ArrowRight,
  BookmarkPlus, Check, ClipboardList,
} from 'lucide-react';
import api from '@/lib/api';
import type { AppProps } from '../index';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { usePricingEngine } from './usePricingEngine';
import {
  CATEGORY_DAI_RATE, fmtGTQ, fmtUSD, fmtPct,
  type ItemCategory,
} from './pricingEngine';
import { importacionesService } from '@/services/importaciones.service';
import { CotizacionesTab } from './CotizacionesTab';

// ─── iOS Switch ───────────────────────────────────────────────────────────────

function IOSSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative w-[51px] h-[31px] rounded-full transition-colors duration-200 shrink-0 ${on ? 'bg-[#34C759]' : 'bg-nodo-line'}`}
    >
      <span
        className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-md transition-transform duration-200 ${on ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

// ─── Inline stepper (para filas iOS) ─────────────────────────────────────────

function InlineStepper({
  value, onChange, min = 0, step = 1, decimals, suffix,
}: {
  value: number; onChange: (v: number) => void;
  min?: number; step?: number; decimals?: number; suffix?: string;
}) {
  const dec = decimals ?? (step < 1 ? Math.max(1, -Math.floor(Math.log10(step))) : 0);
  const snap = (n: number) => parseFloat(n.toFixed(dec));

  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={() => onChange(snap(Math.max(min, value - step)))}
        className="w-8 h-8 rounded-full bg-nodo-inset border border-nodo-line flex items-center justify-center text-nodo-sub active:scale-90 transition-transform shrink-0"
      >
        <Minus size={13} />
      </button>
      <div className="min-w-[4rem] text-center">
        <span className="text-base font-black text-nodo-ink tabular-nums">{value.toFixed(dec)}</span>
        {suffix && <span className="text-[10px] text-nodo-dim font-bold ml-1">{suffix}</span>}
      </div>
      <button
        type="button"
        onClick={() => onChange(snap(value + step))}
        className="w-8 h-8 rounded-full bg-nodo-ink flex items-center justify-center active:scale-90 transition-transform shrink-0"
      >
        <Plus size={13} className="text-nodo-canvas" />
      </button>
    </div>
  );
}

// ─── Fila iOS (label izq, control der) ───────────────────────────────────────

function FormRow({
  label, sub, children, last, tall,
}: {
  label?: string; sub?: string; children: React.ReactNode; last?: boolean; tall?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 ${tall ? 'py-3' : 'h-[56px]'} ${!last ? 'border-b border-nodo-line' : ''}`}>
      {(label || sub) && (
        <div className="flex-1 min-w-0">
          {label && <span className="text-[15px] font-semibold text-nodo-ink">{label}</span>}
          {sub   && <p  className="text-[12px] text-nodo-sub">{sub}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Separador de sección iOS (label uppercase centrado) ─────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <div className="h-px flex-1 bg-nodo-line" />
      <span className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest">{label}</span>
      <div className="h-px flex-1 bg-nodo-line" />
    </div>
  );
}

// ─── Fila para aside oscuro ───────────────────────────────────────────────────

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

// ─── Fila para BottomSheet ────────────────────────────────────────────────────

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

// ─── Desglose BottomSheet ─────────────────────────────────────────────────────

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
        <div className="border-t border-nodo-line mt-3 pt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-0.5">Costo Landed</p>
            <p className="text-lg font-black tabular-nums text-nodo-ink">{fmtGTQ(result.totalLandedCostGTQ)}</p>
            <p className="text-[10px] text-nodo-sub tabular-nums">{fmtGTQ(result.unitLandedCostGTQ)} / u</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-0.5">Utilidad Neta</p>
            <p className={`text-lg font-black tabular-nums ${result.isViable ? 'text-nodo-success-tx' : 'text-nodo-danger-tx'}`}>
              {fmtGTQ(result.netProfitGTQ)}
            </p>
            <p className="text-[10px] text-nodo-sub tabular-nums">{fmtGTQ(result.unitProfitGTQ)} / u</p>
          </div>
        </div>
      </div>

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

      <div className="bg-nodo-inset rounded-2xl p-4 border border-nodo-line space-y-0.5">
        <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-2">Costo Landed</p>
        <SRow label="Producto (real)" value={fmtGTQ(result.realProductGTQ)} />
        <SRow label="Importación" value={fmtGTQ(result.totalImportCostGTQ)} />
        <div className="border-t border-nodo-line pt-2 mt-1 space-y-0.5">
          <SRow label="Landed total" value={fmtGTQ(result.totalLandedCostGTQ)} bold />
          <SRow label={`Por unidad (${inputs.qty}u)`} value={fmtGTQ(result.unitLandedCostGTQ)} dim />
        </div>
      </div>

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

// ─── Desglose aside desktop ───────────────────────────────────────────────────

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
          <div className="border-t border-white/10 mt-3 pt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-0.5">Costo Landed</p>
              <p className="text-lg font-black text-white/70 tabular-nums">{fmtGTQ(result.totalLandedCostGTQ)}</p>
              <p className="text-[10px] text-white/40 tabular-nums">{fmtGTQ(result.unitLandedCostGTQ)} / u</p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-0.5">Utilidad Neta</p>
              <p className={`text-lg font-black tabular-nums ${result.isViable ? 'text-emerald-400' : 'text-red-400'}`}>{fmtGTQ(result.netProfitGTQ)}</p>
              <p className="text-[10px] text-white/40 tabular-nums">{fmtGTQ(result.unitProfitGTQ)} / u</p>
            </div>
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

// ─── FL label ─────────────────────────────────────────────────────────────────

function FL({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-1.5 select-none">
      {children}
    </p>
  );
}

// ─── NumInput (desktop) ───────────────────────────────────────────────────────

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

// ─── MiniStepper (desktop) ────────────────────────────────────────────────────

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

// ─── Toggle (desktop) ─────────────────────────────────────────────────────────

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

// ─── Componente Principal ─────────────────────────────────────────────────────

const TAB_OPTS = [
  { value: 'calc',   label: 'Calculadora',  icon: <Plane size={14} /> },
  { value: 'quotes', label: 'Cotizaciones', icon: <ClipboardList size={14} /> },
];

export function SmartCalculator(_props: AppProps) {
  const { inputs, config, result, updateInput, updateConfig, reset } = usePricingEngine();
  const [activeTab, setActiveTab]         = useState<'calc' | 'quotes'>('calc');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showReceipt, setShowReceipt]     = useState(false);
  const [showConfig, setShowConfig]       = useState(false);

  const [amazonUrl, setAmazonUrl]         = useState('');
  const [amazonProduct, setAmazonProduct] = useState<{ name: string; asin: string } | null>(null);
  const [amazonLoading, setAmazonLoading] = useState(false);
  const [amazonError, setAmazonError]     = useState<string | null>(null);
  const [amazonNeedsPrice, setAmazonNeedsPrice] = useState(false);

  const [showSaveSheet, setShowSaveSheet] = useState(false);
  const [saveName, setSaveName]           = useState('');
  const [saveLoading, setSaveLoading]     = useState(false);
  const [saveSuccess, setSaveSuccess]     = useState(false);

  async function handleAmazonSearch() {
    if (!amazonUrl.trim()) return;
    setAmazonLoading(true);
    setAmazonError(null);
    setAmazonProduct(null);
    setAmazonNeedsPrice(false);
    try {
      const { data } = await api.post('/api/amazon/scrape', { url: amazonUrl.trim() });
      if (data.price_usd) {
        updateInput('unitCostUSD', data.price_usd);
        if (inputs.useDeclaredValue) updateInput('declaredCostUSD', data.price_usd);
      } else {
        setAmazonNeedsPrice(true);
      }
      setAmazonProduct({ name: data.name ?? 'Producto sin nombre', asin: data.asin });
    } catch (err: any) {
      setAmazonError(err?.response?.data?.detail ?? 'No se pudo obtener el producto.');
    } finally {
      setAmazonLoading(false);
    }
  }

  function handleUrlChange(value: string) {
    setAmazonUrl(value);
    setAmazonError(null);
    if (amazonProduct) {
      setAmazonProduct(null);
      setAmazonNeedsPrice(false);
    }
  }

  function clearAmazon() {
    setAmazonUrl('');
    setAmazonProduct(null);
    setAmazonError(null);
    setAmazonNeedsPrice(false);
    updateInput('unitCostUSD', 1);
    if (inputs.useDeclaredValue) updateInput('declaredCostUSD', 0);
  }

  function handleReset() {
    reset();
    setAmazonUrl('');
    setAmazonProduct(null);
    setAmazonError(null);
    setAmazonNeedsPrice(false);
  }

  const hasSavings     = inputs.useDeclaredValue && result.taxSavingsGTQ > 0;
  const declaredIsHigh = inputs.useDeclaredValue && inputs.declaredCostUSD > inputs.unitCostUSD;

  function openSaveSheet() {
    setSaveName(amazonProduct?.name ?? '');
    setSaveSuccess(false);
    setShowSaveSheet(true);
  }

  async function handleSaveCotizacion() {
    if (!saveName.trim()) return;
    setSaveLoading(true);
    try {
      await importacionesService.create({
        product_name:    saveName.trim(),
        amazon_asin:     amazonProduct?.asin ?? null,
        inputs_snapshot: inputs as unknown as Record<string, unknown>,
        config_snapshot: config as unknown as Record<string, unknown>,
        result_snapshot: result as unknown as Record<string, unknown>,
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setShowSaveSheet(false);
        setActiveTab('quotes');
      }, 900);
    } catch {
      // keep sheet open on error — user can retry
    } finally {
      setSaveLoading(false);
    }
  }

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-3">

      {/* SegmentedControl — tabs */}
      <SegmentedControl
        options={TAB_OPTS}
        value={activeTab}
        onChange={v => setActiveTab(v as typeof activeTab)}
        size="sm"
      />

      {activeTab === 'quotes' && <CotizacionesTab />}

      {activeTab === 'calc' && <>

      {/* ══════════════════════════════════════════════════════════
          DARK RESULT CARD — mobile only
          ══════════════════════════════════════════════════════════ */}
      <div className="lg:hidden bg-[#111111] dark:bg-[#1C1C1E] rounded-3xl overflow-hidden shadow-xl">

        {/* Header strip */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Plane size={15} className="text-white" />
            </div>
            <div>
              <p className="text-white font-black text-sm leading-none">Importaciones</p>
              <p className="text-white/40 text-[10px] font-medium mt-0.5">
                {amazonProduct ? (
                  <span className="line-clamp-1">{amazonProduct.name}</span>
                ) : 'Courier GT'}
              </p>
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
              onClick={handleReset}
              className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/15 transition-colors"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        <div className="h-px bg-white/8 mx-4" />

        {/* Output — tap for full breakdown */}
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
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-white/50 text-[10px] font-bold tabular-nums">
                costo {fmtGTQ(result.totalLandedCostGTQ)}
              </span>
              <span className="text-white/25 text-[10px]">·</span>
              <p className={`text-sm font-black tabular-nums ${result.isViable ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtGTQ(result.netProfitGTQ)}
              </p>
              <span className="text-white/40 text-[10px] font-bold">utilidad</span>
              <span className="text-white/25 text-[10px]">·</span>
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

      {/* ══════════════════════════════════════════════════════════
          DESKTOP HEADER
          ══════════════════════════════════════════════════════════ */}
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
            onClick={handleReset}
            className="h-10 px-4 rounded-xl flex items-center gap-2 text-xs font-bold bg-nodo-card text-nodo-sub border border-nodo-line hover:bg-nodo-danger-bg hover:text-nodo-danger-tx hover:border-nodo-danger-bd transition-colors"
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          LAYOUT PRINCIPAL
          ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 lg:gap-5 items-start">

        {/* ── FORMULARIO ── */}
        <div className="lg:col-span-3 flex flex-col gap-3">

          {/* ════ MOBILE: iOS Grouped Form ════ */}
          <div className="lg:hidden bg-nodo-card rounded-3xl border border-nodo-line shadow-sm overflow-hidden">

            {/* ── Amazon search row ── */}
            {amazonProduct ? (
              /* Product found state — shows inline chip */
              <div className={`flex items-center gap-3 px-4 h-[56px] border-b border-nodo-line ${amazonNeedsPrice ? 'bg-nodo-warn-bg' : 'bg-nodo-success-bg/50'}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${amazonNeedsPrice ? 'bg-nodo-warn-tx' : 'bg-nodo-success-tx'}`}>
                  {amazonNeedsPrice
                    ? <X size={11} className="text-white" />
                    : <span className="text-white text-[10px] font-black">✓</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${amazonNeedsPrice ? 'text-nodo-warn-tx' : 'text-nodo-success-tx'}`}>
                    {amazonNeedsPrice ? 'Precio no encontrado — ingrésalo abajo' : `${fmtUSD(inputs.unitCostUSD)} · ASIN ${amazonProduct.asin}`}
                  </p>
                  <p className="text-[13px] font-semibold text-nodo-ink leading-tight line-clamp-1">
                    {amazonProduct.name}
                  </p>
                </div>
                <button onClick={clearAmazon} className="text-nodo-dim hover:text-nodo-ink transition-colors shrink-0">
                  <X size={15} />
                </button>
              </div>
            ) : (
              /* URL input state */
              <div className={`flex items-center gap-2 px-3 h-[56px] border-b border-nodo-line transition-colors duration-200 ${amazonLoading ? 'bg-nodo-inset' : ''}`}>
                <div className="w-8 h-8 flex items-center justify-center shrink-0">
                  {amazonLoading
                    ? <Loader2 size={16} className="text-nodo-sub animate-spin" />
                    : <Search size={16} className="text-nodo-dim" />
                  }
                </div>
                <input
                  type="text"
                  value={amazonUrl}
                  onChange={e => handleUrlChange(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !amazonLoading && handleAmazonSearch()}
                  placeholder={amazonLoading ? 'Obteniendo precio...' : 'URL o ASIN de Amazon...'}
                  disabled={amazonLoading}
                  className="flex-1 h-full bg-transparent text-[15px] font-semibold text-nodo-ink outline-none placeholder:text-nodo-dim disabled:opacity-60 disabled:cursor-wait"
                />
                {amazonUrl.trim() && !amazonLoading && (
                  <button
                    onClick={handleAmazonSearch}
                    className="w-8 h-8 rounded-full bg-nodo-ink flex items-center justify-center shrink-0 active:scale-90 transition-transform"
                  >
                    <ArrowRight size={14} className="text-nodo-canvas" />
                  </button>
                )}
                {amazonUrl.trim() && !amazonLoading && (
                  <button onClick={() => handleUrlChange('')} className="text-nodo-dim shrink-0">
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

            {/* Error banner inline */}
            {amazonError && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-nodo-danger-bg border-b border-nodo-danger-bd">
                <span className="text-xs font-bold text-nodo-danger-tx flex-1">{amazonError}</span>
                <button onClick={() => setAmazonError(null)} className="text-nodo-danger-tx shrink-0">
                  <X size={13} />
                </button>
              </div>
            )}

            {/* ── Precio ── */}
            <FormRow label="Precio en USA">
              <div className="flex items-center gap-1 justify-end">
                <span className="text-[15px] font-semibold text-nodo-dim">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  value={Number.isFinite(inputs.unitCostUSD) ? inputs.unitCostUSD : 0}
                  onChange={e => updateInput('unitCostUSD', parseFloat(e.target.value) || 0)}
                  onFocus={e => e.target.select()}
                  className="w-28 text-right text-[17px] font-black text-nodo-ink bg-transparent outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </FormRow>

            {/* ── Categoría ── */}
            <FormRow label="Tipo" tall>
              <div className="flex gap-1 p-1 bg-nodo-inset border border-nodo-line rounded-xl">
                {(Object.keys(CATEGORY_DAI_RATE) as ItemCategory[]).map(cat => {
                  const active = inputs.itemCategory === cat;
                  const rate   = CATEGORY_DAI_RATE[cat];
                  return (
                    <button
                      key={cat} type="button"
                      onClick={() => updateInput('itemCategory', cat)}
                      className={[
                        'h-9 px-2.5 rounded-lg text-[10px] font-bold leading-tight transition-all flex flex-col items-center justify-center gap-0.5',
                        active ? 'bg-nodo-ink text-nodo-canvas shadow-sm' : 'text-nodo-sub',
                      ].join(' ')}
                    >
                      <span>{cat === 'ropa' ? 'Ropa' : cat === 'repuestos' ? 'Repuestos' : 'Electrón.'}</span>
                      <span className={`text-[8px] font-black ${active ? 'opacity-60' : rate === 0 ? 'text-nodo-success-tx' : 'text-nodo-dim'}`}>
                        {(rate * 100).toFixed(0)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </FormRow>

            <SectionDivider label="Logística" />

            {/* ── Peso ── */}
            <FormRow label="Peso del lote">
              <InlineStepper
                value={inputs.totalWeightLbs}
                onChange={v => updateInput('totalWeightLbs', v)}
                step={0.1} min={0.1} decimals={1} suffix="lbs"
              />
            </FormRow>

            {/* ── Cantidad ── */}
            <FormRow label="Cantidad" last>
              <InlineStepper
                value={inputs.qty}
                onChange={v => updateInput('qty', v)}
                step={1} min={1} suffix="u"
              />
            </FormRow>

            <SectionDivider label="Venta" />

            {/* ── Modo (margen vs fijo) ── */}
            <div className="px-4 pb-3">
              <div className="flex p-1 bg-nodo-inset border border-nodo-line rounded-xl gap-1">
                {(['margin', 'fixed'] as const).map(m => (
                  <button
                    key={m} type="button"
                    onClick={() => updateInput('mode', m)}
                    className={[
                      'flex-1 h-8 rounded-lg text-[11px] font-bold transition-all',
                      inputs.mode === m ? 'bg-nodo-ink text-nodo-canvas shadow-sm' : 'text-nodo-sub',
                    ].join(' ')}
                  >
                    {m === 'margin' ? 'Por Margen %' : 'Precio Fijo Q'}
                  </button>
                ))}
              </div>
            </div>

            {inputs.mode === 'margin' ? (
              /* Margin row + inline slider */
              <>
                <FormRow label="Margen">
                  <div className="flex items-center gap-2">
                    <span className="text-[17px] font-black text-nodo-ink tabular-nums w-12 text-right">
                      {inputs.targetMargin.toFixed(0)}%
                    </span>
                  </div>
                </FormRow>
                <div className="px-4 pb-4 -mt-1">
                  <input
                    type="range" min="0" max="80" step="0.5"
                    value={inputs.targetMargin}
                    onChange={e => updateInput('targetMargin', parseFloat(e.target.value))}
                    className="w-full accent-current h-1.5 cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-nodo-dim font-bold mt-1">
                    {['0%', '20%', '40%', '60%', '80%'].map(l => <span key={l}>{l}</span>)}
                  </div>
                </div>
              </>
            ) : (
              <FormRow label="Precio de venta" last>
                <div className="flex items-center gap-1 justify-end">
                  <span className="text-[15px] font-semibold text-nodo-dim">Q</span>
                  <input
                    type="number" inputMode="decimal" min={0} step={0.01}
                    value={Number.isFinite(inputs.fixedSalePrice) ? inputs.fixedSalePrice : 0}
                    onChange={e => updateInput('fixedSalePrice', parseFloat(e.target.value) || 0)}
                    onFocus={e => e.target.select()}
                    className="w-28 text-right text-[17px] font-black text-nodo-ink bg-transparent outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </FormRow>
            )}

            <SectionDivider label="Factura al courier" />

            {/* ── Factura toggle row ── */}
            <FormRow
              label="Declarar valor menor"
              sub={hasSavings ? `Ahorro fiscal ${fmtGTQ(result.taxSavingsGTQ)}` : undefined}
              last={!inputs.useDeclaredValue}
              tall={!!hasSavings}
            >
              <IOSSwitch
                on={inputs.useDeclaredValue}
                onChange={v => {
                  updateInput('useDeclaredValue', v);
                  if (v && inputs.declaredCostUSD === 0) updateInput('declaredCostUSD', inputs.unitCostUSD);
                }}
              />
            </FormRow>

            {inputs.useDeclaredValue && (
              <>
                <FormRow label="Valor real (ref.)">
                  <div className="flex items-center gap-1 justify-end opacity-50">
                    <span className="text-[15px] font-semibold text-nodo-dim">$</span>
                    <span className="text-[17px] font-black text-nodo-ink tabular-nums">
                      {inputs.unitCostUSD.toFixed(2)}
                    </span>
                  </div>
                </FormRow>
                <FormRow label="Valor declarado" last>
                  <div className="flex items-center gap-1 justify-end">
                    <span className="text-[15px] font-semibold text-nodo-dim">$</span>
                    <input
                      type="number" inputMode="decimal" min={0} step={0.01}
                      value={Number.isFinite(inputs.declaredCostUSD) ? inputs.declaredCostUSD : 0}
                      onChange={e => updateInput('declaredCostUSD', parseFloat(e.target.value) || 0)}
                      onFocus={e => e.target.select()}
                      className="w-28 text-right text-[17px] font-black text-nodo-ink bg-transparent outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </FormRow>
                {declaredIsHigh && (
                  <div className="px-4 py-2.5 bg-nodo-danger-bg border-t border-nodo-danger-bd">
                    <p className="text-[11px] font-bold text-nodo-danger-tx">El declarado no puede ser mayor al real.</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ════ DESKTOP: tres secciones ════ */}
          <div className="hidden lg:flex flex-col gap-4">

            {/* Amazon search bar (desktop) */}
            <div className={`bg-nodo-card rounded-3xl border border-nodo-line shadow-sm p-4 transition-colors duration-300 ${amazonLoading ? 'bg-nodo-inset' : ''}`}>
              <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-3">Buscar en Amazon</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  {amazonLoading
                    ? <Loader2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-nodo-sub animate-spin pointer-events-none" />
                    : <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-nodo-dim pointer-events-none" />
                  }
                  <input
                    type="text"
                    value={amazonUrl}
                    onChange={e => handleUrlChange(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !amazonLoading && handleAmazonSearch()}
                    placeholder={amazonLoading ? 'Obteniendo precio...' : 'Pega la URL o ASIN de Amazon...'}
                    disabled={amazonLoading}
                    className="w-full h-11 pl-9 pr-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim disabled:opacity-60 disabled:cursor-wait"
                  />
                </div>
                <button
                  onClick={handleAmazonSearch}
                  disabled={amazonLoading || !amazonUrl.trim()}
                  className="h-11 px-4 rounded-2xl bg-nodo-ink text-nodo-canvas font-bold text-sm flex items-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-30"
                >
                  {amazonLoading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                  {amazonLoading ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
              {amazonError && (
                <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-nodo-danger-bg border border-nodo-danger-bd rounded-xl">
                  <span className="text-xs font-bold text-nodo-danger-tx flex-1">{amazonError}</span>
                  <button onClick={() => setAmazonError(null)} className="text-nodo-danger-tx shrink-0"><X size={13} /></button>
                </div>
              )}
              {amazonProduct && (
                <div className={`flex items-start gap-3 mt-2 px-3 py-2.5 rounded-xl border ${amazonNeedsPrice ? 'bg-nodo-warn-bg border-nodo-warn-bd' : 'bg-nodo-success-bg border-nodo-success-bd'}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${amazonNeedsPrice ? 'text-nodo-warn-tx' : 'text-nodo-success-tx'}`}>
                      {amazonNeedsPrice ? 'Precio no encontrado — ingrésalo manual · ' : `${fmtUSD(inputs.unitCostUSD)} cargado · `}
                      ASIN {amazonProduct.asin}
                    </p>
                    <p className="text-xs font-semibold text-nodo-ink leading-snug line-clamp-1">{amazonProduct.name}</p>
                  </div>
                  <button onClick={clearAmazon} className="text-nodo-dim hover:text-nodo-ink transition-colors shrink-0 mt-0.5"><X size={14} /></button>
                </div>
              )}
            </div>

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

        {/* ── ASIDE desktop ── */}
        <aside className="hidden lg:block lg:col-span-2 lg:sticky lg:top-6">
          <ReceiptFull
            result={result} config={config} inputs={inputs}
            showBreakdown={showBreakdown}
            onToggleBreakdown={() => setShowBreakdown(s => !s)}
          />
        </aside>
      </div>

      {/* ── Botón guardar cotización ── */}
      <button
        onClick={openSaveSheet}
        className="w-full h-[60px] rounded-3xl bg-nodo-ink text-nodo-canvas font-black text-base tracking-wide active:scale-[0.97] transition-transform flex items-center justify-center gap-3 shadow-lg"
      >
        <BookmarkPlus size={20} />
        GUARDAR COTIZACIÓN
      </button>

      {/* ── BottomSheets ── */}
      <BottomSheet open={showReceipt} onClose={() => setShowReceipt(false)} title="Desglose de Costos">
        <ReceiptSheet
          result={result} config={config} inputs={inputs}
          showBreakdown={showBreakdown}
          onToggleBreakdown={() => setShowBreakdown(s => !s)}
        />
      </BottomSheet>

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

      <BottomSheet
        open={showSaveSheet}
        onClose={() => setShowSaveSheet(false)}
        title="Guardar Cotización"
        footer={
          <button
            onClick={handleSaveCotizacion}
            disabled={!saveName.trim() || saveLoading || saveSuccess}
            className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {saveLoading
              ? <Loader2 size={18} className="animate-spin" />
              : saveSuccess
              ? <Check size={18} />
              : <BookmarkPlus size={18} />
            }
            {saveSuccess ? 'GUARDADO' : 'CONFIRMAR'}
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
                <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-0.5">Landed</p>
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
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
              Nombre del producto
            </label>
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Ej. Audífonos Sony WH-1000XM5"
              autoFocus
              className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim"
            />
          </div>
        </div>
      </BottomSheet>

      </> /* end activeTab === 'calc' */}

    </div>
  );
}
