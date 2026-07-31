/**
 * Chrome de módulo: el título y las acciones de cada pantalla viven en la AppBar,
 * no en el cuerpo. Así el contenido arranca pegado al borde y se gana pantalla.
 */
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ModuleChromeValue {
  /** Setter estable (useState de AppShell). null ⇒ vuelve al título por defecto. */
  setTitle: (v: { title: string; subtitle?: string } | null) => void;
  actionsSlot: HTMLElement | null;
}

const Ctx = createContext<ModuleChromeValue>({ setTitle: () => {}, actionsSlot: null });

export const ModuleChromeProvider = Ctx.Provider;

/**
 * Sobrescribe el título/subtítulo de la AppBar mientras el módulo está montado.
 * Sin llamarlo, la AppBar ya muestra el `name` del módulo (o el label del tab).
 * Sólo strings: con JSX el efecto se dispararía en cada render.
 */
export function useModuleChrome(title: string, subtitle?: string) {
  const { setTitle } = useContext(Ctx);
  useEffect(() => {
    setTitle({ title, subtitle });
    return () => setTitle(null);
  }, [title, subtitle, setTitle]);
}

/**
 * Portalea las acciones del módulo a la derecha de la AppBar.
 * Uno solo por módulo: dos montados a la vez escriben en el mismo slot y se apilan.
 */
export function ModuleActions({ children }: { children: ReactNode }) {
  const { actionsSlot } = useContext(Ctx);
  if (!actionsSlot) return null;
  return createPortal(children, actionsSlot);
}
