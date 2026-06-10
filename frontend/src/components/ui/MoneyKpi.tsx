import { IrisArea, IrisBars } from './IrisCharts';

/**
 * Tarjeta KPI financiera con mini-gráfica iris — patrón estándar de los
 * módulos de negocio (Personal Shopper, Importaciones, dashboard).
 * Las tendencias son decorativas; el número es el dato real.
 */

const fmtCompact = (n: number) =>
  'Q' + n.toLocaleString('es-GT', { maximumFractionDigits: 0 });

const DEFAULT_TRENDS: Record<'area' | 'bars', number[]> = {
  bars: [6, 9, 7, 12, 9, 14, 11],
  area: [8, 10, 9, 12, 11, 14, 13, 16],
};

export function MoneyKpi({
  label, value, sub, chart = 'area', trend,
}: {
  label: string;
  value: number;
  sub?: string;
  chart?: 'area' | 'bars';
  trend?: number[];
}) {
  const data = trend ?? DEFAULT_TRENDS[chart];
  return (
    <div className="nodo-card p-3.5 sm:p-5 min-w-0 overflow-hidden">
      <p className="nodo-section-label !mb-1 truncate">{label}</p>
      <p className="text-lg sm:text-2xl font-black text-nodo-ink tabular-nums tracking-tight truncate">
        {fmtCompact(value)}
      </p>
      {sub && (
        <p className="text-[10px] font-semibold text-nodo-dim mt-0.5 truncate">{sub}</p>
      )}
      {chart === 'bars'
        ? <IrisBars data={data} height={40} className="mt-2" />
        : <IrisArea data={data} height={40} className="mt-2" />}
    </div>
  );
}
