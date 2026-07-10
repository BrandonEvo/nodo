/**
 * CatalogoTab — Catálogo público del módulo Importaciones (vista del vendedor)
 * Adaptado de apps/personal-shopper/CatalogMode.tsx, nativo de importaciones.
 * Grid image-first + FAB (agregar Amazon/Manual) + header con compartir/reservas/ajustes.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus, Loader2, Trash2, Check, X, Eye, EyeOff, Share2, ExternalLink,
  Settings, Package, Globe, Bell, ChevronRight, ChevronLeft, Clock, AlertTriangle, Copy,
  PackageX, RotateCcw, MessageCircle, Sparkles, ShoppingCart, ImageIcon, Upload,
} from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ImportFab } from './ImportFab';
import { buildWhatsAppUrl } from '@/lib/utils';
import {
  importCatalogService,
  type ImportCatalogItem,
  type ImportCatalogSettings,
  type ImportReservation,
  type ReservationStatus,
} from '@/services/import_catalog.service';
// Amazon scrape es un endpoint genérico (/api/amazon/scrape); reusamos el wrapper.
import { shopperAmazonService, type AmazonProduct } from '@/services/shopper_amazon.service';
import { tenantMeService } from '@/services/tenantMe.service';
import { fileToResizedDataUrl } from '@/utils/image';
import { haptic } from '@/utils/haptic';
import {
  calculatePricing, DEFAULT_CONFIG, CATEGORY_DAI_RATE, fmtPct, suggestPrices,
  type ItemCategory,
} from './pricingEngine';

const fmt = (n: number) =>
  'Q ' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Liquid glass (iOS) — misma receta que la clase .liquid-glass de index.css:
// base traslúcida + reflejo especular en capas de background + borde de luz.
const glass: React.CSSProperties = {
  background:
    'linear-gradient(178deg, var(--nodo-glass-highlight) 0%, transparent 34%),'
    + 'radial-gradient(120% 80% at 12% -15%, rgba(255,255,255,0.16) 0%, transparent 52%),'
    + 'var(--nodo-glass-bg-strong)',
  backdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
  WebkitBackdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
  border: '1px solid var(--nodo-glass-border)',
  boxShadow:
    'inset 0 1px 0 var(--nodo-glass-highlight),'
    + 'inset 0 -8px 24px -12px var(--nodo-glass-edge),'
    + 'var(--nodo-shadow-card)',
};

// Resume una descripción larga a "lo importante": si viene en viñetas, deja las
// 2 primeras (recortadas); si es un párrafo, la primera oración o ~160 chars.
function summarizeDescription(text: string): string {
  const t = (text || '').trim();
  if (!t) return '';
  const lines = t.split('\n').map(l => l.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);
  if (lines.length > 1) {
    return lines.slice(0, 2)
      .map(b => (b.length > 90 ? b.slice(0, 88).trimEnd() + '…' : b))
      .map(b => `• ${b}`)
      .join('\n');
  }
  const one = lines[0] ?? t;
  const firstSentence = one.split(/(?<=[.!?])\s/)[0] ?? one;
  const base = firstSentence.length >= 40 ? firstSentence : one;
  return base.length > 160 ? base.slice(0, 158).trimEnd() + '…' : base;
}

const scarcityLabel = (avail: number): { text: string; cls: string } | null => {
  if (avail <= 0)  return { text: 'VENDIDO',     cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' };
  if (avail === 1) return { text: 'ÚLTIMA',       cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' };
  if (avail === 2) return { text: '🔥 2 quedan', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300' };
  if (avail === 3) return { text: '⚡ Solo 3',   cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300' };
  return null;
};

function KpiPill({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 flex-1 py-3" style={glass}>
      <p className={`text-2xl font-black tabular-nums ${accent}`}>{value}</p>
      <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-wider">{label}</p>
    </div>
  );
}

// ─── Product grid card (vendor) ───────────────────────────────────────────────

function CatalogGridCard({
  item, onEdit, onDelete, onTogglePublish, onSoldOne,
}: {
  item: ImportCatalogItem;
  onEdit: (i: ImportCatalogItem) => void;
  onDelete: (id: string) => void;
  onTogglePublish: (i: ImportCatalogItem) => void;
  onSoldOne: (i: ImportCatalogItem) => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  // Un ítem por encargo no tiene inventario: ni escasez ni "agotado" aplican.
  const mto       = item.is_made_to_order;
  const scarcity  = mto ? null : scarcityLabel(item.stock_available);
  const isSold    = !mto && item.stock_available <= 0;
  const isOffer   = item.is_offer;

  return (
    <div
      className={`rounded-3xl overflow-hidden flex flex-col transition-opacity ${!item.is_published ? 'opacity-55' : ''}`}
      style={glass}
    >
      <div className="relative bg-nodo-inset overflow-hidden" style={{ height: 130 }}>
        {item.image_url && !imgErr ? (
          <img src={item.image_url} alt={item.title}
            onError={() => setImgErr(true)}
            className="w-full h-full object-contain bg-white p-1.5" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={28} className="text-nodo-dim" />
          </div>
        )}

        {isOffer && (
          <div className="absolute top-2 left-2 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-500 text-white">
            🔥 OFERTA
          </div>
        )}

        <div className="absolute top-2 right-2">
          {item.is_published
            ? <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500 text-white">PUB</span>
            : <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-nodo-dim/60 text-white">OFF</span>
          }
        </div>
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-[13px] font-bold text-nodo-ink leading-snug line-clamp-2 flex-1">
          {item.title}
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          {item.price_gtq != null && (
            <span className="text-base font-black text-nodo-ink tabular-nums">{fmt(item.price_gtq)}</span>
          )}
          {isOffer && item.compare_at_price_gtq != null && (
            <span className="text-[11px] font-bold text-nodo-dim line-through tabular-nums">{fmt(item.compare_at_price_gtq)}</span>
          )}
          {scarcity && (
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${scarcity.cls}`}>
              {scarcity.text}
            </span>
          )}
          {mto ? (
            <span className="text-[9px] font-bold text-nodo-dim">📦 Por encargo</span>
          ) : !isSold && item.stock_available > 4 && (
            <span className="text-[10px] text-nodo-dim">{item.stock_available}</span>
          )}
        </div>

        <div className="flex gap-1.5 mt-auto pt-1">
          {/* "Vender 1" descuenta inventario: sólo tiene sentido si hay inventario. */}
          {!mto && !isSold && (
            <button onClick={() => { haptic.tap(); onSoldOne(item); }}
              className="flex-1 h-8 rounded-xl bg-nodo-inset text-nodo-sub text-[10px] font-bold
                         flex items-center justify-center gap-1 active:scale-95 transition-transform">
              <Check size={10} /> Vender 1
            </button>
          )}
          <button onClick={() => { haptic.tap(); onTogglePublish(item); }}
            className="h-8 w-8 rounded-xl bg-nodo-inset text-nodo-sub
                       flex items-center justify-center active:scale-95 transition-transform">
            {item.is_published ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
          <button onClick={() => { haptic.tap(); onEdit(item); }}
            className="h-8 w-8 rounded-xl bg-nodo-inset text-nodo-sub
                       flex items-center justify-center active:scale-95 transition-transform">
            <Plus size={12} className="rotate-45" />
          </button>
          <button onClick={() => { haptic.error(); onDelete(item.id); }}
            className="h-8 w-8 rounded-xl bg-nodo-danger-bg text-nodo-danger-tx
                       flex items-center justify-center active:scale-95 transition-transform">
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Chips de precio psicológico (Q199.99 / Q200 / Q250) desde el precio mínimo del margen.
function PricePicker({ min, current, onPick }: {
  min: number; current: number; onPick: (v: number) => void;
}) {
  const opts = suggestPrices(min);
  if (opts.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">Redondear a</span>
      {opts.map(p => {
        const active = Math.abs(p - current) < 0.005;
        return (
          <button key={p} type="button" onClick={() => { haptic.tap(); onPick(p); }}
            className={`px-2.5 h-7 rounded-full text-xs font-black tabular-nums transition-transform active:scale-95
                        ${active ? 'bg-nodo-ink text-nodo-canvas' : 'bg-nodo-inset text-nodo-ink'}`}>
            {fmt(p)}
          </button>
        );
      })}
    </div>
  );
}

// ─── Amazon import panel ──────────────────────────────────────────────────────

const EMPTY_COSTS = {
  weight: '1', category: 'ropa' as ItemCategory, margin: 35,
  useDeclared: false, declaredUsd: '',
};

function AmazonPanel({ onAdded }: { onAdded: (item: ImportCatalogItem) => void }) {
  const [url, setUrl]         = useState('');
  const [product, setProduct] = useState<AmazonProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Costos de importación (mismo motor que la calculadora del módulo)
  const [costs, setCosts]   = useState({ ...EMPTY_COSTS });
  const [costUsd, setCostUsd] = useState('');       // editable: corrige si el scrape no leyó el precio
  const [priceGtq, setPriceGtq] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  // Marketing: gancho + descripción (viñetas de Amazon como base editable)
  const [hook, setHook] = useState('');
  const [description, setDescription] = useState('');
  // Oferta por tiempo limitado
  const [isOffer, setIsOffer] = useState(false);
  const [compareAt, setCompareAt] = useState('');
  const [offerEnds, setOfferEnds] = useState('');

  useEffect(() => { inputRef.current?.focus(); }, []);

  const usd = Number(costUsd) || 0;
  const result = useMemo(() => calculatePricing({
    qty: 1,
    unitCostUSD: usd,
    declaredCostUSD: Number(costs.declaredUsd) || 0,
    useDeclaredValue: costs.useDeclared,
    totalWeightLbs: Number(costs.weight) || 0,
    itemCategory: costs.category,
    mode: 'margin',
    targetMargin: costs.margin,
    fixedSalePrice: 0,
  }, DEFAULT_CONFIG), [usd, costs]);

  // El precio sugerido sigue al cálculo, salvo que el usuario lo haya editado a mano.
  useEffect(() => {
    if (!priceTouched && product) {
      setPriceGtq(result.salePriceGTQ > 0 ? result.salePriceGTQ.toFixed(2) : '');
    }
  }, [result.salePriceGTQ, priceTouched, product]);

  const handleLookup = async () => {
    if (!url.trim()) return;
    haptic.tap();
    setLoading(true); setError(null); setProduct(null);
    setCosts({ ...EMPTY_COSTS });
    setPriceTouched(false);
    setHook(''); setIsOffer(false); setCompareAt(''); setOfferEnds('');
    try {
      const r = await shopperAmazonService.scrape(url.trim());
      setProduct(r);
      setCostUsd(r.price_usd != null ? String(r.price_usd) : '');
      setDescription(summarizeDescription(r.description ?? ''));
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(d ?? 'No se pudo obtener el producto.');
      haptic.error();
    } finally { setLoading(false); }
  };

  const handlePublish = async () => {
    if (!product) return;
    haptic.tap();
    setPublishing(true);
    try {
      const created = await importCatalogService.create({
        title: product.name ?? product.asin,
        hook: hook.trim() || null,
        description: description.trim() || null,
        price_gtq: priceGtq !== '' ? Number(priceGtq) : null,
        is_offer: isOffer,
        compare_at_price_gtq: isOffer && compareAt !== '' ? Number(compareAt) : null,
        offer_ends_at: isOffer && offerEnds ? offerEnds : null,
        // Por encargo: se compra en Amazon cuando el cliente aparta. No hay stock.
        is_made_to_order: true,
        is_published: true,
        source: 'amazon',
        amazon_url: product.url,
        amazon_asin: product.asin,
        image_url: product.image_url ?? null,
      });
      haptic.confirm();
      onAdded(created);
    } catch { haptic.error(); setError('No se pudo publicar.'); }
    finally { setPublishing(false); }
  };

  const setWeight = (delta: number) =>
    setCosts(c => ({ ...c, weight: String(Math.max(0.1, Number((Number(c.weight) + delta).toFixed(1)))) }));

  return (
    <div className="flex flex-col gap-4">
      <div className="p-4 rounded-2xl border" style={{
        background: 'rgba(245,158,11,0.06)',
        borderColor: 'rgba(245,158,11,0.2)',
      }}>
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 leading-relaxed">
          Pega el link de Amazon. Calculamos el costo con todo lo del módulo
          (peso, arancel, IVA, facturar menos) y te sugerimos el precio de venta.
        </p>
      </div>

      <div>
        <label className="nodo-label">Link o ASIN de Amazon</label>
        <div className="flex gap-2">
          <input ref={inputRef} type="url" value={url}
            onChange={e => { setUrl(e.target.value); setProduct(null); setError(null); }}
            onKeyDown={e => e.key === 'Enter' && handleLookup()}
            placeholder="https://amazon.com/dp/..."
            className="nodo-input flex-1" />
          <button onClick={handleLookup}
            disabled={!url.trim() || loading}
            className="h-12 px-4 rounded-2xl font-bold text-sm shrink-0 flex items-center gap-1.5
                       active:scale-95 transition-transform disabled:opacity-40"
            style={{ background: 'var(--nodo-iris)', color: 'white' }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Buscar'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-nodo-danger-bg border border-nodo-danger-bd
                        text-nodo-danger-tx text-xs font-bold px-3 py-2.5 rounded-2xl">
          <AlertTriangle size={14} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={12} /></button>
        </div>
      )}

      {loading && (
        <div className="p-6 rounded-3xl flex flex-col items-center gap-3" style={glass}>
          <Loader2 size={28} className="animate-spin text-nodo-sub" />
          <p className="text-sm font-bold text-nodo-dim text-center">
            Obteniendo producto…<br />
            <span className="text-xs font-normal">Puede tomar unos segundos</span>
          </p>
        </div>
      )}

      {product && !loading && (
        <div className="rounded-3xl overflow-hidden" style={glass}>
          {/* Preview producto */}
          <div className="flex gap-4 p-4">
            {product.image_url ? (
              <img src={product.image_url} alt={product.name ?? ''}
                className="w-24 h-24 rounded-2xl object-contain bg-white shrink-0" />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-nodo-inset flex items-center justify-center shrink-0">
                <Package size={28} className="text-nodo-dim" />
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="font-bold text-nodo-ink text-sm leading-snug line-clamp-3">
                {product.name ?? 'Sin título'}
              </p>
              <p className="text-[10px] font-mono text-nodo-dim">ASIN: {product.asin}</p>
            </div>
          </div>

          {/* ── Costos de importación ── */}
          <div className="px-4 pb-2 space-y-3 border-t border-nodo-line pt-3">
            <p className="nodo-section-label !mb-0">Costos de importación</p>

            {/* Costo real en USA — editable (corrige si el scrape no leyó el precio) */}
            <div>
              <label className="nodo-label">Costo real en USA (USD)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-nodo-dim pointer-events-none">$</span>
                <input type="number" inputMode="decimal" value={costUsd}
                  onChange={e => setCostUsd(e.target.value)}
                  placeholder="0.00" className="nodo-input-number nodo-input-prefixed" />
              </div>
              {usd <= 0 && (
                <p className="text-[10px] font-bold text-nodo-warn-tx mt-1">
                  No pudimos leer el precio de Amazon — escríbelo para calcular bien la ganancia.
                </p>
              )}
            </div>

            {/* Peso */}
            <div>
              <label className="nodo-label">Peso (lbs)</label>
              <div className="flex items-center h-12 bg-nodo-inset border-2 border-nodo-line rounded-2xl overflow-hidden">
                <button onClick={() => setWeight(-0.5)} className="h-full px-4 text-nodo-sub active:scale-90">−</button>
                <input type="number" inputMode="decimal" value={costs.weight}
                  onChange={e => setCosts(c => ({ ...c, weight: e.target.value }))}
                  className="flex-1 w-full text-center bg-transparent text-sm font-black text-nodo-ink tabular-nums outline-none
                             [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <button onClick={() => setWeight(0.5)} className="h-full px-4 text-nodo-sub active:scale-90">＋</button>
              </div>
            </div>

            {/* Categoría / DAI */}
            <div>
              <label className="nodo-label">Tipo de artículo (arancel DAI)</label>
              <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-nodo-inset rounded-xl">
                {(Object.keys(CATEGORY_DAI_RATE) as ItemCategory[]).map(cat => {
                  const active = costs.category === cat;
                  return (
                    <button key={cat} type="button"
                      onClick={() => setCosts(c => ({ ...c, category: cat }))}
                      className={`h-10 rounded-lg text-[11px] font-bold leading-tight flex flex-col items-center justify-center gap-0.5
                                  ${active ? 'bg-nodo-card text-nodo-ink shadow-sm' : 'text-nodo-sub'}`}>
                      <span>{cat === 'ropa' ? 'Ropa' : cat === 'repuestos' ? 'Repuestos' : 'Electrón.'}</span>
                      <span className="text-[9px] text-nodo-dim">{(CATEGORY_DAI_RATE[cat] * 100).toFixed(0)}%</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Facturar menos */}
            <button type="button"
              onClick={() => setCosts(c => ({ ...c, useDeclared: !c.useDeclared, declaredUsd: c.declaredUsd || String(usd) }))}
              className="flex items-center gap-3 p-2.5 bg-nodo-inset rounded-xl w-full text-left">
              <div className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${costs.useDeclared ? 'bg-nodo-ink' : 'bg-nodo-line'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${costs.useDeclared ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs font-bold text-nodo-ink flex-1">Facturar valor menor al courier</span>
              {result.taxSavingsGTQ > 0 && (
                <span className="text-[10px] font-black text-nodo-warn-tx">ahorro {fmt(result.taxSavingsGTQ)}</span>
              )}
            </button>
            {costs.useDeclared && (
              <div>
                <label className="nodo-label">Valor declarado (USD)</label>
                <input type="number" value={costs.declaredUsd}
                  onChange={e => setCosts(c => ({ ...c, declaredUsd: e.target.value }))}
                  placeholder="0.00" className="nodo-input-number" />
                {Number(costs.declaredUsd) > usd && (
                  <p className="text-[10px] font-bold text-nodo-danger-tx mt-1">No puede ser mayor al costo real (${usd.toFixed(2)}).</p>
                )}
              </div>
            )}
          </div>

          {/* ── Tu ganancia: la palanca (margen) pegada a su resultado y al precio ── */}
          <div className="px-4 pb-2 pt-3 space-y-3 border-t border-nodo-line">
            <p className="nodo-section-label !mb-0">Tu ganancia</p>

            {/* Margen */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="nodo-label !mb-0">Margen objetivo</label>
                <span className="text-sm font-black text-nodo-ink tabular-nums">{costs.margin}%</span>
              </div>
              <input type="range" min={0} max={80} step={1} value={costs.margin}
                onChange={e => setCosts(c => ({ ...c, margin: Number(e.target.value) }))}
                className="nodo-range w-full"
                style={{ background: `linear-gradient(to right, var(--nodo-iris-mid) ${(costs.margin / 80) * 100}%, var(--nodo-inset) ${(costs.margin / 80) * 100}%)` }} />
            </div>

            {/* Resumen del cálculo */}
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-nodo-inset p-3">
              <div className="text-center">
                <p className="text-[8px] font-bold text-nodo-dim uppercase tracking-wider">Costo total</p>
                <p className="text-sm font-black text-nodo-sub tabular-nums">{fmt(result.totalLandedCostGTQ)}</p>
              </div>
              <div className="text-center">
                <p className="text-[8px] font-bold text-nodo-dim uppercase tracking-wider">Precio sug.</p>
                <p className="text-sm font-black text-nodo-ink tabular-nums">{fmt(result.salePriceGTQ)}</p>
              </div>
              <div className="text-center">
                <p className="text-[8px] font-bold text-nodo-dim uppercase tracking-wider">Ganancia</p>
                <p className="text-sm font-black tabular-nums" style={{ color: 'var(--nodo-iris)' }}>{fmt(result.netProfitGTQ)}</p>
              </div>
            </div>

            {/* Precio final (editable) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="nodo-label !mb-0">Tu precio para clientes</label>
                {priceTouched && (
                  <button onClick={() => { setPriceTouched(false); }}
                    className="text-[10px] font-bold text-nodo-sub underline">usar sugerido</button>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-nodo-dim pointer-events-none">Q</span>
                <input type="number" inputMode="decimal" value={priceGtq}
                  onChange={e => { setPriceTouched(true); setPriceGtq(e.target.value); }}
                  placeholder="0.00" className="nodo-input-number nodo-input-prefixed" />
              </div>
              <div className="pt-2">
                <PricePicker min={result.salePriceGTQ} current={Number(priceGtq)}
                  onPick={p => { setPriceTouched(true); setPriceGtq(p.toFixed(2)); }} />
              </div>
              <p className="text-[10px] text-nodo-dim pt-1.5">
                Margen real {fmtPct(priceGtq !== '' && Number(priceGtq) > 0
                  ? ((Number(priceGtq) - result.totalLandedCostGTQ) / Number(priceGtq)) * 100
                  : 0)} · cambio Q{DEFAULT_CONFIG.exchangeRate}/$
              </p>
            </div>

            {/* Oferta por tiempo limitado */}
            <button type="button" onClick={() => setIsOffer(o => !o)}
              className="flex items-center gap-3 p-2.5 bg-nodo-inset rounded-xl w-full text-left">
              <div className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${isOffer ? 'bg-nodo-ink' : 'bg-nodo-line'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isOffer ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs font-bold text-nodo-ink flex-1">🔥 Oferta por tiempo limitado</span>
            </button>
            {isOffer && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="nodo-label">Precio normal (tachado)</label>
                  <input type="number" inputMode="decimal" value={compareAt}
                    onChange={e => setCompareAt(e.target.value)}
                    placeholder="0.00" className="nodo-input-number" />
                </div>
                <div>
                  <label className="nodo-label">Termina</label>
                  <input type="datetime-local" value={offerEnds}
                    onChange={e => setOfferEnds(e.target.value)} className="nodo-input" />
                </div>
                {compareAt !== '' && Number(compareAt) <= Number(priceGtq) && (
                  <p className="col-span-2 text-[10px] font-bold text-nodo-danger-tx">
                    El precio normal debe ser mayor a tu precio de oferta.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── Gancho de venta + descripción (viñetas de Amazon como base) ── */}
          <div className="px-4 pb-2 pt-3 space-y-3 border-t border-nodo-line">
            <p className="nodo-section-label !mb-0">Cómo se ve para el cliente</p>
            <div>
              <label className="nodo-label">Gancho de venta · 1 línea</label>
              <input type="text" value={hook} maxLength={80}
                onChange={e => setHook(e.target.value)}
                placeholder='Ej. "Adiós cara de desvelada"' className="nodo-input" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="nodo-label !mb-0">Descripción estratégica</label>
                {description.trim() && (
                  <button type="button" onClick={() => { haptic.tap(); setDescription(d => summarizeDescription(d)); }}
                    className="flex items-center gap-1 text-[11px] font-bold text-nodo-ink bg-nodo-inset border border-nodo-line rounded-full px-2.5 py-1 active:scale-95 transition-transform">
                    <Sparkles size={11} /> Resumir
                  </button>
                )}
              </div>
              <textarea value={description} maxLength={300} rows={3}
                onChange={e => setDescription(e.target.value)}
                placeholder="Beneficio + para quién es + cómo se usa. Corto y que venda."
                className="nodo-textarea" />
              <p className="text-[10px] text-nodo-dim font-medium mt-1">
                {product.description
                  ? 'Resumimos las viñetas de Amazon a lo esencial — «Resumir» las acorta aún más.'
                  : 'Amazon no trajo viñetas; escribe algo corto que venda.'}
                {' '}{description.length}/300
              </p>
            </div>
          </div>

          <div className="px-4 pb-4 space-y-2">
            <button onClick={handlePublish} disabled={publishing}
              className="w-full h-12 rounded-2xl font-black text-sm flex items-center justify-center gap-2
                         active:scale-[0.97] transition-transform disabled:opacity-40"
              style={{ background: 'var(--nodo-iris)', color: 'white' }}>
              {publishing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {publishing ? 'Publicando…' : 'Publicar en mi catálogo'}
            </button>
            <a href={product.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-xs text-nodo-dim font-semibold py-1">
              <ExternalLink size={11} /> Ver en Amazon
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reservas (bandeja + máquina de estados) ────────────────────────────────────

// Flujo "feliz": el vendedor avanza/retrocede de a un paso (todo reversible).
const HAPPY: ReservationStatus[] = ['pendiente', 'confirmada', 'comprada', 'en_camino', 'entregada'];

const STATE_UI: Record<string, { label: string; emoji: string; cls: string }> = {
  pendiente:     { label: 'Pendiente',     emoji: '🕗', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' },
  confirmada:    { label: 'Confirmada',    emoji: '✅', cls: 'bg-nodo-success-bg text-nodo-success-tx' },
  comprada:      { label: 'Comprada',      emoji: '🛒', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' },
  en_camino:     { label: 'En camino',     emoji: '✈️', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' },
  entregada:     { label: 'Entregada',     emoji: '🎉', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' },
  no_disponible: { label: 'No disponible', emoji: '😔', cls: 'bg-nodo-warn-bg text-nodo-warn-tx' },
  cancelada:     { label: 'Cancelada',     emoji: '✖️', cls: 'bg-nodo-danger-bg text-nodo-danger-tx' },
};

const REASON_CHIPS: { value: string; label: string }[] = [
  { value: 'agotado',          label: 'Se agotó' },
  { value: 'no_encontrado',    label: 'No lo conseguí' },
  { value: 'vendedor_cancelo', label: 'Otro motivo' },
];

function ReservasPanel({
  reservations, whatsappNumber, onChanged, onSuccess, onError,
}: {
  reservations: ImportReservation[];
  whatsappNumber: string | null;
  onChanged: () => Promise<void> | void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  // Marcado de "no disponible" inline (evita anidar BottomSheets).
  const [ndFor, setNdFor]       = useState<string | null>(null);
  const [ndReason, setNdReason] = useState('no_encontrado');
  const [ndNote, setNdNote]     = useState('');
  const [ndPick, setNdPick]     = useState<string | null>(null);
  const [ndSugg, setNdSugg]     = useState<ImportCatalogItem[]>([]);
  const [ndLoading, setNdLoading] = useState(false);

  const move = async (
    id: string, status: ReservationStatus, msg: string,
    extra?: { resolution?: string; resolution_note?: string | null; suggested_item_id?: string | null },
  ) => {
    haptic.tap();
    setBusy(id + status);
    try {
      await importCatalogService.updateReservation(id, { status, ...extra });
      onSuccess(msg); haptic.confirm();
      await onChanged();
    } catch (e) {
      haptic.error();
      onError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'No se pudo actualizar.');
    } finally { setBusy(null); }
  };

  const openNoDisp = async (r: ImportReservation) => {
    haptic.tap();
    setNdFor(r.id); setNdReason('no_encontrado'); setNdNote(''); setNdPick(null);
    setNdSugg([]); setNdLoading(true);
    try { setNdSugg(await importCatalogService.reservationSuggestions(r.id)); }
    catch { /* sin sugerencias */ }
    finally { setNdLoading(false); }
  };

  const confirmNoDisp = async (id: string) => {
    await move(id, 'no_disponible', 'Marcado como no disponible', {
      resolution: ndReason, resolution_note: ndNote.trim() || null, suggested_item_id: ndPick,
    });
    setNdFor(null);
  };

  const notifyClient = (r: ImportReservation) => {
    if (!whatsappNumber || !r.order_token) return;
    haptic.tap();
    const link = `${window.location.origin}/mi-pedido/${r.order_token}`;
    const msg = `Hola ${r.client_name} 👋 Lamentamos avisarte que no pudimos conseguir *${r.item_title}*. `
      + `Te dejamos opciones parecidas para cambiarlo aquí: ${link}`;
    window.open(buildWhatsAppUrl(msg, r.client_phone), '_blank', 'noopener');
    importCatalogService.markReservationNotified(r.id).then(() => onChanged()).catch(() => {});
  };

  if (reservations.length === 0) return (
    <div className="flex flex-col items-center py-16 text-center gap-3">
      <div className="w-14 h-14 rounded-3xl bg-nodo-inset flex items-center justify-center">
        <Bell size={24} className="text-nodo-dim" />
      </div>
      <p className="text-sm font-bold text-nodo-dim">Sin reservas todavía</p>
      <p className="text-xs text-nodo-dim">Cuando un cliente aparte algo, aparecerá aquí</p>
    </div>
  );

  const attend  = reservations.filter(r => ['pendiente', 'confirmada', 'comprada', 'en_camino'].includes(r.status));
  const noDisp  = reservations.filter(r => r.status === 'no_disponible' && !r.resolved_by_substitute);
  const history = reservations.filter(r =>
    r.status === 'entregada' || r.status === 'cancelada' || (r.status === 'no_disponible' && r.resolved_by_substitute));

  const Track = ({ idx }: { idx: number }) => (
    <div className="flex items-center">
      {HAPPY.map((s, i) => (
        <div key={s} className={`flex items-center ${i < HAPPY.length - 1 ? 'flex-1' : ''}`}>
          <span className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: i <= idx ? 'var(--nodo-primary)' : 'var(--nodo-line)' }} />
          {i < HAPPY.length - 1 && (
            <span className="h-0.5 flex-1 rounded-full"
              style={{ background: i < idx ? 'var(--nodo-primary)' : 'var(--nodo-line)' }} />
          )}
        </div>
      ))}
    </div>
  );

  const card = (r: ImportReservation) => {
    const ui = STATE_UI[r.status] ?? { label: r.status, emoji: '', cls: 'bg-nodo-inset text-nodo-sub' };
    const idx = HAPPY.indexOf(r.status);
    const next = idx >= 0 && idx < HAPPY.length - 1 ? HAPPY[idx + 1] : null;
    const prev = idx > 0 ? HAPPY[idx - 1] : null;
    const isPending = r.status === 'pendiente';
    const isExpired = isPending && new Date(r.expires_at) <= new Date();
    const marking = ndFor === r.id;

    return (
      <div key={r.id} className="liquid-glass rounded-3xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          {/* Miniatura de referencia: si hay link de Amazon, la miniatura abre el producto */}
          {r.item_amazon_url ? (
            <a href={r.item_amazon_url} target="_blank" rel="noopener noreferrer" onClick={() => haptic.tap()}
              aria-label="Abrir en Amazon"
              className="w-14 h-14 rounded-2xl bg-white overflow-hidden shrink-0 flex items-center justify-center border border-nodo-line active:scale-95 transition-transform">
              {r.item_image_url
                ? <img src={r.item_image_url} alt={r.item_title ?? ''} className="w-full h-full object-contain p-1" />
                : <Package size={18} className="text-nodo-dim" />}
            </a>
          ) : r.item_image_url ? (
            <div className="w-14 h-14 rounded-2xl bg-white overflow-hidden shrink-0 flex items-center justify-center border border-nodo-line">
              <img src={r.item_image_url} alt={r.item_title ?? ''} className="w-full h-full object-contain p-1" />
            </div>
          ) : null}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-nodo-ink text-sm leading-snug line-clamp-2">{r.item_title}</p>
            <p className="text-xs text-nodo-sub mt-0.5">{r.client_name} · {r.client_phone}</p>
          </div>
          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 ${ui.cls}`}>{ui.emoji} {ui.label}</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="font-black text-nodo-ink">×{r.quantity}</span>
          {r.item_price_gtq != null && (
            <span className="font-bold text-nodo-ink tabular-nums">{fmt(r.item_price_gtq * r.quantity)}</span>
          )}
          {isPending && !isExpired && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
              <Clock size={10} />
              {new Date(r.expires_at).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {isExpired && <span className="font-bold text-nodo-danger-tx text-[10px]">Vencida</span>}
          {r.resolved_by_substitute && <span className="text-[10px] font-bold text-nodo-success-tx">Reemplazado ✓</span>}
        </div>

        {idx >= 0 && <Track idx={idx} />}

        {marking ? (
          <div className="space-y-2.5 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {REASON_CHIPS.map(c => (
                <button key={c.value} onClick={() => setNdReason(c.value)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${ndReason === c.value ? 'bg-nodo-ink text-nodo-canvas' : 'bg-nodo-inset text-nodo-sub'}`}>
                  {c.label}
                </button>
              ))}
            </div>
            <textarea value={ndNote} onChange={e => setNdNote(e.target.value)} rows={2} maxLength={300}
              placeholder="Mensaje para tu cliente (opcional): «te lo consigo pronto»…"
              className="nodo-textarea text-xs" />
            <div>
              <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5">Ofrecer algo parecido</p>
              {ndLoading ? (
                <div className="flex items-center gap-2 text-xs text-nodo-dim"><Loader2 size={12} className="animate-spin" /> Buscando…</div>
              ) : ndSugg.length === 0 ? (
                <p className="text-[11px] text-nodo-dim">Sin alternativas en stock. El cliente verá sólo tu aviso.</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {ndSugg.map(s => (
                    <button key={s.id} onClick={() => setNdPick(p => p === s.id ? null : s.id)}
                      className={`shrink-0 w-24 rounded-2xl overflow-hidden border-2 text-left ${ndPick === s.id ? 'border-nodo-ink' : 'border-nodo-line'}`}>
                      <div className="h-16 bg-white flex items-center justify-center">
                        {s.image_url ? <img src={s.image_url} alt={s.title} className="w-full h-full object-contain p-1" /> : <Package size={18} className="text-nodo-dim" />}
                      </div>
                      <p className="text-[10px] font-bold text-nodo-ink line-clamp-2 px-1.5 py-1">{s.title}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setNdFor(null)} className="flex-1 h-9 rounded-xl bg-nodo-inset text-nodo-sub text-xs font-bold">Cancelar</button>
              <button onClick={() => confirmNoDisp(r.id)} disabled={!!busy}
                className="flex-1 h-9 rounded-xl bg-nodo-warn-tx text-white text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-40">
                {busy === r.id + 'no_disponible' ? <Loader2 size={12} className="animate-spin" /> : <PackageX size={12} />} Confirmar
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Referencia de compra: durante la fase de compra, el dueño abre el
                producto exacto en Amazon para comprarlo. Destacado al confirmar. */}
            {r.item_amazon_url && ['pendiente', 'confirmada', 'comprada', 'en_camino'].includes(r.status) && (
              <a href={r.item_amazon_url} target="_blank" rel="noopener noreferrer" onClick={() => haptic.tap()}
                className={`flex items-center justify-center gap-1.5 h-9 rounded-xl text-xs font-black active:scale-[0.97] transition-transform
                  ${r.status === 'confirmada'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'}`}>
                <ShoppingCart size={13} /> Comprar en Amazon <ExternalLink size={11} />
              </a>
            )}

            {r.status === 'no_disponible' && (
              <>
                {r.resolution_note && (
                  <p className="text-xs font-medium text-nodo-warn-tx bg-nodo-warn-bg rounded-xl px-3 py-2">{r.resolution_note}</p>
                )}
                <div className="flex gap-2">
                  {whatsappNumber && r.order_token && (
                    <button onClick={() => notifyClient(r)}
                      className="flex-1 h-9 rounded-xl bg-emerald-500 text-white text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
                      <MessageCircle size={12} /> {r.client_notified_at ? 'Avisar otra vez' : 'Avisar al cliente'}
                    </button>
                  )}
                  <button onClick={() => move(r.id, 'confirmada', 'Reabierto ✓')} disabled={!!busy}
                    className="flex-1 h-9 rounded-xl bg-nodo-inset text-nodo-ink text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-40">
                    <RotateCcw size={12} /> Lo conseguí
                  </button>
                </div>
              </>
            )}

            {idx >= 0 && r.status !== 'entregada' && (
              <div className="flex items-center gap-2">
                {prev && (
                  <button onClick={() => move(r.id, prev, 'Regresado')} disabled={!!busy} aria-label="Volver"
                    className="h-9 w-9 rounded-xl bg-nodo-inset text-nodo-sub flex items-center justify-center shrink-0 active:scale-90 transition-transform disabled:opacity-40">
                    {busy === r.id + prev ? <Loader2 size={12} className="animate-spin" /> : <ChevronLeft size={14} />}
                  </button>
                )}
                {next && (
                  <button onClick={() => move(r.id, next, `→ ${STATE_UI[next].label}`)} disabled={!!busy}
                    className="flex-1 h-9 rounded-xl text-white text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-40"
                    style={{ background: 'var(--nodo-primary)' }}>
                    {busy === r.id + next ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    {STATE_UI[next].emoji} {STATE_UI[next].label}
                  </button>
                )}
                <button onClick={() => openNoDisp(r)} disabled={!!busy} aria-label="Marcar no disponible"
                  className="h-9 w-9 rounded-xl bg-nodo-warn-bg text-nodo-warn-tx flex items-center justify-center shrink-0 active:scale-90 transition-transform">
                  <PackageX size={14} />
                </button>
                <button onClick={() => move(r.id, 'cancelada', 'Cancelada')} disabled={!!busy} aria-label="Cancelar"
                  className="h-9 w-9 rounded-xl bg-nodo-danger-bg text-nodo-danger-tx flex items-center justify-center shrink-0 active:scale-90 transition-transform disabled:opacity-40">
                  {busy === r.id + 'cancelada' ? <Loader2 size={12} className="animate-spin" /> : <X size={14} />}
                </button>
              </div>
            )}

            {r.status === 'entregada' && (
              <button onClick={() => move(r.id, 'en_camino', 'Entrega deshecha')} disabled={!!busy}
                className="w-full h-8 rounded-xl bg-nodo-inset text-nodo-sub text-[11px] font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-40">
                <RotateCcw size={11} /> Deshacer entrega
              </button>
            )}
            {r.status === 'cancelada' && (
              <button onClick={() => move(r.id, 'pendiente', 'Reactivada')} disabled={!!busy}
                className="w-full h-8 rounded-xl bg-nodo-inset text-nodo-sub text-[11px] font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-40">
                <RotateCcw size={11} /> Reactivar
              </button>
            )}

            {r.order_token && (
              <a href={`/mi-pedido/${r.order_token}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between text-[11px] font-semibold text-nodo-dim pt-0.5">
                <span>Ver pedido del cliente</span><ChevronRight size={12} />
              </a>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {attend.length > 0 && (
        <div className="space-y-2.5">
          <p className="nodo-section-label">Por atender ({attend.length})</p>
          {attend.map(card)}
        </div>
      )}
      {noDisp.length > 0 && (
        <div className="space-y-2.5">
          <p className="nodo-section-label">No disponible · resolver ({noDisp.length})</p>
          {noDisp.map(card)}
        </div>
      )}
      {history.length > 0 && (
        <div className="space-y-2.5">
          <p className="nodo-section-label">Historial</p>
          {history.slice(0, 15).map(card)}
        </div>
      )}
    </div>
  );
}

// ─── Main CatalogoTab ─────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: '', hook: '', description: '', category: '', price_gtq: '', stock_total: '1',
  // Por encargo por defecto: es lo que hace el negocio el 95% de las veces. Sólo
  // cuando el vendedor afirma tener unidades en la mano el catálogo muestra escasez.
  is_made_to_order: true,
  is_published: true, amazon_url: '', notes: '',
  is_offer: false, compare_at_price: '', offer_ends: '',
};

// Categorías sugeridas para el datalist del formulario de publicación.
// Libre (el vendedor puede escribir otra); alimenta filtros y similitud.
const CATEGORY_SUGGESTIONS = [
  'Belleza', 'Cuidado personal', 'Tecnología', 'Hogar', 'Cocina',
  'Ropa', 'Calzado', 'Accesorios', 'Juguetes', 'Bebé',
  'Salud', 'Deportes', 'Mascotas', 'Papelería', 'Otros',
];

// Canales para atribución: cada uno genera el link con ?src= para saber de dónde
// llegó el cliente (se guarda en su ficha al apartar).
const SHARE_CHANNELS: { src: string; label: string; emoji: string }[] = [
  { src: 'instagram', label: 'Instagram',       emoji: '📸' },
  { src: 'facebook',  label: 'Facebook',        emoji: '👥' },
  { src: 'whatsapp',  label: 'Estado WhatsApp', emoji: '💬' },
  { src: 'tiktok',    label: 'TikTok',          emoji: '🎵' },
  { src: 'feria',     label: 'Feria / físico',  emoji: '🏬' },
];

export function CatalogoTab() {
  const [items, setItems]             = useState<ImportCatalogItem[]>([]);
  const [settings, setSettings]       = useState<ImportCatalogSettings | null>(null);
  const [reservations, setReservations] = useState<ImportReservation[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [aiBusy, setAiBusy]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState<string | null>(null);

  // Logo del negocio (Tenant.logo_url) — brandea el catálogo público. Se guarda
  // como data URI comprimido, sin storage externo.
  const [logoUrl, setLogoUrl]         = useState<string | null>(null);
  const [logoBusy, setLogoBusy]       = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [addMode, setAddMode]         = useState<'amazon' | 'manual'>('amazon');
  const [showReservas, setShowReservas] = useState(false);
  const [showConfig, setShowConfig]   = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [editingItem, setEditingItem] = useState<ImportCatalogItem | null>(null);
  const [form, setForm]               = useState({ ...EMPTY_FORM });
  const [settingsForm, setSettingsForm] = useState({
    business_name: '', whatsapp_number: '', delivery_days_min: '5', delivery_days_max: '7',
    trip_name: '', trip_close_at: '', trip_label: 'viaje', origin_label: 'desde USA 🇺🇸',
    bank_name: '', bank_account_holder: '', bank_account_number: '', bank_account_type: '',
  });

  const publicUrl = settings
    ? `${window.location.origin}/importa/${settings.public_token}`
    : null;
  // Palabra configurable para "viaje" (reflejada en labels/placeholders del form).
  const tripWord = settingsForm.trip_label.trim() || 'viaje';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogItems, cfg, reservs, tenant] = await Promise.all([
        importCatalogService.list(),
        importCatalogService.getSettings(),
        importCatalogService.listReservations(),
        tenantMeService.getMyTenant().catch(() => null),
      ]);
      setItems(catalogItems);
      setSettings(cfg);
      setReservations(reservs);
      setLogoUrl(tenant?.logo_url ?? null);
      setSettingsForm({
        business_name: cfg.business_name ?? '',
        whatsapp_number: cfg.whatsapp_number ?? '',
        delivery_days_min: String(cfg.delivery_days_min ?? 5),
        delivery_days_max: String(cfg.delivery_days_max ?? 7),
        trip_name: cfg.trip_name ?? '',
        trip_close_at: cfg.trip_close_at ? cfg.trip_close_at.slice(0, 16) : '',
        trip_label: cfg.trip_label ?? 'viaje',
        origin_label: cfg.origin_label ?? 'desde USA 🇺🇸',
        bank_name: cfg.bank_name ?? '',
        bank_account_holder: cfg.bank_account_holder ?? '',
        bank_account_number: cfg.bank_account_number ?? '',
        bank_account_type: cfg.bank_account_type ?? '',
      });
    } catch { setError('No se pudo cargar el catálogo.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Recarga solo las reservas — usada tras cambiar el estado de una reserva.
  const reloadReservations = useCallback(async () => {
    try {
      setReservations(await importCatalogService.listReservations());
    } catch { /* silent */ }
  }, []);

  // Auto-refresh reservas cada 30s
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await importCatalogService.listReservations();
        setReservations(r);
      } catch { /* silent */ }
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!success) return;
    const id = setTimeout(() => setSuccess(null), 2500);
    return () => clearTimeout(id);
  }, [success]);

  const openForm = (item?: ImportCatalogItem) => {
    haptic.tap();
    if (item) {
      setEditingItem(item);
      setForm({
        title: item.title, hook: item.hook ?? '', description: item.description ?? '',
        category: item.category ?? '',
        price_gtq: item.price_gtq != null ? String(item.price_gtq) : '',
        stock_total: String(item.stock_total),
        is_made_to_order: item.is_made_to_order,
        is_published: item.is_published,
        amazon_url: item.amazon_url ?? '', notes: item.notes ?? '',
        is_offer: item.is_offer,
        compare_at_price: item.compare_at_price_gtq != null ? String(item.compare_at_price_gtq) : '',
        offer_ends: item.offer_ends_at ? item.offer_ends_at.slice(0, 16) : '',
      });
    } else {
      setEditingItem(null);
      setForm({ ...EMPTY_FORM });
      setAddMode('amazon');
    }
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    haptic.tap();
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        hook: form.hook.trim() || null,
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        price_gtq: form.price_gtq !== '' ? Number(form.price_gtq) : null,
        is_offer: form.is_offer,
        compare_at_price_gtq: form.is_offer && form.compare_at_price !== '' ? Number(form.compare_at_price) : null,
        offer_ends_at: form.is_offer && form.offer_ends ? form.offer_ends : null,
        is_made_to_order: form.is_made_to_order,
        stock_total: form.is_made_to_order ? 1 : Math.max(1, Number(form.stock_total) || 1),
        is_published: form.is_published,
        amazon_url: form.amazon_url.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editingItem) {
        const u = await importCatalogService.update(editingItem.id, payload);
        setItems(prev => prev.map(i => i.id === editingItem.id ? u : i));
        setSuccess('Producto actualizado');
      } else {
        const c = await importCatalogService.create(payload);
        setItems(prev => [c, ...prev]);
        setSuccess('Producto agregado');
      }
      haptic.confirm();
      setShowForm(false);
    } catch { haptic.error(); setError('No se pudo guardar.'); }
    finally { setSaving(false); }
  };

  const handleGenerateCopy = async () => {
    if (!form.title.trim() || aiBusy) return;
    haptic.tap();
    setAiBusy(true);
    try {
      const copy = await importCatalogService.generateCopy({
        title: form.title.trim(),
        category: form.category.trim() || null,
        notes: form.notes.trim() || null,
      });
      setForm(f => ({
        ...f,
        hook: copy.hook || f.hook,
        description: copy.description || f.description,
      }));
      haptic.done();
    } catch {
      haptic.error();
      setError('No se pudo generar el texto con IA.');
    } finally { setAiBusy(false); }
  };

  const handleToggle = async (item: ImportCatalogItem) => {
    haptic.tap();
    const u = await importCatalogService.update(item.id, { is_published: !item.is_published });
    setItems(prev => prev.map(i => i.id === item.id ? u : i));
    setSuccess(u.is_published ? 'Publicado' : 'Ocultado');
  };

  const handleSoldOne = async (item: ImportCatalogItem) => {
    haptic.tap();
    const newSold = Math.min(item.stock_sold + 1, item.stock_total);
    const u = await importCatalogService.update(item.id, { stock_sold: newSold });
    setItems(prev => prev.map(i => i.id === item.id ? u : i));
    const rem = u.stock_available;
    setSuccess(rem <= 0 ? `"${item.title.slice(0, 20)}" agotado` : `Vendido 1 · quedan ${rem}`);
  };

  const handleDelete = async (id: string) => {
    haptic.error();
    await importCatalogService.remove(id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';   // permite re-subir el mismo archivo
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError('La imagen es muy grande (máx. 8 MB).'); return; }
    haptic.tap();
    setLogoBusy(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file, { maxSize: 320 });
      await tenantMeService.updateConfig({ logo_url: dataUrl });
      setLogoUrl(dataUrl);
      setSuccess('Logo actualizado');
      haptic.confirm();
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'No se pudo subir el logo.');
    } finally { setLogoBusy(false); }
  };

  const handleRemoveLogo = async () => {
    haptic.tap();
    setLogoBusy(true);
    try {
      await tenantMeService.updateConfig({ logo_url: '' });
      setLogoUrl(null);
    } catch { setError('No se pudo quitar el logo.'); }
    finally { setLogoBusy(false); }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    haptic.tap();
    setSaving(true);
    try {
      const u = await importCatalogService.updateSettings({
        business_name: settingsForm.business_name.trim() || null,
        whatsapp_number: settingsForm.whatsapp_number.trim() || null,
        delivery_days_min: Math.max(0, Number(settingsForm.delivery_days_min) || 0),
        delivery_days_max: Math.max(0, Number(settingsForm.delivery_days_max) || 0),
        trip_name: settingsForm.trip_name.trim() || null,
        // Hora local del vendedor tal cual (los clientes están en la misma zona GT).
        trip_close_at: settingsForm.trip_close_at || null,
        // trip_label vacío → null (el cliente usa "viaje"). origin_label conserva
        // el string tal cual: "" (vacío) = ocultar la línea de origen.
        trip_label: settingsForm.trip_label.trim() || null,
        origin_label: settingsForm.origin_label.trim(),
        bank_name: settingsForm.bank_name.trim() || null,
        bank_account_holder: settingsForm.bank_account_holder.trim() || null,
        bank_account_number: settingsForm.bank_account_number.trim() || null,
        bank_account_type: settingsForm.bank_account_type.trim() || null,
      });
      setSettings(u);
      haptic.confirm();
      setSuccess('Guardado');
    } catch { haptic.error(); setError('Error al guardar.'); }
    finally { setSaving(false); }
  };

  const handleShare = async () => {
    if (!publicUrl) return;
    haptic.tap();
    const biz = settings?.business_name?.trim() || 'Mi catálogo';
    const tripWordShare = settings?.trip_label?.trim() || 'viaje';
    const originShare = settings?.origin_label ?? 'desde USA 🇺🇸';   // null→default, ''→ocultar
    const tripLine = settings?.trip_close_at
      ? `\n⏳ Aparta lo tuyo antes de que cierre el próximo ${tripWordShare}.`
      : '';
    const shareText =
      `🛍️ *${biz}* — Mira lo que traigo${originShare ? ` ${originShare}` : ''}\n`
      + `Aparta lo que quieras en segundos 👇${tripLine}`;
    if (navigator.share) {
      await navigator.share({ title: biz, text: shareText, url: publicUrl }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(`${shareText}\n${publicUrl}`);
      setSuccess('Mensaje copiado');
    }
  };

  const copyChannelLink = async (src: string, label: string) => {
    if (!publicUrl) return;
    haptic.tap();
    const link = `${publicUrl}?src=${src}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${settings?.business_name ?? 'Catálogo'} · ${label}`, url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setSuccess(`Link de ${label} copiado`);
      }
    } catch { /* compartir cancelado */ }
  };

  const pendingCount = reservations.filter(r => r.status === 'pendiente').length;
  const published    = items.filter(i => i.is_published);
  const drafts       = items.filter(i => !i.is_published);

  if (loading) return (
    <div className="nodo-spinner-container">
      <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
    </div>
  );

  return (
    <>
      {error && (
        <div className="fixed top-4 right-4 z-[70] flex items-center gap-3 max-w-xs
                        bg-nodo-danger-bg border border-nodo-danger-bd text-nodo-danger-tx
                        text-sm font-bold px-4 py-3 rounded-2xl shadow-lg">
          <X size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}
      {success && (
        <div className="fixed top-4 right-4 z-[70] flex items-center gap-3 max-w-xs
                        bg-nodo-success-bg border border-nodo-success-bd text-nodo-success-tx
                        text-sm font-bold px-4 py-3 rounded-2xl shadow-lg">
          <Check size={16} className="shrink-0" /><span>{success}</span>
        </div>
      )}

      <div className="flex flex-col gap-4">

        {/* KPI strip */}
        <div className="flex gap-2.5 rounded-3xl overflow-hidden" style={{ gap: '2px' }}>
          <KpiPill label="Publicados" value={published.length} accent="text-nodo-success-tx" />
          <KpiPill label="Reservas" value={pendingCount} accent={pendingCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-nodo-sub'} />
          <KpiPill label="Agotados" value={items.filter(i => i.is_published && !i.is_made_to_order && i.stock_available <= 0).length} accent="text-nodo-dim" />
        </div>

        {/* Acciones del catálogo — compartir (venta) · reservas · ajustes */}
        <div className="flex items-center gap-2">
          {publicUrl && (
            <button onClick={handleShare}
              className="flex-1 h-11 rounded-full bg-nodo-ink text-nodo-canvas font-bold text-sm
                         flex items-center justify-center gap-2 active:scale-[0.97] transition-transform">
              <Share2 size={16} /> Compartir catálogo
            </button>
          )}
          <button onClick={() => { haptic.tap(); setShowReservas(true); }}
            aria-label="Reservas"
            className="relative shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={glass}>
            <Bell size={17} className="text-nodo-sub" />
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
          <button onClick={() => { haptic.tap(); setShowConfig(true); }}
            aria-label="Ajustes"
            className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={glass}>
            <Settings size={17} className="text-nodo-sub" />
          </button>
        </div>

        {/* Grid de productos (image-first) */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center gap-3">
            <div className="w-16 h-16 rounded-3xl bg-nodo-inset flex items-center justify-center">
              <Globe size={28} className="text-nodo-dim" />
            </div>
            <p className="text-sm font-bold text-nodo-dim">Tu catálogo está vacío</p>
            <p className="text-xs text-nodo-dim">Toca <span className="font-black text-nodo-ink">＋ Producto</span> para agregar o importar de Amazon</p>
          </div>
        ) : (
          <>
            {published.length > 0 && (
              <div>
                <p className="nodo-section-label mb-2.5">Publicados ({published.length})</p>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {published.map(item => (
                    <CatalogGridCard key={item.id} item={item}
                      onEdit={openForm} onDelete={handleDelete}
                      onTogglePublish={handleToggle} onSoldOne={handleSoldOne} />
                  ))}
                </div>
              </div>
            )}
            {drafts.length > 0 && (
              <div>
                <p className="nodo-section-label mb-2.5">Borradores ({drafts.length})</p>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {drafts.map(item => (
                    <CatalogGridCard key={item.id} item={item}
                      onEdit={openForm} onDelete={handleDelete}
                      onTogglePublish={handleToggle} onSoldOne={handleSoldOne} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB: agregar producto (al alcance del pulgar) */}
      <ImportFab icon={<Plus size={20} strokeWidth={2.5} />} label="Producto" onPress={() => openForm()} />

      {/* ── BottomSheet: agregar / editar ── */}
      <BottomSheet open={showForm} onClose={() => setShowForm(false)}
        title={editingItem ? 'Editar producto' : 'Agregar producto'}
        footer={(editingItem || addMode === 'manual') ? (
          <button onClick={handleSave} disabled={saving || !form.title.trim()}
            className="w-full h-[52px] rounded-full font-black text-base flex items-center justify-center gap-2
                       shadow-lg active:scale-[0.97] transition-transform disabled:opacity-40"
            style={{ background: 'var(--nodo-iris)', color: 'white' }}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {editingItem ? 'Guardar cambios' : 'Agregar al catálogo'}
          </button>
        ) : undefined}>

        {!editingItem && (
          <SegmentedControl
            options={[
              { value: 'amazon', label: 'Desde Amazon', icon: <ExternalLink size={13} /> },
              { value: 'manual', label: 'Manual',       icon: <Plus size={13} /> },
            ]}
            value={addMode}
            onChange={v => setAddMode(v as 'amazon' | 'manual')}
            size="sm"
          />
        )}

        {(!editingItem && addMode === 'amazon') ? (
          <AmazonPanel onAdded={item => {
            setItems(prev => [item, ...prev]);
            setSuccess('Publicado en tu catálogo');
            haptic.done();
            setShowForm(false);
          }} />
        ) : (
          <>
            <div>
              <label className="nodo-label">Nombre del producto *</label>
              <input type="text" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Ej. Audífonos Sony WH-1000XM5" className="nodo-input" autoFocus />
            </div>
            {settings?.ai_copy_enabled && (
              <button type="button" onClick={handleGenerateCopy} disabled={!form.title.trim() || aiBusy}
                className="w-full h-11 rounded-2xl bg-nodo-primary-soft text-nodo-ink font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-40">
                {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {aiBusy ? 'Generando…' : 'Generar gancho y descripción con IA'}
              </button>
            )}
            <div>
              <label className="nodo-label">Gancho de venta · 1 línea (opcional)</label>
              <input type="text" value={form.hook} maxLength={80}
                onChange={e => setForm(f => ({ ...f, hook: e.target.value }))}
                placeholder='Ej. "Adiós cara de desvelada"' className="nodo-input" />
              <p className="text-[10px] text-nodo-dim font-medium mt-1">
                El beneficio en palabras del cliente — se ve en la tarjeta del catálogo.
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="nodo-label !mb-0">Descripción (opcional)</label>
                {form.description.trim() && (
                  <button type="button" onClick={() => { haptic.tap(); setForm(f => ({ ...f, description: summarizeDescription(f.description) })); }}
                    className="flex items-center gap-1 text-[11px] font-bold text-nodo-ink bg-nodo-inset border border-nodo-line rounded-full px-2.5 py-1 active:scale-95 transition-transform">
                    <Sparkles size={11} /> Resumir
                  </button>
                )}
              </div>
              <textarea value={form.description} maxLength={280} rows={3}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="1) ¿Qué hace por el cliente? 2) ¿Para quién es? 3) ¿Cómo se usa?"
                className="nodo-textarea" />
              <p className="text-[10px] text-nodo-dim font-medium mt-1 text-right tabular-nums">
                {form.description.length}/280
              </p>
            </div>
            <div>
              <label className="nodo-label">Categoría (opcional)</label>
              <input type="text" value={form.category} maxLength={40} list="import-cat-suggestions"
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="Ej. Belleza, Tecnología, Cocina…" className="nodo-input" />
              <datalist id="import-cat-suggestions">
                {CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}
              </datalist>
              <p className="text-[10px] text-nodo-dim font-medium mt-1">
                Ayuda a filtrar el catálogo y a sugerir reemplazos parecidos.
              </p>
            </div>
            <div>
              <label className="nodo-label">Precio Q</label>
              <input type="number" value={form.price_gtq}
                onChange={e => setForm(f => ({ ...f, price_gtq: e.target.value }))}
                placeholder="0.00" className="nodo-input-number" />
            </div>

            {/* Stock físico: opt-in explícito. Si el vendedor no lo marca, el ítem es
                por encargo y el catálogo no muestra "quedan N" ni se agota nunca. */}
            <button type="button"
              onClick={() => setForm(f => ({ ...f, is_made_to_order: !f.is_made_to_order }))}
              className="flex items-center gap-3 p-2.5 bg-nodo-inset rounded-xl w-full text-left">
              <div className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${!form.is_made_to_order ? 'bg-nodo-ink' : 'bg-nodo-line'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${!form.is_made_to_order ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs font-bold text-nodo-ink flex-1">📦 Tengo unidades limitadas</span>
            </button>
            {form.is_made_to_order ? (
              <p className="text-[10px] text-nodo-dim font-medium -mt-1">
                Se pide a nombre del cliente cuando aparta. El catálogo no muestra stock.
              </p>
            ) : (
              <div>
                <label className="nodo-label">Unidades que tenés</label>
                <input type="number" value={form.stock_total}
                  onChange={e => setForm(f => ({ ...f, stock_total: e.target.value }))}
                  min="1" className="nodo-input-number" />
                <p className="text-[10px] text-nodo-dim font-medium mt-1">
                  El catálogo avisará «quedan pocas» y marcará el producto como vendido al llegar a cero.
                </p>
              </div>
            )}

            {form.price_gtq !== '' && Number(form.price_gtq) > 0 && (
              <PricePicker min={Number(form.price_gtq)} current={Number(form.price_gtq)}
                onPick={p => setForm(f => ({ ...f, price_gtq: p.toFixed(2) }))} />
            )}

            {/* Oferta por tiempo limitado */}
            <button type="button" onClick={() => setForm(f => ({ ...f, is_offer: !f.is_offer }))}
              className="flex items-center gap-3 p-2.5 bg-nodo-inset rounded-xl w-full text-left">
              <div className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${form.is_offer ? 'bg-nodo-ink' : 'bg-nodo-line'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_offer ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs font-bold text-nodo-ink flex-1">🔥 Oferta por tiempo limitado</span>
            </button>
            {form.is_offer && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="nodo-label">Precio normal (tachado)</label>
                  <input type="number" inputMode="decimal" value={form.compare_at_price}
                    onChange={e => setForm(f => ({ ...f, compare_at_price: e.target.value }))}
                    placeholder="0.00" className="nodo-input-number" />
                </div>
                <div>
                  <label className="nodo-label">Termina</label>
                  <input type="datetime-local" value={form.offer_ends}
                    onChange={e => setForm(f => ({ ...f, offer_ends: e.target.value }))}
                    className="nodo-input" />
                </div>
              </div>
            )}

            <div>
              <label className="nodo-label">Link Amazon (opcional)</label>
              <input type="url" value={form.amazon_url}
                onChange={e => setForm(f => ({ ...f, amazon_url: e.target.value }))}
                placeholder="https://amazon.com/dp/..." className="nodo-input" />
            </div>
            <button type="button" onClick={() => setForm(f => ({ ...f, is_published: !f.is_published }))}
              className="flex items-center gap-3 p-3 bg-nodo-inset rounded-2xl w-full text-left">
              <div className={`w-10 h-6 rounded-full transition-colors relative shrink-0
                ${form.is_published ? 'bg-nodo-ink' : 'bg-nodo-line'}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
                  ${form.is_published ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-nodo-ink">
                  {form.is_published ? 'Publicar ahora' : 'Guardar como borrador'}
                </p>
                <p className="text-xs text-nodo-dim">
                  {form.is_published ? 'Visible en tu catálogo público' : 'Solo tú lo verás'}
                </p>
              </div>
            </button>
          </>
        )}
      </BottomSheet>

      {/* ── BottomSheet: reservas ── */}
      <BottomSheet open={showReservas} onClose={() => setShowReservas(false)}
        title={pendingCount > 0 ? `Reservas (${pendingCount})` : 'Reservas'}>
        <ReservasPanel
          reservations={reservations}
          whatsappNumber={settings?.whatsapp_number ?? null}
          onChanged={reloadReservations}
          onSuccess={setSuccess}
          onError={setError}
        />
      </BottomSheet>

      {/* ── BottomSheet: ajustes del catálogo ── */}
      <BottomSheet open={showConfig} onClose={() => setShowConfig(false)}
        title="Ajustes del catálogo"
        footer={
          <button onClick={handleSaveSettings} disabled={saving}
            className="w-full h-[52px] rounded-full font-black text-base flex items-center justify-center gap-2
                       shadow-lg active:scale-[0.97] transition-transform disabled:opacity-40"
            style={{ background: 'var(--nodo-iris)', color: 'white' }}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            Guardar
          </button>
        }>
        {settings && (
          <>
            {publicUrl && (
              <div>
                <label className="nodo-label">Link de tu catálogo</label>
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-xs text-nodo-sub bg-nodo-inset rounded-2xl px-3 py-3 font-mono truncate">
                    {publicUrl}
                  </p>
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 w-11 h-11 rounded-2xl bg-nodo-inset flex items-center justify-center active:scale-90">
                    <ExternalLink size={16} className="text-nodo-sub" />
                  </a>
                </div>
              </div>
            )}

            {/* Links por canal — mismo catálogo, distinto ?src= para saber de dónde llegan */}
            {publicUrl && (
              <div>
                <label className="nodo-label">Links por canal (para saber de dónde llegan)</label>
                <div className="grid grid-cols-2 gap-2">
                  {SHARE_CHANNELS.map(ch => (
                    <button key={ch.src} onClick={() => copyChannelLink(ch.src, ch.label)}
                      className="flex items-center gap-2 px-3 h-11 rounded-2xl bg-nodo-inset border border-nodo-line
                                 text-left active:scale-[0.97] transition-transform">
                      <span className="text-base leading-none">{ch.emoji}</span>
                      <span className="flex-1 text-xs font-bold text-nodo-ink truncate">{ch.label}</span>
                      <Copy size={13} className="text-nodo-dim shrink-0" />
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-nodo-dim font-medium mt-1.5">
                  Comparte el link de cada canal donde publiques. En Clientes verás con qué badge llegó cada quien.
                </p>
              </div>
            )}
            {/* ── Terminología del catálogo (para no “quemar” la palabra viaje) ── */}
            <div className="p-3.5 rounded-2xl border border-nodo-line bg-nodo-inset space-y-3">
              <p className="nodo-section-label !mb-0">✍️ Textos del catálogo</p>
              <div>
                <label className="nodo-label">¿Cómo llamas a tus cortes?</label>
                <input type="text" value={settingsForm.trip_label} maxLength={30}
                  onChange={e => setSettingsForm(f => ({ ...f, trip_label: e.target.value }))}
                  placeholder="viaje" className="nodo-input" />
                <p className="text-[10px] text-nodo-dim font-medium mt-1">
                  Reemplaza la palabra «viaje» en el banner y los mensajes. Ej.: pedido, corte, lote, entrega.
                </p>
              </div>
              <div>
                <label className="nodo-label">Línea de origen</label>
                <input type="text" value={settingsForm.origin_label} maxLength={60}
                  onChange={e => setSettingsForm(f => ({ ...f, origin_label: e.target.value }))}
                  placeholder="desde USA 🇺🇸" className="nodo-input" />
                <p className="text-[10px] text-nodo-dim font-medium mt-1">
                  Se muestra junto a la entrega y en el logo. Cámbiala (ej. «hecho en Guatemala 🇬🇹») o déjala vacía para ocultarla.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl border border-nodo-line bg-nodo-inset space-y-3">
              <p className="nodo-section-label !mb-0">🗓️ Próximo {tripWord} (countdown del catálogo)</p>
              <div>
                <label className="nodo-label">Nombre del {tripWord} (opcional)</label>
                <input type="text" value={settingsForm.trip_name} maxLength={100}
                  onChange={e => setSettingsForm(f => ({ ...f, trip_name: e.target.value }))}
                  placeholder={`Ej. ${tripWord.charAt(0).toUpperCase() + tripWord.slice(1)} de julio`} className="nodo-input" />
              </div>
              <div>
                <label className="nodo-label">Cierre de pedidos</label>
                <input type="datetime-local" value={settingsForm.trip_close_at}
                  onChange={e => setSettingsForm(f => ({ ...f, trip_close_at: e.target.value }))}
                  className="nodo-input" />
                <p className="text-[10px] text-nodo-dim font-medium mt-1">
                  Con fecha activa, el catálogo muestra el countdown y la barra de cupo apartado.
                  Déjalo vacío para ocultar el banner.
                </p>
              </div>
            </div>
            {/* ── Identidad de marca: logo + nombre ── */}
            <div className="p-3.5 rounded-2xl border border-nodo-line bg-nodo-inset space-y-3">
              <p className="nodo-section-label !mb-0">🎨 Marca de tu catálogo</p>
              <div>
                <label className="nodo-label">Logo del negocio</label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-nodo-card border border-nodo-line overflow-hidden flex items-center justify-center shrink-0">
                    {logoUrl
                      ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                      : <ImageIcon size={22} className="text-nodo-dim" />}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-2">
                    <button type="button" onClick={() => logoInputRef.current?.click()} disabled={logoBusy}
                      className="h-10 px-4 rounded-xl bg-nodo-ink text-nodo-canvas text-xs font-black flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform disabled:opacity-40">
                      {logoBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      {logoUrl ? 'Cambiar logo' : 'Subir logo'}
                    </button>
                    {logoUrl && !logoBusy && (
                      <button type="button" onClick={handleRemoveLogo}
                        className="h-8 px-3 rounded-xl bg-nodo-card border border-nodo-line text-nodo-sub text-[11px] font-bold active:scale-95 transition-transform">
                        Quitar logo
                      </button>
                    )}
                  </div>
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
                </div>
                <p className="text-[10px] text-nodo-dim font-medium mt-1.5">
                  PNG o JPG con fondo transparente para mejor resultado. Se optimiza solo y se ve en el encabezado de tu catálogo.
                </p>
              </div>
              <div>
                <label className="nodo-label">Nombre del negocio</label>
                <input type="text" value={settingsForm.business_name}
                  onChange={e => setSettingsForm(f => ({ ...f, business_name: e.target.value }))}
                  placeholder="Tu nombre o tienda" className="nodo-input" />
              </div>
            </div>
            <div>
              <label className="nodo-label">WhatsApp (para reservas)</label>
              <input type="tel" value={settingsForm.whatsapp_number}
                onChange={e => setSettingsForm(f => ({ ...f, whatsapp_number: e.target.value }))}
                placeholder="+502 5555-1234" className="nodo-input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="nodo-label">Entrega desde (días)</label>
                <input type="number" min="0" value={settingsForm.delivery_days_min}
                  onChange={e => setSettingsForm(f => ({ ...f, delivery_days_min: e.target.value }))}
                  className="nodo-input-number" />
              </div>
              <div>
                <label className="nodo-label">Entrega hasta (días)</label>
                <input type="number" min="0" value={settingsForm.delivery_days_max}
                  onChange={e => setSettingsForm(f => ({ ...f, delivery_days_max: e.target.value }))}
                  className="nodo-input-number" />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl border border-nodo-line bg-nodo-inset space-y-3">
              <p className="nodo-section-label !mb-0">🏦 Cuenta para depósitos</p>
              <p className="text-[10px] text-nodo-dim font-medium">
                Se muestra al cliente en el catálogo y en su pedido para que pueda pagar. Déjalo vacío para ocultarlo.
              </p>
              <div>
                <label className="nodo-label">Banco</label>
                <input type="text" value={settingsForm.bank_name} maxLength={80}
                  onChange={e => setSettingsForm(f => ({ ...f, bank_name: e.target.value }))}
                  placeholder="Ej. Banco Industrial" className="nodo-input" />
              </div>
              <div>
                <label className="nodo-label">A nombre de</label>
                <input type="text" value={settingsForm.bank_account_holder} maxLength={150}
                  onChange={e => setSettingsForm(f => ({ ...f, bank_account_holder: e.target.value }))}
                  placeholder="Titular de la cuenta" className="nodo-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="nodo-label">No. de cuenta</label>
                  <input type="text" inputMode="numeric" value={settingsForm.bank_account_number} maxLength={60}
                    onChange={e => setSettingsForm(f => ({ ...f, bank_account_number: e.target.value }))}
                    placeholder="000-000000-0" className="nodo-input" />
                </div>
                <div>
                  <label className="nodo-label">Tipo</label>
                  <select value={settingsForm.bank_account_type}
                    onChange={e => setSettingsForm(f => ({ ...f, bank_account_type: e.target.value }))}
                    className="nodo-select">
                    <option value="">—</option>
                    <option value="monetaria">Monetaria</option>
                    <option value="ahorro">Ahorro</option>
                  </select>
                </div>
              </div>
            </div>
          </>
        )}
      </BottomSheet>
    </>
  );
}
