import { useId } from 'react';

/**
 * Isotipo "nodo." — aros entrelazados con el acento iridiscente.
 * El gradiente lee --nodo-iris-* : colores de marca en pantallas pre-tenant
 * y la versión derivada del tenantColor dentro del AppShell.
 */
export function NodoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  const gid = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`iris-${gid}`} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   style={{ stopColor: 'var(--nodo-iris-start)' }} />
          <stop offset="50%"  style={{ stopColor: 'var(--nodo-iris-mid)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--nodo-iris-end)' }} />
        </linearGradient>
      </defs>
      <g stroke={`url(#iris-${gid})`} strokeWidth="5.5" strokeLinecap="round">
        <circle cx="17.5" cy="17.5" r="10" />
        <circle cx="30.5" cy="17.5" r="10" />
        <circle cx="17.5" cy="30.5" r="10" />
        <circle cx="30.5" cy="30.5" r="10" />
      </g>
    </svg>
  );
}

/**
 * Wordmark "nodo." — minúsculas redondeadas con el punto sólido en el color
 * cálido del iris (coral de marca pre-login; derivado del tenant en la app).
 * `name` permite usar el mismo tratamiento con el nombre del tenant.
 */
export function NodoWordmark({
  name = 'nodo',
  className = '',
}: {
  name?: string;
  className?: string;
}) {
  return (
    <span className={`font-black tracking-tight leading-none select-none ${className}`}>
      {name}
      <span style={{ color: 'var(--nodo-iris-start)' }}>.</span>
    </span>
  );
}
