/**
 * Utilidades compartidas por las páginas públicas de Importaciones
 * (catálogo y "Mi pedido"): tema de color de la empresa + tarjeta de datos de pago.
 */
import { useState } from 'react';
import { Landmark, Copy, Check } from 'lucide-react';
import { haptic } from '@/utils/haptic';
import type { PayInfo } from '@/services/import_catalog.service';

// Liquid glass (iOS) — misma receta que la clase .liquid-glass de index.css.
const glassCard: React.CSSProperties = {
  background:
    'linear-gradient(178deg, var(--nodo-glass-highlight) 0%, transparent 34%),'
    + 'radial-gradient(120% 80% at 12% -15%, rgba(255,255,255,0.16) 0%, transparent 52%),'
    + 'var(--nodo-glass-bg-strong)',
  backdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
  WebkitBackdropFilter: 'blur(var(--nodo-glass-blur)) saturate(var(--nodo-glass-saturate))',
  border: '1px solid var(--nodo-glass-border)',
  boxShadow:
    'inset 0 1px 0 var(--nodo-glass-highlight),'
    + 'inset 0 -8px 24px -12px var(--nodo-glass-edge),'
    + 'var(--nodo-shadow-card)',
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().replace('#', '');
  if (/^[0-9a-fA-F]{3}$/.test(m)) return [parseInt(m[0] + m[0], 16), parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16)];
  if (/^[0-9a-fA-F]{6}$/.test(m)) return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
  return null;
}

/**
 * Retiñe la página pública con el color de la empresa (tenant_theme_color),
 * mapeándolo a las CSS vars que el diseño ya usa. Aplicar en un wrapper
 * `display:contents` para que herede a todos los hijos sin alterar el layout.
 */
export function themeStyle(color?: string | null): React.CSSProperties {
  const rgb = color ? hexToRgb(color) : null;
  if (!rgb) return {};
  const [r, g, b] = rgb;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return {
    ['--nodo-iris' as string]: color!,
    ['--nodo-primary' as string]: color!,
    ['--nodo-primary-soft' as string]: `rgba(${r},${g},${b},0.12)`,
    ['--nodo-primary-softer' as string]: `rgba(${r},${g},${b},0.07)`,
    ['--nodo-on-primary' as string]: lum > 0.6 ? '#111111' : '#FFFFFF',
    ['--nodo-shadow-fab' as string]: `0 8px 20px -4px rgba(${r},${g},${b},0.35)`,
  } as React.CSSProperties;
}

/** Datos de pago (número de cuenta) al alcance del cliente. */
export function PayInfoCard({ pay }: { pay: PayInfo }) {
  const [copied, setCopied] = useState(false);
  if (!pay.bank_name && !pay.bank_account_number && !pay.bank_account_holder) return null;
  const copy = () => {
    if (!pay.bank_account_number) return;
    navigator.clipboard?.writeText(pay.bank_account_number)
      .then(() => { setCopied(true); haptic.tap(); setTimeout(() => setCopied(false), 1500); })
      .catch(() => {});
  };
  const typeLabel = pay.bank_account_type === 'monetaria' ? 'Monetaria'
    : pay.bank_account_type === 'ahorro' ? 'Ahorro' : null;
  return (
    <div className="rounded-3xl p-4" style={glassCard}>
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--nodo-primary-soft)' }}>
          <Landmark size={15} className="text-nodo-ink" />
        </div>
        <p className="text-sm font-black text-nodo-ink">¿Cómo pagar?</p>
        {typeLabel && (
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-nodo-inset text-nodo-sub">{typeLabel}</span>
        )}
      </div>
      <div className="space-y-1.5">
        {pay.bank_name && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-nodo-dim uppercase tracking-wider">Banco</span>
            <span className="text-sm font-bold text-nodo-ink text-right">{pay.bank_name}</span>
          </div>
        )}
        {pay.bank_account_holder && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-nodo-dim uppercase tracking-wider">A nombre de</span>
            <span className="text-sm font-bold text-nodo-ink text-right">{pay.bank_account_holder}</span>
          </div>
        )}
        {pay.bank_account_number && (
          <button onClick={copy}
            className="w-full flex items-center justify-between gap-2 mt-1 rounded-2xl px-3 py-2.5 active:scale-[0.98] transition-transform"
            style={{ background: 'var(--nodo-primary-soft)' }}>
            <div className="text-left min-w-0">
              <p className="text-[10px] font-bold text-nodo-dim uppercase tracking-wider">No. de cuenta</p>
              <p className="text-base font-black text-nodo-ink tabular-nums truncate">{pay.bank_account_number}</p>
            </div>
            <span className="flex items-center gap-1 text-[11px] font-black text-nodo-ink shrink-0">
              {copied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
