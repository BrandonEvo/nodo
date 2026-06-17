import { useCallback, useEffect, useState } from 'react';
import { Check, Clock, Loader2, Megaphone, Percent, Plus, Tag, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import {
  ventasService,
  type PromoType, type StoreProduct, type StorePromotion,
} from '@/services/ventas.service';

interface Props {
  products: StoreProduct[];
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

const money = (n: number) =>
  'Q' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TYPE_OPTS = [
  { value: 'percent' as PromoType, label: '% Off', icon: <Percent size={13} /> },
  { value: 'two_for_one' as PromoType, label: '2x1', icon: <Tag size={13} /> },
  { value: 'bundle' as PromoType, label: 'Combo', icon: <Tag size={13} /> },
  { value: 'badge' as PromoType, label: 'Etiqueta', icon: <Megaphone size={13} /> },
];

const TYPE_LABEL: Record<PromoType, string> = {
  percent: '% de descuento',
  two_for_one: '2x1',
  compare_at: 'Precio ancla',
  bundle: 'Combo',
  badge: 'Etiqueta',
};

type FormData = {
  title: string;
  promo_type: PromoType;
  value: string;
  product_id: string;
  description: string;
  urgency_text: string;
  starts_on: string;
  ends_on: string;
  is_published: boolean;
};

const EMPTY_FORM: FormData = {
  title: '',
  promo_type: 'percent',
  value: '',
  product_id: '',
  description: '',
  urgency_text: '',
  starts_on: '',
  ends_on: '',
  is_published: true,
};

function summary(p: StorePromotion, productName: (id: string | null) => string): string {
  const target = p.product_id ? productName(p.product_id) : 'Toda la tienda';
  if (p.promo_type === 'percent') return `${p.value ?? 0}% en ${target}`;
  if (p.promo_type === 'two_for_one') return `2x1 en ${target}`;
  if (p.promo_type === 'bundle') return `Combo ${p.value ? money(p.value) : ''} · ${target}`;
  return target;
}

export function PromocionesPanel({ products, onError, onSuccess }: Props) {
  const [promos, setPromos] = useState<StorePromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setPromos(await ventasService.listPromotions());
    } catch {
      onError('Error al cargar las promociones');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { load(); }, [load]);

  const productName = (id: string | null) =>
    products.find(p => p.id === id)?.name ?? 'Producto';

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (p: StorePromotion) => {
    setEditingId(p.id);
    setForm({
      title: p.title,
      promo_type: p.promo_type,
      value: p.value != null ? String(p.value) : '',
      product_id: p.product_id ?? '',
      description: p.description ?? '',
      urgency_text: p.urgency_text ?? '',
      starts_on: p.starts_on ?? '',
      ends_on: p.ends_on ?? '',
      is_published: p.is_published,
    });
    setShowForm(true);
  };

  const needsValue = form.promo_type === 'percent' || form.promo_type === 'bundle';
  const valid =
    form.title.trim().length >= 2 &&
    (!needsValue || (form.value !== '' && parseFloat(form.value) > 0));

  const handleSave = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        promo_type: form.promo_type,
        value: needsValue ? parseFloat(form.value) : null,
        product_id: form.product_id || null,
        description: form.description.trim() || null,
        urgency_text: form.urgency_text.trim() || null,
        starts_on: form.starts_on || null,
        ends_on: form.ends_on || null,
        is_published: form.is_published,
      };
      if (editingId) await ventasService.updatePromotion(editingId, payload);
      else await ventasService.createPromotion(payload);
      setShowForm(false);
      onSuccess(editingId ? 'Promoción actualizada' : 'Promoción creada');
      await load();
    } catch (err: any) {
      onError(err?.response?.data?.detail ?? 'Error al guardar la promoción');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId || deleting) return;
    setDeleting(true);
    try {
      await ventasService.deletePromotion(editingId);
      setShowForm(false);
      onSuccess('Promoción eliminada');
      await load();
    } catch {
      onError('Error al eliminar la promoción');
    } finally {
      setDeleting(false);
    }
  };

  const toggleLive = async (p: StorePromotion) => {
    try {
      await ventasService.updatePromotion(p.id, { is_published: !p.is_published });
      await load();
    } catch {
      onError('No se pudo cambiar el estado de la promoción');
    }
  };

  if (loading) {
    return (
      <div className="nodo-spinner-container">
        <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {promos.length === 0 ? (
          <div className="nodo-empty-state">
            <Megaphone size={32} className="text-nodo-dim mb-2" />
            <p className="text-sm font-bold text-nodo-dim">Crea tu primera oferta para enganchar clientes</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {promos.map(p => (
              <div
                key={p.id}
                className="nodo-card p-4 flex items-center gap-3"
              >
                <button onClick={() => openEdit(p)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-black text-nodo-ink truncate">{p.title}</p>
                    {p.is_live ? (
                      <span className="bg-nodo-success-bg border border-nodo-success-bd text-nodo-success-tx rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase shrink-0">
                        Activa
                      </span>
                    ) : (
                      <span className="bg-nodo-inset border border-nodo-line text-nodo-dim rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase shrink-0">
                        {p.is_published ? 'Programada' : 'Pausada'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-nodo-sub mt-0.5">
                    <span className="font-semibold">{TYPE_LABEL[p.promo_type]}</span> · {summary(p, productName)}
                  </p>
                  {(p.starts_on || p.ends_on) && (
                    <p className="text-[11px] text-nodo-dim mt-0.5 flex items-center gap-1">
                      <Clock size={11} />
                      {p.starts_on ?? '…'} → {p.ends_on ?? '…'}
                    </p>
                  )}
                  {p.urgency_text && (
                    <p className="text-[11px] text-nodo-warn-tx font-bold mt-0.5">⏳ {p.urgency_text}</p>
                  )}
                </button>
                <button
                  onClick={() => toggleLive(p)}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${p.is_published ? 'bg-nodo-success-tx' : 'bg-nodo-inset border border-nodo-line'}`}
                  aria-label={p.is_published ? 'Pausar' : 'Activar'}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${p.is_published ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button onClick={openCreate} className="nodo-btn-primary">
          <Plus size={20} />
          CREAR OFERTA
        </button>
      </div>

      <BottomSheet
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? 'Editar oferta' : 'Nueva oferta'}
        footer={
          <button onClick={handleSave} disabled={!valid || saving} className="nodo-btn-primary">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {editingId ? 'GUARDAR CAMBIOS' : 'CREAR OFERTA'}
          </button>
        }
      >
        <div className="space-y-4 px-1">
          <div>
            <label className="nodo-label">Título del gancho</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Ej: ¡Llévate 2 y paga 1!"
              className="nodo-input"
              maxLength={80}
            />
          </div>

          <div>
            <label className="nodo-label">Tipo de oferta</label>
            <SegmentedControl
              options={TYPE_OPTS}
              value={form.promo_type === 'compare_at' ? 'percent' : form.promo_type}
              onChange={v => setForm(f => ({ ...f, promo_type: v as PromoType }))}
              size="sm"
            />
          </div>

          {needsValue && (
            <div>
              <label className="nodo-label">
                {form.promo_type === 'percent' ? 'Descuento (%)' : 'Precio del combo (Q)'}
              </label>
              <input
                type="number"
                min="0"
                step={form.promo_type === 'percent' ? '1' : '0.01'}
                value={form.value}
                onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                placeholder={form.promo_type === 'percent' ? 'Ej: 20' : '0.00'}
                className="nodo-input-number"
              />
            </div>
          )}

          <div>
            <label className="nodo-label">Producto (opcional)</label>
            <select
              value={form.product_id}
              onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}
              className="nodo-select"
            >
              <option value="">Toda la tienda (banner)</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="nodo-label">Descripción (opcional)</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Ej: Solo este fin de semana"
              className="nodo-input"
              maxLength={200}
            />
          </div>

          <div>
            <label className="nodo-label">Mensaje de urgencia (opcional)</label>
            <input
              type="text"
              value={form.urgency_text}
              onChange={e => setForm(f => ({ ...f, urgency_text: e.target.value }))}
              placeholder="Ej: ¡Quedan pocas! / Termina hoy"
              className="nodo-input"
              maxLength={80}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="nodo-label">Desde</label>
              <input
                type="date"
                value={form.starts_on}
                onChange={e => setForm(f => ({ ...f, starts_on: e.target.value }))}
                className="nodo-input"
              />
            </div>
            <div>
              <label className="nodo-label">Hasta</label>
              <input
                type="date"
                value={form.ends_on}
                onChange={e => setForm(f => ({ ...f, ends_on: e.target.value }))}
                className="nodo-input"
              />
            </div>
          </div>

          <div className="flex items-center justify-between bg-nodo-inset border border-nodo-line rounded-2xl px-4 py-3">
            <div>
              <p className="text-sm font-bold text-nodo-ink">Mostrar en la tienda</p>
              <p className="text-xs text-nodo-sub mt-0.5">Aparece si hoy está dentro de las fechas</p>
            </div>
            <button
              onClick={() => setForm(f => ({ ...f, is_published: !f.is_published }))}
              className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${form.is_published ? 'bg-nodo-success-tx' : 'bg-nodo-card border border-nodo-line'}`}
            >
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${form.is_published ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          {editingId && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full h-12 rounded-2xl border-2 border-nodo-danger-bd text-nodo-danger-tx font-bold text-sm active:scale-[0.97] transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Eliminar oferta
            </button>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
