/**
 * "Mi pedido" — pedido acumulado del cliente (Importaciones), sin login del SaaS.
 * Agrupa todas las reservas del mismo teléfono bajo un order_token consultable.
 * Es el destino permanente del cliente: ver, seguir agregando y confirmar por WhatsApp.
 */
import { useState, useEffect } from 'react';
import {
  Loader2, ShoppingBag, Check, X, MessageCircle, AlertTriangle,
  Clock, Plus, Minus, Truck, Package, Trash2, PackageX, Sparkles,
} from 'lucide-react';
import {
  importCatalogService,
  type PublicImportOrder,
  type PublicImportOrderLine,
  type ReservationStatus,
} from '@/services/import_catalog.service';
import { haptic } from '@/utils/haptic';
import { themeStyle, PayInfoCard } from './importPublicShared';

interface Props { orderToken: string }

const fmt = (n: number) =>
  'Q ' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function buildWhatsApp(phone: string, message: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}

function useCountdownToClose(closeAt?: string | null) {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    if (!closeAt) { setMs(null); return; }
    const tick = () => setMs(new Date(closeAt).getTime() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [closeAt]);
  if (ms === null) return null;
  if (ms <= 0) return 'Cerrado';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

const glassCard: React.CSSProperties = {
  background:
    'linear-gradient(178deg, var(--nodo-glass-highlight) 0%, transparent 34%),'
    + 'radial-gradient(120% 80% at 12% -15%, rgba(255,255,255,0.16) 0%, transparent 52%),'
    + 'var(--nodo-glass-bg-strong)',
  backdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
  WebkitBackdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
  border: '1px solid var(--nodo-glass-border)',
  boxShadow: 'var(--nodo-shadow-card)',
};

// Camino "feliz" del cliente — se dibuja como un tablero de progreso (juego).
const HAPPY: ReservationStatus[] = ['pendiente', 'confirmada', 'comprada', 'en_camino', 'entregada'];

const STEP_UI: Record<string, { label: string; short: string; emoji: string }> = {
  pendiente:  { label: 'Apartado',   short: 'Apartado',  emoji: '📝' },
  confirmada: { label: 'Confirmado', short: 'Confirmado', emoji: '✅' },
  comprada:   { label: 'Comprado',   short: 'Comprado',  emoji: '🛒' },
  en_camino:  { label: 'En camino',  short: 'En camino', emoji: '✈️' },
  entregada:  { label: '¡Entregado!', short: 'Entregado', emoji: '🎉' },
};

// Tablero de progreso por línea (pendiente → entregada). El punto activo late.
function ProgressTrack({ status }: { status: ReservationStatus }) {
  const idx = HAPPY.indexOf(status);
  if (idx < 0) return null;
  return (
    <div className="flex items-center mt-3">
      {HAPPY.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={s} className={`flex items-center ${i < HAPPY.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${active ? 'animate-pulse' : ''}`}
                style={{
                  background: done || active ? 'var(--nodo-primary)' : 'var(--nodo-inset)',
                  color: done || active ? 'var(--nodo-on-primary)' : undefined,
                }}>
                {done ? <Check size={12} /> : active ? STEP_UI[s].emoji : ''}
              </span>
              <span className={`text-[8px] font-bold tracking-tight whitespace-nowrap ${active ? 'text-nodo-ink' : 'text-nodo-dim'}`}>
                {STEP_UI[s].short}
              </span>
            </div>
            {i < HAPPY.length - 1 && (
              <span className="h-0.5 flex-1 rounded-full mx-0.5 -mt-4"
                style={{ background: i < idx ? 'var(--nodo-primary)' : 'var(--nodo-line)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function deliveryRangeLabel(minDays: number, maxDays: number) {
  const f = (n: number) => {
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.toLocaleDateString('es-GT', { day: 'numeric', month: 'short' });
  };
  return `${f(minDays)} – ${f(maxDays)}`;
}

// ─── "No pudimos conseguirlo" — desenlace cálido con reemplazo similar ───────────
function NoDispCard({ line, busy, onSwap, onDismiss }: {
  line: PublicImportOrderLine; busy: boolean;
  onSwap: (lineId: string, itemId: string) => void;
  onDismiss: (lineId: string) => void;
}) {
  return (
    <div className="p-4 rounded-3xl border" style={{ ...glassCard, borderColor: 'var(--nodo-warn-bd)' }}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-nodo-warn-bg flex items-center justify-center shrink-0">
          <PackageX size={20} className="text-nodo-warn-tx" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-nodo-ink">No pudimos conseguirlo 😔</p>
          <p className="text-xs text-nodo-sub font-medium line-clamp-1">{line.item_title}</p>
        </div>
      </div>

      <p className="text-xs text-nodo-sub leading-relaxed mt-2.5">
        {line.resolution_note?.trim()
          || 'Lo lamentamos de verdad. No afecta el resto de tu pedido y, por supuesto, no se te cobra por este artículo.'}
      </p>

      {line.suggested_items.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={13} style={{ color: 'var(--nodo-primary)' }} />
            <p className="text-[11px] font-black text-nodo-ink uppercase tracking-widest">Quizás te guste esto</p>
          </div>
          <div className="space-y-2">
            {line.suggested_items.map(s => (
              <div key={s.id} className="flex items-center gap-2.5 p-2 rounded-2xl bg-nodo-inset">
                <div className="w-11 h-11 rounded-xl bg-white overflow-hidden shrink-0 flex items-center justify-center">
                  {s.image_url
                    ? <img src={s.image_url} alt={s.title} className="w-full h-full object-contain p-1" />
                    : <Package size={18} className="text-nodo-dim" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-nodo-ink line-clamp-1">{s.title}</p>
                  {s.price_gtq != null && (
                    <p className="text-[12px] font-black text-nodo-ink tabular-nums">{fmt(s.price_gtq)}</p>
                  )}
                </div>
                <button onClick={() => onSwap(line.id, s.id)} disabled={busy}
                  className="h-9 px-3 rounded-xl text-[11px] font-black flex items-center gap-1 active:scale-95 transition-transform disabled:opacity-40"
                  style={{ background: 'var(--nodo-primary)', color: 'var(--nodo-on-primary)' }}>
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Cambiar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => onDismiss(line.id)} disabled={busy}
        className="w-full h-9 rounded-xl bg-nodo-inset text-nodo-sub text-xs font-bold mt-2.5 active:scale-95 transition-transform disabled:opacity-40">
        Está bien, quítalo de mi pedido
      </button>
    </div>
  );
}

export function ImportOrderPage({ orderToken }: Props) {
  const [order, setOrder] = useState<PublicImportOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [lineErr, setLineErr] = useState<string | null>(null);

  useEffect(() => {
    importCatalogService.getClientOrder(orderToken)
      .then(setOrder)
      .catch(e => { if (e.response?.status === 404) setNotFound(true); })
      .finally(() => setLoading(false));
  }, [orderToken]);

  const errDetail = (e: unknown) =>
    (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;

  const changeQty = async (lineId: string, next: number, max: number) => {
    if (busyLine || next < 1 || next > max) return;
    haptic.tap(); setBusyLine(lineId); setLineErr(null);
    try {
      setOrder(await importCatalogService.updateOrderLine(orderToken, lineId, next));
    } catch (e) {
      haptic.error(); setLineErr(errDetail(e) ?? 'No se pudo actualizar la cantidad.');
    } finally { setBusyLine(null); }
  };

  const removeLine = async (lineId: string) => {
    if (busyLine) return;
    haptic.error(); setBusyLine(lineId); setLineErr(null);
    try {
      setOrder(await importCatalogService.removeOrderLine(orderToken, lineId));
      haptic.confirm();
    } catch (e) {
      haptic.error(); setLineErr(errDetail(e) ?? 'No se pudo quitar el producto.');
    } finally { setBusyLine(null); setConfirmRemove(null); }
  };

  // El cliente acepta un reemplazo para una línea que no se pudo conseguir.
  const swapLine = async (lineId: string, newItemId: string) => {
    if (busyLine) return;
    haptic.tap(); setBusyLine(lineId); setLineErr(null);
    try {
      setOrder(await importCatalogService.swapOrderLine(orderToken, lineId, newItemId));
      haptic.confirm();
    } catch (e) {
      haptic.error(); setLineErr(errDetail(e) ?? 'No se pudo cambiar el producto.');
    } finally { setBusyLine(null); }
  };

  // El cliente descarta de su vista una línea que no se pudo conseguir.
  const dismissLine = async (lineId: string) => {
    if (busyLine) return;
    haptic.tap(); setBusyLine(lineId); setLineErr(null);
    try {
      setOrder(await importCatalogService.dismissOrderLine(orderToken, lineId));
    } catch (e) {
      haptic.error(); setLineErr(errDetail(e) ?? 'No se pudo actualizar.');
    } finally { setBusyLine(null); }
  };

  const countdown = useCountdownToClose(order?.trip_close_at);
  const tripLabel = order?.trip_label?.trim() || 'viaje';

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-nodo-canvas">
      <Loader2 className="w-8 h-8 animate-spin text-nodo-sub" />
    </div>
  );

  if (notFound || !order) return (
    <div className="min-h-screen flex items-center justify-center bg-nodo-canvas p-6">
      <div className="text-center max-w-xs space-y-3">
        <div className="w-16 h-16 rounded-3xl bg-nodo-inset flex items-center justify-center mx-auto">
          <AlertTriangle size={28} className="text-nodo-dim" />
        </div>
        <h1 className="text-xl font-black text-nodo-ink">Pedido no encontrado</h1>
        <p className="text-sm text-nodo-sub">Este link ya no está disponible.</p>
      </div>
    </div>
  );

  const happySet = new Set<string>(HAPPY);
  const active = order.lines.filter(l => happySet.has(l.status));
  const noDisp = order.lines.filter(l => l.status === 'no_disponible' && !l.resolved_by_substitute);
  const cancelled = order.lines.filter(l => l.status === 'cancelada');
  const catalogHref = order.catalog_token ? `/importa/${order.catalog_token}` : null;

  const handleWhatsApp = () => {
    if (!order.whatsapp_number) return;
    haptic.confirm();
    const items = active.map(l => `• ${l.item_title} x${l.quantity}`).join('\n');
    const msg = `¡Hola! Soy ${order.client_name}. Confirmo mi pedido:\n${items}\n\nTotal: ${fmt(order.total_gtq)}\n${window.location.href}`;
    window.open(buildWhatsApp(order.whatsapp_number, msg), '_blank');
  };

  return (
    <div className="contents" style={themeStyle(order.theme_color)}>
      <div className="fixed inset-0 -z-10 pointer-events-none dark:opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 80% 40% at 50% -10%, rgba(105,231,168,0.14) 0%, transparent 70%),'
            + 'radial-gradient(ellipse 60% 40% at 80% 80%, rgba(65,88,208,0.08) 0%, transparent 60%)',
        }} />

      <div className="min-h-screen bg-nodo-canvas">
        <header className="sticky top-0 z-20 px-4 py-3"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 10px)',
            background: 'var(--nodo-glass-bg-strong)',
            backdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
            WebkitBackdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
            borderBottom: '1px solid var(--nodo-glass-border)',
          }}>
          <div className="flex items-center gap-3 max-w-lg mx-auto">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
              style={{ background: order.logo_url ? '#fff' : 'var(--nodo-iris)' }}>
              {order.logo_url
                ? <img src={order.logo_url} alt={order.business_name ?? ''} className="w-full h-full object-contain p-0.5" />
                : <ShoppingBag size={16} className="text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-nodo-ink truncate leading-tight text-sm">Mi pedido</p>
              <p className="text-[11px] text-nodo-sub font-medium truncate">
                {order.business_name ?? 'Importaciones'} · {order.client_name}
              </p>
            </div>
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 pb-28 space-y-4 pt-4">
          {/* Marcador del pedido — hero */}
          <div className="relative overflow-hidden rounded-[28px] p-5 text-nodo-on-primary"
            style={{ background: 'var(--nodo-iris)', boxShadow: 'var(--nodo-shadow-fab)' }}>
            <div className="absolute -right-6 -top-8 opacity-20"><Package size={120} strokeWidth={1.2} /></div>
            <div className="relative">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-90">Total apartado</p>
              <p className="text-[44px] leading-none font-black tabular-nums tracking-tighter mt-1">{fmt(order.total_gtq)}</p>
              <p className="text-sm font-bold opacity-90 mt-1">
                {order.total_items} {order.total_items === 1 ? 'producto' : 'productos'} en tu pedido
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {countdown && order.trip_close_at && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/15 text-xs font-bold">
                    <Clock size={13} /> {order.trip_name ?? `Próximo ${tripLabel}`}: cierra en {countdown}
                  </div>
                )}
                {order.order_pin && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/15 text-xs font-bold">
                    Código: <span className="tabular-nums tracking-widest">{order.order_pin}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {lineErr && (
            <div className="flex items-center gap-2 bg-nodo-danger-bg border border-nodo-danger-bd
                            text-nodo-danger-tx text-xs font-bold px-3 py-2.5 rounded-2xl">
              <AlertTriangle size={14} className="shrink-0" />
              <span className="flex-1">{lineErr}</span>
              <button onClick={() => setLineErr(null)}><X size={12} /></button>
            </div>
          )}

          {/* Líneas activas — cada una con su tablero de progreso (juego) */}
          <div className="space-y-2.5">
            {active.map(line => {
              const busy = busyLine === line.id;
              const confirming = confirmRemove === line.id;
              return (
                <div key={line.id} className="p-3.5 rounded-3xl" style={glassCard}>
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl bg-white overflow-hidden shrink-0 flex items-center justify-center">
                      {line.item_image_url
                        ? <img src={line.item_image_url} alt={line.item_title} className="w-full h-full object-contain p-1" />
                        : <Package size={22} className="text-nodo-dim" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-nodo-ink leading-snug line-clamp-2">{line.item_title}</p>
                      <p className="text-[11px] font-bold text-nodo-sub mt-0.5">
                        {STEP_UI[line.status]?.emoji} {STEP_UI[line.status]?.label}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {line.item_price_gtq != null && (
                        <p className="text-sm font-black text-nodo-ink tabular-nums">{fmt(line.item_price_gtq * line.quantity)}</p>
                      )}
                      <p className="text-[11px] text-nodo-dim font-semibold">x{line.quantity}</p>
                    </div>
                  </div>

                  <ProgressTrack status={line.status} />

                  {/* Editar cantidad / quitar — solo mientras esté pendiente (no confirmado) */}
                  {line.editable && (
                    confirming ? (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-nodo-line">
                        <p className="flex-1 text-[11px] font-bold text-nodo-danger-tx leading-snug">
                          ¿Quitar del pedido? Se libera tu apartado y perderías el precio reservado.
                        </p>
                        <button onClick={() => setConfirmRemove(null)} disabled={busy}
                          className="h-9 px-3 rounded-xl bg-nodo-inset text-nodo-sub text-xs font-bold active:scale-95 transition-transform">
                          Conservar
                        </button>
                        <button onClick={() => removeLine(line.id)} disabled={busy}
                          className="h-9 px-3 rounded-xl bg-nodo-danger-tx text-white text-xs font-black flex items-center gap-1 active:scale-95 transition-transform disabled:opacity-40">
                          {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Quitar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-nodo-line">
                        <div className="flex items-center gap-2 flex-1">
                          <button onClick={() => changeQty(line.id, line.quantity - 1, line.stock_available)}
                            disabled={busy || line.quantity <= 1}
                            className="w-9 h-9 rounded-xl bg-nodo-inset border border-nodo-line flex items-center justify-center text-nodo-ink active:scale-90 transition-transform disabled:opacity-30">
                            <Minus size={14} />
                          </button>
                          <span className="w-8 text-center text-sm font-black text-nodo-ink tabular-nums">
                            {busy ? '…' : line.quantity}
                          </span>
                          <button onClick={() => changeQty(line.id, line.quantity + 1, line.stock_available)}
                            disabled={busy || line.quantity >= line.stock_available}
                            className="w-9 h-9 rounded-xl bg-nodo-ink flex items-center justify-center text-nodo-canvas active:scale-90 transition-transform disabled:opacity-30">
                            <Plus size={14} />
                          </button>
                        </div>
                        <button onClick={() => { haptic.tap(); setConfirmRemove(line.id); }} disabled={busy}
                          className="h-9 px-3 rounded-xl bg-nodo-danger-bg text-nodo-danger-tx text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-transform">
                          <Trash2 size={13} /> Quitar
                        </button>
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>

          {/* No disponible — resolución cálida + reemplazo similar */}
          {noDisp.map(line => (
            <NoDispCard key={line.id} line={line} busy={busyLine === line.id}
              onSwap={swapLine} onDismiss={dismissLine} />
          ))}

          {/* Quitados del pedido — resumen mínimo, sin frialdad */}
          {cancelled.length > 0 && (
            <details className="rounded-2xl px-4 py-3" style={glassCard}>
              <summary className="text-[11px] font-bold text-nodo-dim uppercase tracking-widest cursor-pointer select-none">
                Quitados del pedido ({cancelled.length})
              </summary>
              <div className="mt-2 space-y-1">
                {cancelled.map(l => (
                  <p key={l.id} className="text-xs text-nodo-dim line-through">{l.item_title} · x{l.quantity}</p>
                ))}
              </div>
            </details>
          )}

          {/* Entrega estimada */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={glassCard}>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <Truck size={16} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-widest">Entrega estimada</p>
              <p className="text-sm font-black text-nodo-ink">
                {deliveryRangeLabel(order.delivery_days_min, order.delivery_days_max)}
              </p>
            </div>
          </div>

          {catalogHref && (
            <a href={catalogHref}
              className="flex items-center justify-center gap-2 w-full rounded-2xl bg-nodo-inset text-nodo-ink font-black text-sm
                         active:scale-[0.97] transition-transform" style={{ height: 50 }}>
              <Plus size={17} /> Seguir agregando al pedido
            </a>
          )}

          {order.pay_info && <PayInfoCard pay={order.pay_info} />}

          <p className="text-center text-[10px] text-nodo-dim pt-2">
            {order.business_name ? `${order.business_name} · ` : ''}Pedido seguro con Nodo
          </p>
        </div>
      </div>

      {/* CTA WhatsApp fija al alcance del pulgar */}
      {order.whatsapp_number && active.length > 0 && (
        <div className="fixed left-0 right-0 z-[60] px-4"
          style={{ bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
          <div className="max-w-lg mx-auto">
            <button onClick={handleWhatsApp}
              className="w-full rounded-full bg-emerald-500 text-white font-black text-base
                         flex items-center justify-center gap-2 shadow-lg active:scale-[0.97] transition-transform"
              style={{ height: 54 }}>
              <MessageCircle size={18} /> Confirmar pedido por WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
