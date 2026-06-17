import { useMemo, useState } from 'react';
import { Check, Loader2, Minus, Package, Plus } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ventasService, type StoreProduct, type WasteReason } from '@/services/ventas.service';

interface Props {
  open: boolean;
  onClose: () => void;
  products: StoreProduct[];
  onDone: (successMsg: string) => Promise<void>;
  onError: (msg: string) => void;
}

type Mode = 'venta' | 'merma';

const MODE_OPTS = [
  { value: 'venta' as Mode, label: 'Venta' },
  { value: 'merma' as Mode, label: 'Merma' },
];

const REASONS: { value: WasteReason; label: string }[] = [
  { value: 'se_arruino', label: 'Se arruinó' },
  { value: 'perdida', label: 'Pérdida' },
  { value: 'correccion', label: 'Corrección' },
];

const money = (n: number) =>
  'Q' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function VentaRapidaSheet({ open, onClose, products, onDone, onError }: Props) {
  const [mode, setMode] = useState<Mode>('venta');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [priceOverride, setPriceOverride] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<WasteReason>('se_arruino');
  const [saving, setSaving] = useState(false);

  const available = useMemo(() => products.filter(p => p.available > 0), [products]);

  const lineQty = (id: string) => qty[id] ?? 0;
  const linePrice = (p: StoreProduct) => {
    const raw = priceOverride[p.id];
    if (raw === undefined || raw === '') return p.price;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n >= 0 ? n : p.price;
  };

  const { count, total } = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const p of available) {
      const q = lineQty(p.id);
      count += q;
      total += q * linePrice(p);
    }
    return { count, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, qty, priceOverride]);

  const reset = () => {
    setQty({});
    setPriceOverride({});
    setReason('se_arruino');
    setMode('venta');
  };

  const setProductQty = (id: string, value: number, max: number) => {
    setQty(prev => ({ ...prev, [id]: Math.max(0, Math.min(max, value)) }));
  };

  const handleSave = async () => {
    if (count === 0 || saving) return;
    setSaving(true);
    try {
      const items = available
        .filter(p => lineQty(p.id) > 0)
        .map(p => ({ product_id: p.id, qty: lineQty(p.id) }));

      if (mode === 'venta') {
        await ventasService.quickSale(
          items.map(i => {
            const p = available.find(x => x.id === i.product_id)!;
            const price = linePrice(p);
            return { ...i, unit_price: price !== p.price ? price : undefined };
          }),
        );
        await onDone(`Venta registrada — ${money(total)}`);
      } else {
        await ventasService.registerWaste(items, reason);
        await onDone('Merma registrada');
      }
      reset();
    } catch (err: any) {
      onError(err?.response?.data?.detail ?? 'No se pudo registrar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={() => { if (!saving) { reset(); onClose(); } }}
      title={mode === 'venta' ? 'Venta rápida' : 'Registrar merma'}
      footer={
        <button onClick={handleSave} disabled={count === 0 || saving} className="nodo-btn-primary">
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          {mode === 'venta'
            ? count > 0 ? `COBRAR ${money(total)}` : 'COBRAR'
            : count > 0 ? `DESCONTAR ${count}` : 'DESCONTAR'}
        </button>
      }
    >
      <div className="space-y-4 px-1">
        <SegmentedControl options={MODE_OPTS} value={mode} onChange={m => setMode(m)} size="sm" />

        {mode === 'merma' && (
          <div className="flex gap-2">
            {REASONS.map(r => (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                className={`flex-1 h-9 rounded-xl text-xs font-bold transition-colors ${
                  reason === r.value
                    ? 'bg-nodo-ink text-nodo-canvas'
                    : 'bg-nodo-inset border border-nodo-line text-nodo-sub'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {available.length === 0 ? (
          <div className="nodo-empty-state">
            <Package size={32} className="text-nodo-dim mb-2" />
            <p className="text-sm font-bold text-nodo-dim">No hay productos con stock disponible</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {available.map(p => {
              const q = lineQty(p.id);
              return (
                <div key={p.id} className="bg-nodo-inset border border-nodo-line rounded-2xl p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-nodo-ink truncate">{p.name}</p>
                      <p className="text-xs text-nodo-sub tabular-nums">{p.available} disponibles</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setProductQty(p.id, q - 1, p.available)}
                        className="w-9 h-9 rounded-xl bg-nodo-card border border-nodo-line flex items-center justify-center text-nodo-ink active:scale-90 transition-transform"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center text-sm font-black text-nodo-ink tabular-nums">{q}</span>
                      <button
                        onClick={() => setProductQty(p.id, q + 1, p.available)}
                        disabled={q >= p.available}
                        className="w-9 h-9 rounded-xl bg-nodo-ink flex items-center justify-center text-nodo-canvas active:scale-90 transition-transform disabled:opacity-30"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Precio editable por línea — solo en modo venta y con cantidad */}
                  {mode === 'venta' && q > 0 && (
                    <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-nodo-line">
                      <span className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">
                        Precio unitario
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-nodo-sub">Q</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={priceOverride[p.id] ?? String(p.price)}
                          onChange={e => setPriceOverride(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-24 h-9 px-2 bg-nodo-card border-2 border-nodo-line rounded-xl text-sm font-black text-nodo-ink text-right tabular-nums outline-none focus:border-nodo-line-s"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
