import { useLayoutEffect, useRef } from 'react';

/**
 * Revela un elemento al entrar en viewport. Un solo IntersectionObserver
 * compartido por toda la landing, y `unobserve` al revelar: nunca vuelve a
 * ocultarse al hacer scroll hacia arriba.
 *
 * El estado oculto se aplica desde JS (no desde el CSS base) para que, si el
 * observer no está disponible, el contenido quede visible en vez de invisible.
 */
let observer: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  if (!observer) {
    observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.classList.remove('nodo-reveal-hidden');
          el.classList.add('nodo-reveal-in');
          observer?.unobserve(el);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );
  }
  return observer;
}

export function useReveal<T extends HTMLElement = HTMLDivElement>(delayMs = 0) {
  const ref = useRef<T>(null);

  // useLayoutEffect: ocultar antes del primer paint. Con useEffect el elemento
  // se vería un frame, parpadearía a oculto y recién ahí revelaría.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const io = getObserver();
    if (reduced || !io) return;

    if (delayMs) el.style.transitionDelay = `${delayMs}ms`;
    el.classList.add('nodo-reveal-hidden');
    io.observe(el);

    return () => io.unobserve(el);
  }, [delayMs]);

  return ref;
}
