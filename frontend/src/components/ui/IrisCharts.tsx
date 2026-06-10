import { useId } from 'react';

/**
 * Mini-gráficas SVG con el gradiente iridiscente de marca (--nodo-iris-*).
 * Sin dependencias — pensadas como acento visual de tarjetas KPI, no como
 * gráficas analíticas completas.
 */

function buildSmoothPath(data: number[], w: number, h: number, pad = 3) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [
    pad + (i * (w - 2 * pad)) / (data.length - 1),
    pad + (1 - (v - min) / span) * (h - 2 * pad),
  ]);
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C ${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  return { d, pts };
}

export function IrisArea({
  data,
  height = 64,
  className = '',
}: {
  data: number[];
  height?: number;
  className?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const W = 200;
  const { d, pts } = buildSmoothPath(data, W, height);
  const area = `${d} L ${pts[pts.length - 1][0]},${height} L ${pts[0][0]},${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`stroke-${gid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   style={{ stopColor: 'var(--nodo-iris-start)' }} />
          <stop offset="55%"  style={{ stopColor: 'var(--nodo-iris-mid)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--nodo-iris-end)' }} />
        </linearGradient>
        <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   style={{ stopColor: 'var(--nodo-iris-mid)', stopOpacity: 0.30 }} />
          <stop offset="100%" style={{ stopColor: 'var(--nodo-iris-end)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#fill-${gid})`} />
      <path
        d={d}
        fill="none"
        stroke={`url(#stroke-${gid})`}
        strokeWidth={2.5}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function IrisBars({
  data,
  height = 64,
  className = '',
}: {
  data: number[];
  height?: number;
  className?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const W = 200;
  const max = Math.max(...data) || 1;
  const gap = 6;
  const bw = (W - gap * (data.length - 1)) / data.length;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      className={`w-full ${className}`}
      style={{ height }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`bar-${gid}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%"   style={{ stopColor: 'var(--nodo-iris-end)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--nodo-iris-mid)' }} />
        </linearGradient>
      </defs>
      {data.map((v, i) => {
        const bh = Math.max(4, (v / max) * (height - 4));
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={height - bh}
            width={bw}
            height={bh}
            rx={Math.min(4, bw / 2)}
            fill={`url(#bar-${gid})`}
            opacity={0.55 + 0.45 * (v / max)}
          />
        );
      })}
    </svg>
  );
}

export function IrisDonut({
  value,
  total,
  size = 116,
  label,
}: {
  value: number;
  total: number;
  size?: number;
  label?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const stroke = 12;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, value / total) : 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={`donut-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   style={{ stopColor: 'var(--nodo-iris-start)' }} />
            <stop offset="55%"  style={{ stopColor: 'var(--nodo-iris-mid)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--nodo-iris-end)' }} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={stroke}
          style={{ stroke: 'var(--nodo-inset)' }}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={stroke} strokeLinecap="round"
          stroke={`url(#donut-${gid})`}
          strokeDasharray={`${C * frac} ${C}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black text-nodo-ink tabular-nums leading-none">
          {total > 0 ? Math.round(frac * 100) : 0}%
        </span>
        {label && <span className="text-[9px] font-semibold text-nodo-dim mt-0.5">{label}</span>}
      </div>
    </div>
  );
}
