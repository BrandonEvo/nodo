import { useEffect, useState } from 'react';

// Hook para inputs numéricos editables y "vaciables".
//
// WHY: el patrón `parseFloat(e.target.value) || 0` convierte el string vacío en 0
// al instante, así que el usuario no puede borrar el "0" para teclear otro número.
// Aquí mantenemos un texto local mientras se edita; solo propagamos al onChange
// cuando hay un número válido, y normalizamos al `min` (o reformateamos) en blur.

const PARTIAL = /^-?\d*\.?\d*$/; // permite "", ".", "-", "12.", etc. mientras se teclea

export function useNumericField({
  value, onChange, min = 0, decimals,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  decimals?: number;
}) {
  const fmt = (n: number) =>
    decimals != null ? n.toFixed(decimals) : String(n);

  const [text, setText] = useState(() => (Number.isFinite(value) ? fmt(value) : ''));
  const [editing, setEditing] = useState(false);

  // El valor mostrado sigue al prop cuando cambia por fuera (Amazon, reset, steppers),
  // salvo mientras el usuario está tecleando en este campo.
  useEffect(() => {
    if (!editing) setText(Number.isFinite(value) ? fmt(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, editing]);

  function handleChange(raw: string) {
    if (!PARTIAL.test(raw)) return;
    setText(raw);
    const n = parseFloat(raw);
    if (Number.isFinite(n)) onChange(n); // solo propaga números válidos; deja vacío/parcial intacto
  }

  function handleBlur() {
    setEditing(false);
    const n = parseFloat(text);
    const next = Number.isFinite(n) ? Math.max(min, n) : min;
    setText(fmt(next));
    onChange(next);
  }

  return {
    text,
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => { setEditing(true); e.target.select(); },
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => handleChange(e.target.value),
    onBlur: handleBlur,
  };
}
