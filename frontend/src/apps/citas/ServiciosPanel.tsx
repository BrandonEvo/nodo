import { useState } from 'react';
import { Check, Loader2, Pencil, Plus, Scissors, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { citasService, type BookingService } from '@/services/citas.service';
import { durationLabel, money } from './shared';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

interface Props {
  services: BookingService[];
  onReload: () => Promise<void>;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

type FormData = {
  name: string;
  description: string;
  price: string;
  duration_minutes: number;
  is_published: boolean;
};

const EMPTY_FORM: FormData = {
  name: '',
  description: '',
  price: '',
  duration_minutes: 30,
  is_published: true,
};

export function ServiciosPanel({ services, onReload, onError, onSuccess }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (s: BookingService) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      description: s.description ?? '',
      price: String(s.price),
      duration_minutes: s.duration_minutes,
      is_published: s.is_published,
    });
    setShowForm(true);
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
        duration_minutes: form.duration_minutes,
        is_published: form.is_published,
      };
      if (editingId) {
        await citasService.updateService(editingId, payload);
      } else {
        await citasService.createService(payload);
      }
      setShowForm(false);
      onSuccess(editingId ? 'Servicio actualizado' : 'Servicio creado');
      await onReload();
    } catch (err: any) {
      onError(err?.response?.data?.detail ?? 'Error al guardar el servicio');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId || deleting) return;
    setDeleting(true);
    try {
      await citasService.deleteService(editingId);
      setShowForm(false);
      onSuccess('Servicio eliminado');
      await onReload();
    } catch {
      onError('Error al eliminar el servicio');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        {services.length === 0 ? (
          <div className="nodo-empty-state">
            <Scissors size={32} className="text-nodo-dim mb-2" />
            <p className="text-sm font-bold text-nodo-dim">Crea tu primer servicio para abrir la agenda</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {services.map(s => (
              <button
                key={s.id}
                onClick={() => openEdit(s)}
                className="nodo-card p-4 flex items-center gap-4 text-left active:scale-[0.99] transition-transform"
              >
                <div className="w-12 h-12 rounded-2xl bg-nodo-primary-soft flex items-center justify-center text-lg font-black text-nodo-ink shrink-0">
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-nodo-ink truncate">{s.name}</p>
                    {!s.is_published && (
                      <span className="bg-nodo-inset border border-nodo-line text-nodo-dim rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase shrink-0">
                        Oculto
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-nodo-sub mt-0.5">
                    {durationLabel(s.duration_minutes)}
                    {s.description && <span> · {s.description}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-base font-black text-nodo-ink tabular-nums">{money(s.price)}</span>
                  <Pencil size={14} className="text-nodo-dim" />
                </div>
              </button>
            ))}
          </div>
        )}

        <button onClick={openCreate} className="nodo-btn-primary">
          <Plus size={20} />
          AGREGAR SERVICIO
        </button>
      </div>

      <BottomSheet
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? 'Editar servicio' : 'Nuevo servicio'}
        footer={
          <button onClick={handleSave} disabled={!valid || saving} className="nodo-btn-primary">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {editingId ? 'GUARDAR CAMBIOS' : 'CREAR SERVICIO'}
          </button>
        }
      >
        <div className="space-y-4 px-1">
          <div>
            <label className="nodo-label">Nombre</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Limpieza dental"
              className="nodo-input"
            />
          </div>

          <div>
            <label className="nodo-label">Descripción (opcional)</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Ej: Limpieza profunda con ultrasonido"
              className="nodo-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="nodo-label">Precio (Q)</label>
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
              <label className="nodo-label">Duración</label>
              <select
                value={form.duration_minutes}
                onChange={e => setForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))}
                className="nodo-select"
              >
                {DURATIONS.map(d => (
                  <option key={d} value={d}>{durationLabel(d)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between bg-nodo-inset border border-nodo-line rounded-2xl px-4 py-3">
            <div>
              <p className="text-sm font-bold text-nodo-ink">Visible en la agenda</p>
              <p className="text-xs text-nodo-sub mt-0.5">Los clientes podrán reservarlo</p>
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
              Eliminar servicio
            </button>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
