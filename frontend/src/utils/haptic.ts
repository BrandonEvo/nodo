const vib = (pattern: number | number[]) => navigator.vibrate?.(pattern);

export const haptic = {
  tap:     () => vib(10),
  confirm: () => vib([60, 30, 60]),
  done:    () => vib([80, 40, 80, 40, 80]),
  error:   () => vib([150]),
};
