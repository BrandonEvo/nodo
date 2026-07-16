export type ProfitMode = 'margin' | 'fixed';
export type ItemCategory = 'ropa' | 'repuestos' | 'electronicos';

export const CATEGORY_DAI_RATE: Record<ItemCategory, number> = {
  ropa: 0.15,
  repuestos: 0.10,
  electronicos: 0.00,
};

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  ropa: 'Ropa / Aseo Personal (15%)',
  repuestos: 'Repuestos (10%)',
  electronicos: 'Electrónicos (0%)',
};

export interface PricingConfig {
  exchangeRate: number;
  /** Tarifa de transporte ICC, IVA incluido (USD/lb). Fuente: factura real Q128.02/5lbs */
  iccPoundRate: number;
  /** Desaduanaje fijo, IVA incluido (USD). Fuente: factura real Q28.00 */
  iccCustomsFee: number;
  /** IVA SAT Guatemala */
  ivaRate: number;
  /** Tasa de seguro sobre valor declarado (IVA ICC incl.). Fuente: Q7.20/(57.65×7.85) */
  insuranceRate: number;
  /** Tarifa de flete para base CIF aduanal (USD/lb). Calibrada con calculadora ICC. */
  customsFreightRate: number;
}

export const DEFAULT_CONFIG: PricingConfig = {
  exchangeRate: 7.85,
  iccPoundRate: 3.262,         // Q128.02 / 5 lbs / 7.85 (factura real, IVA incl.)
  iccCustomsFee: 3.567,        // Q28.00 / 7.85 (factura real, IVA incl.)
  ivaRate: 0.12,
  insuranceRate: 0.01591,      // Q7.20 / (57.65 × 7.85) (factura real, IVA incl.)
  customsFreightRate: 0.82,    // Calibrada para CIF → coincide con estimación ICC
};

export interface PricingInputs {
  qty: number;
  /** Precio real pagado en USA, todo incluido (para calcular margen/utilidad) */
  unitCostUSD: number;
  /** Precio declarado en la factura presentada al courier (puede ser menor al real) */
  declaredCostUSD: number;
  /** Si está activo, usa declaredCostUSD para calcular aduana; unitCostUSD para el margen */
  useDeclaredValue: boolean;
  totalWeightLbs: number;
  itemCategory: ItemCategory;
  mode: ProfitMode;
  targetMargin: number;
  fixedSalePrice: number;
}

export const DEFAULT_INPUTS: PricingInputs = {
  qty: 1,
  unitCostUSD: 1,
  declaredCostUSD: 0,
  useDeclaredValue: false,
  totalWeightLbs: 1,
  itemCategory: 'ropa',
  mode: 'margin',
  targetMargin: 35,
  fixedSalePrice: 0,
};

export interface PricingBreakdown {
  // ── Costos en USD ──
  realProductUSD: number;
  declaredProductUSD: number;
  freightUSD: number;
  desaduanajeUSD: number;
  seguroUSD: number;
  // ── En GTQ ──
  realProductGTQ: number;
  freightGTQ: number;
  desaduanajeGTQ: number;
  seguroGTQ: number;
  cifBaseGTQ: number;
  daiRate: number;
  daiGTQ: number;
  ivaGTQ: number;
  // ── Totales importación ──
  totalImportCostGTQ: number;   // Import al valor DECLARADO
  totalLandedCostGTQ: number;   // Producto REAL + import declarado
  unitLandedCostGTQ: number;
  // ── Comparativa factura declarada ──
  importAtRealGTQ: number;      // Import si facturara el valor real
  taxSavingsGTQ: number;        // Ahorro fiscal (0 si no usa factura ajustada)
  // ── Venta ──
  salePriceGTQ: number;
  netProfitGTQ: number;
  unitProfitGTQ: number;
  actualMargin: number;
  isViable: boolean;
}

export function calculatePricing(
  inputs: PricingInputs,
  config: PricingConfig = DEFAULT_CONFIG,
): PricingBreakdown {
  const qty = Math.max(1, inputs.qty || 1);
  const lbs = Math.max(0, inputs.totalWeightLbs || 0);
  const daiRate = CATEGORY_DAI_RATE[inputs.itemCategory] ?? 0;
  const ex = config.exchangeRate;

  const realProductUSD = qty * Math.max(0, inputs.unitCostUSD || 0);
  const declaredProductUSD = inputs.useDeclaredValue
    ? qty * Math.max(0, inputs.declaredCostUSD || 0)
    : realProductUSD;

  // ── Costos fijos de ICC (peso, no cambian con el valor declarado) ──
  const freightUSD = lbs * config.iccPoundRate;
  const desaduanajeUSD = config.iccCustomsFee;

  // ── Seguro: sobre valor DECLARADO ──
  const seguroUSD = declaredProductUSD * config.insuranceRate;

  const freightGTQ = freightUSD * ex;
  const desaduanajeGTQ = desaduanajeUSD * ex;
  const seguroGTQ = seguroUSD * ex;
  const realProductGTQ = realProductUSD * ex;

  // ── CIF para cálculo aduanal (sobre valor DECLARADO) ──
  const cifBaseGTQ =
    (declaredProductUSD + declaredProductUSD * config.insuranceRate + lbs * config.customsFreightRate) * ex;

  const daiGTQ = cifBaseGTQ * daiRate;
  const ivaGTQ = (cifBaseGTQ + daiGTQ) * config.ivaRate;

  const totalImportCostGTQ = freightGTQ + desaduanajeGTQ + seguroGTQ + daiGTQ + ivaGTQ;
  const totalLandedCostGTQ = realProductGTQ + totalImportCostGTQ;
  const unitLandedCostGTQ = totalLandedCostGTQ / qty;

  // ── Comparativa: ¿qué costaría si declarara el valor real? ──
  let importAtRealGTQ = totalImportCostGTQ;
  let taxSavingsGTQ = 0;

  if (inputs.useDeclaredValue && declaredProductUSD < realProductUSD) {
    const seguroRealGTQ = realProductUSD * config.insuranceRate * ex;
    const cifReal =
      (realProductUSD + realProductUSD * config.insuranceRate + lbs * config.customsFreightRate) * ex;
    const daiReal = cifReal * daiRate;
    const ivaReal = (cifReal + daiReal) * config.ivaRate;
    importAtRealGTQ = freightGTQ + desaduanajeGTQ + seguroRealGTQ + daiReal + ivaReal;
    taxSavingsGTQ = importAtRealGTQ - totalImportCostGTQ;
  }

  // ── Venta / Utilidad ──
  let salePriceGTQ = 0;
  let netProfitGTQ = 0;
  let actualMargin = 0;

  if (inputs.mode === 'margin') {
    const m = Math.min(99.99, Math.max(0, inputs.targetMargin || 0));
    salePriceGTQ = totalLandedCostGTQ / (1 - m / 100);
    netProfitGTQ = salePriceGTQ - totalLandedCostGTQ;
    actualMargin = m;
  } else {
    salePriceGTQ = Math.max(0, inputs.fixedSalePrice || 0);
    netProfitGTQ = salePriceGTQ - totalLandedCostGTQ;
    actualMargin = salePriceGTQ > 0 ? (netProfitGTQ / salePriceGTQ) * 100 : 0;
  }

  const unitProfitGTQ = netProfitGTQ / qty;

  return {
    realProductUSD,
    declaredProductUSD,
    freightUSD,
    desaduanajeUSD,
    seguroUSD,
    realProductGTQ,
    freightGTQ,
    desaduanajeGTQ,
    seguroGTQ,
    cifBaseGTQ,
    daiRate,
    daiGTQ,
    ivaGTQ,
    totalImportCostGTQ,
    totalLandedCostGTQ,
    unitLandedCostGTQ,
    importAtRealGTQ,
    taxSavingsGTQ,
    salePriceGTQ,
    netProfitGTQ,
    unitProfitGTQ,
    actualMargin,
    isViable: netProfitGTQ > 0,
  };
}

/**
 * Precios "psicológicos" sugeridos a partir del precio mínimo que da el margen
 * (ej. costo Q126.87 → precio ~Q195 → sugiere Q199.99, Q200, Q250).
 * Devuelve hasta 3 opciones redondas/atractivas, todas ≥ minPrice.
 */
export function suggestPrices(minPrice: number): number[] {
  if (!isFinite(minPrice) || minPrice <= 0) return [];
  const step = minPrice < 100 ? 10 : minPrice < 500 ? 50 : 100;
  const roundUp = (p: number, s: number) => Math.ceil(p / s) * s;
  const opts = [
    roundUp(minPrice, step) - 0.01,      // terminación .99 (199.99)
    roundUp(minPrice, step),             // múltiplo redondo (200)
    roundUp(minPrice * 1.12, step),      // opción premium (~12% arriba)
  ];
  return [...new Set(opts)]
    .filter(p => p >= minPrice)
    .sort((a, b) => a - b)
    .slice(0, 3);
}

export const fmtGTQ = (n: number) =>
  `Q${(isFinite(n) ? n : 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtUSD = (n: number) =>
  `$${(isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtPct = (n: number) =>
  `${(isFinite(n) ? n : 0).toFixed(2)}%`;
