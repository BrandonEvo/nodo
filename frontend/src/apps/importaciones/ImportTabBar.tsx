import type { ReactNode } from 'react';
import { haptic } from '@/utils/haptic';

export interface ImportTab {
  value: string;
  label: string;
  icon: ReactNode;
}

/**
 * Pill de navegación de cristal, solo móvil, flotando al alcance del pulgar
 * (por encima de la BottomNav global). En desktop se usa el SegmentedControl
 * del header. El segmento activo se expande con label; los demás son solo icono.
 */
export function ImportTabBar({
  tabs, value, onChange,
}: {
  tabs: ImportTab[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      className="lg:hidden fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-1
                 liquid-glass rounded-full p-1.5 shadow-lg
                 bottom-[calc(var(--nodo-bottomnav-h)+12px)]"
    >
      {tabs.map(t => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            aria-label={t.label}
            onClick={() => { if (!active) { haptic.tap(); onChange(t.value); } }}
            className={`flex items-center gap-1.5 h-10 rounded-full text-xs font-bold
                        transition-all active:scale-95 ${active ? 'px-3.5' : 'px-3 text-nodo-sub'}`}
            style={active ? { background: 'var(--nodo-iris)', color: 'var(--nodo-on-iris)' } : undefined}
          >
            {t.icon}
            {active && <span className="whitespace-nowrap">{t.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
