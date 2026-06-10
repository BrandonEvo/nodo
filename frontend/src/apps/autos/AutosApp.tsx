import { useState, useEffect, useCallback } from 'react';
import {
  Car, ChevronDown, RotateCcw, Calculator, Loader2, X,
  TrendingUp, TrendingDown, Wrench, Settings2, ChevronRight,
} from 'lucide-react';
import type { AppProps } from '../index';
import {
  autosService,
  type AutosCalculoInput,
  type AutosCalculoResult,
  type EstadoUSA,
} from '@/services/autos.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const Q = (n: number) =>
  `Q${(isFinite(n) ? n : 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const USD = (n: number) =>
  `$${(isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Primitivos ────────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
      {children}
    </label>
  );
}

function NumField({
  prefix, suffix, value, onChange, placeholder = '0',
}: {
  prefix?: string; suffix?: string; value: number;
  onChange: (v: number) => void; placeholder?: string;
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-nodo-dim pointer-events-none">
          {prefix}
        </span>
      )}
      <input
        type="number" inputMode="decimal" min={0} step={0.01}
        value={value || ''}
        placeholder={placeholder}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        onFocus={e => e.target.select()}
        className={`w-full h-11 ${prefix ? 'pl-8' : 'pl-4'} ${suffix ? 'pr-12' : 'pr-4'} bg-nodo-inset border-2 border-nodo-line rounded-xl text-sm font-bold text-nodo-ink focus:border-nodo-ink focus:bg-nodo-card outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
      />
      {suffix && (
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-nodo-dim pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

function SectionToggle({
  open, onToggle, icon: Icon, label, accent,
}: {
  open: boolean; onToggle: () => void;
  icon: React.ElementType; label: string; accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
        open
          ? 'border-nodo-ink bg-nodo-ink text-nodo-canvas'
          : 'border-nodo-line bg-nodo-card text-nodo-sub hover:border-nodo-line-s'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${open ? 'bg-nodo-canvas/15' : accent}`}>
          <Icon size={14} className={open ? 'text-nodo-canvas' : ''} />
        </div>
        <span className="text-sm font-bold">{label}</span>
      </div>
      <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  );
}

function ResultRow({
  label, value, bold, dim, small,
}: {
  label: string; value: string; bold?: boolean; dim?: boolean; small?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-[5px] ${bold ? 'font-bold text-white' : dim ? 'text-white/30' : 'text-white/60'}`}>
      <span className={small ? 'text-[10px]' : 'text-[11px]'}>{label}</span>
      <span className={`font-mono ${small ? 'text-[10px]' : 'text-[12px]'}`}>{value}</span>
    </div>
  );
}

function CollapsibleSection({
  title, total, children, defaultOpen = false,
}: {
  title: string; total: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white/5 rounded-2xl border border-white/5 overflow-hidden">
      <button
        onClick={() => setOpen(s => !s)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider">{title}</span>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-mono font-bold text-white">{total}</span>
          <ChevronRight size={12} className={`text-white/30 transition-transform ${open ? 'rotate-90' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-0 border-t border-white/10 pt-2">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Componente Principal ──────────────────────────────────────────────────────

type VehicleSize = 'normal' | 'mediano' | 'grande';

const SIZE_OPTIONS: { value: VehicleSize; label: string; hint: string }[] = [
  { value: 'normal',  label: 'Normal',  hint: 'Sedán / Compacto' },
  { value: 'mediano', label: 'Mediano', hint: 'Camioneta / SUV' },
  { value: 'grande',  label: 'Grande',  hint: 'Van / Truck largo' },
];

export function AutosApp(_props: AppProps) {
  const [estados, setEstados] = useState<EstadoUSA[]>([]);
  const [costoReal, setCostoReal] = useState(0);
  const [stateCode, setStateCode] = useState('');
  const [vehicleSize, setVehicleSize] = useState<VehicleSize>('normal');
  const [reparaciones, setReparaciones] = useState({
    llave: 0, repuestos: 0, pintura: 0, manoObra: 0, otros: 0,
  });
  const [precioVenta, setPrecioVenta] = useState(0);
  const [variables, setVariables] = useState({
    tc: 8.0, tramite: 1650.0, satPct: 32.0,
  });

  const [showRep, setShowRep]  = useState(false);
  const [showVars, setShowVars] = useState(false);

  const [result, setResult] = useState<AutosCalculoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEstados = useCallback(async () => {
    try {
      const data = await autosService.listarEstados();
      data.sort((a, b) => a.label.localeCompare(b.label));
      setEstados(data);
    } catch {
      // silencioso — el selector quedará vacío y el backend rechazará códigos inválidos
    }
  }, []);

  useEffect(() => { loadEstados(); }, [loadEstados]);

  const canCalculate = costoReal > 0 && stateCode !== '';

  const handleCalcular = async () => {
    if (!canCalculate) return;
    setLoading(true);
    setError(null);
    try {
      const input: AutosCalculoInput = {
        costo_real_usd: costoReal,
        state_code:     stateCode,
        vehicle_size:   vehicleSize,
        rep_llave:      reparaciones.llave,
        rep_repuestos:  reparaciones.repuestos,
        rep_pintura:    reparaciones.pintura,
        rep_mano_obra:  reparaciones.manoObra,
        rep_otros:      reparaciones.otros,
        precio_venta_gtq:     precioVenta,
        tipo_cambio:          variables.tc !== 8.0   ? variables.tc    : undefined,
        tramite_aduanero_gtq: variables.tramite !== 1650.0 ? variables.tramite : undefined,
        porcentaje_sat:       variables.satPct !== 32.0 ? variables.satPct / 100 : undefined,
      };
      const data = await autosService.calcular(input);
      setResult(data);
    } catch {
      setError('No se pudo calcular. Verifica los datos e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setCostoReal(0);
    setStateCode('');
    setVehicleSize('normal');
    setReparaciones({ llave: 0, repuestos: 0, pintura: 0, manoObra: 0, otros: 0 });
    setPrecioVenta(0);
    setVariables({ tc: 8.0, tramite: 1650.0, satPct: 32.0 });
    setResult(null);
    setError(null);
  };

  const isProfit = result ? result.utilidad_gtq >= 0 : false;

  return (
    <div className="w-full max-w-7xl mx-auto">

      {/* ── HEADER ── */}
      <header className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-nodo-ink flex items-center justify-center">
            <Car size={22} className="text-nodo-canvas" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-nodo-ink leading-none">Importación de Vehículos</h1>
            <p className="text-xs font-medium text-nodo-sub mt-1">USA → Guatemala · Cálculo automático</p>
          </div>
        </div>
        <button
          onClick={handleReset}
          className="h-10 px-4 rounded-xl text-xs font-bold flex items-center gap-2 bg-nodo-card text-nodo-sub hover:bg-nodo-danger-bg hover:text-nodo-danger-tx border border-nodo-line transition-all"
        >
          <RotateCcw size={14} /> Reiniciar
        </button>
      </header>

      {error && (
        <div className="mb-4 bg-nodo-danger-bg border border-nodo-danger-bd text-nodo-danger-tx text-sm font-medium px-4 py-3 rounded-2xl flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}><X size={16} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

        {/* ── FORMULARIO ── */}
        <div className="lg:col-span-3 space-y-4">

          {/* Sección principal */}
          <section className="bg-nodo-card border border-nodo-line rounded-3xl shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Car size={15} />
              </div>
              <h2 className="text-sm font-black text-nodo-ink uppercase tracking-wider">Datos del Vehículo</h2>
            </div>

            {/* Costo Real */}
            <div>
              <FieldLabel>Costo Real (adjudicación)</FieldLabel>
              <NumField
                prefix="$"
                value={costoReal}
                onChange={setCostoReal}
                placeholder="5,505"
              />
              <p className="text-[10px] text-nodo-dim mt-1">Precio de compra/subasta en USD (sin incluir gastos)</p>
            </div>

            {/* Estado */}
            <div>
              <FieldLabel>Estado de Origen (USA)</FieldLabel>
              <select
                value={stateCode}
                onChange={e => setStateCode(e.target.value)}
                className="nodo-select"
              >
                <option value="">— Selecciona un estado —</option>
                {estados.map(s => (
                  <option key={s.code} value={s.code}>
                    {s.label} ({s.code}) · Puerto {s.puerto}
                  </option>
                ))}
              </select>
            </div>

            {/* Tamaño */}
            <div>
              <FieldLabel>Tamaño del Vehículo</FieldLabel>
              <div className="grid grid-cols-3 gap-2 bg-nodo-inset border-2 border-nodo-line rounded-xl p-1.5">
                {SIZE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVehicleSize(opt.value)}
                    className={`py-2.5 px-2 rounded-lg transition-all ${
                      vehicleSize === opt.value
                        ? 'bg-nodo-ink text-nodo-canvas shadow-sm'
                        : 'text-nodo-sub hover:text-nodo-ink'
                    }`}
                  >
                    <p className="text-xs font-black">{opt.label}</p>
                    <p className={`text-[9px] font-medium mt-0.5 ${vehicleSize === opt.value ? 'text-nodo-canvas/60' : 'text-nodo-dim'}`}>
                      {opt.hint}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Reparaciones (colapsable) */}
          <div className="space-y-2">
            <SectionToggle
              open={showRep}
              onToggle={() => setShowRep(s => !s)}
              icon={Wrench}
              label="Costo de Reparación (opcional)"
              accent="bg-orange-50 text-orange-500"
            />
            {showRep && (
              <section className="bg-nodo-card border border-nodo-line rounded-3xl shadow-sm p-6">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: 'llave',    label: 'Llave' },
                    { key: 'repuestos',label: 'Repuestos' },
                    { key: 'pintura',  label: 'Pintura' },
                    { key: 'manoObra', label: 'Mano de obra' },
                    { key: 'otros',    label: 'Otros' },
                  ].map(f => (
                    <div key={f.key}>
                      <FieldLabel>{f.label}</FieldLabel>
                      <NumField
                        prefix="Q"
                        value={(reparaciones as any)[f.key]}
                        onChange={v => setReparaciones(prev => ({ ...prev, [f.key]: v }))}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Variables avanzadas (colapsable) */}
          <div className="space-y-2">
            <SectionToggle
              open={showVars}
              onToggle={() => setShowVars(s => !s)}
              icon={Settings2}
              label="Variables (avanzado)"
              accent="bg-purple-50 text-purple-500"
            />
            {showVars && (
              <section className="bg-nodo-card border border-nodo-line rounded-3xl shadow-sm p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <FieldLabel>Tipo de Cambio</FieldLabel>
                    <NumField suffix="Q/$" value={variables.tc} onChange={v => setVariables(p => ({ ...p, tc: v }))} />
                  </div>
                  <div>
                    <FieldLabel>Trámite Aduanero</FieldLabel>
                    <NumField prefix="Q" value={variables.tramite} onChange={v => setVariables(p => ({ ...p, tramite: v }))} />
                  </div>
                  <div>
                    <FieldLabel>Porcentaje SAT</FieldLabel>
                    <NumField suffix="%" value={variables.satPct} onChange={v => setVariables(p => ({ ...p, satPct: v }))} />
                  </div>
                </div>
                <div>
                  <FieldLabel>Precio de Venta (para calcular utilidad)</FieldLabel>
                  <NumField prefix="Q" value={precioVenta} onChange={setPrecioVenta} placeholder="0" />
                </div>
              </section>
            )}
          </div>

          {/* Botón Calcular */}
          <button
            onClick={handleCalcular}
            disabled={!canCalculate || loading}
            className="w-full h-14 rounded-2xl font-black text-base tracking-widest uppercase transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed bg-nodo-ink text-nodo-canvas shadow-lg"
          >
            {loading
              ? <><Loader2 size={20} className="animate-spin" /> Calculando...</>
              : <><Calculator size={20} /> Calcular</>
            }
          </button>
        </div>

        {/* ── PANEL DE RESULTADOS ── */}
        <aside className="lg:col-span-2 lg:sticky lg:top-6">
          {!result ? (
            <div className="bg-[#111] rounded-3xl p-8 flex flex-col items-center justify-center text-center min-h-[300px] border border-white/5">
              <Car size={40} className="text-white/10 mb-3" />
              <p className="text-white/30 font-bold text-sm">Ingresa los datos del vehículo</p>
              <p className="text-white/20 text-xs mt-1">y presiona Calcular para ver el desglose</p>
            </div>
          ) : (
            <div className="bg-[#111] rounded-3xl shadow-2xl overflow-hidden text-white">

              {/* Header result */}
              <div className="px-6 py-5 border-b border-white/10">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                    {result.state_label} · Puerto {result.puerto}
                  </p>
                  <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase ${
                    result.precio_venta_gtq > 0
                      ? (isProfit ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300')
                      : 'bg-white/10 text-white/40'
                  }`}>
                    {result.precio_venta_gtq > 0 ? (isProfit ? 'Ganancia' : 'Pérdida') : 'Sin precio venta'}
                  </span>
                </div>
                <p className="text-[10px] text-white/30">
                  TC Q{result.tipo_cambio.toFixed(2)} · SAT {(result.porcentaje_sat * 100).toFixed(0)}%
                </p>
              </div>

              {/* Resumen */}
              <div className="px-6 py-5 space-y-3">

                <CollapsibleSection title="Costo Vehículo" total={Q(result.costo_vehiculo.total_gtq)}>
                  <ResultRow label="Costo real" value={`${USD(result.costo_vehiculo.costo_real_usd)} / ${Q(result.costo_vehiculo.costo_real_gtq)}`} />
                  <ResultRow label="Comisión bancaria" value={`${USD(result.costo_vehiculo.comision_bancaria_usd)} / ${Q(result.costo_vehiculo.comision_bancaria_gtq)}`} dim />
                  <div className="border-t border-white/10 pt-1.5 mt-1">
                    <ResultRow label="Total vehículo" value={`${USD(result.costo_vehiculo.total_usd)}`} bold />
                  </div>
                </CollapsibleSection>

                <CollapsibleSection title="Costo Importación" total={Q(result.costo_importacion.total_gtq)}>
                  <ResultRow label="Grúa" value={`${USD(result.costo_importacion.grua_usd)} / ${Q(result.costo_importacion.grua_gtq)}`} />
                  <ResultRow label="Com. grúa (4%)" value={USD(result.costo_importacion.comision_grua_usd)} dim small />
                  <ResultRow label="Barco" value={`${USD(result.costo_importacion.barco_usd)} / ${Q(result.costo_importacion.barco_gtq)}`} />
                  <ResultRow label="Com. barco (4%)" value={USD(result.costo_importacion.comision_barco_usd)} dim small />
                  <ResultRow label="Storage" value={`${USD(result.costo_importacion.storage_usd)} / ${Q(result.costo_importacion.storage_gtq)}`} />
                  <ResultRow label="Com. bancaria logística" value={USD(result.costo_importacion.comision_bancaria_logistica_usd)} dim small />
                  <div className="border-t border-white/10 pt-1.5 mt-1">
                    <ResultRow label="Total importación" value={USD(result.costo_importacion.total_usd)} bold />
                  </div>
                </CollapsibleSection>

                <CollapsibleSection title="Impuestos Guatemala" total={Q(result.impuestos_guatemala.total_gtq)}>
                  <ResultRow label={`Impuestos SAT (${(result.porcentaje_sat * 100).toFixed(0)}%)`} value={Q(result.impuestos_guatemala.impuestos_sat_gtq)} />
                  <ResultRow label="Trámite aduanero" value={Q(result.impuestos_guatemala.tramite_aduanero_gtq)} />
                  <ResultRow label="Tacuacina" value={Q(result.impuestos_guatemala.tacuacina_gtq)} dim />
                  <ResultRow label="Primeras placas" value={Q(result.impuestos_guatemala.primeras_placas_gtq)} dim />
                  <ResultRow label="Calcomanía" value={Q(result.impuestos_guatemala.calcomania_gtq)} dim />
                  <ResultRow label="Facturación y legalización" value={Q(result.impuestos_guatemala.facturacion_legalizacion_gtq)} dim />
                  <ResultRow label="Insumos / gasolina" value={Q(result.impuestos_guatemala.insumos_gasolina_gtq)} dim />
                  <ResultRow label="Contador" value={Q(result.impuestos_guatemala.contador_gtq)} dim />
                  <ResultRow label="Grúa local" value={Q(result.impuestos_guatemala.grua_local_gtq)} dim />
                </CollapsibleSection>

                {result.costo_reparacion.total_gtq > 0 && (
                  <CollapsibleSection title="Costo Reparación" total={Q(result.costo_reparacion.total_gtq)}>
                    {result.costo_reparacion.llave_gtq > 0     && <ResultRow label="Llave"        value={Q(result.costo_reparacion.llave_gtq)} dim />}
                    {result.costo_reparacion.repuestos_gtq > 0 && <ResultRow label="Repuestos"    value={Q(result.costo_reparacion.repuestos_gtq)} dim />}
                    {result.costo_reparacion.pintura_gtq > 0   && <ResultRow label="Pintura"      value={Q(result.costo_reparacion.pintura_gtq)} dim />}
                    {result.costo_reparacion.mano_obra_gtq > 0 && <ResultRow label="Mano de obra" value={Q(result.costo_reparacion.mano_obra_gtq)} dim />}
                    {result.costo_reparacion.otros_gtq > 0     && <ResultRow label="Otros"        value={Q(result.costo_reparacion.otros_gtq)} dim />}
                  </CollapsibleSection>
                )}

                {/* Costo Final */}
                <div className="bg-white/10 rounded-2xl p-4 border border-white/15">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-white uppercase tracking-wider">Costo Final</p>
                    <p className="text-2xl font-black text-white font-mono">{Q(result.costo_final_gtq)}</p>
                  </div>
                </div>

                {/* Precio de Venta + Utilidad */}
                {result.precio_venta_gtq > 0 && (
                  <div className={`rounded-2xl p-4 border ${
                    isProfit
                      ? 'bg-emerald-500/10 border-emerald-400/20'
                      : 'bg-red-500/10 border-red-400/20'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-0.5">Precio de Venta</p>
                        <p className="text-lg font-black text-white">{Q(result.precio_venta_gtq)}</p>
                      </div>
                      {isProfit
                        ? <TrendingUp size={28} className="text-emerald-400/40" />
                        : <TrendingDown size={28} className="text-red-400/40" />
                      }
                    </div>
                    <div className="border-t border-white/10 pt-3 flex items-center justify-between">
                      <p className="text-xs font-bold text-white/40 uppercase tracking-wider">Utilidad</p>
                      <p className={`text-2xl font-black font-mono ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {Q(result.utilidad_gtq)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
