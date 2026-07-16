/**
 * Pista de sesión — NO es autenticación.
 *
 * La landing en `/` no puede consultar `/api/auth/session`: debe pintar sin
 * tocar el backend (que puede estar frío). Este flag, escrito desde el portal,
 * solo sirve para que la landing rotule su CTA "Entrar al panel" en vez de
 * "Ir al portal". Un atacante que lo falsifique no gana nada: la sesión real
 * sigue viviendo en la cookie httpOnly y se valida en el servidor.
 */
const KEY = 'nodo:has_session';

export function markSessionHint(): void {
  try { localStorage.setItem(KEY, '1'); } catch { /* modo privado */ }
}

export function clearSessionHint(): void {
  try { localStorage.removeItem(KEY); } catch { /* modo privado */ }
}

export function hasSessionHint(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
