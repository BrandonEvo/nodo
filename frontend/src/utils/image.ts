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
