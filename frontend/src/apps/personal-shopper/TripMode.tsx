/**
 * TripMode — Captura de productos en viaje (crystal glass redesign)
 * Timer inmersivo · FAB thumb-zone · Quick capture · Publish al catálogo
 */
import { useState, useEffect, useCallback } from 'react';
import {
  MapPin, Play, StopCircle, Plus, Loader2, Trash2,
  Package, Clock, Check, X, Pencil, Send, Minus, ChevronRight,
} from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { shopperTripsService, type ShopperTrip, type ShopperTripItem } from '@/services/shopper_trips.service';
import { shopperCatalogService } from '@/services/shopper_catalog.service';
import { haptic } from '@/utils/haptic';

const fmt = (n: number) =>
  'Q ' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Timer hook ────────────────────────────────────────────────────────────────

function useElapsed(startedAt: string | null) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Glass helper ──────────────────────────────────────────────────────────────

const glass: React.CSSProperties = {
  background: 'var(--nodo-glass-bg-strong)',
  backdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
  WebkitBackdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
  border: '1px solid var(--nodo-glass-border)',
  boxShadow: 'var(--nodo-shadow-card)',
};

const EMPTY_ITEM = { title: '', price_gtq: '', stock: '1', description: '' };

// ─── Vista sin viaje activo ───────────────────────────────────────────────────

function StartTripView({ onStart, loading }: { onStart: (s: string) => void; loading: boolean }) {
  const [storeName, setStoreName] = useState('');

  const handleStart = () => {
    if (!storeName.trim()) return;
    haptic.confirm();
    onStart(storeName.trim());
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Hero motivacional */}
      <div className="rounded-3xl p-6 text-center space-y-4" style={{
        background: 'linear-gradient(135deg, rgba(249,115,22,0.10) 0%, rgba(99,102,241,0.10) 100%)',
        border: '1px solid rgba(99,102,241,0.15)',
      }}>
        <div className="w-16 h-16 rounded-3xl mx-auto flex items-center justify-center"
          style={{ background: 'var(--nodo-iris)', boxShadow: '0 8px 24px -4px rgba(99,102,241,0.35)' }}>
          <MapPin size={30} color="white" />
        </div>
        <div>
          <h2 className="text-xl font-black text-nodo-ink">Personal Shopper</h2>
          <p className="text-sm text-nodo-sub mt-1.5 leading-relaxed">
            Inicia un viaje para capturar productos en segundos.<br />
            Luego los publicas en tu catálogo y tus clientes compran.
          </p>
        </div>
        <div className="flex justify-center gap-6 pt-2">
          {[
            { num: '1', label: 'Captura' },
            { num: '2', label: 'Publica' },
            { num: '3', label: 'Vende' },
          ].map(({ num, label }) => (
            <div key={num} className="flex flex-col items-center gap-1">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-sm"
                style={{ background: 'var(--nodo-iris)' }}>{num}</div>
              <span className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Input tienda */}
      <div className="space-y-3">
        <div>
          <label className="nodo-label">¿En qué tienda estás?</label>
          <input type="text" value={storeName}
            onChange={e => setStoreName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleStart()}
            placeholder="Ej. Costco, Walmart, Amazon…"
            className="nodo-input" autoFocus />
        </div>
        <button onClick={handleStart} disabled={!storeName.trim() || loading}
          className="w-full h-[56px] rounded-full font-black text-base flex items-center justify-center gap-2.5
                     shadow-lg active:scale-[0.97] transition-transform disabled:opacity-40"
          style={{ background: 'var(--nodo-iris)', color: 'white' }}>
          {loading ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
          Iniciar viaje
        </button>
      </div>
    </div>
  );
}

// ─── Tarjeta de ítem ──────────────────────────────────────────────────────────

function TripItemCard({
  item, onEdit, onDelete, onPublish, published,
}: {
  item: ShopperTripItem;
  onEdit: (i: ShopperTripItem) => void;
  onDelete: (id: string) => void;
  onPublish: (i: ShopperTripItem) => void;
  published: boolean;
}) {
  return (
    <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3" style={glass}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'rgba(99,102,241,0.1)' }}>
        <Package size={16} style={{ color: 'var(--nodo-iris)' }} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-nodo-ink text-sm leading-tight truncate">{item.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {item.price_gtq != null && (
            <span className="text-xs font-black text-nodo-ink tabular-nums">{fmt(item.price_gtq)}</span>
          )}
          <span className="text-[10px] text-nodo-dim">×{item.stock}</span>
          {published && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full
                             bg-nodo-success-bg text-nodo-success-tx">
              EN CATÁLOGO
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {!published && (
          <button onClick={() => { haptic.tap(); onPublish(item); }}
            title="Publicar en catálogo"
            className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: 'var(--nodo-iris)' }}>
            <Send size={12} color="white" />
          </button>
        )}
        <button onClick={() => { haptic.tap(); onEdit(item); }}
          className="w-8 h-8 rounded-xl bg-nodo-inset flex items-center justify-center
                     active:scale-90 transition-transform text-nodo-dim">
          <Pencil size={12} />
        </button>
        <button onClick={() => { haptic.error(); onDelete(item.id); }}
          className="w-8 h-8 rounded-xl bg-nodo-danger-bg flex items-center justify-center
                     active:scale-90 transition-transform text-nodo-danger-tx">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Trip HQ card (cuando viaje activo) ──────────────────────────────────────

function TripHQ({
  trip, elapsed, itemCount, totalValue, onEnd,
}: {
  trip: ShopperTrip;
  elapsed: string;
  itemCount: number;
  totalValue: number;
  onEnd: () => void;
}) {
  return (
    <div className="rounded-3xl overflow-hidden relative" style={{
      background: 'linear-gradient(135deg, rgba(249,115,22,0.15) 0%, rgba(99,102,241,0.2) 100%)',
      border: '1px solid rgba(99,102,241,0.25)',
      boxShadow: 'var(--nodo-shadow-hero)',
    }}>
      {/* Live indicator */}
      <div className="flex items-center justify-between px-5 pt-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">En curso</span>
        </div>
        <button onClick={() => { haptic.tap(); onEnd(); }}
          className="flex items-center gap-1.5 h-8 px-3 rounded-xl font-bold text-xs
                     bg-nodo-danger-bg text-nodo-danger-tx border border-nodo-danger-bd
                     active:scale-95 transition-transform">
          <StopCircle size={12} />
          Terminar
        </button>
      </div>

      {/* Store name + timer */}
      <div className="px-5 pt-3 pb-2">
        <p className="text-2xl font-black text-nodo-ink leading-tight">{trip.store_name}</p>
        <div className="flex items-baseline gap-1.5 mt-1">
          <Clock size={12} className="text-nodo-dim shrink-0 mt-0.5" />
          <span className="text-3xl font-black tabular-nums tracking-tighter"
            style={{ background: 'var(--nodo-iris)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {elapsed}
          </span>
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex divide-x divide-nodo-line/50 border-t border-nodo-line/40 mx-5 mb-5 mt-2 rounded-2xl overflow-hidden"
        style={glass}>
        <div className="flex flex-col items-center py-3 flex-1">
          <p className="text-xl font-black text-nodo-ink tabular-nums">{itemCount}</p>
          <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-wider">Productos</p>
        </div>
        <div className="flex flex-col items-center py-3 flex-1">
          <p className="text-xl font-black text-nodo-ink tabular-nums">{fmt(totalValue)}</p>
          <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-wider">Valor total</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main TripMode ────────────────────────────────────────────────────────────

export function TripMode() {
  const [trip, setTrip]     = useState<ShopperTrip | null | undefined>(undefined);
  const [items, setItems]   = useState<ShopperTripItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [publishedIds, setPublishedIds] = useState<Set<string>>(new Set());
  const [showCapture, setShowCapture]   = useState(false);
  const [editingItem, setEditingItem]   = useState<ShopperTripItem | null>(null);
  const [itemForm, setItemForm]         = useState({ ...EMPTY_ITEM });
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const elapsed = useElapsed(trip?.started_at ?? null);

  const totalValue = items.reduce((acc, i) => acc + ((i.price_gtq ?? 0) * i.stock), 0);

  const loadActive = useCallback(async () => {
    setLoading(true);
    try {
      const active = await shopperTripsService.getActive();
      setTrip(active);
      if (active) {
        const tripItems = await shopperTripsService.listItems(active.id);
        setItems(tripItems);
      }
    } catch { setError('No se pudo cargar el viaje.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadActive(); }, [loadActive]);

  useEffect(() => {
    if (!success) return;
    const id = setTimeout(() => setSuccess(null), 2500);
    return () => clearTimeout(id);
  }, [success]);

  const handleStart = async (storeName: string) => {
    setSaving(true);
    try {
      const newTrip = await shopperTripsService.start({ store_name: storeName });
      setTrip(newTrip);
      setItems([]);
      haptic.done();
    } catch { setError('No se pudo iniciar el viaje.'); haptic.error(); }
    finally { setSaving(false); }
  };

  const handleEnd = async () => {
    if (!trip) return;
    haptic.tap();
    setSaving(true);
    try {
      await shopperTripsService.end(trip.id);
      setTrip(null);
      setItems([]);
      setShowEndConfirm(false);
      setSuccess(`Viaje terminado · ${items.length} productos guardados`);
      haptic.done();
    } catch { setError('No se pudo finalizar el viaje.'); haptic.error(); }
    finally { setSaving(false); }
  };

  const openCapture = (item?: ShopperTripItem) => {
    haptic.tap();
    if (item) {
      setEditingItem(item);
      setItemForm({
        title: item.title,
        description: item.description ?? '',
        price_gtq: item.price_gtq != null ? String(item.price_gtq) : '',
        stock: String(item.stock),
      });
    } else {
      setEditingItem(null);
      setItemForm({ ...EMPTY_ITEM });
    }
    setShowCapture(true);
  };

  const handleSaveItem = async () => {
    if (!trip || !itemForm.title.trim()) return;
    haptic.tap();
    setSaving(true);
    try {
      const payload = {
        title: itemForm.title.trim(),
        description: itemForm.description.trim() || null,
        price_gtq: itemForm.price_gtq !== '' ? Number(itemForm.price_gtq) : null,
        stock: Math.max(1, Number(itemForm.stock) || 1),
        notes: null,
      };
      if (editingItem) {
        const u = await shopperTripsService.updateItem(editingItem.id, payload);
        setItems(prev => prev.map(i => i.id === editingItem.id ? u : i));
        setSuccess('Actualizado');
      } else {
        const c = await shopperTripsService.addItem(trip.id, payload);
        setItems(prev => [c, ...prev]);
        setSuccess(`"${payload.title.slice(0, 20)}" agregado`);
      }
      haptic.confirm();
      setShowCapture(false);
    } catch { setError('No se pudo guardar.'); haptic.error(); }
    finally { setSaving(false); }
  };

  const handlePublish = async (item: ShopperTripItem) => {
    haptic.tap();
    try {
      await shopperCatalogService.publishFromTrip(item.id);
      setPublishedIds(prev => new Set([...prev, item.id]));
      setSuccess(`"${item.title.slice(0, 20)}" en catálogo`);
      haptic.done();
    } catch { setError('No se pudo publicar.'); haptic.error(); }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await shopperTripsService.removeItem(id);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch { setError('No se pudo eliminar.'); }
  };

  const setStock = (delta: number) =>
    setItemForm(f => ({ ...f, stock: String(Math.max(1, (Number(f.stock) || 1) + delta)) }));

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

      {!trip ? (
        <StartTripView onStart={handleStart} loading={saving} />
      ) : (
        <div className="flex flex-col gap-4 pb-24">
          {/* Trip HQ hero card */}
          <TripHQ trip={trip} elapsed={elapsed} itemCount={items.length}
            totalValue={totalValue} onEnd={() => setShowEndConfirm(true)} />

          {/* Lista de ítems */}
          {items.length === 0 ? (
            <div className="flex flex-col items-center py-14 gap-3 text-center">
              <div className="w-14 h-14 rounded-3xl bg-nodo-inset flex items-center justify-center">
                <Package size={24} className="text-nodo-dim" />
              </div>
              <p className="text-sm font-bold text-nodo-dim">Aún sin productos</p>
              <p className="text-xs text-nodo-dim">Toca + para capturar</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="nodo-section-label">Capturados ({items.length})</p>
              {items.map(item => (
                <TripItemCard key={item.id} item={item}
                  onEdit={openCapture} onDelete={handleDeleteItem}
                  onPublish={handlePublish} published={publishedIds.has(item.id)} />
              ))}
            </div>
          )}

          {/* Desktop CTA */}
          <button onClick={() => openCapture()}
            className="hidden xl:flex w-full h-[52px] rounded-full font-bold text-sm
                       items-center justify-center gap-2 shadow-lg active:scale-[0.97] transition-transform"
            style={{ background: 'var(--nodo-iris)', color: 'white' }}>
            <Plus size={18} strokeWidth={2.5} /> Capturar producto
          </button>
        </div>
      )}

      {/* FAB — thumb zone mobile */}
      {trip && (
        <button onClick={() => openCapture()}
          className="fixed bottom-24 right-5 z-40 w-16 h-16 rounded-full xl:hidden
                     flex items-center justify-center active:scale-90 transition-transform"
          style={{ background: 'var(--nodo-iris)', boxShadow: 'var(--nodo-shadow-fab)' }}>
          <Plus size={30} color="white" strokeWidth={2.5} />
        </button>
      )}

      {/* ── BottomSheet: Captura rápida ── */}
      <BottomSheet open={showCapture} onClose={() => setShowCapture(false)}
        title={editingItem ? 'Editar producto' : '+ Capturar producto'}
        footer={
          <button onClick={handleSaveItem}
            disabled={saving || !itemForm.title.trim()}
            className="w-full h-[52px] rounded-full font-black text-base flex items-center justify-center gap-2.5
                       shadow-lg active:scale-[0.97] transition-transform disabled:opacity-40"
            style={{ background: 'var(--nodo-iris)', color: 'white' }}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {editingItem ? 'Guardar cambios' : 'Agregar al viaje'}
          </button>
        }>
        <div>
          <label className="nodo-label">Nombre del producto *</label>
          <input type="text" value={itemForm.title}
            onChange={e => setItemForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Ej. Zapatos Nike Air Max"
            className="nodo-input" autoFocus
            onKeyDown={e => e.key === 'Enter' && handleSaveItem()} />
        </div>

        <div>
          <label className="nodo-label">Descripción (opcional)</label>
          <input type="text" value={itemForm.description}
            onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Color, talla, modelo…" className="nodo-input" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="nodo-label">Precio Q</label>
            <input type="number" value={itemForm.price_gtq}
              onChange={e => setItemForm(f => ({ ...f, price_gtq: e.target.value }))}
              placeholder="0.00" className="nodo-input-number" />
          </div>
          <div>
            <label className="nodo-label">Cantidad</label>
            <div className="flex items-center gap-2 h-12">
              <button onClick={() => setStock(-1)}
                className="w-10 h-10 rounded-xl bg-nodo-inset border border-nodo-line
                           flex items-center justify-center active:scale-90 transition-transform shrink-0">
                <Minus size={14} className="text-nodo-ink" />
              </button>
              <span className="flex-1 text-center text-lg font-black text-nodo-ink tabular-nums">
                {itemForm.stock}
              </span>
              <button onClick={() => setStock(1)}
                className="w-10 h-10 rounded-xl bg-nodo-ink flex items-center justify-center
                           active:scale-90 transition-transform shrink-0">
                <Plus size={14} className="text-nodo-canvas" />
              </button>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* ── BottomSheet: Confirmar fin de viaje ── */}
      <BottomSheet open={showEndConfirm} onClose={() => setShowEndConfirm(false)}
        title="Terminar viaje"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setShowEndConfirm(false)} className="nodo-btn-secondary flex-1">
              Seguir comprando
            </button>
            <button onClick={handleEnd} disabled={saving}
              className="flex-1 h-[52px] rounded-full font-bold text-base flex items-center justify-center gap-2
                         bg-nodo-ink text-nodo-canvas shadow-lg active:scale-[0.97] transition-transform disabled:opacity-40">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <StopCircle size={16} />}
              Terminar
            </button>
          </div>
        }>
        <div className="rounded-2xl p-4 space-y-3" style={glass}>
          <p className="font-semibold text-nodo-ink">
            ¿Terminaste en <strong>{trip?.store_name}</strong>?
          </p>
          <div className="flex items-center gap-4 text-sm text-nodo-sub">
            <span className="flex items-center gap-1.5"><Clock size={14} /> {elapsed}</span>
            <span className="flex items-center gap-1.5"><ChevronRight size={14} /> {items.length} productos</span>
          </div>
          {items.length > 0 && items.some(i => !publishedIds.has(i.id)) && (
            <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
              {items.filter(i => !publishedIds.has(i.id)).length} producto(s) sin publicar en tu catálogo.
              Podrás publicarlos después desde Catálogo.
            </p>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
