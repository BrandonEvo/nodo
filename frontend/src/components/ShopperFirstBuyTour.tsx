/**
 * Tutorial de primera compra del catálogo público del Personal Shopper.
 * Coach-mark tipo spotlight sobre los elementos reales (por [data-tour="..."]),
 * autocontenido y sin librerías. Dos pasos, una línea de texto cada uno.
 *
 * El velo apaga la pantalla salvo el hueco del CTA, y el reloj del drop sigue
 * corriendo dentro del tooltip: la urgencia no se pausa, se enfoca.
 *
 * El padre decide cuándo montar, qué pasos incluir y persiste el "ya lo vi".
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { X, ChevronRight, Check } from 'lucide-react';
import { haptic } from '@/utils/haptic';

export interface ShopperTourStep {
  /** Valor de data-tour del elemento a resaltar. Obligatorio: no hay pasos centrados. */
  target: string;
  emoji: string;
  /** Una línea, ≤ 8 palabras. */
  text: string;
  /** El hueco deja pasar el toque al elemento real y el tour se cierra solo. */
  interactive?: boolean;
}

const PAD = 8;

export function ShopperFirstBuyTour({ steps, clock, urgent, onClose, onTapThrough }: {
  steps: ShopperTourStep[];
  /** Countdown ya formateado por el padre; null → sin chip. */
  clock?: string | null;
  urgent?: boolean;
  onClose: () => void;
  /** El usuario tocó el elemento real de un paso `interactive`. Sin esto, obedecer
      al tutorial lo mataba y el paso siguiente no se veía nunca. */
  onTapThrough?: () => void;
}) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];
  const isLast = i === steps.length - 1;

  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const tapRef = useRef(onTapThrough);
  useEffect(() => { tapRef.current = onTapThrough; }, [onTapThrough]);

  const dismiss = useCallback(() => closeRef.current(), []);
  const finish = useCallback(() => { haptic.tap(); closeRef.current(); }, []);
  const next = () => { if (isLast) finish(); else { haptic.tap(); setI(v => v + 1); } };

  // Mide el target del paso y sigue al elemento en scroll/resize. Ojo: `clock` NO
  // puede entrar en las deps — el padre re-renderiza 1×/s y re-dispararía el scroll.
  const target = step?.target;
  const interactive = step?.interactive;
  useEffect(() => {
    if (!target) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
    if (!el) { closeRef.current(); return; }

    // Un spotlight sobre un botón que se agotó o se cerró es peor que no tener tutorial.
    const measure = () => {
      if (!document.contains(el) || el.hasAttribute('disabled')) { closeRef.current(); return; }
      setRect(el.getBoundingClientRect());
    };

    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Sólo scrollear si el target no está entero a la vista: en un teléfono el primer
    // card ya se ve junto al hero, y scrollear ahí sacaría el reloj de pantalla.
    if (!(r.top > 64 && r.bottom < vh - 12)) {
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    }
    measure();

    let raf = 0;
    const onMove = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    const settle = setTimeout(measure, 400);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);

    // Tap-through en pointerdown: el tour se desmonta antes de que corra el click real.
    const onTap = () => (tapRef.current ?? closeRef.current)();
    if (interactive) el.addEventListener('pointerdown', onTap);

    return () => {
      clearTimeout(settle);
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      if (interactive) el.removeEventListener('pointerdown', onTap);
    };
  }, [target, interactive]);

  if (!step || !rect) return null;

  const vh = window.innerHeight;
  const hole = {
    top: rect.top - PAD, left: rect.left - PAD,
    width: rect.width + PAD * 2, height: rect.height + PAD * 2,
  };
  const placeBelow = rect.bottom < vh * 0.56;
  const tipStyle: React.CSSProperties = placeBelow
    ? { top: hole.top + hole.height + 6, left: '50%', transform: 'translateX(-50%)' }
    : { bottom: vh - hole.top + 6, left: '50%', transform: 'translateX(-50%)' };

  // El box-shadow del velo no captura toques (sólo lo hace el box del div), así que
  // el bloqueo real lo hacen estos 4 rects alrededor del hueco.
  const shutter = 'absolute pointer-events-auto';

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none" role="dialog" aria-modal="true" aria-label="Cómo comprar">
      <style>{`
        @keyframes sct-veil-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes sct-ring-in { from { opacity: 0; transform: scale(1.12) } to { opacity: 1; transform: scale(1) } }
        @keyframes sct-ring    { 0%,100% { transform: scale(1) } 50% { transform: scale(1.035) } }
        @keyframes sct-tip-in  { from { opacity: 0; transform: translate3d(0,8px,0) scale(.96) } to { opacity: 1; transform: translate3d(0,0,0) scale(1) } }
        .sct-veil { animation: sct-veil-in .26s ease-out both; }
        .sct-ring { will-change: transform; animation: sct-ring-in .18s ease-out both, sct-ring 1.8s ease-in-out .18s infinite; }
        .sct-tip  { animation: sct-tip-in .30s cubic-bezier(.22,1,.36,1) both; }
        .sct-dot  { transform-origin: left; transition: transform .3s cubic-bezier(.22,1,.36,1); }
        @media (prefers-reduced-motion: reduce) {
          .sct-ring { animation: none; will-change: auto; }
          .sct-tip  { animation: sct-veil-in .16s linear both; }
          .sct-dot  { transition: none; }
        }
      `}</style>

      <div className="sct-veil absolute pointer-events-none"
        style={{ ...hole, borderRadius: 18, boxShadow: '0 0 0 9999px rgba(2,6,23,0.72)' }} />
      <div className="sct-ring absolute pointer-events-none rounded-[18px]"
        style={{ ...hole, boxShadow: '0 0 0 2px #fff, 0 0 0 6px var(--nodo-primary)' }} />

      {/* Tocar la zona oscura sale del tour: se auto-abrió sin permiso, un toque
          perdido debe ser una salida y no una trampa (se recupera con el ❓). */}
      <div className={shutter} style={{ top: 0, left: 0, right: 0, height: Math.max(0, hole.top) }} onClick={dismiss} />
      <div className={shutter} style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }} onClick={dismiss} />
      <div className={shutter} style={{ top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height }} onClick={dismiss} />
      <div className={shutter} style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }} onClick={dismiss} />
      {!step.interactive && (
        <div className={shutter} style={{ ...hole }} onClick={dismiss} />
      )}

      {/* Dos divs: el externo posiciona (translateX(-50%)), el interno anima — si
          comparten transform se pisan y el tooltip aparece corrido. */}
      <div className="absolute pointer-events-auto w-[min(92vw,320px)]" style={tipStyle}>
        <div key={i} className="sct-tip nodo-card p-4 relative">
          <button onClick={finish} aria-label="Cerrar"
            className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-nodo-inset text-nodo-sub flex items-center justify-center active:scale-90 transition-transform">
            <X size={13} />
          </button>

          {steps.length > 1 && (
            <div className="flex items-center gap-1 mb-2.5">
              {steps.map((_, idx) => (
                <span key={idx} className="h-1 w-[18px] rounded-full bg-nodo-line overflow-hidden">
                  <span className="sct-dot block h-full w-full rounded-full"
                    style={{ background: 'var(--nodo-primary)', transform: idx <= i ? 'scaleX(1)' : 'scaleX(.33)' }} />
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 mb-1.5 pr-6">
            <span className="text-[28px] leading-none">{step.emoji}</span>
            {clock && (
              <span className={`px-2.5 py-1 rounded-full text-[13px] font-black tabular-nums shrink-0 ${urgent ? 'bg-nodo-danger-bg text-nodo-danger-tx' : 'bg-nodo-inset text-nodo-sub'}`}>
                ⏰ {clock}
              </span>
            )}
          </div>

          <p className="text-[17px] font-black text-nodo-ink leading-snug">{step.text}</p>

          <button onClick={next}
            className="w-full h-12 mt-3 rounded-2xl bg-nodo-primary text-nodo-on-primary text-[15px] font-black flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform">
            {isLast ? <><Check size={16} /> ¡Listo!</> : <>Siguiente <ChevronRight size={16} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
