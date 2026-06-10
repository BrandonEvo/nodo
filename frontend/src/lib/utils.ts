import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Color del branding del tenant ──────────────────────────────────────────
// Misma lógica que AppShell para mantener consistencia de marca en toda la app.

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "")
  const bigint = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16)
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

/** Oscurece un hex mezclándolo con negro (amount 0–1) */
export function darkenHex(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const d = (c: number) => clamp(c * (1 - amount)).toString(16).padStart(2, "0")
  return `#${d(r)}${d(g)}${d(b)}`
}

/** Luminancia relativa (0–1) — decide si el texto encima va oscuro o claro */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex)
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === rn
    ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
    : max === gn
      ? ((bn - rn) / d + 2) / 6
      : ((rn - gn) / d + 4) / 6
  return { h: h * 360, s: s * 100, l: l * 100 }
}

export function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
  return `#${[f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, "0")).join("")}`
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

/**
 * Gradiente iridiscente de marca derivado del color del tenant.
 * Rota el matiz ±50°: lado cálido más claro → tenant → lado cool más profundo.
 * Así cada tenant tiene su propia versión del acento "nodo." sin perder identidad.
 */
export function irisFromTenant(hex: string) {
  const { h, s, l } = hexToHsl(hex)
  const start = hslToHex((h - 50 + 360) % 360, Math.min(100, s + 20), Math.min(78, l + 18))
  const end   = hslToHex((h + 50) % 360,       Math.min(100, s + 10), Math.max(32, l - 8))
  return {
    start,
    mid: hex,
    end,
    gradient: `linear-gradient(135deg, ${start} 0%, ${hex} 50%, ${end} 100%)`,
    soft: `linear-gradient(135deg, ${hexToRgba(start, 0.16)} 0%, ${hexToRgba(hex, 0.12)} 50%, ${hexToRgba(end, 0.16)} 100%)`,
  }
}

/**
 * Estilos derivados del color de marca del negocio, para los headers públicos
 * de tracking. Cae a un slate oscuro si el color es inválido o no existe.
 */
export function brandTheme(color?: string | null) {
  const valid = color && /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color.replace("#", ""))
  const base = valid ? (color!.startsWith("#") ? color! : `#${color}`) : "#1f2937"
  const onBrand = luminance(base) > 0.55 ? "#111111" : "#FFFFFF"
  return {
    base,
    onBrand,
    gradient: `linear-gradient(135deg, ${base} 0%, ${darkenHex(base, 0.28)} 100%)`,
    overlay: onBrand === "#FFFFFF" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.08)",
  }
}

// navigator.clipboard solo existe en contextos seguros (HTTPS/localhost).
// El despliegue corre por HTTP (nip.io), así que sin este fallback el botón
// de copiar link lanza TypeError y "no hace nada".
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // cae al fallback
    }
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.style.position = "fixed"
    ta.style.left = "-9999px"
    ta.setAttribute("readonly", "")
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// ── Compartir ───────────────────────────────────────────────────────────────

/** Normaliza un teléfono GT a dígitos para wa.me (antepone 502 si son 8 dígitos). */
export function normalizePhoneForWhatsApp(phone?: string | null): string | null {
  if (!phone) return null
  let digits = phone.replace(/[^\d]/g, "")
  if (!digits) return null
  if (digits.length === 8) digits = `502${digits}`
  return digits
}

/** URL de WhatsApp: chat directo si hay teléfono, si no abre el selector. */
export function buildWhatsAppUrl(message: string, phone?: string | null): string {
  const text = encodeURIComponent(message)
  const digits = normalizePhoneForWhatsApp(phone)
  return digits
    ? `https://wa.me/${digits}?text=${text}`
    : `https://api.whatsapp.com/send?text=${text}`
}

/**
 * El menú nativo del SO (Web Share API) solo existe en contextos seguros (HTTPS).
 * El deploy corre por HTTP (nip.io), así que aquí será false y la UI cae al
 * share sheet propio. Al activar HTTPS, el botón "Compartir…" aparece solo.
 */
export function canNativeShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function"
}

/** Dispara el share nativo. Devuelve false si no está disponible o el usuario cancela. */
export async function nativeShare(data: { title?: string; text?: string; url?: string }): Promise<boolean> {
  if (!canNativeShare()) return false
  try {
    await navigator.share(data)
    return true
  } catch {
    return false
  }
}
