/**
 * Motor de precios del Personal Shopper — "La Maleta".
 *
 * A diferencia de Importaciones (aduana formal: DAI/IVA/CIF), un viajero reparte
 * el costo de su maleta/caja entre lo que trae. Dos modos honestos y simétricos:
 *
 *  - Maleta: pagó $X por la maleta con capacidad de N libras → cada libra cuesta
 *    X/N. El flete de un ítem = costo/lb × su peso.
 *  - Caja:   pagó $X por una caja de L×A×H → cada unidad de volumen cuesta
 *    X/(L·A·H). El flete de un ítem = costo/vol × su propio volumen.
 *
 * El input mínimo del dueño por producto es el que pidió: precio antes de tax +
 * (peso | medidas). El resto sale de la config persistida del tenant.
 */

export type FreightMode = 'maleta' | 'caja';
export type ProfitMode = 'markup' | 'fixed';
export type DimUnit = 'in' | 'cm';

export interface CalcConfig {
  freightMode: FreightMode;
  exchangeRate: number;
  taxRate: number;            // %
  defaultMarkupPct: number;   // %
  // Maleta
  suitcaseCostUsd: number | null;
  suitcaseCapacityLbs: number | null;
  // Caja
  boxCostUsd: number | null;
  boxLengthIn: number | null;
  boxWidthIn: number | null;
  boxHeightIn: number | null;
  dimUnit: DimUnit;
}

export const DEFAULT_CALC_CONFIG: CalcConfig = {
  freightMode: 'maleta',
  exchangeRate: 7.75,
  taxRate: 7,
  defaultMarkupPct: 30,
  suitcaseCostUsd: 80,
  suitcaseCapacityLbs: 50,
  boxCostUsd: null,
  boxLengthIn: null,
  boxWidthIn: null,
  boxHeightIn: null,
  dimUnit: 'in',
};

export interface CalcInputs {
  priceUsd: number;
  weightLbs: number;                 // modo maleta
  dims: { l: number; w: number; h: number };  // modo caja (en config.dimUnit)
  profitMode: ProfitMode;
  markupPct: number;
  fixedSaleGtq: number;
}

export interface CalcResult {
  mode: FreightMode;
  costPerLb: number;
  costPerVol: number;         // por unidad de volumen (config.dimUnit)
  itemWeightLbs: number;
  itemVolume: number;         // en config.dimUnit³
  itemVolumeIn3: number;      // normalizado a pulgadas³ para el snapshot/gauge
  shippingUsd: number;
  taxUsd: number;
  totalCostUsd: number;
  totalCostGtq: number;
  saleGtq: number;
  profitGtq: number;
  marginPct: number;
}

const CM3_PER_IN3 = 16.387064;

/** El "consumo" de un producto en la unidad del gauge de la maleta:
 *  libras si el viaje es por maleta, pulgadas³ si es por caja. */
export function consumptionOf(mode: FreightMode, r: CalcResult): number {
  return mode === 'maleta' ? r.itemWeightLbs : r.itemVolumeIn3;
}

export function calcShipping(cfg: CalcConfig, inputs: CalcInputs): {
  shippingUsd: number; costPerLb: number; costPerVol: number;
  itemVolume: number; itemVolumeIn3: number;
} {
  if (cfg.freightMode === 'caja') {
    const boxVol =
      Math.max(0, cfg.boxLengthIn || 0) *
      Math.max(0, cfg.boxWidthIn || 0) *
      Math.max(0, cfg.boxHeightIn || 0);
    const costPerVol = boxVol > 0 ? Math.max(0, cfg.boxCostUsd || 0) / boxVol : 0;
    const itemVolume =
      Math.max(0, inputs.dims.l || 0) *
      Math.max(0, inputs.dims.w || 0) *
      Math.max(0, inputs.dims.h || 0);
    const itemVolumeIn3 = cfg.dimUnit === 'cm' ? itemVolume / CM3_PER_IN3 : itemVolume;
    return { shippingUsd: costPerVol * itemVolume, costPerLb: 0, costPerVol, itemVolume, itemVolumeIn3 };
  }
  // maleta
  const cap = Math.max(0, cfg.suitcaseCapacityLbs || 0);
  const costPerLb = cap > 0 ? Math.max(0, cfg.suitcaseCostUsd || 0) / cap : 0;
  const w = Math.max(0, inputs.weightLbs || 0);
  return { shippingUsd: costPerLb * w, costPerLb, costPerVol: 0, itemVolume: 0, itemVolumeIn3: 0 };
}

export function calculate(cfg: CalcConfig, inputs: CalcInputs): CalcResult {
  const price = Math.max(0, inputs.priceUsd || 0);
  const { shippingUsd, costPerLb, costPerVol, itemVolume, itemVolumeIn3 } = calcShipping(cfg, inputs);

  const taxUsd = price * (Math.max(0, cfg.taxRate || 0) / 100);
  const totalCostUsd = price + taxUsd + shippingUsd;
  const totalCostGtq = totalCostUsd * Math.max(0, cfg.exchangeRate || 0);

  let saleGtq: number;
  if (inputs.profitMode === 'markup') {
    saleGtq = totalCostGtq * (1 + Math.max(0, inputs.markupPct || 0) / 100);
  } else {
    saleGtq = Math.max(0, inputs.fixedSaleGtq || 0);
  }
  const profitGtq = saleGtq - totalCostGtq;
  const marginPct = saleGtq > 0 ? (profitGtq / saleGtq) * 100 : 0;

  return {
    mode: cfg.freightMode,
    costPerLb,
    costPerVol,
    itemWeightLbs: cfg.freightMode === 'maleta' ? Math.max(0, inputs.weightLbs || 0) : 0,
    itemVolume,
    itemVolumeIn3,
    shippingUsd,
    taxUsd,
    totalCostUsd,
    totalCostGtq,
    saleGtq,
    profitGtq,
    marginPct,
  };
}

/** Snapshot que se manda al backend al publicar (se congela en el ítem). */
export interface CalcSnapshotPayload {
  calc_mode: FreightMode;
  weight_lbs: number | null;
  volume_in3: number | null;
  cost_per_lb: number | null;
  cost_per_in3: number | null;
  tax_rate: number;
  exchange_rate: number;
  shipping_usd: number;
  tax_usd: number;
  total_cost_gtq: number;
}

export function toSnapshot(cfg: CalcConfig, r: CalcResult): CalcSnapshotPayload {
  const inCaja = cfg.freightMode === 'caja';
  const costPerIn3 = inCaja
    ? (cfg.dimUnit === 'cm' ? r.costPerVol * CM3_PER_IN3 : r.costPerVol)
    : null;
  return {
    calc_mode: cfg.freightMode,
    weight_lbs: inCaja ? null : r.itemWeightLbs,
    volume_in3: inCaja ? round(r.itemVolumeIn3, 2) : null,
    cost_per_lb: inCaja ? null : round(r.costPerLb, 4),
    cost_per_in3: costPerIn3 != null ? round(costPerIn3, 6) : null,
    tax_rate: cfg.taxRate,
    exchange_rate: cfg.exchangeRate,
    shipping_usd: round(r.shippingUsd, 2),
    tax_usd: round(r.taxUsd, 2),
    total_cost_gtq: round(r.totalCostGtq, 2),
  };
}

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round((isFinite(n) ? n : 0) * f) / f;
}

/**
 * Precios "psicológicos" sugeridos a partir del costo total (misma lógica que
 * Importaciones): terminación .99, múltiplo redondo y una opción premium.
 */
export function suggestPrices(minPrice: number): number[] {
  if (!isFinite(minPrice) || minPrice <= 0) return [];
  const step = minPrice < 100 ? 10 : minPrice < 500 ? 50 : 100;
  const roundUp = (p: number, s: number) => Math.ceil(p / s) * s;
  const opts = [
    roundUp(minPrice, step) - 0.01,
    roundUp(minPrice, step),
    roundUp(minPrice * 1.12, step),
  ];
  return [...new Set(opts)].filter(p => p >= minPrice).sort((a, b) => a - b).slice(0, 3);
}

export const fmtGTQ = (n: number) =>
  'Q' + (isFinite(n) ? n : 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtUSD = (n: number) =>
  '$' + (isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtPct = (n: number) => `${(isFinite(n) ? n : 0).toFixed(1)}%`;
