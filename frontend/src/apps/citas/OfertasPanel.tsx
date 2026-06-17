import { useEffect, useState } from 'react';
import { Check, Loader2, Percent, Plus, Tag, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import {
  citasService,
  type BookingOffer, type BookingService, type OfferType,
} from '@/services/citas.service';
import { offerLabel, shortDateLabel, todayISO } from './shared';

const TYPE_OPTS = [
  { value: 'percent' as OfferType, label: '% Descuento' },
  { value: 'two_for_one' as OfferType, label: '2x1' },
  { value: 'fixed' as OfferType, label: 'Precio fijo' },
];

interface Props {
  services: BookingService[];
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

type FormData = {
  title: string;
  description: string;
  offer_type: OfferType;
  value: string;
  service_id: string;     // '' = todos
  starts_on: string;
  ends_on: string;
  is_published: boolean;
};

const emptyForm = (): FormData => ({
  title: '',
  description: '',
  offer_type: 'percent',
  value: '',
  service_id: '',
  starts_on: todayISO(),
  ends_on: todayISO(),
  is_published: true,
});

function isVigente(o: BookingOffer): boolean {
  const today = todayISO();
  return o.is_published && o.starts_on <= today && o.ends_on >= today;
}

export function OfertasPanel({ services, onError, onSuccess }: Props) {
  const [offers, setOffers] = useState<BookingOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      setOffers(await citasService.listOffers());
    } catch {
      onError('Error al cargar las ofertas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (o: BookingOffer) => {
    setEditingId(o.id);
    setForm({
      title: o.title,
      description: o.description ?? '',
      offer_type: o.offer_type,
      value: o.value != null ? String(o.value) : '',
      service_id: o.service_id ?? '',
      starts_on: o.starts_on,
      ends_on: o.ends_on,
      is_published: o.is_published,
    });
    setShowForm(true);
  };

  const needsValue = form.offer_type !== 'two_for_one';
  const valid =
    form.title.trim().length >= 2 &&
    form.starts_on <= form.ends_on &&
    (!needsValue || (form.value !== '' && parseFloat(form.value) >= 0));

  const handleSave = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        offer_type: form.offer_type,
        value: needsValue ? parseFloat(form.value) : null,
        service_id: form.service_id || null,
        starts_on: form.starts_on,
        ends_on: form.ends_on,
        is_published: form.is_published,
      };
      if (editingId) await citasService.updateOffer(editingId, payload);
      else await citasService.createOffer(payload);
      setShowForm(false);
      onSuccess(editingId ? 'Oferta actualizada' : 'Oferta creada');
      await load();
    } catch (err: any) {
      onError(err?.response?.data?.detail ?? 'Error al guardar la oferta');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (o: BookingOffer) => {
    try {
      await citasService.updateOffer(o.id, { is_published: !o.is_published });
      await load();
    } catch (err: any) {
      onError(err?.response?.data?.detail ?? 'No se pudo actualizar la oferta');
    }
  };

  const handleDelete = async () => {
    if (!editingId || deleting) return;
    setDeleting(true);
    try {
      await citasService.deleteOffer(editingId);
      setShowForm(false);
      onSuccess('Oferta eliminada');
      await load();
    } catch {
      onError('Error al eliminar la oferta');
    } finally {
      setDeleting(false);
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
        {offers.length === 0 ? (
          <div className="nodo-empty-state">
            <Tag size={32} className="text-nodo-dim mb-2" />
            <p className="text-sm font-bold text-nodo-dim">Crea una oferta para atraer clientes en días específicos</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {offers.map(o => {
              const vigente = isVigente(o);
              return (
                <div key={o.id} className="nodo-card p-4 flex items-center gap-4">
                  <button onClick={() => openEdit(o)} className="flex items-center gap-4 flex-1 min-w-0 text-left">
                    <div className="w-12 h-12 rounded-2xl bg-nodo-primary-soft flex items-center justify-center shrink-0">
                      <span className="text-xs font-black text-nodo-primary tabular-nums">
                        {offerLabel(o.offer_type, o.value)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-nodo-ink truncate">{o.title}</p>
                        {vigente ? (
                          <span className="bg-nodo-success-bg border border-nodo-success-bd text-nodo-success-tx rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase shrink-0">
                            Vigente
                          </span>
                        ) : !o.is_published ? (
                          <span className="bg-nodo-inset border border-nodo-line text-nodo-dim rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase shrink-0">
                            Pausada
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-nodo-sub mt-0.5 truncate">
                        {shortDateLabel(o.starts_on)} – {shortDateLabel(o.ends_on)}
                        {o.service_name ? ` · ${o.service_name}` : ' · Todos los servicios'}
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => handleToggle(o)}
                    className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${o.is_published ? 'bg-nodo-success-tx' : 'bg-nodo-card border border-nodo-line'}`}
                    aria-label={o.is_published ? 'Pausar oferta' : 'Activar oferta'}
                  >
                    <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${o.is_published ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <button onClick={openCreate} className="nodo-btn-primary">
          <Plus size={20} />
          NUEVA OFERTA
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
            <label className="nodo-label">Título</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Ej: Martes de descuento"
              className="nodo-input"
            />
          </div>

          <div>
            <label className="nodo-label">Tipo de oferta</label>
            <SegmentedControl
              options={TYPE_OPTS}
              value={form.offer_type}
              onChange={v => setForm(f => ({ ...f, offer_type: v, value: v === 'two_for_one' ? '' : f.value }))}
              size="sm"
            />
          </div>

          {needsValue && (
            <div>
              <label className="nodo-label">{form.offer_type === 'percent' ? 'Porcentaje (%)' : 'Precio rebajado (Q)'}</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step={form.offer_type === 'percent' ? '1' : '0.01'}
                  value={form.value}
                  onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                  placeholder={form.offer_type === 'percent' ? '10' : '0.00'}
                  className="nodo-input-number"
                />
                <Percent
                  size={14}
                  className={`absolute right-4 top-1/2 -translate-y-1/2 text-nodo-dim ${form.offer_type === 'percent' ? '' : 'hidden'}`}
                />
              </div>
            </div>
          )}

          <div>
            <label className="nodo-label">Servicio</label>
            <select
              value={form.service_id}
              onChange={e => setForm(f => ({ ...f, service_id: e.target.value }))}
              className="nodo-select"
            >
              <option value="">Todos los servicios</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="nodo-label">Desde</label>
              <input
                type="date"
                value={form.starts_on}
                min={todayISO()}
                onChange={e => setForm(f => ({ ...f, starts_on: e.target.value }))}
                className="nodo-input"
              />
            </div>
            <div>
              <label className="nodo-label">Hasta</label>
              <input
                type="date"
                value={form.ends_on}
                min={form.starts_on}
                onChange={e => setForm(f => ({ ...f, ends_on: e.target.value }))}
                className="nodo-input"
              />
            </div>
          </div>

          <div>
            <label className="nodo-label">Descripción (opcional)</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Detalle visible para el cliente"
              className="nodo-input"
            />
          </div>

          <div className="flex items-center justify-between bg-nodo-inset border border-nodo-line rounded-2xl px-4 py-3">
            <div>
              <p className="text-sm font-bold text-nodo-ink">Visible para clientes</p>
              <p className="text-xs text-nodo-sub mt-0.5">Aparece en la agenda pública</p>
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
