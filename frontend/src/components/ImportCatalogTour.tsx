/**
 * Tutorial guiado del catálogo público de Importaciones.
 * Coach-mark tipo spotlight, autocontenido (sin librerías, CSP-safe): resalta el
 * elemento real de cada paso (por [data-tour="..."]) con un tooltip que explica
 * dónde tocar. Cancelable en cualquier momento; se relanza desde el botón "Tutorial".
 *
 * El padre controla apertura montando/desmontando este componente y decide qué
 * pasos incluir (p. ej. omitir "apartar" si el catálogo está vacío).
 */
import { useEffect, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { haptic } from '@/utils/haptic';

export interface TourStep {
  /** Valor de data-tour del elemento a resaltar. Sin target → paso centrado. */
  target?: string;
  emoji: string;
  title: string;
  body: string;
}

const PAD = 8;   // margen del spotlight alrededor del elemento

export function ImportCatalogTour({ steps, onClose }: {
  steps: TourStep[];
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];
  const isLast = i === steps.length - 1;

  const finish = useCallback(() => { haptic.tap(); onClose(); }, [onClose]);
  const next = () => { if (isLast) finish(); else { haptic.tap(); setI(v => v + 1); } };
  const back = () => { if (i > 0) { haptic.tap(); setI(v => v - 1); } };

  // Localiza y mide el elemento del paso actual; lo trae a la vista y se
  // re-mide en scroll/resize para que el spotlight siga al elemento.
  useEffect(() => {
    if (!step?.target) { setRect(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) { setRect(null); return; }

    const measure = () => setRect(el.getBoundingClientRect());
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    measure();

    let raf = 0;
    const onMove = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    const settle = setTimeout(measure, 400);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      clearTimeout(settle);
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [i, step?.target]);

  if (!step) return null;

  // Posición del tooltip: bajo el elemento si hay espacio arriba, si no encima.
  // Sin elemento → centrado. Ancho fijo y centrado horizontalmente (robusto).
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const placeBelow = rect ? rect.bottom < vh * 0.56 : false;
  const tooltipStyle: React.CSSProperties = !rect
    ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    : placeBelow
      ? { top: rect.bottom + PAD + 6, left: '50%', transform: 'translateX(-50%)' }
      : { bottom: vh - rect.top + PAD + 6, left: '50%', transform: 'translateX(-50%)' };

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Tutorial">
      {/* Captura de toques: bloquea la página detrás; avanzar sólo con botones. */}
      <div className="absolute inset-0" />

      {/* Oscurecido: si hay elemento, el "hueco" lo hace la sombra gigante del
          spotlight; si no, un velo a pantalla completa. */}
      {rect ? (
        <>
          <div
            className="absolute pointer-events-none transition-all duration-300"
            style={{
              top: rect.top - PAD, left: rect.left - PAD,
              width: rect.width + PAD * 2, height: rect.height + PAD * 2,
              borderRadius: 18,
              boxShadow: '0 0 0 9999px rgba(2,6,23,0.66)',
            }}
          />
          <div
            className="absolute pointer-events-none rounded-[18px] animate-pulse"
            style={{
              top: rect.top - PAD, left: rect.left - PAD,
              width: rect.width + PAD * 2, height: rect.height + PAD * 2,
              boxShadow: '0 0 0 2px #fff, 0 0 0 6px var(--nodo-primary)',
            }}
          />
        </>
      ) : (
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(2,6,23,0.66)' }} />
      )}

      {/* Tooltip */}
      <div
        className="absolute liquid-glass liquid-glass-hero rounded-3xl p-5 w-[min(92vw,360px)]"
        style={tooltipStyle}
      >
        <button onClick={finish} aria-label="Cerrar tutorial"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-nodo-inset text-nodo-sub flex items-center justify-center active:scale-90 transition-transform">
          <X size={15} />
        </button>

        <div className="flex items-center gap-1 mb-2">
          {steps.map((_, idx) => (
            <span key={idx} className="h-1 rounded-full transition-all duration-300"
              style={{
                width: idx === i ? 18 : 6,
                background: idx <= i ? 'var(--nodo-primary)' : 'var(--nodo-line)',
              }} />
          ))}
        </div>

        <div className="text-3xl mb-1.5 leading-none">{step.emoji}</div>
        <p className="text-lg font-black text-nodo-ink leading-tight pr-6">{step.title}</p>
        <p className="text-sm text-nodo-sub font-medium mt-1.5 leading-snug">{step.body}</p>

        <div className="flex items-center gap-2 mt-4">
          {i > 0 && (
            <button onClick={back} aria-label="Anterior"
              className="h-11 w-11 rounded-2xl bg-nodo-inset text-nodo-sub flex items-center justify-center shrink-0 active:scale-90 transition-transform">
              <ChevronLeft size={18} />
            </button>
          )}
          {!isLast && (
            <button onClick={finish}
              className="h-11 px-4 rounded-2xl bg-nodo-inset text-nodo-sub text-sm font-bold active:scale-95 transition-transform">
              Saltar
            </button>
          )}
          <button onClick={next}
            className="flex-1 h-11 rounded-2xl text-white text-sm font-black flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform"
            style={{ background: 'var(--nodo-iris)' }}>
            {isLast ? <><Check size={16} /> ¡Entendido!</> : <>Siguiente <ChevronRight size={16} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
