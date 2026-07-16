import type { ReactNode } from 'react';
import { haptic } from '@/utils/haptic';

/**
 * FAB contextual de la app Importaciones. Fijo, al alcance del pulgar.
 * Móvil: flota por encima de la pill de navegación y de la BottomNav global.
 * Desktop: esquina inferior derecha.
 */
export function ImportFab({
  icon, label, onPress, disabled,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={() => { haptic.tap(); onPress(); }}
      className="fixed right-4 lg:right-8 z-40 flex items-center gap-2 h-14 pl-5 pr-6
                 rounded-full font-black text-[15px] active:scale-95 transition-transform
                 disabled:opacity-40 bottom-[calc(132px+env(safe-area-inset-bottom,0px))] lg:bottom-8"
      style={{
        background: 'var(--nodo-iris)',
        color: 'var(--nodo-on-iris)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), var(--nodo-shadow-fab)',
      }}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
