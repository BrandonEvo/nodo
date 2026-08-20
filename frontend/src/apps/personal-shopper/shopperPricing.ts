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
/**
 * Cómo se capturó el costo, para que el reporte sepa qué tan completo es:
 *  maleta | caja — precio en USA + tax + su parte del flete del viaje.
 *  usa            — precio en USA + tax, sin prorrateo de flete (ya viajó, se compró suelto).
 *  directo        — un hecho en quetzales (compra local), sin derivación.
 */
export type CalcMode = FreightMode | 'usa' | 'directo';
export type ProfitMode = 'markup' | 'fixed';
export type DimUnit = 'in' | 'cm';
/** Moneda en la que el dueño escribe el costo del producto. */
export type CostCurrency = 'usd' | 'gtq';

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
  /** Tax de ESTA compra. El impuesto es del estado donde compró, no del tenant:
   *  New Hampshire cobra 0 y California 9.5. Sin override cae al ajuste del dueño. */
  taxPct?: number;
  profitMode: ProfitMode;
  markupPct: number;
  fixedSaleGtq: number;
}

export interface CalcResult {
  mode: FreightMode;
  taxRate: number;            // % efectivamente aplicado
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
  const raw = calcShipping(cfg, inputs);
  const { costPerLb, costPerVol, itemVolume, itemVolumeIn3 } = raw;

  // Cada componente en dólares es plata que se paga en dólares, así que se redondea
  // a centavo ANTES de sumar, y el total en quetzales sale de los componentes ya
  // redondeados. Al revés (redondear sólo al final) el snapshot guardado no cuadra
  // con su propio desglose y el ítem queda inauditable por un centavo.
  const taxRate = Math.max(0, inputs.taxPct ?? cfg.taxRate ?? 0);
  const shippingUsd = round(raw.shippingUsd, 2);
  const taxUsd = round(price * (taxRate / 100), 2);
  const totalCostUsd = round(price + taxUsd + shippingUsd, 2);
  const totalCostGtq = round(totalCostUsd * Math.max(0, cfg.exchangeRate || 0), 2);

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
    taxRate,
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
  calc_mode: CalcMode;
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

/**
 * @param withFreight  false cuando el costo es sólo producto + tax: el ítem no
 *   consumió capacidad de este viaje (se compró suelto y ya está acá). Guardar
 *   igual un `cost_per_lb` con 0 libras dejaría un desglose que insinúa un flete
 *   que nunca se prorrateó.
 */
export function toSnapshot(cfg: CalcConfig, r: CalcResult, withFreight = true): CalcSnapshotPayload {
  const inCaja = cfg.freightMode === 'caja';
  const costPerIn3 = inCaja
    ? (cfg.dimUnit === 'cm' ? r.costPerVol * CM3_PER_IN3 : r.costPerVol)
    : null;
  if (!withFreight) {
    return {
      calc_mode: 'usa',
      weight_lbs: null, volume_in3: null, cost_per_lb: null, cost_per_in3: null,
      tax_rate: r.taxRate,
      exchange_rate: cfg.exchangeRate,
      shipping_usd: 0,
      tax_usd: round(r.taxUsd, 2),
      total_cost_gtq: round(r.totalCostGtq, 2),
    };
  }
  return {
    calc_mode: cfg.freightMode,
    weight_lbs: inCaja ? null : r.itemWeightLbs,
    volume_in3: inCaja ? round(r.itemVolumeIn3, 2) : null,
    cost_per_lb: inCaja ? null : round(r.costPerLb, 4),
    cost_per_in3: costPerIn3 != null ? round(costPerIn3, 6) : null,
    tax_rate: r.taxRate,
    exchange_rate: cfg.exchangeRate,
    shipping_usd: round(r.shippingUsd, 2),
    tax_usd: round(r.taxUsd, 2),
    total_cost_gtq: round(r.totalCostGtq, 2),
  };
}

/**
 * Costo capturado como hecho en quetzales (compra local, o algo que ya se pagó acá).
 * No es "sin datos": es un costo sin derivación, y guardarlo con `calc_mode: 'directo'`
 * lo distingue del ítem al que simplemente nunca le pusieron costo — y de los que se
 * cargaron cuando el campo pedía quetzales y el dueño escribía dólares.
 */
export function directSnapshot(cfg: CalcConfig, costGtq: number): CalcSnapshotPayload {
  return {
    calc_mode: 'directo',
    weight_lbs: null,
    volume_in3: null,
    cost_per_lb: null,
    cost_per_in3: null,
    tax_rate: 0,
    exchange_rate: cfg.exchangeRate,
    shipping_usd: 0,
    tax_usd: 0,
    total_cost_gtq: round(Math.max(0, costGtq), 2),
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

export const round2 = (n: number) => round(n, 2);

export const fmtGTQ = (n: number) =>
  'Q' + (isFinite(n) ? n : 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtUSD = (n: number) =>
  '$' + (isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtPct = (n: number) => `${(isFinite(n) ? n : 0).toFixed(1)}%`;
