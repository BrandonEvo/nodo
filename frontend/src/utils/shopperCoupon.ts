// Persistencia liviana del cupón entre el catálogo y la página de pedido.
// El link `…/catalogo/{token}?cupon=CODE` guarda el código por catálogo; la página
// de pedido lo auto-aplica una sola vez por pedido.

const codeKey = (catalogToken: string) => `nodo_shopper_coupon_${catalogToken}`;
const appliedKey = (orderToken: string) => `nodo_shopper_coupon_applied_${orderToken}`;

export function normalizeCode(raw: string): string {
  return (raw || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function rememberCoupon(catalogToken: string, code: string): void {
  const c = normalizeCode(code);
  if (!c) return;
  try { localStorage.setItem(codeKey(catalogToken), c); } catch { /* */ }
}

export function pendingCoupon(catalogToken?: string | null): string | null {
  if (!catalogToken) return null;
  try { return localStorage.getItem(codeKey(catalogToken)); } catch { return null; }
}

export function markCouponApplied(orderToken: string): void {
  try { localStorage.setItem(appliedKey(orderToken), '1'); } catch { /* */ }
}

export function wasCouponApplied(orderToken: string): boolean {
  try { return localStorage.getItem(appliedKey(orderToken)) === '1'; } catch { return false; }
}
