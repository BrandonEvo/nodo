import { useRef, useState } from 'react';
import { Camera, Check, Loader2, Package, Pencil, Plus, Trash2, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import {
  ventasService, type StoreProduct, type StoreSettings,
} from '@/services/ventas.service';

// Reducción client-side: la foto viaja como data-URL (mismo patrón que el logo
// del tenant), así que hay que dejarla en decenas de KB antes de enviarla.
async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const MAX = 700;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.78);
}

const PHOTO_TIPS = [
  'Luz natural, de frente al producto',
  'Fondo claro y liso, sin desorden',
  'El producto centrado y ocupando la mayor parte',
  'Sin filtros ni zoom digital',
];

interface Props {
  products: StoreProduct[];
  settings: StoreSettings | null;
  onReload: () => Promise<void>;
  onUpdateSettings: (body: Partial<Pick<StoreSettings, 'is_open' | 'reservation_ttl_minutes'>>) => Promise<void>;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

const money = (n: number) =>
  'Q' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type FormData = {
  name: string;
  description: string;
  price: string;
  cost: string;
  compare_at_price: string;
  badge: string;
  stock_qty: string;
  is_published: boolean;
  image_url: string;
};

const EMPTY_FORM: FormData = {
  name: '',
  description: '',
  price: '',
  cost: '',
  compare_at_price: '',
  badge: '',
  stock_qty: '0',
  is_published: true,
  image_url: '',
};

// Etiquetas sugeridas — ganchos de venta de un toque
const BADGE_PRESETS = ['¡MÁS VENDIDO!', '¡NUEVO!', 'OFERTA', 'ÚLTIMAS UNIDADES', 'EDICIÓN LIMITADA'];

export function ProductosPanel({ products, settings, onReload, onUpdateSettings, onError, onSuccess }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (p: StoreProduct) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      description: p.description ?? '',
      price: String(p.price),
      cost: p.cost > 0 ? String(p.cost) : '',
      compare_at_price: p.compare_at_price && p.compare_at_price > 0 ? String(p.compare_at_price) : '',
      badge: p.badge ?? '',
      stock_qty: String(p.stock_qty),
      is_published: p.is_published,
      image_url: p.image_url ?? '',
    });
    setShowForm(true);
  };

  const handlePickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setProcessingPhoto(true);
    try {
      const dataUrl = await compressImage(file);
      setForm(f => ({ ...f, image_url: dataUrl }));
    } catch {
      onError('No se pudo procesar la foto');
    } finally {
      setProcessingPhoto(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const valid = form.name.trim().length >= 2 && form.price !== '' && parseFloat(form.price) >= 0;

  const handleSave = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: parseFloat(form.price),
        cost: parseFloat(form.cost) || 0,
        // 0 limpia el precio ancla, "" limpia la etiqueta (convención del backend)
        compare_at_price: parseFloat(form.compare_at_price) || 0,
        badge: form.badge.trim(),
        stock_qty: Math.max(0, parseInt(form.stock_qty) || 0),
        is_published: form.is_published,
        image_url: form.image_url,
      };
      if (editingId) {
        await ventasService.updateProduct(editingId, payload);
      } else {
        await ventasService.createProduct(payload);
      }
      setShowForm(false);
      onSuccess(editingId ? 'Producto actualizado' : 'Producto creado');
      await onReload();
    } catch (err: any) {
      onError(err?.response?.data?.detail ?? 'Error al guardar el producto');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId || deleting) return;
    setDeleting(true);
    try {
      await ventasService.deleteProduct(editingId);
      setShowForm(false);
      onSuccess('Producto eliminado');
      await onReload();
    } catch {
      onError('Error al eliminar el producto');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Estado de la tienda */}
        {settings && (
          <div className="nodo-card p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-nodo-ink">
                {settings.is_open ? 'Tienda abierta' : 'Tienda cerrada'}
              </p>
              <p className="text-xs text-nodo-sub mt-0.5">
                {settings.is_open
                  ? `Reservas se apartan por ${settings.reservation_ttl_minutes} min`
                  : 'El catálogo no acepta pedidos'}
              </p>
            </div>
            <button
              onClick={() => onUpdateSettings({ is_open: !settings.is_open })}
              className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${settings.is_open ? 'bg-nodo-success-tx' : 'bg-nodo-inset border border-nodo-line'}`}
            >
              <span
                className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${settings.is_open ? 'left-6' : 'left-1'}`}
              />
            </button>
          </div>
        )}

        {/* Lista de productos */}
        {products.length === 0 ? (
          <div className="nodo-empty-state">
            <Package size={32} className="text-nodo-dim mb-2" />
            <p className="text-sm font-bold text-nodo-dim">Crea tu primer producto para abrir la tienda</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {products.map(p => (
              <button
                key={p.id}
                onClick={() => openEdit(p)}
                className="nodo-card p-4 flex items-center gap-4 text-left active:scale-[0.99] transition-transform"
              >
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="w-12 h-12 rounded-2xl object-cover border border-nodo-line shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-nodo-primary-soft flex items-center justify-center text-lg font-black text-nodo-ink shrink-0">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-nodo-ink truncate">{p.name}</p>
                    {p.badge && (
                      <span className="bg-nodo-primary text-nodo-on-primary rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wide shrink-0">
                        {p.badge}
                      </span>
                    )}
                    {!p.is_published && (
                      <span className="bg-nodo-inset border border-nodo-line text-nodo-dim rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase shrink-0">
                        Oculto
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-nodo-sub mt-0.5">
                    <span className={`font-bold ${p.available <= 3 ? 'text-nodo-warn-tx' : 'text-nodo-ink'} tabular-nums`}>
                      {p.available} disponible{p.available !== 1 ? 's' : ''}
                    </span>
                    {p.reserved_qty > 0 && (
                      <span className="tabular-nums"> · {p.reserved_qty} apartado{p.reserved_qty !== 1 ? 's' : ''}</span>
                    )}
                    {p.cost > 0 && (
                      <span className="tabular-nums"> · costo {money(p.cost)}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex flex-col items-end leading-none">
                    {p.compare_at_price && p.compare_at_price > p.price && (
                      <span className="text-[11px] font-bold text-nodo-dim line-through tabular-nums">{money(p.compare_at_price)}</span>
                    )}
                    <span className="text-base font-black text-nodo-ink tabular-nums">{money(p.price)}</span>
                  </div>
                  <Pencil size={14} className="text-nodo-dim" />
                </div>
              </button>
            ))}
          </div>
        )}

        <button onClick={openCreate} className="nodo-btn-primary">
          <Plus size={20} />
          AGREGAR PRODUCTO
        </button>
      </div>

      <BottomSheet
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? 'Editar producto' : 'Nuevo producto'}
        footer={
          <button onClick={handleSave} disabled={!valid || saving} className="nodo-btn-primary">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {editingId ? 'GUARDAR CAMBIOS' : 'CREAR PRODUCTO'}
          </button>
        }
      >
        <div className="space-y-4 px-1">
          {/* Foto del producto */}
          <div>
            <label className="nodo-label">Foto</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handlePickPhoto(e.target.files?.[0])}
            />
            <div className="flex items-start gap-3">
              {form.image_url ? (
                <div className="relative shrink-0">
                  <img
                    src={form.image_url}
                    alt="Foto del producto"
                    className="w-24 h-24 rounded-2xl object-cover border border-nodo-line"
                  />
                  <button
                    onClick={() => setForm(f => ({ ...f, image_url: '' }))}
                    className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-nodo-ink text-nodo-canvas flex items-center justify-center shadow active:scale-90 transition-transform"
                    aria-label="Quitar foto"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={processingPhoto}
                  className="w-24 h-24 rounded-2xl bg-nodo-inset border-2 border-dashed border-nodo-line flex flex-col items-center justify-center gap-1 text-nodo-dim active:scale-95 transition-transform shrink-0"
                >
                  {processingPhoto
                    ? <Loader2 size={20} className="animate-spin" />
                    : <><Camera size={20} /><span className="text-[10px] font-bold">Subir foto</span></>}
                </button>
              )}
              <div className="flex-1 bg-nodo-inset border border-nodo-line rounded-2xl px-3.5 py-3">
                <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5">
                  📸 Para una buena foto
                </p>
                <ul className="space-y-0.5">
                  {PHOTO_TIPS.map(tip => (
                    <li key={tip} className="text-[11px] text-nodo-sub font-medium leading-snug">· {tip}</li>
                  ))}
                </ul>
              </div>
            </div>
            {form.image_url && (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={processingPhoto}
                className="mt-2 text-xs font-bold text-nodo-sub underline underline-offset-2"
              >
                {processingPhoto ? 'Procesando…' : 'Cambiar foto'}
              </button>
            )}
          </div>

          <div>
            <label className="nodo-label">Nombre</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Pan de campo"
              className="nodo-input"
            />
          </div>

          <div>
            <label className="nodo-label">Descripción (opcional)</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Ej: Hogaza rústica de masa madre"
              className="nodo-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="nodo-label">Precio de venta (Q)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="0.00"
                className="nodo-input-number"
              />
            </div>
            <div>
              <label className="nodo-label">Costo (Q)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                placeholder="0.00"
                className="nodo-input-number"
              />
            </div>
          </div>

          {form.price && form.cost && parseFloat(form.price) > 0 && (
            <p className="text-xs text-nodo-sub text-right -mt-1">
              Ganancia por unidad:{' '}
              <span className={`font-bold tabular-nums ${parseFloat(form.price) - parseFloat(form.cost) >= 0 ? 'text-nodo-success-tx' : 'text-nodo-danger-tx'}`}>
                {money(parseFloat(form.price) - parseFloat(form.cost))}
                {' '}({Math.round(((parseFloat(form.price) - parseFloat(form.cost)) / parseFloat(form.price)) * 100)}%)
              </span>
            </p>
          )}

          {/* ── Gancho de venta ── */}
          <div className="bg-nodo-inset border border-nodo-line rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">🎣 Gancho de venta</p>

            <div>
              <label className="nodo-label">Precio "antes" (tachado)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.compare_at_price}
                onChange={e => setForm(f => ({ ...f, compare_at_price: e.target.value }))}
                placeholder="Mayor al precio de venta"
                className="nodo-input-number bg-nodo-card"
              />
              {form.compare_at_price && form.price && parseFloat(form.compare_at_price) > parseFloat(form.price) && (
                <p className="text-[11px] text-nodo-success-tx font-bold mt-1.5">
                  El cliente verá un ahorro de {money(parseFloat(form.compare_at_price) - parseFloat(form.price))}
                  {' '}({Math.round((1 - parseFloat(form.price) / parseFloat(form.compare_at_price)) * 100)}% menos)
                </p>
              )}
              {form.compare_at_price && form.price && parseFloat(form.compare_at_price) > 0 && parseFloat(form.compare_at_price) <= parseFloat(form.price) && (
                <p className="text-[11px] text-nodo-warn-tx font-bold mt-1.5">
                  Para que enganche, el "antes" debe ser mayor al precio de venta.
                </p>
              )}
            </div>

            <div>
              <label className="nodo-label">Etiqueta</label>
              <input
                type="text"
                maxLength={40}
                value={form.badge}
                onChange={e => setForm(f => ({ ...f, badge: e.target.value }))}
                placeholder="Ej: ¡MÁS VENDIDO!"
                className="nodo-input bg-nodo-card"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {BADGE_PRESETS.map(b => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, badge: f.badge === b ? '' : b }))}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      form.badge === b
                        ? 'bg-nodo-ink text-nodo-canvas'
                        : 'bg-nodo-card border border-nodo-line text-nodo-sub active:scale-95'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="nodo-label">Stock</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.stock_qty}
                onChange={e => setForm(f => ({ ...f, stock_qty: e.target.value }))}
                className="nodo-input-number"
              />
            </div>
          </div>

          <div className="flex items-center justify-between bg-nodo-inset border border-nodo-line rounded-2xl px-4 py-3">
            <div>
              <p className="text-sm font-bold text-nodo-ink">Visible en la tienda</p>
              <p className="text-xs text-nodo-sub mt-0.5">Los clientes lo verán en el catálogo</p>
            </div>
            <button
              onClick={() => setForm(f => ({ ...f, is_published: !f.is_published }))}
              className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${form.is_published ? 'bg-nodo-success-tx' : 'bg-nodo-card border border-nodo-line'}`}
            >
              <span
                className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${form.is_published ? 'left-6' : 'left-1'}`}
              />
            </button>
          </div>

          {editingId && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full h-12 rounded-2xl border-2 border-nodo-danger-bd text-nodo-danger-tx font-bold text-sm active:scale-[0.97] transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Eliminar producto
            </button>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
