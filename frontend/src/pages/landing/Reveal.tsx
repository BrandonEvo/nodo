import type { CSSProperties, ReactNode } from 'react';
import { useReveal } from '@/hooks/useReveal';

/**
 * Envoltorio para revelar contenido al hacer scroll. Existe como componente —y
 * no como hook llamado en el sitio— porque las secciones renderizan sus
 * tarjetas dentro de `.map()`, donde un hook no puede vivir.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  style,
  id,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  id?: string;
}) {
  const ref = useReveal<HTMLDivElement>(delay);
  return (
    <div ref={ref} id={id} className={className} style={style}>
      {children}
    </div>
  );
}
