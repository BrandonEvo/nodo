/**
 * PaquetesBoard — Fase 2: agrupar pedidos en paquetes por cliente con tracking
 * unificado. Agrupar arrastrando (desktop, drag HTML5) o con el botón "Mover"
 * (móvil, BottomSheet). El paquete lleva un solo estado/tracking/fecha que se
 * avanza una vez para toda la caja.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Package, PackagePlus, Loader2, ChevronRight, MoveRight,
  Calendar, MapPin, Check, Pencil, Trash2, Boxes, Undo2,
} from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import {
  importacionesService,
  type Cotizacion, type Paquete, type CotizacionStatus,
  STATUS_LABEL, NEXT_STATUS, NEXT_STATUS_ACTION, PREV_STATUS,
} from '@/services/importaciones.service';
import { fmtGTQ } from './pricingEngine';

const STATUS_CLS: Record<string, string> = {
  cotizado:    'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  confirmado:  'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  comprado:    'bg-nodo-warn-bg text-nodo-warn-tx',
  en_transito: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  entregado:   'bg-nodo-success-bg text-nodo-success-tx',
  pagado:      'bg-nodo-success-bg text-nodo-success-tx',
  cancelado:   'bg-nodo-inset text-nodo-dim',
};

const resultNum = (c: Cotizacion, k: string) =>
  Number((c.result_snapshot as Record<string, unknown>)[k] ?? 0);

function totals(orders: Cotizacion[]) {
  return {
    precio:   orders.reduce((s, c) => s + resultNum(c, 'salePriceGTQ'), 0),
    costo:    orders.reduce((s, c) => s + resultNum(c, 'totalLandedCostGTQ'), 0),
    ganancia: orders.reduce((s, c) => s + resultNum(c, 'netProfitGTQ'), 0),
  };
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-GT', { day: 'numeric', month: 'short' });
}

const isClosed = (c: Cotizacion) => c.status === 'pagado' || c.status === 'cancelado';

// ─── Tipos de agrupación ────────────────────────────────────────────────────────

interface ClientGroup {
  key: string;
  clienteId: string | null;
  clienteName: string;
  paquetes: Paquete[];
  sueltos: Cotizacion[];
}

// ─── Mini tarjeta de orden (dentro de paquete o suelta) ──────────────────────────

function OrderChip({
  order, onDragStart, onDragEnd, onMove,
}: {
  order: Cotizacion;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: () => void;
}) {
  const precio = resultNum(order, 'salePriceGTQ');
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', order.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      className="group flex items-center gap-2 px-3 py-2 rounded-xl bg-nodo-inset
                 hover:bg-nodo-raised transition-colors cursor-grab active:cursor-grabbing"
    >
      <Package size={13} className="text-nodo-dim shrink-0" />
      <span className="flex-1 min-w-0 truncate text-sm font-semibold text-nodo-ink">{order.product_name}</span>
      <span className="text-xs font-black text-nodo-ink tabular-nums shrink-0">{fmtGTQ(precio)}</span>
      <button
        onClick={onMove}
        title="Mover a paquete"
        className="shrink-0 w-7 h-7 rounded-lg bg-nodo-card border border-nodo-line flex items-center justify-center
                   text-nodo-dim hover:text-nodo-ink active:scale-90 transition-all"
      >
        <MoveRight size={13} />
      </button>
    </div>
  );
}

// ─── Tarjeta de paquete ──────────────────────────────────────────────────────────

function PaqueteCard({
  paquete, isDropTarget, onDragOver, onDragLeave, onDrop,
  onAdvance, onBack, onEdit, onMoveOrder, busy,
}: {
  paquete: Paquete;
  isDropTarget: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onAdvance: () => void;
  onBack: () => void;
  onEdit: () => void;
  onMoveOrder: (o: Cotizacion) => void;
  busy: boolean;
}) {
  const t = totals(paquete.cotizaciones);
  const next = NEXT_STATUS[paquete.status];
  const prev = PREV_STATUS[paquete.status];

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`rounded-2xl border-2 transition-colors p-3.5 flex flex-col gap-3
                  ${isDropTarget ? 'border-nodo-iris-mid bg-nodo-iris-soft' : 'border-nodo-line bg-nodo-card'}`}
      style={isDropTarget ? { borderColor: 'var(--nodo-iris)' } : undefined}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--nodo-iris-soft)' }}>
          <Boxes size={16} style={{ color: 'var(--nodo-iris)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-nodo-ink text-sm leading-tight truncate">{paquete.name}</p>
          <p className="text-[11px] text-nodo-dim">{paquete.cotizaciones.length} {paquete.cotizaciones.length === 1 ? 'producto' : 'productos'}</p>
        </div>
        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${STATUS_CLS[paquete.status] ?? STATUS_CLS.cotizado}`}>
          {STATUS_LABEL[paquete.status] ?? paquete.status}
        </span>
        <button onClick={onEdit} title="Editar paquete"
          className="shrink-0 w-7 h-7 rounded-lg bg-nodo-inset flex items-center justify-center text-nodo-dim hover:text-nodo-ink active:scale-90 transition-all">
          <Pencil size={12} />
        </button>
      </div>

      {/* Meta */}
      {(paquete.tracking_number || paquete.estimated_delivery) && (
        <div className="flex items-center gap-3 flex-wrap text-[11px] text-nodo-dim -mt-1">
          {paquete.estimated_delivery && (
            <span className="inline-flex items-center gap-1"><Calendar size={11} /> {fmtDate(paquete.estimated_delivery)}</span>
          )}
          {paquete.tracking_number && (
            <span className="inline-flex items-center gap-1 max-w-[160px]"><MapPin size={11} className="shrink-0" /><span className="truncate">{paquete.tracking_number}</span></span>
          )}
        </div>
      )}

      {/* Miembros */}
      <div className="flex flex-col gap-1.5">
        {paquete.cotizaciones.length === 0 ? (
          <div className="text-center py-4 text-xs text-nodo-dim border border-dashed border-nodo-line rounded-xl">
            Arrastrá o tocá <MoveRight size={11} className="inline" /> en un pedido para meterlo aquí
          </div>
        ) : (
          paquete.cotizaciones.map(o => (
            <OrderChip key={o.id} order={o}
              onDragStart={() => {}} onDragEnd={() => {}}
              onMove={() => onMoveOrder(o)} />
          ))
        )}
      </div>

      {/* Totales combinados */}
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-nodo-inset p-2.5">
        <div className="text-center">
          <p className="text-[8px] font-bold text-nodo-dim uppercase tracking-wider">Precio</p>
          <p className="text-sm font-black text-nodo-ink tabular-nums">{fmtGTQ(t.precio)}</p>
        </div>
        <div className="text-center">
          <p className="text-[8px] font-bold text-nodo-dim uppercase tracking-wider">Costo</p>
          <p className="text-sm font-black text-nodo-sub tabular-nums">{fmtGTQ(t.costo)}</p>
        </div>
        <div className="text-center">
          <p className="text-[8px] font-bold text-nodo-dim uppercase tracking-wider">Ganancia</p>
          <p className="text-sm font-black tabular-nums" style={{ color: 'var(--nodo-iris)' }}>{fmtGTQ(t.ganancia)}</p>
        </div>
      </div>

      {/* Acciones de estado unificado */}
      <div className="flex gap-2">
        {prev && (
          <button onClick={onBack} disabled={busy} title={`Volver a ${STATUS_LABEL[prev]}`}
            className="h-9 px-3 rounded-full border border-nodo-line text-nodo-sub hover:bg-nodo-inset active:scale-95 transition-all disabled:opacity-40 flex items-center">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
          </button>
        )}
        {next && (
          <button onClick={onAdvance} disabled={busy}
            className="flex-1 h-9 rounded-full font-bold text-xs flex items-center justify-center gap-1.5
                       active:scale-[0.97] transition-transform disabled:opacity-40"
            style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ChevronRight size={13} />}
            {NEXT_STATUS_ACTION[paquete.status] ?? STATUS_LABEL[next]}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Board principal ─────────────────────────────────────────────────────────────

export function PaquetesBoard({
  cotizaciones, onChanged,
}: {
  cotizaciones: Cotizacion[];
  onChanged: () => void;
}) {
  const [paquetes, setPaquetes]   = useState<Paquete[]>([]);
  const [loading, setLoading]     = useState(true);
  const [busyId, setBusyId]       = useState<string | null>(null);
  const [dragId, setDragId]       = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Mover (móvil) + editar paquete
  const [moveOrder, setMoveOrder]   = useState<Cotizacion | null>(null);
  const [editPaquete, setEditPaquete] = useState<Paquete | null>(null);

  const loadPaquetes = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await importacionesService.listPaquetes();
      setPaquetes(data.filter(p => p.status !== 'pagado' && p.status !== 'cancelado'
        || p.cotizaciones.length > 0));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadPaquetes(); }, [loadPaquetes]);

  const reloadAll = useCallback(async () => {
    await loadPaquetes();
    onChanged();
  }, [loadPaquetes, onChanged]);

  // Órdenes sueltas activas (sin paquete, no cerradas)
  const sueltas = cotizaciones.filter(c => !c.paquete_id && !isClosed(c));

  // Agrupar por cliente
  const groups: ClientGroup[] = (() => {
    const map = new Map<string, ClientGroup>();
    const ensure = (clienteId: string | null, name: string): ClientGroup => {
      const key = clienteId ?? '__none__';
      let g = map.get(key);
      if (!g) {
        g = { key, clienteId, clienteName: name, paquetes: [], sueltos: [] };
        map.set(key, g);
      }
      return g;
    };
    for (const p of paquetes) {
      const g = ensure(p.cliente_id, p.cliente?.name ?? 'Sin cliente');
      g.paquetes.push(p);
    }
    for (const c of sueltas) {
      const g = ensure(c.cliente_id, c.cliente?.name ?? 'Sin cliente');
      g.sueltos.push(c);
    }
    // Orden: clientes con nombre primero, "Sin cliente" al final
    return [...map.values()].sort((a, b) => {
      if (a.clienteId === null) return 1;
      if (b.clienteId === null) return -1;
      return a.clienteName.localeCompare(b.clienteName);
    });
  })();

  async function assign(cotizacionId: string, paqueteId: string | null) {
    setBusyId(cotizacionId);
    try {
      await importacionesService.assignPaquete(cotizacionId, paqueteId);
      await reloadAll();
    } finally { setBusyId(null); }
  }

  async function createPaqueteForClient(clienteId: string | null, firstOrderId?: string) {
    const { data } = await importacionesService.createPaquete({
      cliente_id: clienteId,
      cotizacion_ids: firstOrderId ? [firstOrderId] : [],
    });
    await reloadAll();
    return data;
  }

  async function advance(p: Paquete, status: CotizacionStatus) {
    setBusyId(p.id);
    try {
      await importacionesService.advancePaqueteStatus(p.id, status);
      await reloadAll();
    } finally { setBusyId(null); }
  }

  // Drag handlers (desktop)
  const onDropTo = (paqueteId: string | null) => (e: React.DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const id = e.dataTransfer.getData('text/plain') || dragId;
    if (id) assign(id, paqueteId);
    setDragId(null);
  };

  if (loading) {
    return (
      <div className="nodo-spinner-container">
        <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="nodo-card p-10 text-center">
        <div className="w-16 h-16 mx-auto mb-3 rounded-3xl flex items-center justify-center" style={{ background: 'var(--nodo-iris-soft)' }}>
          <Boxes className="w-8 h-8 text-nodo-sub" />
        </div>
        <p className="text-base font-bold text-nodo-ink mb-1">Sin pedidos para agrupar</p>
        <p className="text-sm text-nodo-sub">Guardá cotizaciones y acá las organizás en paquetes por cliente.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        {groups.map(g => (
          <div key={g.key} className="flex flex-col gap-2.5">
            {/* Encabezado de cliente */}
            <div className="flex items-center gap-2 px-1">
              <p className="text-sm font-black text-nodo-ink">{g.clienteName}</p>
              <span className="text-[11px] text-nodo-dim">
                {g.paquetes.length > 0 && `${g.paquetes.length} paq · `}{g.sueltos.length} sueltos
              </span>
              <button
                onClick={() => createPaqueteForClient(g.clienteId)}
                className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full
                           bg-nodo-inset text-nodo-sub hover:text-nodo-ink hover:bg-nodo-raised active:scale-95 transition-all"
              >
                <PackagePlus size={13} /> Nuevo paquete
              </button>
            </div>

            {/* Paquetes del cliente */}
            {g.paquetes.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {g.paquetes.map(p => (
                  <PaqueteCard
                    key={p.id}
                    paquete={p}
                    isDropTarget={dropTarget === p.id}
                    onDragOver={e => { e.preventDefault(); setDropTarget(p.id); }}
                    onDragLeave={() => setDropTarget(prev => prev === p.id ? null : prev)}
                    onDrop={onDropTo(p.id)}
                    onAdvance={() => { const n = NEXT_STATUS[p.status]; if (n) advance(p, n); }}
                    onBack={() => { const pr = PREV_STATUS[p.status]; if (pr) advance(p, pr); }}
                    onEdit={() => setEditPaquete(p)}
                    onMoveOrder={o => setMoveOrder(o)}
                    busy={busyId === p.id}
                  />
                ))}
              </div>
            )}

            {/* Sueltos (zona para sacar de paquete arrastrando aquí) */}
            <div
              onDragOver={e => { e.preventDefault(); setDropTarget('loose:' + g.key); }}
              onDragLeave={() => setDropTarget(prev => prev === 'loose:' + g.key ? null : prev)}
              onDrop={onDropTo(null)}
              className={`rounded-2xl border-2 border-dashed p-2.5 transition-colors
                          ${dropTarget === 'loose:' + g.key ? 'bg-nodo-iris-soft' : 'border-nodo-line'}`}
              style={dropTarget === 'loose:' + g.key ? { borderColor: 'var(--nodo-iris)' } : undefined}
            >
              {g.sueltos.length === 0 ? (
                <p className="text-center text-[11px] text-nodo-dim py-1.5">Sin pedidos sueltos</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {g.sueltos.map(o => (
                    <OrderChip
                      key={o.id} order={o}
                      onDragStart={() => setDragId(o.id)}
                      onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                      onMove={() => setMoveOrder(o)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Sheet: mover orden a paquete (móvil-friendly) ── */}
      <MoveSheet
        order={moveOrder}
        paquetes={moveOrder ? paquetes.filter(p =>
          (p.cliente_id ?? '__none__') === (moveOrder.cliente_id ?? '__none__')) : []}
        onClose={() => setMoveOrder(null)}
        onPick={async (paqueteId) => {
          const o = moveOrder!;
          setMoveOrder(null);
          await assign(o.id, paqueteId);
        }}
        onNew={async () => {
          const o = moveOrder!;
          setMoveOrder(null);
          await createPaqueteForClient(o.cliente_id, o.id);
        }}
      />

      {/* ── Sheet: editar paquete ── */}
      <EditPaqueteSheet
        paquete={editPaquete}
        onClose={() => setEditPaquete(null)}
        onSaved={reloadAll}
        onDeleted={reloadAll}
      />
    </>
  );
}

// ─── Sheet: mover a paquete ──────────────────────────────────────────────────────

function MoveSheet({
  order, paquetes, onClose, onPick, onNew,
}: {
  order: Cotizacion | null;
  paquetes: Paquete[];
  onClose: () => void;
  onPick: (paqueteId: string | null) => void;
  onNew: () => void;
}) {
  return (
    <BottomSheet open={!!order} onClose={onClose} title="Mover a paquete">
      {order && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-nodo-sub mb-1">
            <span className="font-bold text-nodo-ink">{order.product_name}</span>
            {order.cliente?.name ? ` · ${order.cliente.name}` : ''}
          </p>

          {paquetes.map(p => (
            <button key={p.id} onClick={() => onPick(p.id)}
              disabled={p.id === order.paquete_id}
              className="flex items-center gap-3 p-3 rounded-2xl bg-nodo-inset hover:bg-nodo-raised
                         active:scale-[0.98] transition-all text-left disabled:opacity-40">
              <Boxes size={18} style={{ color: 'var(--nodo-iris)' }} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-nodo-ink truncate">{p.name}</p>
                <p className="text-[11px] text-nodo-dim">{p.cotizaciones.length} productos · {STATUS_LABEL[p.status]}</p>
              </div>
              {p.id === order.paquete_id
                ? <Check size={16} className="text-nodo-success-tx shrink-0" />
                : <ChevronRight size={16} className="text-nodo-dim shrink-0" />}
            </button>
          ))}

          <button onClick={onNew}
            className="flex items-center gap-3 p-3 rounded-2xl border-2 border-dashed border-nodo-line
                       hover:bg-nodo-inset active:scale-[0.98] transition-all text-left">
            <PackagePlus size={18} className="text-nodo-sub shrink-0" />
            <span className="text-sm font-bold text-nodo-ink">Crear paquete nuevo</span>
          </button>

          {order.paquete_id && (
            <button onClick={() => onPick(null)}
              className="flex items-center gap-3 p-3 rounded-2xl bg-nodo-danger-bg text-nodo-danger-tx
                         active:scale-[0.98] transition-all text-left mt-1">
              <Undo2 size={18} className="shrink-0" />
              <span className="text-sm font-bold">Sacar del paquete</span>
            </button>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

// ─── Sheet: editar / disolver paquete ────────────────────────────────────────────

function EditPaqueteSheet({
  paquete, onClose, onSaved, onDeleted,
}: {
  paquete: Paquete | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName]         = useState('');
  const [tracking, setTracking] = useState('');
  const [delivery, setDelivery] = useState('');
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (paquete) {
      setName(paquete.name);
      setTracking(paquete.tracking_number ?? '');
      setDelivery(paquete.estimated_delivery ?? '');
      setNotes(paquete.notes ?? '');
    }
  }, [paquete]);

  async function save() {
    if (!paquete) return;
    setSaving(true);
    try {
      await importacionesService.updatePaquete(paquete.id, {
        name: name.trim() || paquete.name,
        tracking_number: tracking.trim() || null,
        estimated_delivery: delivery || null,
        notes: notes.trim() || null,
      });
      onSaved();
      onClose();
    } finally { setSaving(false); }
  }

  async function dissolve() {
    if (!paquete) return;
    setSaving(true);
    try {
      await importacionesService.deletePaquete(paquete.id);
      onDeleted();
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <BottomSheet
      open={!!paquete}
      onClose={onClose}
      title="Editar paquete"
      footer={
        <button onClick={save} disabled={saving}
          className="w-full h-[52px] rounded-full font-bold text-base flex items-center justify-center gap-2.5
                     shadow-lg active:scale-[0.97] transition-transform disabled:opacity-40"
          style={{ background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' }}>
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          Guardar
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="nodo-label">Nombre del paquete</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Ej. Envío julio" className="nodo-input" />
        </div>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="nodo-label">Tracking (todo el paquete)</label>
            <input type="text" value={tracking} onChange={e => setTracking(e.target.value)}
              placeholder="Ej. 1Z999AA10123456784" className="nodo-input" />
          </div>
          <div>
            <label className="nodo-label">Entrega estimada</label>
            <input type="date" value={delivery} onChange={e => setDelivery(e.target.value)}
              className="nodo-input" />
          </div>
          <div>
            <label className="nodo-label">Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Observaciones del envío…" className="nodo-textarea" />
          </div>
        </div>
        <button onClick={dissolve} disabled={saving}
          className="w-full h-12 rounded-2xl bg-nodo-danger-bg text-nodo-danger-tx font-bold text-sm
                     flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40">
          <Trash2 size={15} /> Disolver paquete (los pedidos quedan sueltos)
        </button>
      </div>
    </BottomSheet>
  );
}
