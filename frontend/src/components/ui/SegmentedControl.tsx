interface Option<T extends string> {
  value: T;
  label: string;
  /** Ícono opcional a la izquierda del label */
  icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Tamaño del texto y padding. Default: 'md' */
  size?: 'sm' | 'md';
}

/**
 * Control de selección estilo iOS con pill animada.
 * Usa tokens nodo-* para ser dark-mode aware automáticamente.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
  size = 'md',
}: SegmentedControlProps<T>) {
  const n = options.length;
  const activeIdx = options.findIndex(o => o.value === value);

  const pillStyle = {
    width:  `calc(${100 / n}% - 6px)`,
    left:   `calc(${(activeIdx * 100) / n}% + 3px)`,
  };

  const textSize = size === 'sm' ? 'text-[12px]' : 'text-[13px]';
  const py       = size === 'sm' ? 'py-1'        : 'py-1.5';

  return (
    <div className={`relative flex bg-nodo-inset rounded-xl p-[3px] ${className}`}>
      {/* Pill deslizante */}
      <div
        className="absolute top-[3px] bottom-[3px] bg-nodo-card rounded-[9px] shadow-sm transition-all duration-200 ease-out pointer-events-none"
        style={pillStyle}
      />

      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={[
            'relative z-10 flex-1 flex items-center justify-center gap-1.5 rounded-[9px]',
            'font-bold transition-colors duration-200 select-none active:scale-[0.97]',
            textSize,
            py,
            value === opt.value ? 'text-nodo-accent' : 'text-nodo-sub',
          ].join(' ')}
        >
          {opt.icon && <span className="shrink-0">{opt.icon}</span>}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
