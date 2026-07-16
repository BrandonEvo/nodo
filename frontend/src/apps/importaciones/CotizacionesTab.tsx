import { useState, useEffect, useCallback } from 'react';
import {
  Package2, Truck, CheckCircle2, DollarSign, Clock, AlertTriangle,
  ChevronRight, RotateCcw, X, Check, Loader2, MapPin,
  Calendar, Calculator, Share2, Search, Plus, Undo2, Globe,
  MoreHorizontal, SlidersHorizontal,
} from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ShareSheet } from '@/components/ui/ShareSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { MoneyKpi } from '@/components/ui/MoneyKpi';
import { PaquetesBoard } from './PaquetesBoard';
import { ImportFab } from './ImportFab';
import { List, Boxes } from 'lucide-react';
import {
  importacionesService,
  type Cotizacion,
  type CotizacionStatus,
  type LogisticsUpdate,
  type RenovarPayload,
  STATUS_LABEL,
  NEXT_STATUS,
  NEXT_STATUS_ACTION,
  PREV_STATUS,
} from '@/services/importaciones.service';
import {
  fmtGTQ, fmtPct, CATEGORY_DAI_RATE,
  type PricingInputs, type PricingConfig,
} from './pricingEngine';
import { usePricingEngine } from './usePricingEngine';
import { importCatalogService } from '@/services/import_catalog.service';

// ── Status badge config ───────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CotizacionStatus, { icon: React.ReactNode; cls: string }> = {
  cotizado:    { icon: <Clock size={10} />,        cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  confirmado:  { icon: <CheckCircle2 size={10} />, cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20' },
  comprado:    { icon: <Package2 size={10} />,     cls: 'bg-nodo-warn-bg text-nodo-warn-tx border-nodo-warn-bd' },
  en_transito: { icon: <Truck size={10} />,        cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20' },
  entregado:   { icon: <CheckCircle2 size={10} />, cls: 'bg-nodo-success-bg text-nodo-success-tx border-nodo-success-bd' },
  pagado:      { icon: <DollarSign size={10} />,   cls: 'bg-nodo-success-bg text-nodo-success-tx border-nodo-success-bd' },
  cancelado:   { icon: <X size={10} />,            cls: 'bg-nodo-inset text-nodo-dim border-nodo-line' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isExpired(c: Cotizacion): boolean {
  return (c.status as string === 'cotizado' || c.status as string === 'pendiente')
    && new Date(c.expires_at) < new Date();
}

function expiryLabel(c: Cotizacion): string {
  const diff = new Date(c.expires_at).getTime() - Date.now();
  if (diff <= 0) return 'Vencida';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function resultField<T>(c: Cotizacion, key: string): T {
  return (c.result_snapshot as Record<string, T>)[key];
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-GT', { day: 'numeric', month: 'short' });
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

// Tolera cotizaciones legacy con estado 'pendiente' (antes de la migración de
// estados) para que el render no reviente si el backend aún no se actualizó.
function displayStatus(status: CotizacionStatus): CotizacionStatus {
  return (status as string) === 'pendiente' ? 'cotizado' : status;
}

function StatusBadge({ status }: { status: CotizacionStatus }) {
  const s = displayStatus(status);
  const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.cotizado;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${cfg.cls}`}>
      {cfg.icon}
      {STATUS_LABEL[s] ?? s}
    </span>
  );
}

// ── Logistics BottomSheet ─────────────────────────────────────────────────────

function LogisticsSheet({
  cotizacion,
  open,
  onClose,
  onSaved,
}: {
  cotizacion: Cotizacion;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: Cotizacion) => void;
}) {
  const [tracking, setTracking]   = useState(cotizacion.tracking_number ?? '');
  const [delivery, setDelivery]   = useState(cotizacion.estimated_delivery ?? '');
  const [notes, setNotes]         = useState(cotizacion.notes ?? '');
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (open) {
      setTracking(cotizacion.tracking_number ?? '');
      setDelivery(cotizacion.estimated_delivery ?? '');
      setNotes(cotizacion.notes ?? '');
    }
  }, [open, cotizacion]);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: LogisticsUpdate = {
        tracking_number:    tracking.trim() || null,
        estimated_delivery: delivery || null,
        notes:              notes.trim() || null,
      };
      const { data } = await importacionesService.updateLogistics(cotizacion.id, payload);
      onSaved(data);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Logística"
      footer={
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-[52px] rounded-full font-bold text-base flex items-center justify-center gap-2.5
                     shadow-lg active:scale-[0.97] transition-transform disabled:opacity-40"
          style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          Guardar
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
            Número de tracking
          </label>
          <input
            type="text"
            value={tracking}
            onChange={e => setTracking(e.target.value)}
            placeholder="Ej. 1Z999AA10123456784"
            className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
            Fecha estimada de entrega
          </label>
          <input
            type="date"
            value={delivery}
            onChange={e => setDelivery(e.target.value)}
            className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors appearance-none min-w-0 [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:m-0 [&::-webkit-calendar-picker-indicator]:ml-auto [&::-webkit-calendar-picker-indicator]:opacity-60"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
            Notas
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Observaciones del envío..."
            className="w-full px-4 py-3 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors resize-none placeholder:text-nodo-dim"
          />
        </div>
      </div>
    </BottomSheet>
  );
}

// ── Cotizacion Card ───────────────────────────────────────────────────────────

// ── Edit Sheet ────────────────────────────────────────────────────────────────

function EditSheet({
  cotizacion,
  open,
  onClose,
  onSaved,
}: {
  cotizacion: Cotizacion;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: Cotizacion) => void;
}) {
  const { inputs, config, result, updateInput, updateConfig } = usePricingEngine(
    cotizacion.config_snapshot as unknown as PricingConfig,
    cotizacion.inputs_snapshot as unknown as PricingInputs,
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: RenovarPayload = {
        inputs_snapshot: inputs as unknown as Record<string, unknown>,
        config_snapshot: config as unknown as Record<string, unknown>,
        result_snapshot: result as unknown as Record<string, unknown>,
      };
      const { data } = await importacionesService.recalcular(cotizacion.id, payload);
      onSaved(data);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const hasSavings     = inputs.useDeclaredValue && result.taxSavingsGTQ > 0;
  const declaredIsHigh = inputs.useDeclaredValue && inputs.declaredCostUSD > inputs.unitCostUSD;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Editar cálculo"
      footer={
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-[52px] rounded-full font-bold text-base flex items-center justify-center gap-2.5
                     shadow-lg active:scale-[0.97] transition-transform disabled:opacity-40"
          style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          Guardar cambios
        </button>
      }
    >
      <div className="space-y-4">

        {/* Resultado en vivo */}
        <div className={`rounded-2xl p-4 border ${result.isViable ? 'bg-nodo-success-bg border-nodo-success-bd' : 'bg-nodo-danger-bg border-nodo-danger-bd'}`}>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-0.5">Precio</p>
              <p className="text-lg font-black tabular-nums text-nodo-ink">{fmtGTQ(result.salePriceGTQ)}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-0.5">Costo</p>
              <p className="text-lg font-black tabular-nums text-nodo-sub">{fmtGTQ(result.totalLandedCostGTQ)}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-0.5">Margen</p>
              <p className="text-lg font-black tabular-nums text-nodo-sub">{fmtPct(result.actualMargin)}</p>
            </div>
          </div>
        </div>

        {/* Precio en USA */}
        <div>
          <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Precio en USA</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-nodo-dim pointer-events-none">$</span>
            <input
              type="number" inputMode="decimal" min={0} step={0.01}
              value={inputs.unitCostUSD}
              onChange={e => updateInput('unitCostUSD', parseFloat(e.target.value) || 0)}
              onFocus={e => e.target.select()}
              className="w-full h-12 pl-8 pr-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-bold text-nodo-ink focus:border-nodo-ink outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </div>

        {/* Tipo de artículo */}
        <div>
          <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Tipo de artículo</label>
          <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-nodo-inset border-2 border-nodo-line rounded-2xl">
            {(Object.keys(CATEGORY_DAI_RATE) as Array<keyof typeof CATEGORY_DAI_RATE>).map(cat => {
              const active = inputs.itemCategory === cat;
              const rate   = CATEGORY_DAI_RATE[cat];
              return (
                <button key={cat} type="button"
                  onClick={() => updateInput('itemCategory', cat)}
                  className={`h-11 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${active ? 'bg-nodo-ink text-nodo-canvas shadow-sm' : 'text-nodo-sub'}`}>
                  <span>{cat === 'ropa' ? 'Ropa / Aseo' : cat === 'repuestos' ? 'Repuestos' : 'Electrónicos'}</span>
                  <span className={`text-[9px] font-black ${active ? 'opacity-60' : rate === 0 ? 'text-nodo-success-tx' : 'text-nodo-dim'}`}>
                    {(rate * 100).toFixed(0)}% DAI
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Peso + cantidad */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Peso (lbs)</label>
            <div className="flex items-center h-12 bg-nodo-inset border-2 border-nodo-line rounded-2xl overflow-hidden">
              <button type="button" onClick={() => updateInput('totalWeightLbs', parseFloat(Math.max(0.1, inputs.totalWeightLbs - 0.1).toFixed(1)))}
                className="h-full px-3 text-nodo-sub hover:text-nodo-ink hover:bg-nodo-raised active:scale-90 transition-all shrink-0">
                <span className="text-base font-bold">−</span>
              </button>
              <span className="flex-1 text-center text-sm font-black text-nodo-ink tabular-nums">{inputs.totalWeightLbs.toFixed(1)}</span>
              <button type="button" onClick={() => updateInput('totalWeightLbs', parseFloat((inputs.totalWeightLbs + 0.1).toFixed(1)))}
                className="h-full px-3 text-nodo-sub hover:text-nodo-ink hover:bg-nodo-raised active:scale-90 transition-all shrink-0">
                <span className="text-base font-bold">+</span>
              </button>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Cantidad</label>
            <div className="flex items-center h-12 bg-nodo-inset border-2 border-nodo-line rounded-2xl overflow-hidden">
              <button type="button" onClick={() => updateInput('qty', Math.max(1, inputs.qty - 1))}
                className="h-full px-3 text-nodo-sub hover:text-nodo-ink hover:bg-nodo-raised active:scale-90 transition-all shrink-0">
                <span className="text-base font-bold">−</span>
              </button>
              <span className="flex-1 text-center text-sm font-black text-nodo-ink tabular-nums">{inputs.qty}</span>
              <button type="button" onClick={() => updateInput('qty', inputs.qty + 1)}
                className="h-full px-3 text-nodo-sub hover:text-nodo-ink hover:bg-nodo-raised active:scale-90 transition-all shrink-0">
                <span className="text-base font-bold">+</span>
              </button>
            </div>
          </div>
        </div>

        {/* Estrategia de venta */}
        <div>
          <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Precio de venta</label>
          <div className="flex p-1 bg-nodo-inset border-2 border-nodo-line rounded-xl gap-1 mb-3">
            {(['margin', 'fixed'] as const).map(m => (
              <button key={m} type="button" onClick={() => updateInput('mode', m)}
                className={`flex-1 h-8 rounded-lg text-[11px] font-bold transition-all ${inputs.mode === m ? 'bg-nodo-ink text-nodo-canvas shadow-sm' : 'text-nodo-sub'}`}>
                {m === 'margin' ? 'Por Margen %' : 'Precio Fijo Q'}
              </button>
            ))}
          </div>
          {inputs.mode === 'margin' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-nodo-sub">Margen objetivo</span>
                <span className="text-sm font-black text-nodo-ink tabular-nums">{inputs.targetMargin.toFixed(0)}%</span>
              </div>
              <input type="range" min="0" max="80" step="0.5" value={inputs.targetMargin}
                onChange={e => updateInput('targetMargin', parseFloat(e.target.value))}
                className="w-full accent-current h-1.5 cursor-pointer" />
            </div>
          ) : (
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-nodo-dim pointer-events-none">Q</span>
              <input
                type="number" inputMode="decimal" min={0} step={0.01}
                value={inputs.fixedSalePrice}
                onChange={e => updateInput('fixedSalePrice', parseFloat(e.target.value) || 0)}
                onFocus={e => e.target.select()}
                className="w-full h-12 pl-8 pr-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-bold text-nodo-ink focus:border-nodo-ink outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          )}
        </div>

        {/* Valor declarado */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">Declarar valor menor</label>
            <button
              type="button"
              onClick={() => {
                updateInput('useDeclaredValue', !inputs.useDeclaredValue);
                if (!inputs.useDeclaredValue && inputs.declaredCostUSD === 0)
                  updateInput('declaredCostUSD', inputs.unitCostUSD);
              }}
              className={`relative w-[51px] h-[31px] rounded-full transition-colors duration-200 shrink-0 ${inputs.useDeclaredValue ? 'bg-[#34C759]' : 'bg-nodo-line'}`}
            >
              <span className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-md transition-transform duration-200 ${inputs.useDeclaredValue ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          {inputs.useDeclaredValue && (
            <div className="space-y-2">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-nodo-dim pointer-events-none">$</span>
                <input
                  type="number" inputMode="decimal" min={0} step={0.01}
                  value={inputs.declaredCostUSD}
                  onChange={e => updateInput('declaredCostUSD', parseFloat(e.target.value) || 0)}
                  onFocus={e => e.target.select()}
                  placeholder="Valor declarado..."
                  className="w-full h-12 pl-8 pr-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-bold text-nodo-ink focus:border-nodo-ink outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              {declaredIsHigh && (
                <p className="text-[11px] font-bold text-nodo-danger-tx px-1">El declarado no puede ser mayor al real.</p>
              )}
              {hasSavings && !declaredIsHigh && (
                <p className="text-[11px] font-bold text-nodo-warn-tx px-1">
                  Ahorro fiscal estimado: {fmtGTQ(result.taxSavingsGTQ)}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Tipo de cambio */}
        <div>
          <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">
            Tipo de cambio  <span className="normal-case font-normal">Q/$</span>
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-nodo-dim pointer-events-none">Q</span>
            <input
              type="number" inputMode="decimal" min={1} step={0.01}
              value={config.exchangeRate}
              onChange={e => updateConfig('exchangeRate', parseFloat(e.target.value) || 7.85)}
              onFocus={e => e.target.select()}
              className="w-full h-12 pl-8 pr-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-bold text-nodo-ink focus:border-nodo-ink outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </div>

      </div>
    </BottomSheet>
  );
}

// Fila de acción dentro del BottomSheet "Acciones" de una cotización.
function ActionRow({
  icon, label, onClick, danger, right, disabled,
}: {
  icon: React.ReactNode; label: string; onClick: () => void;
  danger?: boolean; right?: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full h-14 flex items-center gap-3 px-2 rounded-2xl active:bg-nodo-inset
                  transition-colors disabled:opacity-40 ${danger ? 'text-nodo-danger-tx' : 'text-nodo-ink'}`}
    >
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
                        ${danger ? 'bg-nodo-danger-bg' : 'bg-nodo-inset'}`}>
        {icon}
      </span>
      <span className="flex-1 text-left text-sm font-bold">{label}</span>
      {right ?? <ChevronRight size={16} className="text-nodo-dim shrink-0" />}
    </button>
  );
}

function CotizacionCard({
  cotizacion,
  onUpdate,
}: {
  cotizacion: Cotizacion;
  onUpdate: (updated: Cotizacion) => void;
}) {
  const [advancing, setAdvancing]         = useState(false);
  const [renovating, setRenovating]       = useState(false);
  const [showLogistics, setShowLogistics] = useState(false);
  const [showEdit, setShowEdit]           = useState(false);
  const [showShare, setShowShare]         = useState(false);
  const [showActions, setShowActions]     = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pubState, setPubState]           = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const trackingUrl = `${window.location.origin}/import-tracking/${cotizacion.share_token}`;

  const status     = displayStatus(cotizacion.status);
  const expired    = isExpired(cotizacion);
  const nextStatus = NEXT_STATUS[status];
  const prevStatus = PREV_STATUS[status];
  const salePrice  = resultField<number>(cotizacion, 'salePriceGTQ');
  const landed     = resultField<number>(cotizacion, 'totalLandedCostGTQ');
  const margin     = resultField<number>(cotizacion, 'actualMargin');
  const isViable   = resultField<boolean>(cotizacion, 'isViable');

  async function handleAdvance() {
    if (!nextStatus) return;
    setAdvancing(true);
    try {
      const { data } = await importacionesService.advanceStatus(cotizacion.id, nextStatus);
      onUpdate(data);
    } finally {
      setAdvancing(false);
    }
  }

  async function handleGoBack() {
    if (!prevStatus) return;
    setAdvancing(true);
    try {
      const { data } = await importacionesService.advanceStatus(cotizacion.id, prevStatus);
      onUpdate(data);
    } finally {
      setAdvancing(false);
    }
  }

  async function handleCancel() {
    setAdvancing(true);
    try {
      const { data } = await importacionesService.advanceStatus(cotizacion.id, 'cancelado');
      onUpdate(data);
    } finally {
      setAdvancing(false);
    }
  }

  async function handleReactivar() {
    setAdvancing(true);
    try {
      const { data } = await importacionesService.advanceStatus(cotizacion.id, 'cotizado');
      onUpdate(data);
    } finally {
      setAdvancing(false);
    }
  }

  async function handlePublishCatalog() {
    if (pubState === 'loading' || pubState === 'done') return;
    setPubState('loading');
    try {
      await importCatalogService.publishFromCotizacion(cotizacion.id);
      setPubState('done');
    } catch {
      setPubState('error');
    }
  }

  async function handleRenovar() {
    setRenovating(true);
    try {
      const payload: RenovarPayload = {
        inputs_snapshot: cotizacion.inputs_snapshot,
        config_snapshot: cotizacion.config_snapshot,
        result_snapshot: cotizacion.result_snapshot,
      };
      const { data } = await importacionesService.renovar(cotizacion.id, payload);
      onUpdate(data);
    } finally {
      setRenovating(false);
    }
  }

  const isClosed = status === 'pagado' || status === 'cancelado';

  return (
    <>
      <div className={`nodo-card overflow-hidden transition-all hover:border-nodo-line-s ${expired ? '!border-nodo-danger-bd' : ''}`}>

        {/* Expired banner */}
        {expired && (
          <div className="flex items-center gap-2 px-4 py-2 bg-nodo-danger-bg border-b border-nodo-danger-bd">
            <AlertTriangle size={12} className="text-nodo-danger-tx shrink-0" />
            <span className="text-[11px] font-bold text-nodo-danger-tx flex-1">Cotización vencida — precios pueden haber cambiado</span>
            <button
              onClick={handleRenovar}
              disabled={renovating}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-nodo-danger-tx text-white text-[10px] font-black active:scale-95 transition-transform disabled:opacity-50"
            >
              {renovating ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
              Renovar
            </button>
          </div>
        )}

        {/* Cara — toca para ver todas las acciones */}
        <button
          onClick={() => setShowActions(true)}
          className="block w-full text-left p-4 active:bg-nodo-inset transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-nodo-ink truncate">{cotizacion.product_name}</p>
              <p className="text-sm text-nodo-sub truncate mt-0.5">
                {cotizacion.cliente?.name ?? 'Sin cliente'}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-lg font-black leading-tight tracking-tight tabular-nums ${isViable ? 'text-nodo-ink' : 'text-nodo-danger-tx'}`}>
                {fmtGTQ(salePrice)}
              </p>
              <p className="text-xs text-nodo-dim tabular-nums">
                costo {fmtGTQ(landed)} · {fmtPct(margin)}
              </p>
            </div>
          </div>

          {/* Meta compacta: estado + UN chip contextual + badge catálogo */}
          <div className="flex items-center gap-2 mt-3">
            <StatusBadge status={status} />
            {status === 'cotizado' && !expired ? (
              <span className="inline-flex items-center gap-1 text-xs text-nodo-dim tabular-nums">
                <Clock className="w-3 h-3" />
                {expiryLabel(cotizacion)}
              </span>
            ) : cotizacion.tracking_number ? (
              <span className="inline-flex items-center gap-1 text-xs text-nodo-dim max-w-[150px]">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{cotizacion.tracking_number}</span>
              </span>
            ) : cotizacion.estimated_delivery ? (
              <span className="inline-flex items-center gap-1 text-xs text-nodo-dim">
                <Calendar className="w-3 h-3" />
                {fmtDate(cotizacion.estimated_delivery)}
              </span>
            ) : null}
            {pubState === 'done' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-nodo-success-tx">
                <Globe className="w-3 h-3" /> En catálogo
              </span>
            )}
          </div>
        </button>

        {/* Acción primaria (avanzar / renovar) + kebab con el resto */}
        <div className="flex items-center gap-2 px-4 pb-4">
          {expired ? (
            <button
              onClick={handleRenovar}
              disabled={renovating}
              className="flex-1 h-12 rounded-full font-bold text-sm flex items-center justify-center gap-1.5
                         shadow-sm active:scale-[0.97] transition-transform disabled:opacity-40"
              style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
            >
              {renovating ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Renovar cotización
            </button>
          ) : !isClosed && nextStatus ? (
            <button
              onClick={handleAdvance}
              disabled={advancing}
              className="flex-1 h-12 rounded-full font-bold text-sm flex items-center justify-center gap-1.5
                         shadow-sm active:scale-[0.97] transition-transform disabled:opacity-40"
              style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
            >
              {advancing ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
              {NEXT_STATUS_ACTION[status] ?? STATUS_LABEL[nextStatus]}
            </button>
          ) : (
            <div className="flex-1" />
          )}
          <button
            onClick={() => setShowActions(true)}
            aria-label="Más acciones"
            className="w-12 h-12 rounded-full border border-nodo-line text-nodo-sub
                       flex items-center justify-center active:scale-95 hover:bg-nodo-inset transition-all shrink-0"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      </div>

      {/* BottomSheet: todas las acciones secundarias, ordenadas por frecuencia */}
      <BottomSheet
        open={showActions}
        onClose={() => { setShowActions(false); setConfirmCancel(false); }}
        title="Acciones"
      >
        <p className="text-sm text-nodo-sub font-medium -mt-1 mb-3 truncate">{cotizacion.product_name}</p>
        <div className="flex flex-col gap-0.5">
          {!isClosed && (
            <>
              <ActionRow
                icon={<Calculator size={17} className="text-nodo-sub" />}
                label="Editar cálculo"
                onClick={() => { setShowActions(false); setShowEdit(true); }}
              />
              <ActionRow
                icon={<Truck size={17} className="text-nodo-sub" />}
                label="Logística y tracking"
                onClick={() => { setShowActions(false); setShowLogistics(true); }}
              />
            </>
          )}
          <ActionRow
            icon={<Share2 size={17} className="text-nodo-sub" />}
            label="Compartir seguimiento"
            onClick={() => { setShowActions(false); setShowShare(true); }}
          />
          <ActionRow
            icon={<Globe size={17} className="text-nodo-sub" />}
            label={pubState === 'done' ? 'En catálogo' : pubState === 'error' ? 'Reintentar publicación' : 'Publicar en catálogo'}
            disabled={pubState === 'loading' || pubState === 'done'}
            onClick={handlePublishCatalog}
            right={
              pubState === 'loading' ? <Loader2 size={16} className="animate-spin text-nodo-dim shrink-0" />
              : pubState === 'done' ? <Check size={16} className="text-nodo-success-tx shrink-0" />
              : pubState === 'error' ? <AlertTriangle size={16} className="text-nodo-danger-tx shrink-0" />
              : <span className="w-4 shrink-0" />
            }
          />

          <div className="h-px bg-nodo-line my-1.5" />

          {prevStatus && (
            <ActionRow
              icon={<Undo2 size={17} className="text-nodo-sub" />}
              label={isClosed ? 'Reabrir' : `Volver a ${STATUS_LABEL[prevStatus]}`}
              disabled={advancing}
              onClick={() => { handleGoBack(); setShowActions(false); }}
            />
          )}
          {status === 'cancelado' && (
            <ActionRow
              icon={<RotateCcw size={17} className="text-nodo-sub" />}
              label="Reactivar cotización"
              disabled={advancing}
              onClick={() => { handleReactivar(); setShowActions(false); }}
            />
          )}
          {!isClosed && status !== 'entregado' && (
            confirmCancel ? (
              <div className="flex items-center gap-2 px-2 py-2">
                <span className="flex-1 text-xs font-bold text-nodo-danger-tx">¿Cancelar este pedido?</span>
                <button
                  onClick={() => setConfirmCancel(false)}
                  className="h-9 px-3 rounded-xl bg-nodo-inset text-nodo-sub text-xs font-bold active:scale-95 transition-transform"
                >
                  Conservar
                </button>
                <button
                  onClick={() => { handleCancel(); setShowActions(false); setConfirmCancel(false); }}
                  disabled={advancing}
                  className="h-9 px-3 rounded-xl bg-nodo-danger-tx text-white text-xs font-black flex items-center gap-1 active:scale-95 transition-transform disabled:opacity-40"
                >
                  {advancing ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} Cancelar
                </button>
              </div>
            ) : (
              <ActionRow
                icon={<X size={17} className="text-nodo-danger-tx" />}
                label="Cancelar pedido"
                danger
                right={<span className="w-4 shrink-0" />}
                onClick={() => setConfirmCancel(true)}
              />
            )
          )}
        </div>
      </BottomSheet>

      <LogisticsSheet
        cotizacion={cotizacion}
        open={showLogistics}
        onClose={() => setShowLogistics(false)}
        onSaved={onUpdate}
      />
      <EditSheet
        cotizacion={cotizacion}
        open={showEdit}
        onClose={() => setShowEdit(false)}
        onSaved={onUpdate}
      />
      <ShareSheet
        open={showShare}
        onClose={() => setShowShare(false)}
        url={trackingUrl}
        productName={cotizacion.product_name}
        clienteName={cotizacion.cliente?.name}
        clientePhone={cotizacion.cliente?.phone}
      />
    </>
  );
}

// ── FilterChip ────────────────────────────────────────────────────────────────

function FilterChip({
  label, count, active, onClick, statusCls,
}: {
  label: string; count: number; active: boolean; onClick: () => void; statusCls?: string;
}) {
  const activeClass = statusCls ? `border ${statusCls}` : 'bg-nodo-ink text-nodo-canvas';
  const inactiveClass = 'bg-nodo-inset text-nodo-sub hover:bg-nodo-raised';
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold
                  transition-all active:scale-[0.96] flex items-center gap-1.5
                  ${active ? activeClass : inactiveClass}`}
    >
      {label}
      {count > 0 && (
        <span className={`text-xs px-1.5 py-0.5 rounded-full tabular-nums
                          ${active ? 'bg-white/30 dark:bg-black/20' : 'bg-nodo-card'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ hasAny, onNew }: { hasAny: boolean; onNew?: () => void }) {
  return (
    <div className="nodo-card p-10 text-center">
      <div className="w-20 h-20 mx-auto mb-4 rounded-3xl flex items-center justify-center"
        style={{ background: 'var(--nodo-iris-soft)' }}>
        <Package2 className="w-10 h-10 text-nodo-sub" />
      </div>
      <p className="text-lg font-bold text-nodo-ink mb-1">
        {hasAny ? 'Sin resultados' : 'Aún no hay cotizaciones'}
      </p>
      <p className="text-sm text-nodo-sub mb-5">
        {hasAny
          ? 'Prueba con otro filtro o búsqueda'
          : 'Usa la calculadora y guarda tu primera cotización'}
      </p>
      {!hasAny && onNew && (
        <button
          onClick={onNew}
          className="inline-flex items-center gap-2 px-5 h-12 rounded-full font-bold text-sm
                     shadow-lg active:scale-[0.97] transition-transform"
          style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}
        >
          <Calculator className="w-4 h-4" />
          Ir a la calculadora
        </button>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const ALL_COT_STATUSES: CotizacionStatus[] = [
  'cotizado', 'confirmado', 'comprado', 'en_transito', 'entregado', 'pagado', 'cancelado',
];

const isClosedCot = (c: Cotizacion) => {
  const s = displayStatus(c.status);
  return s === 'cancelado' || s === 'pagado';
};

export function CotizacionesTab({ onNew }: { onNew?: () => void }) {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState<CotizacionStatus | 'todos'>('todos');
  const [viewMode, setViewMode]         = useState<'lista' | 'paquetes'>('lista');
  const [showFilters, setShowFilters]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await importacionesService.list();
      setCotizaciones(data);
    } catch {
      setError('No se pudieron cargar las cotizaciones.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleUpdate(updated: Cotizacion) {
    setCotizaciones(prev => prev.map(c => c.id === updated.id ? updated : c));
  }

  const statusCounts = cotizaciones.reduce((acc, c) => {
    const s = displayStatus(c.status);
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {} as Partial<Record<CotizacionStatus, number>>);

  const filtered = cotizaciones
    .filter(c => {
      const q = search.toLowerCase();
      const matchSearch = !q
        || c.product_name.toLowerCase().includes(q)
        || (c.cliente?.name.toLowerCase().includes(q) ?? false);
      return matchSearch && (filterStatus === 'todos' || displayStatus(c.status) === filterStatus);
    })
    .sort((a, b) => Number(isClosedCot(a)) - Number(isClosedCot(b)));

  const activas   = cotizaciones.filter(c => !isClosedCot(c));
  const invertido = activas.reduce((s, c) => s + (resultField<number>(c, 'totalLandedCostGTQ') ?? 0), 0);
  const pendiente = activas.reduce((s, c) => s + (resultField<number>(c, 'salePriceGTQ') ?? 0), 0);
  const ganancia  = activas.reduce((s, c) => s + (resultField<number>(c, 'netProfitGTQ') ?? 0), 0);
  const margenAgregado = pendiente > 0 ? (ganancia / pendiente) * 100 : 0;

  const filterActive = filterStatus !== 'todos' || search.trim() !== '';
  const filterCount = (filterStatus !== 'todos' ? 1 : 0) + (search.trim() !== '' ? 1 : 0);

  return (
    <>
      {/* ── KPIs financieros (cotizaciones activas) ── */}
      {cotizaciones.length > 0 && (
        <>
          {/* Mobile: hero de ganancia + 2 cifras secundarias */}
          <div className="sm:hidden nodo-card p-4 flex flex-col gap-3">
            <div>
              <p className="nodo-section-label !mb-1">Ganancia proyectada</p>
              <p className="text-[34px] font-black text-nodo-ink tabular-nums tracking-tighter leading-none">
                Q{ganancia.toLocaleString('es-GT', { maximumFractionDigits: 0 })}
              </p>
              {ganancia > 0 && (
                <p className="text-xs font-bold text-nodo-sub mt-1">margen {margenAgregado.toFixed(0)}%</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-nodo-line">
              <div>
                <p className="text-[10px] font-semibold text-nodo-dim uppercase tracking-wider">Invertido</p>
                <p className="text-base font-black text-nodo-ink tabular-nums">
                  Q{invertido.toLocaleString('es-GT', { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-nodo-dim uppercase tracking-wider">Pendiente</p>
                <p className="text-base font-black text-nodo-ink tabular-nums">
                  Q{pendiente.toLocaleString('es-GT', { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </div>

          {/* Desktop: 3 tarjetas KPI */}
          <div className="hidden sm:grid grid-cols-3 gap-4">
            <MoneyKpi
              label="Invertido"
              value={invertido}
              sub={`${activas.length} ${activas.length === 1 ? 'cotización activa' : 'cotizaciones activas'}`}
              chart="none"
            />
            <MoneyKpi
              label="Pendiente"
              value={pendiente}
              sub="por cobrar"
              chart="none"
            />
            <MoneyKpi
              label="Ganancia"
              value={ganancia}
              sub={ganancia > 0 ? `margen ${margenAgregado.toFixed(0)}%` : 'proyectada'}
              chart="none"
            />
          </div>
        </>
      )}

      {/* ── Toolbar: vista (Lista | Paquetes) + filtros (mobile) ── */}
      <div className="flex items-center gap-2">
        <SegmentedControl
          options={[
            { value: 'lista',    label: 'Lista',    icon: <List size={14} /> },
            { value: 'paquetes', label: 'Paquetes', icon: <Boxes size={14} /> },
          ]}
          value={viewMode}
          onChange={v => setViewMode(v as typeof viewMode)}
          size="sm"
          className="sm:w-[260px]"
        />
        {viewMode === 'lista' && (
          <button
            onClick={() => setShowFilters(true)}
            className={`xl:hidden relative ml-auto h-10 px-3.5 rounded-2xl border-2 flex items-center gap-1.5
                       active:scale-95 transition-transform shrink-0
                       ${filterActive
                         ? 'bg-nodo-ink text-nodo-canvas border-nodo-ink'
                         : 'bg-nodo-card text-nodo-ink border-nodo-line'}`}
          >
            <SlidersHorizontal size={14} />
            <span className="text-xs font-bold">Filtrar</span>
            {filterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-nodo-canvas text-nodo-ink text-[9px] font-black
                               flex items-center justify-center tabular-nums">
                {filterCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* ── Vista Paquetes ── */}
      {viewMode === 'paquetes' && (
        <div className="min-w-0">
          {error && (
            <div className="bg-nodo-danger-bg border border-nodo-danger-bd rounded-2xl px-4 py-3 mb-4
                            flex items-center gap-3 text-sm text-nodo-danger-tx">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="flex-1 font-semibold">{error}</span>
              <button onClick={load} className="text-xs font-bold underline shrink-0">Reintentar</button>
            </div>
          )}
          <PaquetesBoard cotizaciones={cotizaciones} onChanged={load} />
        </div>
      )}

      {/* ── Vista Lista ── */}
      {viewMode === 'lista' && (
      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5 items-start">

        {/* ── Panel de control (solo desktop, sticky) — en mobile va en el BottomSheet "Filtrar" ── */}
        <div className="hidden xl:flex nodo-card p-4 flex-col gap-4 xl:sticky xl:top-4">

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-nodo-dim pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar producto o cliente"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="nodo-input"
              style={{ paddingLeft: '2.75rem', paddingRight: '2.75rem' }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-nodo-raised
                           flex items-center justify-center active:scale-90 transition-transform"
              >
                <X className="w-3.5 h-3.5 text-nodo-sub" />
              </button>
            )}
          </div>

          {/* Filter chips — scroll horizontal en mobile, wrap en desktop */}
          <div className="overflow-x-auto scrollbar-none -mx-1 xl:mx-0 xl:overflow-visible">
            <div className="flex gap-2 px-1 pb-1 w-max xl:w-auto xl:flex-wrap xl:px-0">
              <FilterChip
                label="Todas"
                count={cotizaciones.length}
                active={filterStatus === 'todos'}
                onClick={() => setFilterStatus('todos')}
              />
              {ALL_COT_STATUSES.map(s => (
                <FilterChip
                  key={s}
                  label={STATUS_LABEL[s] ?? s}
                  count={statusCounts[s] ?? 0}
                  active={filterStatus === s}
                  statusCls={STATUS_CONFIG[s].cls}
                  onClick={() => setFilterStatus(filterStatus === s ? 'todos' : s)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Lista de cotizaciones ── */}
        <div className="flex flex-col gap-4 min-w-0">

          {error && (
            <div className="bg-nodo-danger-bg border border-nodo-danger-bd rounded-2xl px-4 py-3
                            flex items-center gap-3 text-sm text-nodo-danger-tx">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="flex-1 font-semibold">{error}</span>
              <button onClick={load} className="text-xs font-bold underline shrink-0">Reintentar</button>
            </div>
          )}

          {loading ? (
            <div className="nodo-spinner-container flex-col gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
              <p className="text-sm text-nodo-dim">Cargando cotizaciones…</p>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState hasAny={cotizaciones.length > 0} onNew={onNew} />
          ) : (
            <>
              <div className="flex items-baseline justify-between px-1">
                <p className="nodo-section-label !mb-0">
                  {filterStatus === 'todos' ? 'Todas las cotizaciones' : STATUS_LABEL[filterStatus]}
                </p>
                <span className="text-xs font-bold text-nodo-dim tabular-nums">
                  {filtered.length} {filtered.length === 1 ? 'cotización' : 'cotizaciones'}
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
                {filtered.map(c => (
                  <div key={c.id} className={isClosedCot(c) ? 'opacity-60' : undefined}>
                    <CotizacionCard cotizacion={c} onUpdate={handleUpdate} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      )}

      {onNew && (
        <ImportFab icon={<Plus size={20} strokeWidth={2.5} />} label="Cotización" onPress={onNew} />
      )}

      {/* ── BottomSheet "Buscar y filtrar" (mobile/tablet) ── */}
      <BottomSheet
        open={showFilters}
        onClose={() => setShowFilters(false)}
        title="Buscar y filtrar"
        footer={
          <button
            onClick={() => setShowFilters(false)}
            className="nodo-btn-primary"
          >
            Ver {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-nodo-dim pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar producto o cliente"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="nodo-input"
              style={{ paddingLeft: '2.75rem', paddingRight: '2.75rem' }}
              autoFocus
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-nodo-raised
                           flex items-center justify-center active:scale-90 transition-transform"
              >
                <X className="w-3.5 h-3.5 text-nodo-sub" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterChip
              label="Todas"
              count={cotizaciones.length}
              active={filterStatus === 'todos'}
              onClick={() => setFilterStatus('todos')}
            />
            {ALL_COT_STATUSES.map(s => (
              <FilterChip
                key={s}
                label={STATUS_LABEL[s] ?? s}
                count={statusCounts[s] ?? 0}
                active={filterStatus === s}
                statusCls={STATUS_CONFIG[s].cls}
                onClick={() => setFilterStatus(filterStatus === s ? 'todos' : s)}
              />
            ))}
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
