import { useState, useMemo } from 'react';
import {
  Calculator, Package, TrendingUp, Save, ChevronDown, RefreshCw,
  CheckCircle2, Tag, DollarSign, Settings2,
} from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CalcResult {
  product_price_usd: number;
  tax_usd: number;
  shipping_usd: number;
  total_cost_usd: number;
  total_cost_gtq: number;
  sale_price_gtq: number;
  profit_gtq: number;
  margin_pct: number;
  exchange_rate: number;
  tax_rate: number;
  weight_lbs: number;
  cost_per_lb: number;
  profit_mode: 'markup' | 'free';
  markup_pct: number;
}

interface Props {
  onSaveQuote?: (result: CalcResult) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtQ   = (n: number) => 'Q' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUSD = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num    = (v: string) => parseFloat(v.replace(',', '.')) || 0;

const DEFAULT_CONFIG = {
  suitcase_cost: '80',
  suitcase_lbs:  '50',
  exchange_rate: '7.75',
  tax_rate:      '7',
};

// ─── Componente ──────────────────────────────────────────────────────────────

export function ShopperCalculator({ onSaveQuote }: Props) {
  const [showConfig, setShowConfig]   = useState(false);
  const [cfg, setCfg]                 = useState(DEFAULT_CONFIG);

  const [priceDolars, setPriceDolars] = useState('');
  const [weightLbs, setWeightLbs]     = useState('1');

  const [profitMode, setProfitMode]   = useState<'markup' | 'free'>('markup');
  const [markupPct, setMarkupPct]     = useState('30');
  const [salePriceGtq, setSalePriceGtq] = useState('');

  const [saved, setSaved]             = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // ── Cálculo ─────────────────────────────────────────────────────────────────
  const result = useMemo<CalcResult | null>(() => {
    const price  = num(priceDolars);
    const weight = num(weightLbs);
    if (price <= 0) return null;

    const taxRate   = num(cfg.tax_rate) / 100;
    const exRate    = num(cfg.exchange_rate);
    const costPerLb = num(cfg.suitcase_cost) / (num(cfg.suitcase_lbs) || 1);

    const taxUsd       = price * taxRate;
    const shippingUsd  = costPerLb * (weight > 0 ? weight : 0);
    const totalCostUsd = price + taxUsd + shippingUsd;
    const totalCostGtq = totalCostUsd * exRate;

    const saleGtq = profitMode === 'markup'
      ? totalCostGtq * (1 + num(markupPct) / 100)
      : num(salePriceGtq);

    const profitGtq = saleGtq - totalCostGtq;
    const marginPct = saleGtq > 0 ? (profitGtq / saleGtq) * 100 : 0;

    return {
      product_price_usd: price,
      tax_usd:           taxUsd,
      shipping_usd:      shippingUsd,
      total_cost_usd:    totalCostUsd,
      total_cost_gtq:    totalCostGtq,
      sale_price_gtq:    saleGtq,
      profit_gtq:        profitGtq,
      margin_pct:        marginPct,
      exchange_rate:     exRate,
      tax_rate:          num(cfg.tax_rate),
      weight_lbs:        weight,
      cost_per_lb:       costPerLb,
      profit_mode:       profitMode,
      markup_pct:        num(markupPct),
    };
  }, [priceDolars, weightLbs, cfg, profitMode, markupPct, salePriceGtq]);

  const handleSave = () => {
    if (!result || !onSaveQuote) return;
    onSaveQuote(result);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => {
    setPriceDolars('');
    setWeightLbs('1');
    setMarkupPct('30');
    setSalePriceGtq('');
    setSaved(false);
  };

  // ── Estilo de barra de margen ───────────────────────────────────────────────
  const MARGIN_THEMES = {
    emerald: {
      bg: 'bg-emerald-50 dark:bg-emerald-500/15',
      text: 'text-emerald-700 dark:text-emerald-400',
      textLight: 'text-emerald-600 dark:text-emerald-500',
      gradient: 'from-emerald-400 to-emerald-500',
    },
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-500/15',
      text: 'text-amber-700 dark:text-amber-400',
      textLight: 'text-amber-600 dark:text-amber-500',
      gradient: 'from-amber-400 to-amber-500',
    },
    rose: {
      bg: 'bg-rose-50 dark:bg-rose-500/15',
      text: 'text-rose-700 dark:text-rose-400',
      textLight: 'text-rose-600 dark:text-rose-500',
      gradient: 'from-rose-400 to-rose-500',
    },
  } as const;

  const marginTheme =
    !result ? null :
    result.margin_pct >= 25 ? { ...MARGIN_THEMES.emerald, label: 'Margen excelente' } :
    result.margin_pct >= 15 ? { ...MARGIN_THEMES.emerald, label: 'Margen saludable' } :
    result.margin_pct >= 8  ? { ...MARGIN_THEMES.amber,   label: 'Margen ajustado' } :
    result.margin_pct >= 0  ? { ...MARGIN_THEMES.rose,    label: 'Margen muy bajo' } :
                              { ...MARGIN_THEMES.rose,    label: 'Sin ganancia' };

  const perLb = num(cfg.suitcase_cost) / (num(cfg.suitcase_lbs) || 1);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
    <div className="w-full pb-4">

      {/* ─────────── Config de viaje → botón engranaje compacto ─────────── */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowConfig(true)}
          className="inline-flex items-center gap-2 pl-3 pr-3.5 py-2 rounded-full
                     bg-nodo-inset hover:bg-nodo-raised active:scale-[0.97]
                     transition-all text-nodo-sub"
        >
          <Settings2 className="w-4 h-4 text-nodo-dim" />
          <span className="text-xs font-semibold tabular-nums">
            ${perLb.toFixed(2)}/lb · Q{cfg.exchange_rate} · {cfg.tax_rate}%
          </span>
        </button>
      </div>

      {/* ─────────── Layout: inputs (izq) · resultado hero (der) ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-5 items-start">

      {/* ═══ IZQUIERDA: inputs ═══ */}
      <div className="flex flex-col gap-5">

      {/* ─────────── PRODUCTO ─────────── */}
      <div className="nodo-card p-5 lg:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-100 to-rose-200
                          dark:from-pink-500/20 dark:to-rose-500/20
                          flex items-center justify-center">
            <Tag className="w-4 h-4 text-pink-600 dark:text-pink-400" />
          </div>
          <h3 className="text-base font-bold text-nodo-ink tracking-tight">Producto</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <CalcInput
            label="Precio USA"
            required
            value={priceDolars}
            onChange={setPriceDolars}
            prefix="$"
            type="number"
            placeholder="0.00"
          />
          <CalcInput
            label="Peso"
            value={weightLbs}
            onChange={setWeightLbs}
            suffix="lbs"
            type="number"
            placeholder="1.0"
          />
        </div>
      </div>

      {/* ─────────── GANANCIA (modo + input) ─────────── */}
      <div className="nodo-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-200
                          dark:from-emerald-500/20 dark:to-teal-500/20
                          flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-base font-bold text-nodo-ink tracking-tight">Ganancia</h3>
        </div>

        {/* iOS segmented control */}
        <div className="bg-nodo-inset rounded-2xl p-1 flex gap-1">
          {([
            { key: 'markup', label: 'Markup %', icon: TrendingUp },
            { key: 'free',   label: 'Precio libre', icon: DollarSign },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setProfitMode(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                          text-sm font-semibold transition-all active:scale-[0.98]
                          ${profitMode === key
                            ? 'bg-nodo-raised text-nodo-ink shadow-sm'
                            : 'text-nodo-sub'}`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {profitMode === 'markup' ? (
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <label className="text-xs font-semibold text-nodo-sub uppercase tracking-wide px-1">
                Porcentaje de ganancia
              </label>
              <span className="text-2xl font-black text-nodo-ink tabular-nums leading-none">
                {Math.round(num(markupPct))}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(num(markupPct))}
              onChange={e => setMarkupPct(e.target.value)}
              className="nodo-range"
              style={{
                background: `linear-gradient(to right, var(--nodo-iris-mid) ${Math.min(num(markupPct), 100)}%, var(--nodo-inset) ${Math.min(num(markupPct), 100)}%)`,
              }}
            />
            <div className="flex justify-between text-[10px] font-semibold text-nodo-dim mt-1.5 px-0.5">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>
        ) : (
          <CalcInput
            label="Precio de venta al cliente"
            value={salePriceGtq}
            onChange={setSalePriceGtq}
            prefix="Q"
            type="number"
            placeholder="0.00"
          />
        )}
      </div>

      </div>{/* ═══ /IZQUIERDA ═══ */}

      {/* ═══ DERECHA: resultado hero (sticky) ═══ */}
      <div className="lg:sticky lg:top-4">
      {result && result.total_cost_gtq > 0 ? (
        <div className="rounded-3xl p-5 lg:p-6 space-y-4 lg:min-h-[480px] flex flex-col"
          style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)', boxShadow: 'var(--nodo-shadow-fab)' }}>

          {/* Header con total */}
          <div>
            <p className="text-xs font-semibold opacity-70 uppercase tracking-wider">
              Costo total
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-3xl font-black tracking-tight tabular-nums">{fmtQ(result.total_cost_gtq)}</p>
              <p className="text-sm opacity-70">{fmtUSD(result.total_cost_usd)}</p>
            </div>
            <button
              onClick={() => setShowBreakdown(v => !v)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold
                         opacity-80 hover:opacity-100 active:scale-[0.97] transition-all"
            >
              {showBreakdown ? 'Ocultar' : 'Ver'} desglose
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showBreakdown ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Desglose (colapsable) */}
          {showBreakdown && (
            <div className="bg-white/10 backdrop-blur rounded-2xl p-3 space-y-2 text-sm">
              <Row label="Precio producto" value={fmtUSD(result.product_price_usd)} />
              <Row label={`Tax (${result.tax_rate}%)`} value={fmtUSD(result.tax_usd)} />
              {result.shipping_usd > 0 && (
                <Row label={`Envío (${result.weight_lbs} lbs)`} value={fmtUSD(result.shipping_usd)} />
              )}
              <div className="border-t border-white/20 pt-2 mt-2">
                <Row label={`× Q${result.exchange_rate}`} value={fmtQ(result.total_cost_gtq)} bold />
              </div>
            </div>
          )}

          {/* Venta + ganancia — panel blanco en light, dark card en dark */}
          {result.sale_price_gtq > 0 && marginTheme && (
            <div className="bg-nodo-card rounded-2xl p-4 space-y-3 text-nodo-ink">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-nodo-sub">Precio de venta</span>
                <span className="text-2xl font-bold tracking-tight">
                  {fmtQ(result.sale_price_gtq)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className={`rounded-xl p-3 ${marginTheme.bg}`}>
                  <p className="text-xs text-nodo-sub">Ganancia</p>
                  <p className={`text-lg font-bold leading-tight ${marginTheme.text}`}>
                    {fmtQ(result.profit_gtq)}
                  </p>
                </div>
                <div className={`rounded-xl p-3 ${marginTheme.bg}`}>
                  <p className="text-xs text-nodo-sub">Margen</p>
                  <p className={`text-lg font-bold leading-tight ${marginTheme.text}`}>
                    {result.margin_pct.toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Barra de margen */}
              <div>
                <div className="h-2 bg-nodo-inset rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r transition-all ${marginTheme.gradient}`}
                    style={{ width: `${Math.min(Math.max(result.margin_pct, 0), 100)}%` }}
                  />
                </div>
                <p className={`text-xs font-medium mt-1.5 ${marginTheme.textLight}`}>
                  {marginTheme.label}
                </p>
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-2 pt-1 lg:mt-auto">
            <button
              onClick={handleReset}
              className="px-4 py-3 rounded-2xl bg-white/15 backdrop-blur font-semibold
                         active:scale-[0.97] active:bg-white/25 transition-all
                         flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Limpiar</span>
            </button>
            {onSaveQuote && (
              <button
                onClick={handleSave}
                disabled={!result.sale_price_gtq || saved}
                className={`flex-1 px-4 py-3 rounded-2xl font-semibold transition-all
                            active:scale-[0.98] disabled:opacity-50
                            flex items-center justify-center gap-2
                            ${saved
                              ? 'bg-emerald-500 text-white'
                              : 'bg-nodo-card text-nodo-ink hover:bg-nodo-inset'}`}
              >
                {saved ? (
                  <><CheckCircle2 className="w-5 h-5" /> ¡Guardada!</>
                ) : (
                  <><Save className="w-5 h-5" /> Guardar cotización</>
                )}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="nodo-card p-10 text-center lg:min-h-[480px]
                        flex flex-col items-center justify-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-3xl
                          bg-gradient-to-br from-pink-50 to-rose-100
                          dark:from-pink-500/20 dark:to-rose-500/20
                          flex items-center justify-center">
            <Calculator className="w-9 h-9 text-pink-400" />
          </div>
          <p className="text-base text-nodo-ink font-bold">
            Ingresa el precio del producto
          </p>
          <p className="text-sm text-nodo-dim mt-1 max-w-[220px]">
            Verás el costo, el precio de venta y tu ganancia en tiempo real
          </p>
        </div>
      )}
      </div>
      </div>
    </div>

    {/* ─────────── Config de viaje (BottomSheet) ─────────── */}
    <BottomSheet
      open={showConfig}
      onClose={() => setShowConfig(false)}
      title="Configuración de viaje"
      footer={
        <button
          onClick={() => setShowConfig(false)}
          className="nodo-btn-primary"
        >
          <CheckCircle2 size={18} />
          LISTO
        </button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <ConfigInput
            label="Costo maleta"
            prefix="$"
            value={cfg.suitcase_cost}
            onChange={v => setCfg(c => ({ ...c, suitcase_cost: v }))}
          />
          <ConfigInput
            label="Capacidad"
            suffix="lbs"
            value={cfg.suitcase_lbs}
            onChange={v => setCfg(c => ({ ...c, suitcase_lbs: v }))}
          />
          <ConfigInput
            label="Tipo de cambio"
            prefix="Q"
            value={cfg.exchange_rate}
            onChange={v => setCfg(c => ({ ...c, exchange_rate: v }))}
          />
          <ConfigInput
            label="Tax USA"
            suffix="%"
            value={cfg.tax_rate}
            onChange={v => setCfg(c => ({ ...c, tax_rate: v }))}
          />
        </div>
        {num(cfg.suitcase_lbs) > 0 && (
          <div className="bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl px-4 py-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <p className="text-xs text-indigo-700 dark:text-indigo-400">
              Costo por libra:{' '}
              <strong>{fmtUSD(num(cfg.suitcase_cost) / num(cfg.suitcase_lbs))} / lb</strong>
            </p>
          </div>
        )}
      </div>
    </BottomSheet>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTES
// ═══════════════════════════════════════════════════════════════════════════════

function CalcInput({
  label, value, onChange, prefix, suffix, required, placeholder, type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  required?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-nodo-sub
                         mb-1.5 px-1 uppercase tracking-wide">
        {label} {required && <span className="text-pink-500">*</span>}
      </label>
      <div className="flex items-center bg-nodo-inset rounded-2xl overflow-hidden
                      focus-within:ring-2 focus-within:ring-pink-400 dark:focus-within:ring-pink-500/60
                      focus-within:bg-nodo-card transition-all">
        {prefix && (
          <span className="pl-4 pr-1 text-sm font-semibold text-nodo-dim">{prefix}</span>
        )}
        <input
          type={type}
          inputMode={type === 'number' ? 'decimal' : undefined}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-4 py-3 text-sm font-medium bg-transparent
                     text-nodo-ink
                     placeholder:text-nodo-dim
                     focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
        />
        {suffix && (
          <span className="pr-4 pl-1 text-sm font-semibold text-nodo-dim">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function ConfigInput({
  label, value, onChange, prefix, suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-nodo-sub mb-1 px-1">{label}</label>
      <div className="flex items-center bg-nodo-inset rounded-xl overflow-hidden
                      focus-within:ring-2 focus-within:ring-pink-400 dark:focus-within:ring-pink-500/60
                      focus-within:bg-nodo-card transition-all">
        {prefix && (
          <span className="pl-3 pr-0.5 text-xs font-semibold text-nodo-dim">{prefix}</span>
        )}
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 px-3 py-2 text-sm font-medium bg-transparent
                     text-nodo-ink
                     focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
        />
        {suffix && (
          <span className="pr-3 pl-0.5 text-xs font-semibold text-nodo-dim">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={`${bold ? 'font-semibold' : 'opacity-80'}`}>{label}</span>
      <span className={`${bold ? 'font-bold text-base' : 'font-semibold'}`}>{value}</span>
    </div>
  );
}
