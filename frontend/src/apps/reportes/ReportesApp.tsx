import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Factory,
  AlertTriangle, Loader2, ChevronDown, ChevronUp, BarChart3,
} from 'lucide-react';
import type { AppProps } from '../index';
import { useModuleChrome } from '@/components/chrome/ModuleChrome';
import { reportesService, type MonthlyReport, type MonthlyProductRow } from '@/services/reportes.service';

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const fmt = (n: number) =>
  'Q' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (n: number) =>
  (n * 100).toLocaleString('es-GT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';

function KpiCard({
  label, value, sub, positive, icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  icon: typeof DollarSign;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 font-medium">{label}</span>
        <Icon className="w-4 h-4 text-slate-400" />
      </div>
      <span
        className={`text-xl font-bold ${
          positive === undefined
            ? 'text-slate-800'
            : positive
            ? 'text-emerald-600'
            : 'text-red-600'
        }`}
      >
        {value}
      </span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  );
}

function PLRow({
  label, value, indent = false, bold = false, negative = false, separator = false,
}: {
  label?: string;
  value?: number;
  indent?: boolean;
  bold?: boolean;
  negative?: boolean;
  separator?: boolean;
}) {
  if (separator) {
    return <div className="border-t border-slate-200 my-1" />;
  }
  return (
    <div className={`flex justify-between py-1.5 ${indent ? 'pl-6' : ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
        {label}
      </span>
      {value !== undefined && (
        <span
          className={`text-sm font-mono ${
            bold ? 'font-bold' : ''
          } ${
            negative
              ? value < 0
                ? 'text-red-600'
                : 'text-emerald-600'
              : 'text-slate-800'
          }`}
        >
          {value < 0 ? '-' + fmt(Math.abs(value)) : fmt(value)}
        </span>
      )}
    </div>
  );
}

export function ReportesApp(_props: AppProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await reportesService.getMonthly(year, month);
      setReport(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error al cargar reporte');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const t = report?.totals;
  const products = report?.products ?? [];
  const top10 = products.slice(0, 10);
  const displayed = showAllProducts ? products : top10;

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  useModuleChrome('Reporte Mensual P&L');

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-end gap-3">
        <div className="flex gap-2">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {!loading && report && t && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Venta Total"
              value={fmt(t.venta_total)}
              sub={`${t.harina_total_qq.toFixed(1)} qq producidos`}
              icon={ShoppingCart}
            />
            <KpiCard
              label="Costo de Producción"
              value={fmt(t.costo_total)}
              sub={`Merma: ${fmt(t.merma_total)}`}
              icon={Factory}
            />
            <KpiCard
              label="Utilidad Operativa"
              value={fmt(t.utilidad_operativa)}
              positive={t.utilidad_operativa >= 0}
              sub="Antes de OPEX"
              icon={TrendingUp}
            />
            <KpiCard
              label="Utilidad Neta"
              value={t.utilidad_neta < 0 ? '-' + fmt(Math.abs(t.utilidad_neta)) : fmt(t.utilidad_neta)}
              positive={t.utilidad_neta >= 0}
              sub="Después de OPEX"
              icon={t.utilidad_neta >= 0 ? TrendingUp : TrendingDown}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Estado de Resultados */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">
                Estado de Resultados — {MONTHS[month - 1]} {year}
              </h2>
              <PLRow label="Ingresos por ventas" value={t.venta_total} bold />
              <PLRow label="(-) Costo de producción" value={t.costo_total} indent />
              <PLRow label="(-) Merma (2%)" value={t.merma_total} indent />
              <PLRow separator />
              <PLRow label="Utilidad Operativa" value={t.utilidad_operativa} bold negative />
              <PLRow separator />
              <PLRow label="(-) OPEX Operativo" value={t.opex_operativo} indent />
              <PLRow label="(-) Retiros Propietario" value={t.owner_drawing} indent />
              <PLRow label="(-) Costos Financieros" value={t.financing_cost} indent />
              <PLRow separator />
              <PLRow label="OPEX Total" value={t.opex_total} bold />
              <PLRow separator />
              <PLRow label="Utilidad Neta" value={t.utilidad_neta} bold negative />
            </div>

            {/* Top 10 productos por venta */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">
                Top Productos por Venta
              </h2>
              {products.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">
                  Sin órdenes completadas en este período
                </p>
              ) : (
                <div className="space-y-2">
                  {top10.map((p, i) => (
                    <ProductBar key={p.recipe_id} product={p} rank={i + 1} maxVenta={products[0].venta_total} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tabla detallada por producto */}
          {products.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">
                  Detalle por Producto ({products.length} recetas)
                </h2>
                {products.length > 10 && (
                  <button
                    onClick={() => setShowAllProducts(v => !v)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                  >
                    {showAllProducts ? 'Ver menos' : `Ver todos (${products.length})`}
                    {showAllProducts ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-2.5 text-xs font-medium text-slate-500">Producto</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-slate-500 text-right">Harina (lbs)</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-slate-500 text-right">Costo</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-slate-500 text-right">Merma</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-slate-500 text-right">Venta</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-slate-500 text-right">Utilidad</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-slate-500 text-right">Partic.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayed.map(p => (
                      <tr key={p.recipe_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-slate-700">{p.recipe_name}</td>
                        <td className="px-4 py-2.5 text-right text-slate-600 font-mono text-xs">
                          {p.harina_total_lbs.toLocaleString('es-GT', { maximumFractionDigits: 1 })}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600 font-mono text-xs">{fmt(p.costo_total)}</td>
                        <td className="px-4 py-2.5 text-right text-amber-600 font-mono text-xs">{fmt(p.merma_al_costo)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700 font-mono text-xs">{fmt(p.venta_total)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold ${p.utilidad_producto >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {p.utilidad_producto < 0 ? '-' + fmt(Math.abs(p.utilidad_producto)) : fmt(p.utilidad_producto)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-500 text-xs">{pct(p.participacion_pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200">
                      <td className="px-4 py-2.5 text-slate-700">Total</td>
                      <td className="px-4 py-2.5 text-right text-slate-700 font-mono text-xs">
                        {(t.harina_total_qq * 100).toLocaleString('es-GT', { maximumFractionDigits: 1 })}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700 font-mono text-xs">{fmt(t.costo_total)}</td>
                      <td className="px-4 py-2.5 text-right text-amber-600 font-mono text-xs">{fmt(t.merma_total)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700 font-mono text-xs">{fmt(t.venta_total)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono text-xs font-bold ${t.utilidad_neta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {t.utilidad_neta < 0 ? '-' + fmt(Math.abs(t.utilidad_neta)) : fmt(t.utilidad_neta)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500 text-xs">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !error && report && products.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Sin datos de producción para {MONTHS[month - 1]} {year}</p>
          <p className="text-xs mt-1">Completa órdenes de producción en el módulo Cocina para ver el P&L</p>
        </div>
      )}
    </div>
  );
}

function ProductBar({
  product, rank, maxVenta,
}: {
  product: MonthlyProductRow;
  rank: number;
  maxVenta: number;
}) {
  const barWidth = maxVenta > 0 ? (product.venta_total / maxVenta) * 100 : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center shrink-0">
            {rank}
          </span>
          <span className="font-medium text-slate-700 truncate max-w-[160px]">{product.recipe_name}</span>
        </span>
        <span className="text-slate-500 font-mono shrink-0 ml-2">
          {'Q' + product.venta_total.toLocaleString('es-GT', { maximumFractionDigits: 0 })}
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}
