import { useState, useEffect, useCallback } from 'react';
import {
  Search, UserPlus, User, Phone, Mail, Loader2, AlertTriangle, X, Check,
  Plus, ChevronRight, Package2, MessageCircle, Trash2, Pencil, ShoppingBag,
} from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ImportFab } from './ImportFab';
import { buildWhatsAppUrl } from '@/lib/utils';
import {
  importClientesService,
  type Cliente, type ClienteDetail, type ClienteCreate, type ClienteReserva,
} from '@/services/import_clientes.service';
import { STATUS_LABEL, type Cotizacion } from '@/services/importaciones.service';
import { fmtGTQ } from './pricingEngine';

interface ClientesTabProps {
  onNewCotizacion?: (cliente: Cliente) => void;
}

// Origen de la ficha: manual no lleva badge; catálogo/QR sí (vinieron del link público).
const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  catalogo: { label: 'Pedido en línea', cls: 'bg-nodo-primary-soft text-nodo-ink' },
  qr:       { label: 'QR', cls: 'bg-violet-500/15 text-violet-600 dark:text-violet-300' },
};

// Estado de una reserva del catálogo → etiqueta corta y color para el perfil.
const RESERVA_STATUS: Record<string, { label: string; cls: string }> = {
  pendiente:     { label: 'Reservado',     cls: 'bg-nodo-primary-soft text-nodo-ink' },
  confirmada:    { label: 'Confirmado',    cls: 'bg-nodo-primary-soft text-nodo-ink' },
  comprada:      { label: 'Comprado',      cls: 'bg-nodo-primary-soft text-nodo-ink' },
  en_camino:     { label: 'En camino',     cls: 'bg-nodo-primary-soft text-nodo-ink' },
  entregada:     { label: 'Entregado',     cls: 'bg-nodo-success-bg text-nodo-success-tx' },
  no_disponible: { label: 'No disponible', cls: 'bg-nodo-warn-bg text-nodo-warn-tx' },
  cancelada:     { label: 'Cancelado',     cls: 'bg-nodo-danger-bg text-nodo-danger-tx' },
};

function fmtMoney(value: string | null): string {
  return fmtGTQ(Number(value ?? 0));
}

// ── Formulario de cliente (crear/editar) ──────────────────────────────────────

function ClienteForm({
  cliente, open, onClose, onSaved,
}: {
  cliente: Cliente | null;
  open: boolean;
  onClose: () => void;
  onSaved: (c: Cliente) => void;
}) {
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(cliente?.name ?? '');
      setPhone(cliente?.phone ?? '');
      setEmail(cliente?.email ?? '');
      setNotes(cliente?.notes ?? '');
    }
  }, [open, cliente]);

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const payload: ClienteCreate = {
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
      };
      const { data } = cliente
        ? await importClientesService.update(cliente.id, payload)
        : await importClientesService.create(payload);
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
      title={cliente ? 'Editar cliente' : 'Nuevo cliente'}
      footer={
        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="w-full h-14 rounded-2xl bg-nodo-ink text-nodo-canvas font-black text-base active:scale-[0.97] transition-transform disabled:opacity-30 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          GUARDAR
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Nombre</label>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)} autoFocus
            placeholder="Nombre del cliente"
            className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Teléfono (WhatsApp)</label>
          <input
            type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="Ej. 5512 3456"
            className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Correo (opcional)</label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            className="w-full h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors placeholder:text-nodo-dim"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1.5 block">Notas (opcional)</label>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="Preferencias, dirección, etc."
            className="w-full px-4 py-3 bg-nodo-inset border-2 border-nodo-line rounded-2xl text-sm font-semibold text-nodo-ink focus:border-nodo-ink outline-none transition-colors resize-none placeholder:text-nodo-dim"
          />
        </div>
      </div>
    </BottomSheet>
  );
}

// ── Perfil del cliente ─────────────────────────────────────────────────────────

function MiniCotizacion({ c }: { c: Cotizacion }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="w-8 h-8 rounded-xl bg-nodo-inset flex items-center justify-center shrink-0">
        <Package2 size={14} className="text-nodo-sub" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-nodo-ink truncate">{c.product_name}</p>
        <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">{STATUS_LABEL[c.status] ?? c.status}</p>
      </div>
      {c.sale_price_gtq && (
        <p className="text-sm font-black tabular-nums text-nodo-ink shrink-0">{fmtMoney(c.sale_price_gtq)}</p>
      )}
    </div>
  );
}

function MiniReserva({ r }: { r: ClienteReserva }) {
  const meta = RESERVA_STATUS[r.status] ?? { label: r.status, cls: 'bg-nodo-inset text-nodo-sub' };
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="w-8 h-8 rounded-xl bg-nodo-inset flex items-center justify-center shrink-0 overflow-hidden">
        {r.item_image_url
          ? <img src={r.item_image_url} alt="" className="w-full h-full object-cover" />
          : <ShoppingBag size={14} className="text-nodo-sub" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-nodo-ink truncate">
          {r.quantity > 1 && <span className="text-nodo-sub">{r.quantity}× </span>}{r.item_title}
        </p>
        <span className={`inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full mt-0.5 ${meta.cls}`}>
          {meta.label}
        </span>
      </div>
      <p className="text-sm font-black tabular-nums text-nodo-ink shrink-0">{fmtMoney(r.line_total_gtq)}</p>
    </div>
  );
}

function ClienteProfile({
  clienteId, open, onClose, onChanged, onNewCotizacion,
}: {
  clienteId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  onNewCotizacion?: (cliente: Cliente) => void;
}) {
  const [detail, setDetail]   = useState<ClienteDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!clienteId) return;
    setLoading(true);
    try {
      const { data } = await importClientesService.get(clienteId);
      setDetail(data);
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => { if (open && clienteId) load(); }, [open, clienteId, load]);

  async function handleDelete() {
    if (!clienteId) return;
    await importClientesService.remove(clienteId);
    onChanged();
    onClose();
  }

  function openWhatsApp() {
    if (!detail) return;
    const msg = `Hola ${detail.name} 👋`;
    window.open(buildWhatsAppUrl(msg, detail.phone), '_blank', 'noopener');
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Cliente">
      {loading || !detail ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-7 h-7 animate-spin text-nodo-sub" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Encabezado */}
          <div className="flex items-center gap-3">
            <span className="w-14 h-14 rounded-2xl bg-nodo-primary-soft flex items-center justify-center shrink-0">
              <User size={26} className="text-nodo-ink" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-black text-nodo-ink truncate">{detail.name}</p>
              {detail.phone && (
                <p className="text-sm text-nodo-sub font-medium flex items-center gap-1.5">
                  <Phone size={12} /> {detail.phone}
                </p>
              )}
              {detail.email && (
                <p className="text-xs text-nodo-dim font-medium flex items-center gap-1.5">
                  <Mail size={11} /> {detail.email}
                </p>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-nodo-inset rounded-2xl p-3">
              <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-0.5">Cotizaciones</p>
              <p className="text-2xl font-black text-nodo-ink tabular-nums">{detail.cotizaciones_count}</p>
            </div>
            <div className="bg-nodo-inset rounded-2xl p-3">
              <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest mb-0.5">Total pagado</p>
              <p className="text-2xl font-black text-nodo-ink tabular-nums">{fmtMoney(detail.total_pagado_gtq)}</p>
            </div>
          </div>

          {/* Pedido en línea — acumulado de reservas del catálogo por estado */}
          {(detail.reservas.length > 0
            || Number(detail.reservado_gtq) > 0
            || Number(detail.pedido_actual_gtq) > 0
            || Number(detail.entregado_gtq) > 0) && (
            <div className="bg-nodo-primary-soft rounded-2xl p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <ShoppingBag size={13} className="text-nodo-ink" />
                <p className="text-[10px] font-bold text-nodo-ink uppercase tracking-wider">Pedido en línea</p>
                {detail.reservas_activas > 0 && (
                  <span className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-full bg-nodo-primary text-nodo-on-primary">
                    {detail.reservas_activas} activa{detail.reservas_activas > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[9px] font-bold text-nodo-sub uppercase tracking-widest mb-0.5">Reservado</p>
                  <p className="text-base font-black text-nodo-ink tabular-nums">{fmtMoney(detail.reservado_gtq)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-nodo-sub uppercase tracking-widest mb-0.5">En curso</p>
                  <p className="text-base font-black text-nodo-ink tabular-nums">{fmtMoney(detail.pedido_actual_gtq)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-nodo-sub uppercase tracking-widest mb-0.5">Entregado</p>
                  <p className="text-base font-black text-nodo-ink tabular-nums">{fmtMoney(detail.entregado_gtq)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-2">
            {detail.phone && (
              <button
                onClick={openWhatsApp}
                className="flex-1 h-11 rounded-2xl bg-[#25D366] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
              >
                <MessageCircle size={16} /> WhatsApp
              </button>
            )}
            {onNewCotizacion && (
              <button
                onClick={() => { onNewCotizacion(detail); onClose(); }}
                className="flex-1 h-11 rounded-2xl bg-nodo-ink text-nodo-canvas font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
              >
                <Plus size={16} /> Cotización
              </button>
            )}
          </div>

          {detail.notes && (
            <div className="bg-nodo-inset border border-nodo-line rounded-2xl px-4 py-3">
              <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-wider mb-1">Notas</p>
              <p className="text-xs font-semibold text-nodo-sub whitespace-pre-wrap">{detail.notes}</p>
            </div>
          )}

          {/* Pedido en línea — líneas del catálogo */}
          {detail.reservas.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1">Artículos del catálogo</p>
              <div className="divide-y divide-nodo-line">
                {detail.reservas.map(r => <MiniReserva key={r.id} r={r} />)}
              </div>
            </div>
          )}

          {/* Historial de cotizaciones */}
          <div>
            <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider mb-1">Historial de cotizaciones</p>
            {detail.cotizaciones.length === 0 ? (
              <p className="text-xs text-nodo-dim font-medium py-3">Aún sin cotizaciones.</p>
            ) : (
              <div className="divide-y divide-nodo-line">
                {detail.cotizaciones.map(c => <MiniCotizacion key={c.id} c={c} />)}
              </div>
            )}
          </div>

          {/* Editar / Eliminar */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setShowEdit(true)}
              className="flex-1 h-11 rounded-2xl border-2 border-nodo-line text-nodo-sub font-bold text-sm flex items-center justify-center gap-2 hover:bg-nodo-inset active:scale-[0.97] transition-all"
            >
              <Pencil size={14} /> Editar
            </button>
            {confirmDelete ? (
              <button
                onClick={handleDelete}
                className="flex-1 h-11 rounded-2xl bg-nodo-danger-tx text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
              >
                <Trash2 size={14} /> Confirmar
              </button>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="h-11 px-4 rounded-2xl border-2 border-nodo-line text-nodo-dim hover:border-nodo-danger-bd hover:text-nodo-danger-tx hover:bg-nodo-danger-bg active:scale-[0.97] transition-all"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      <ClienteForm
        cliente={detail}
        open={showEdit}
        onClose={() => setShowEdit(false)}
        onSaved={() => { load(); onChanged(); }}
      />
    </BottomSheet>
  );
}

// ── Tab principal ────────────────────────────────────────────────────────────

export function ClientesTab({ onNewCotizacion }: ClientesTabProps) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [showForm, setShowForm] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await importClientesService.list(q?.trim() || undefined);
      setClientes(data);
    } catch {
      setError('No se pudieron cargar los clientes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search, load]);

  return (
    <>
    <div className="flex flex-col gap-4">
      {/* Buscador */}
      <div className="flex items-center gap-2 h-12 px-4 bg-nodo-inset border-2 border-nodo-line rounded-2xl focus-within:border-nodo-ink transition-colors">
        <Search size={16} className="text-nodo-dim shrink-0" />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente…"
          className="flex-1 bg-transparent text-sm font-semibold text-nodo-ink outline-none placeholder:text-nodo-dim"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-nodo-dim hover:text-nodo-ink"><X size={14} /></button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-40 text-center px-4">
          <AlertTriangle size={28} className="text-nodo-danger-tx mb-2" />
          <p className="text-sm font-bold text-nodo-danger-tx">{error}</p>
          <button onClick={() => load(search)} className="mt-3 text-xs font-bold text-nodo-sub underline">Reintentar</button>
        </div>
      ) : clientes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-52 text-center px-4">
          <User size={36} className="text-nodo-dim mb-3" />
          <p className="text-sm font-black text-nodo-dim">{search ? 'Sin resultados' : 'Sin clientes aún'}</p>
          <p className="text-xs text-nodo-dim mt-1">
            {search ? 'Prueba con otro nombre.' : 'Agrega tu primer cliente para cotizar más rápido.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {clientes.map(c => (
            <button
              key={c.id}
              onClick={() => setProfileId(c.id)}
              className="flex items-center gap-3 p-3.5 nodo-card active:scale-[0.99] hover:bg-nodo-inset transition-all text-left"
            >
              <span className="w-11 h-11 rounded-2xl bg-nodo-primary-soft flex items-center justify-center shrink-0">
                <User size={20} className="text-nodo-ink" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-black text-nodo-ink truncate">{c.name}</p>
                  {SOURCE_BADGE[c.source] && (
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${SOURCE_BADGE[c.source].cls}`}>
                      {SOURCE_BADGE[c.source].label}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-nodo-sub font-medium truncate">
                  {c.phone ? c.phone : 'Sin teléfono'}
                  {c.reservas_activas > 0
                    ? ` · ${c.reservas_activas} en línea`
                    : c.cotizaciones_count > 0 && ` · ${c.cotizaciones_count} pedido${c.cotizaciones_count > 1 ? 's' : ''}`}
                </p>
              </div>
              {(() => {
                const enLinea = Number(c.reservado_gtq) + Number(c.pedido_actual_gtq);
                if (enLinea > 0) return (
                  <div className="text-right shrink-0">
                    <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest">En línea</p>
                    <p className="text-sm font-black tabular-nums text-nodo-ink">{fmtGTQ(enLinea)}</p>
                  </div>
                );
                if (Number(c.total_pagado_gtq) > 0) return (
                  <div className="text-right shrink-0">
                    <p className="text-[9px] font-bold text-nodo-dim uppercase tracking-widest">Pagado</p>
                    <p className="text-sm font-black tabular-nums text-nodo-ink">{fmtMoney(c.total_pagado_gtq)}</p>
                  </div>
                );
                return null;
              })()}
              <ChevronRight size={16} className="text-nodo-dim shrink-0" />
            </button>
          ))}
        </div>
      )}

      <ClienteForm
        cliente={null}
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={() => load(search)}
      />
      <ClienteProfile
        clienteId={profileId}
        open={profileId !== null}
        onClose={() => setProfileId(null)}
        onChanged={() => load(search)}
        onNewCotizacion={onNewCotizacion}
      />
    </div>

    <ImportFab icon={<UserPlus size={20} />} label="Cliente" onPress={() => setShowForm(true)} />
    </>
  );
}
