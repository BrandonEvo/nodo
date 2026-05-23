import { useState, useMemo } from 'react';
import {
  Calculator, Package, TrendingUp, Save, ChevronDown, RefreshCw,
  CheckCircle2, Plane, Tag, DollarSign,
} from 'lucide-react';

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
  onSaveQuote?: (result: CalcResult, productName: string) => void;
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

  const [productName, setProductName] = useState('');
  const [priceDolars, setPriceDolars] = useState('');
  const [weightLbs, setWeightLbs]     = useState('');

  const [profitMode, setProfitMode]   = useState<'markup' | 'free'>('markup');
  const [markupPct, setMarkupPct]     = useState('30');
  const [salePriceGtq, setSalePriceGtq] = useState('');

  const [saved, setSaved]             = useState(false);

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
    onSaveQuote(result, productName.trim() || 'Producto sin nombre');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => {
    setProductName('');
    setPriceDolars('');
    setWeightLbs('');
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

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-4">

      {/* ─────────── CONFIG MALETA (collapsible card) ─────────── */}
      <div className="bg-white dark:bg-[#1C1C1E] rounded-3xl shadow-sm dark:shadow-none overflow-hidden">
        <button
          onClick={() => setShowConfig(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4
                     active:bg-gray-50 dark:active:bg-[#2C2C2E] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-100 to-indigo-100
                            dark:from-sky-500/20 dark:to-indigo-500/20
                            flex items-center justify-center">
              <Plane className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Configuración de viaje</p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                ${num(cfg.suitcase_cost) / (num(cfg.suitcase_lbs) || 1)}/lb · TC Q{cfg.exchange_rate} · Tax {cfg.tax_rate}%
              </p>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-gray-400 dark:text-gray-600 transition-transform ${showConfig ? 'rotate-180' : ''}`}
          />
        </button>

        {showConfig && (
          <div className="px-5 pb-5 pt-2 border-t border-gray-100 dark:border-white/5 space-y-3">
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
              <div className="bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl px-4 py-2.5 flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <p className="text-xs text-indigo-700 dark:text-indigo-400">
                  Costo por libra:{' '}
                  <strong>{fmtUSD(num(cfg.suitcase_cost) / num(cfg.suitcase_lbs))} / lb</strong>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─────────── PRODUCTO (hero card) ─────────── */}
      <div className="bg-white dark:bg-[#1C1C1E] rounded-3xl shadow-sm dark:shadow-none p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-100 to-rose-200
                          dark:from-pink-500/20 dark:to-rose-500/20
                          flex items-center justify-center">
            <Tag className="w-4 h-4 text-pink-600 dark:text-pink-400" />
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">Producto</h3>
        </div>

        <CalcInput
          label="Nombre"
          value={productName}
          onChange={setProductName}
          placeholder="Ej. Air Jordan 1 Retro"
        />

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
            placeholder="0.0"
          />
        </div>
      </div>

      {/* ─────────── GANANCIA (modo + input) ─────────── */}
      <div className="bg-white dark:bg-[#1C1C1E] rounded-3xl shadow-sm dark:shadow-none p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-200
                          dark:from-emerald-500/20 dark:to-teal-500/20
                          flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">Ganancia</h3>
        </div>

        {/* iOS segmented control */}
        <div className="bg-gray-100 dark:bg-[#2C2C2E] rounded-2xl p-1 flex gap-1">
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
                            ? 'bg-white dark:bg-[#3A3A3C] text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-500'}`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {profitMode === 'markup' ? (
          <CalcInput
            label="Porcentaje de ganancia"
            value={markupPct}
            onChange={setMarkupPct}
            suffix="%"
            type="number"
          />
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

      {/* ─────────── RESULTADO ─────────── */}
      {result && result.total_cost_gtq > 0 ? (
        <div className="bg-gradient-to-br from-pink-500 to-rose-600 rounded-3xl p-5
                        shadow-xl shadow-pink-500/30 dark:shadow-pink-500/15 text-white space-y-4">

          {/* Header con total */}
          <div>
            <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">
              Costo total
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-3xl font-bold tracking-tight">{fmtQ(result.total_cost_gtq)}</p>
              <p className="text-sm text-white/70">{fmtUSD(result.total_cost_usd)}</p>
            </div>
          </div>

          {/* Desglose */}
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

          {/* Venta + ganancia — panel blanco en light, dark card en dark */}
          {result.sale_price_gtq > 0 && marginTheme && (
            <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl p-4 space-y-3 text-gray-900 dark:text-white">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Precio de venta</span>
                <span className="text-2xl font-bold tracking-tight">
                  {fmtQ(result.sale_price_gtq)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className={`rounded-xl p-3 ${marginTheme.bg}`}>
                  <p className="text-xs text-gray-500 dark:text-gray-500">Ganancia</p>
                  <p className={`text-lg font-bold leading-tight ${marginTheme.text}`}>
                    {fmtQ(result.profit_gtq)}
                  </p>
                </div>
                <div className={`rounded-xl p-3 ${marginTheme.bg}`}>
                  <p className="text-xs text-gray-500 dark:text-gray-500">Margen</p>
                  <p className={`text-lg font-bold leading-tight ${marginTheme.text}`}>
                    {result.margin_pct.toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Barra de margen */}
              <div>
                <div className="h-2 bg-gray-100 dark:bg-[#2C2C2E] rounded-full overflow-hidden">
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
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleReset}
              className="px-4 py-3 rounded-2xl bg-white/15 backdrop-blur text-white font-semibold
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
                              : 'bg-white dark:bg-[#1C1C1E] text-pink-600 dark:text-pink-400 hover:bg-gray-50 dark:hover:bg-[#2C2C2E]'}`}
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
        <div className="bg-white dark:bg-[#1C1C1E] rounded-3xl p-10 text-center">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl
                          bg-gradient-to-br from-pink-50 to-rose-100
                          dark:from-pink-500/20 dark:to-rose-500/20
                          flex items-center justify-center">
            <Calculator className="w-8 h-8 text-pink-400" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            Ingresa el precio del producto
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
            Verás el desglose y la ganancia en tiempo real
          </p>
        </div>
      )}
    </div>
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
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-500
                         mb-1.5 px-1 uppercase tracking-wide">
        {label} {required && <span className="text-pink-500">*</span>}
      </label>
      <div className="flex items-center bg-gray-100 dark:bg-[#2C2C2E] rounded-2xl overflow-hidden
                      focus-within:ring-2 focus-within:ring-pink-400 dark:focus-within:ring-pink-500/60
                      focus-within:bg-white dark:focus-within:bg-[#3A3A3C] transition-all">
        {prefix && (
          <span className="pl-4 pr-1 text-sm font-semibold text-gray-400 dark:text-gray-600">{prefix}</span>
        )}
        <input
          type={type}
          inputMode={type === 'number' ? 'decimal' : undefined}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-4 py-3 text-sm font-medium bg-transparent
                     text-gray-900 dark:text-white
                     placeholder:text-gray-400 dark:placeholder:text-gray-600
                     focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
        />
        {suffix && (
          <span className="pr-4 pl-1 text-sm font-semibold text-gray-400 dark:text-gray-600">{suffix}</span>
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
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-500 mb-1 px-1">{label}</label>
      <div className="flex items-center bg-gray-100 dark:bg-[#2C2C2E] rounded-xl overflow-hidden
                      focus-within:ring-2 focus-within:ring-pink-400 dark:focus-within:ring-pink-500/60
                      focus-within:bg-white dark:focus-within:bg-[#3A3A3C] transition-all">
        {prefix && (
          <span className="pl-3 pr-0.5 text-xs font-semibold text-gray-400 dark:text-gray-600">{prefix}</span>
        )}
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 px-3 py-2 text-sm font-medium bg-transparent
                     text-gray-900 dark:text-white
                     focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
        />
        {suffix && (
          <span className="pr-3 pl-0.5 text-xs font-semibold text-gray-400 dark:text-gray-600">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={`${bold ? 'font-semibold' : 'text-white/80'}`}>{label}</span>
      <span className={`${bold ? 'font-bold text-base' : 'font-semibold'}`}>{value}</span>
    </div>
  );
}
