/**
 * Redimensiona/comprime una imagen del usuario a un data URI ligero, sin backend
 * ni almacenamiento externo (se guarda en Tenant.logo_url, columna Text).
 * Preserva transparencia (WebP con fallback a PNG) — ideal para logos.
 */
export interface ResizeOptions {
  /** Lado máximo (px) del resultado. El aspecto se conserva. */
  maxSize?: number;
  /** Calidad WebP 0–1. */
  quality?: number;
}

const DEFAULTS: Required<ResizeOptions> = { maxSize: 320, quality: 0.92 };

/** Carga un File como HTMLImageElement (revoca el object URL al terminar). */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}

/**
 * Devuelve un data URI (WebP o PNG) escalado a `maxSize`. Lanza si el archivo
 * no es imagen o si el navegador no puede procesarla.
 */
export async function fileToResizedDataUrl(file: File, opts: ResizeOptions = {}): Promise<string> {
  const { maxSize, quality } = { ...DEFAULTS, ...opts };
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen.');

  const img = await loadImage(file);
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  // WebP conserva transparencia y pesa menos; si el navegador no lo soporta,
  // toDataURL devuelve otro tipo → usamos PNG (también con alpha).
  const webp = canvas.toDataURL('image/webp', quality);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}

/** Carga un data URI como imagen; resuelve null si no se puede (logo corrupto). */
function loadDataUrl(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Negro o blanco según la luminancia del fondo — misma regla que --nodo-on-primary. */
function onColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#111111' : '#FFFFFF';
}

/**
 * Compone la tarjeta 1200×630 del preview de links compartidos (WhatsApp, Facebook).
 *
 * Existe porque las fotos de la app son data URI y ningún scraper las consume: sin
 * esta tarjeta el preview sale sin imagen. Se exporta JPEG a propósito — es el
 * único formato que ningún scraper discute — y por eso no se reusa `fileToResizedDataUrl`,
 * que produce WebP con alpha.
 */
export async function composeOgCard(opts: {
  name: string;
  logoDataUrl?: string | null;
  color?: string | null;
}): Promise<string | null> {
  const bg = /^#?([0-9a-f]{6})$/i.test((opts.color ?? '').trim()) ? opts.color!.trim() : '#69E7A8';
  const fg = onColor(bg);
  const name = opts.name.trim();
  if (!name) return null;

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1200, 630);

  let textY = 315;
  if (opts.logoDataUrl) {
    const logo = await loadDataUrl(opts.logoDataUrl);
    if (logo && logo.width && logo.height) {
      const side = 200;
      const scale = Math.min(side / logo.width, side / logo.height);
      const w = logo.width * scale;
      const h = logo.height * scale;
      ctx.drawImage(logo, (1200 - w) / 2, 170 - h / 2, w, h);
      textY = 400;
    }
  }

  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // El nombre largo baja de tamaño en vez de desbordarse.
  let size = 84;
  do {
    ctx.font = `900 ${size}px Nunito, Inter, system-ui, sans-serif`;
    size -= 4;
  } while (ctx.measureText(name).width > 1000 && size > 32);
  ctx.fillText(name, 600, textY, 1040);

  // 0.82 primero; si la tarjeta se pasa de 150 KB, se baja la calidad (un scraper
  // lento abandona y el preview sale sin foto).
  let out = canvas.toDataURL('image/jpeg', 0.82);
  if (out.length > 150_000) out = canvas.toDataURL('image/jpeg', 0.7);
  return out.startsWith('data:image/jpeg') ? out : null;
}
