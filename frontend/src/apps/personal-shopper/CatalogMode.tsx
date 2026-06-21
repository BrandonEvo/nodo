/**
 * CatalogMode — Gestión del catálogo (vista del vendedor)
 * Crystal Glass redesign · Grid-first · Thumb-zone CTAs
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Loader2, Trash2, Check, X, Eye, EyeOff, Share2, ExternalLink,
  Settings, Package, Globe, Bell, ChevronRight, Clock, AlertTriangle,
} from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import {
  shopperCatalogService,
  type ShopperCatalogItem,
  type ShopperCatalogSettings,
  type ShopperReservation,
} from '@/services/shopper_catalog.service';
import { shopperAmazonService, type AmazonProduct } from '@/services/shopper_amazon.service';
import { haptic } from '@/utils/haptic';

const fmt = (n: number) =>
  'Q ' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const USD_TO_GTQ = 7.75;

// ─── Glass helper ─────────────────────────────────────────────────────────────

const glass: React.CSSProperties = {
  background: 'var(--nodo-glass-bg-strong)',
  backdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
  WebkitBackdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
  border: '1px solid var(--nodo-glass-border)',
  boxShadow: 'var(--nodo-shadow-card)',
};

// ─── Scarcity label ───────────────────────────────────────────────────────────

const scarcityLabel = (avail: number): { text: string; cls: string } | null => {
  if (avail <= 0)  return { text: 'VENDIDO',     cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' };
  if (avail === 1) return { text: 'ÚLTIMA',       cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' };
  if (avail === 2) return { text: '🔥 2 quedan', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300' };
  if (avail === 3) return { text: '⚡ Solo 3',   cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300' };
  return null;
};

// ─── KPI pill ─────────────────────────────────────────────────────────────────

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
  item: ShopperCatalogItem;
  onEdit: (i: ShopperCatalogItem) => void;
  onDelete: (id: string) => void;
  onTogglePublish: (i: ShopperCatalogItem) => void;
  onSoldOne: (i: ShopperCatalogItem) => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const scarcity  = scarcityLabel(item.stock_available);
  const isSold    = item.stock_available <= 0;
  const isAmazon  = item.source === 'amazon';

  return (
    <div
      className={`rounded-3xl overflow-hidden flex flex-col transition-opacity ${!item.is_published ? 'opacity-55' : ''}`}
      style={glass}
    >
      {/* Imagen */}
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

        {/* Amazon badge */}
        {isAmazon && (
          <div className="absolute top-2 left-2 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-500 text-white">
            amazon
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-2 right-2">
          {item.is_published
            ? <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500 text-white">PUB</span>
            : <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-nodo-dim/60 text-white">OFF</span>
          }
        </div>
      </div>

      {/* Info + acciones */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-[13px] font-bold text-nodo-ink leading-snug line-clamp-2 flex-1">
          {item.title}
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          {item.price_gtq != null && (
            <span className="text-base font-black text-nodo-ink tabular-nums">{fmt(item.price_gtq)}</span>
          )}
          {scarcity && (
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${scarcity.cls}`}>
              {scarcity.text}
            </span>
          )}
          {!isSold && item.stock_available > 4 && (
            <span className="text-[10px] text-nodo-dim">{item.stock_available}</span>
          )}
        </div>

        {/* Quick actions — thumb zone bottom */}
        <div className="flex gap-1.5 mt-auto pt-1">
          {!isSold && (
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

// ─── Amazon import panel ──────────────────────────────────────────────────────

function AmazonPanel({ onAdded }: { onAdded: (item: ShopperCatalogItem) => void }) {
  const [url, setUrl]         = useState('');
  const [product, setProduct] = useState<AmazonProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [priceGtq, setPriceGtq] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleLookup = async () => {
    if (!url.trim()) return;
    haptic.tap();
    setLoading(true); setError(null); setProduct(null);
    try {
      const r = await shopperAmazonService.scrape(url.trim());
      setProduct(r);
      setPriceGtq(r.price_usd ? (r.price_usd * USD_TO_GTQ).toFixed(2) : '');
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
      const created = await shopperCatalogService.create({
        title: product.name ?? product.asin,
        price_gtq: priceGtq !== '' ? Number(priceGtq) : null,
        stock_total: 10,
        is_published: true,
        source: 'amazon',
        amazon_url: product.url,
        image_url: product.image_url ?? null,
      });
      haptic.confirm();
      onAdded(created);
    } catch { haptic.error(); setError('No se pudo publicar.'); }
    finally { setPublishing(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="p-4 rounded-2xl border" style={{
        background: 'rgba(245,158,11,0.06)',
        borderColor: 'rgba(245,158,11,0.2)',
      }}>
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 leading-relaxed">
          Pega el link de cualquier producto de Amazon.
          En segundos tendrás imagen, título y precio sugerido en tu catálogo.
        </p>
      </div>

      {/* Input */}
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
          {/* Product preview */}
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
              {product.price_usd != null && (
                <p className="text-xs text-nodo-sub">
                  USD ${product.price_usd.toFixed(2)} en Amazon
                </p>
              )}
              <p className="text-[10px] font-mono text-nodo-dim">ASIN: {product.asin}</p>
            </div>
          </div>

          {/* Precio para el cliente */}
          <div className="px-4 pb-4 space-y-1">
            <label className="nodo-label">Tu precio para clientes (Q)</label>
            <input type="number" value={priceGtq}
              onChange={e => setPriceGtq(e.target.value)}
              placeholder="0.00" className="nodo-input-number" />
            {product.price_usd != null && (
              <p className="text-[10px] text-nodo-dim">
                ≈ Q {(product.price_usd * USD_TO_GTQ).toFixed(2)} al cambio (USD × {USD_TO_GTQ})
              </p>
            )}
          </div>

          {/* Publish CTA */}
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

// ─── Reservas panel ───────────────────────────────────────────────────────────

const STATUS_META: Record<string, { cls: string; label: string }> = {
  pendiente:  { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300', label: 'Pendiente' },
  confirmada: { cls: 'bg-nodo-success-bg text-nodo-success-tx', label: 'Confirmada' },
  completada: { cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300', label: 'Completada' },
  cancelada:  { cls: 'bg-nodo-danger-bg text-nodo-danger-tx', label: 'Cancelada' },
};

function ReservasPanel({
  reservations, onUpdate,
}: {
  reservations: ShopperReservation[];
  onUpdate: (id: string, status: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, status: string) => {
    haptic.tap();
    setBusy(id + status);
    await onUpdate(id, status);
    setBusy(null);
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

  const pending   = reservations.filter(r => r.status === 'pendiente');
  const confirmed = reservations.filter(r => r.status === 'confirmada');
  const done      = reservations.filter(r => r.status === 'completada' || r.status === 'cancelada');

  const card = (r: ShopperReservation) => {
    const meta = STATUS_META[r.status] ?? { cls: 'bg-nodo-inset text-nodo-sub', label: r.status };
    const isPending = r.status === 'pendiente';
    const isConf = r.status === 'confirmada';
    const isExpired = isPending && new Date(r.expires_at) <= new Date();

    return (
      <div key={r.id} className="rounded-3xl p-4 space-y-3" style={glass}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-nodo-ink text-sm leading-snug">{r.item_title}</p>
            <p className="text-xs text-nodo-sub mt-0.5">{r.client_name} · {r.client_phone}</p>
          </div>
          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 ${meta.cls}`}>
            {meta.label}
          </span>
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
        </div>

        <a href={`/mis-pedidos/${r.client_token}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-between text-xs font-semibold text-nodo-dim py-2 px-3 rounded-xl
                     bg-nodo-inset active:bg-nodo-raised transition-colors">
          <span>Ver como cliente</span>
          <ChevronRight size={12} />
        </a>

        {(isPending || isConf) && (
          <div className="flex gap-2">
            {isPending && (
              <button onClick={() => act(r.id, 'confirmada')} disabled={!!busy}
                className="flex-1 h-9 rounded-xl bg-nodo-success-bg text-nodo-success-tx text-xs font-black
                           flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-40">
                {busy === r.id + 'confirmada' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Confirmar
              </button>
            )}
            {isConf && (
              <button onClick={() => act(r.id, 'completada')} disabled={!!busy}
                className="flex-1 h-9 rounded-xl bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300
                           text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-40">
                {busy === r.id + 'completada' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Completar venta
              </button>
            )}
            <button onClick={() => act(r.id, 'cancelada')} disabled={!!busy}
              className="h-9 w-9 rounded-xl bg-nodo-danger-bg text-nodo-danger-tx
                         flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40">
              {busy === r.id + 'cancelada' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {pending.length > 0 && (
        <div className="space-y-2.5">
          <p className="nodo-section-label">Pendientes ({pending.length})</p>
          {pending.map(card)}
        </div>
      )}
      {confirmed.length > 0 && (
        <div className="space-y-2.5">
          <p className="nodo-section-label">Confirmadas ({confirmed.length})</p>
          {confirmed.map(card)}
        </div>
      )}
      {done.length > 0 && (
        <div className="space-y-2.5">
          <p className="nodo-section-label">Historial</p>
          {done.slice(0, 10).map(card)}
        </div>
      )}
    </div>
  );
}

// ─── Main CatalogMode ─────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: '', description: '', price_gtq: '', stock_total: '1',
  is_published: true, amazon_url: '', notes: '',
};

export function CatalogMode() {
  const [items, setItems]             = useState<ShopperCatalogItem[]>([]);
  const [settings, setSettings]       = useState<ShopperCatalogSettings | null>(null);
  const [reservations, setReservations] = useState<ShopperReservation[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState<string | null>(null);

  const [view, setView] = useState<'catalogo' | 'amazon' | 'reservas' | 'config'>('catalogo');
  const [showForm, setShowForm]       = useState(false);
  const [editingItem, setEditingItem] = useState<ShopperCatalogItem | null>(null);
  const [form, setForm]               = useState({ ...EMPTY_FORM });
  const [settingsForm, setSettingsForm] = useState({ business_name: '', whatsapp_number: '' });

  const publicUrl = settings
    ? `${window.location.origin}/catalogo/${settings.public_token}`
    : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogItems, cfg, reservs] = await Promise.all([
        shopperCatalogService.list(),
        shopperCatalogService.getSettings(),
        shopperCatalogService.listReservations(),
      ]);
      setItems(catalogItems);
      setSettings(cfg);
      setReservations(reservs);
      setSettingsForm({ business_name: cfg.business_name ?? '', whatsapp_number: cfg.whatsapp_number ?? '' });
    } catch { setError('No se pudo cargar el catálogo.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh reservations every 30s
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await shopperCatalogService.listReservations();
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

  const openForm = (item?: ShopperCatalogItem) => {
    haptic.tap();
    if (item) {
      setEditingItem(item);
      setForm({
        title: item.title, description: item.description ?? '',
        price_gtq: item.price_gtq != null ? String(item.price_gtq) : '',
        stock_total: String(item.stock_total),
        is_published: item.is_published,
        amazon_url: item.amazon_url ?? '', notes: item.notes ?? '',
      });
    } else {
      setEditingItem(null);
      setForm({ ...EMPTY_FORM });
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
        description: form.description.trim() || null,
        price_gtq: form.price_gtq !== '' ? Number(form.price_gtq) : null,
        stock_total: Math.max(1, Number(form.stock_total) || 1),
        is_published: form.is_published,
        amazon_url: form.amazon_url.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editingItem) {
        const u = await shopperCatalogService.update(editingItem.id, payload);
        setItems(prev => prev.map(i => i.id === editingItem.id ? u : i));
        setSuccess('Producto actualizado');
      } else {
        const c = await shopperCatalogService.create(payload);
        setItems(prev => [c, ...prev]);
        setSuccess('Producto agregado');
      }
      haptic.confirm();
      setShowForm(false);
    } catch { haptic.error(); setError('No se pudo guardar.'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (item: ShopperCatalogItem) => {
    haptic.tap();
    const u = await shopperCatalogService.update(item.id, { is_published: !item.is_published });
    setItems(prev => prev.map(i => i.id === item.id ? u : i));
    setSuccess(u.is_published ? 'Publicado' : 'Ocultado');
  };

  const handleSoldOne = async (item: ShopperCatalogItem) => {
    haptic.tap();
    const newSold = Math.min(item.stock_sold + 1, item.stock_total);
    const u = await shopperCatalogService.update(item.id, { stock_sold: newSold });
    setItems(prev => prev.map(i => i.id === item.id ? u : i));
    const rem = u.stock_available;
    setSuccess(rem <= 0 ? `"${item.title.slice(0, 20)}" agotado` : `Vendido 1 · quedan ${rem}`);
  };

  const handleDelete = async (id: string) => {
    haptic.error();
    await shopperCatalogService.remove(id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    haptic.tap();
    setSaving(true);
    try {
      const u = await shopperCatalogService.updateSettings({
        business_name: settingsForm.business_name.trim() || null,
        whatsapp_number: settingsForm.whatsapp_number.trim() || null,
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
    if (navigator.share) {
      await navigator.share({ title: 'Mi catálogo personal', url: publicUrl }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(publicUrl);
      setSuccess('Link copiado');
    }
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
      {/* Toasts */}
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
          <KpiPill label="Agotados" value={items.filter(i => i.is_published && i.stock_available <= 0).length} accent="text-nodo-dim" />
        </div>

        {/* Nav tabs */}
        <div className="flex items-center gap-2">
          <div className="flex-1 overflow-x-auto">
            <SegmentedControl
              options={[
                { value: 'catalogo', label: 'Catálogo',  icon: <Package size={13} /> },
                { value: 'amazon',   label: 'Amazon',    icon: <ExternalLink size={13} /> },
                {
                  value: 'reservas',
                  label: pendingCount > 0 ? `Reservas (${pendingCount})` : 'Reservas',
                  icon: <Bell size={13} />,
                },
                { value: 'config', label: 'Config', icon: <Settings size={13} /> },
              ]}
              value={view}
              onChange={v => setView(v as typeof view)}
              size="sm"
            />
          </div>
          {view === 'catalogo' && publicUrl && (
            <button onClick={handleShare}
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center
                         active:scale-90 transition-transform"
              style={glass}>
              <Share2 size={15} className="text-nodo-sub" />
            </button>
          )}
        </div>

        {/* ── Catálogo tab ── */}
        {view === 'catalogo' && (
          <>
            {items.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center gap-3">
                <div className="w-16 h-16 rounded-3xl bg-nodo-inset flex items-center justify-center">
                  <Globe size={28} className="text-nodo-dim" />
                </div>
                <p className="text-sm font-bold text-nodo-dim">Tu catálogo está vacío</p>
                <p className="text-xs text-nodo-dim">Agrega productos o impórtalos desde Amazon</p>
              </div>
            ) : (
              <>
                {published.length > 0 && (
                  <div>
                    <p className="nodo-section-label mb-2.5">Publicados ({published.length})</p>
                    <div className="grid grid-cols-2 gap-3">
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
                    <div className="grid grid-cols-2 gap-3">
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

            {/* FAB agregar */}
            <button onClick={() => openForm()}
              className="w-full h-[52px] rounded-full font-bold text-sm flex items-center justify-center gap-2
                         active:scale-[0.97] transition-transform shadow-lg"
              style={{ background: 'var(--nodo-iris)', color: 'white' }}>
              <Plus size={18} strokeWidth={2.5} /> Agregar producto
            </button>
          </>
        )}

        {/* ── Amazon tab ── */}
        {view === 'amazon' && (
          <AmazonPanel onAdded={item => {
            setItems(prev => [item, ...prev]);
            setSuccess('Publicado en tu catálogo');
            haptic.done();
            setView('catalogo');
          }} />
        )}

        {/* ── Reservas tab ── */}
        {view === 'reservas' && (
          <ReservasPanel reservations={reservations} onUpdate={async (id, status) => {
            try {
              const u = await shopperCatalogService.updateReservation(id, { status });
              setReservations(prev => prev.map(r => r.id === id ? u : r));
              setSuccess(
                status === 'confirmada' ? 'Reserva confirmada' :
                status === 'completada' ? 'Venta completada ✓' : 'Cancelada'
              );
            } catch { setError('Error al actualizar.'); }
          }} />
        )}

        {/* ── Config tab ── */}
        {view === 'config' && settings && (
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl overflow-hidden" style={glass}>
              <div className="p-4 border-b border-nodo-line">
                <p className="nodo-section-label mb-0">Link de tu catálogo</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-xs text-nodo-sub bg-nodo-inset rounded-xl px-3 py-2.5 font-mono truncate">
                    {publicUrl}
                  </p>
                  <button onClick={handleShare}
                    className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center active:scale-90"
                    style={{ background: 'var(--nodo-ink)' }}>
                    <Share2 size={15} className="text-nodo-canvas" />
                  </button>
                  <a href={publicUrl ?? '#'} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 w-10 h-10 rounded-xl bg-nodo-inset flex items-center justify-center active:scale-90">
                    <ExternalLink size={15} className="text-nodo-sub" />
                  </a>
                </div>
              </div>
            </div>

            <div className="rounded-3xl overflow-hidden space-y-4 p-4" style={glass}>
              <p className="nodo-section-label">Información del negocio</p>
              <div>
                <label className="nodo-label">Nombre del negocio</label>
                <input type="text" value={settingsForm.business_name}
                  onChange={e => setSettingsForm(f => ({ ...f, business_name: e.target.value }))}
                  placeholder="Tu nombre o tienda" className="nodo-input" />
              </div>
              <div>
                <label className="nodo-label">WhatsApp (para reservas)</label>
                <input type="tel" value={settingsForm.whatsapp_number}
                  onChange={e => setSettingsForm(f => ({ ...f, whatsapp_number: e.target.value }))}
                  placeholder="+502 5555-1234" className="nodo-input" />
              </div>
              <button onClick={handleSaveSettings} disabled={saving}
                className="w-full h-12 rounded-full font-bold text-sm flex items-center justify-center gap-2
                           active:scale-[0.97] transition-transform disabled:opacity-40"
                style={{ background: 'var(--nodo-iris)', color: 'white' }}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Guardar configuración
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── BottomSheet: nuevo/editar ítem ── */}
      <BottomSheet open={showForm} onClose={() => setShowForm(false)}
        title={editingItem ? 'Editar producto' : 'Agregar producto'}
        footer={
          <button onClick={handleSave} disabled={saving || !form.title.trim()}
            className="w-full h-[52px] rounded-full font-black text-base flex items-center justify-center gap-2
                       shadow-lg active:scale-[0.97] transition-transform disabled:opacity-40"
            style={{ background: 'var(--nodo-iris)', color: 'white' }}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {editingItem ? 'Guardar cambios' : 'Agregar al catálogo'}
          </button>
        }>
        <div>
          <label className="nodo-label">Nombre del producto *</label>
          <input type="text" value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Ej. Zapatos Nike Air Max" className="nodo-input" autoFocus />
        </div>
        <div>
          <label className="nodo-label">Descripción (opcional)</label>
          <input type="text" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Color, talla, características..." className="nodo-input" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="nodo-label">Precio Q</label>
            <input type="number" value={form.price_gtq}
              onChange={e => setForm(f => ({ ...f, price_gtq: e.target.value }))}
              placeholder="0.00" className="nodo-input-number" />
          </div>
          <div>
            <label className="nodo-label">Stock total</label>
            <input type="number" value={form.stock_total}
              onChange={e => setForm(f => ({ ...f, stock_total: e.target.value }))}
              min="1" className="nodo-input-number" />
          </div>
        </div>
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
      </BottomSheet>
    </>
  );
}
