// Soporte para el formato de salida "ORIGINAL".
//
// La API sólo acepta un set fijo de aspect ratios. Así que "ORIGINAL"
// funciona en dos pasos:
//   1. Leemos las dimensiones reales de la foto de entrada y elegimos el
//      ratio soportado más cercano para pedirle la generación al modelo.
//   2. Cuando vuelve la imagen, la recortamos/escalamos a los píxeles
//      exactos del original, así lo que baja tiene el mismo tamaño que
//      lo que subiste.

export interface Dimensions {
  width: number;
  height: number;
}

/** Lee ancho/alto reales de un File sin subirlo a ningún lado. */
export const getImageDimensions = (file: File): Promise<Dimensions> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudieron leer las dimensiones de la imagen.'));
    };
    img.src = url;
  });

/** Elige el aspect ratio soportado más cercano al del original. */
export const nearestSupportedRatio = (
  dims: Dimensions,
  allowed: string[]
): string => {
  const target = dims.width / dims.height;
  const candidates = allowed.filter((r) => r !== 'ORIGINAL');

  let best = '1:1';
  let bestDelta = Infinity;

  for (const r of candidates) {
    const [w, h] = r.split(':').map(Number);
    if (!w || !h) continue;
    const delta = Math.abs(Math.log(w / h) - Math.log(target));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = r;
    }
  }
  return best;
};

/**
 * Recorta y escala un dataURL a las dimensiones exactas del original.
 * Usa cover + center crop, así no deforma nada.
 */
export const conformToOriginal = (
  dataUrl: string,
  dims: Dimensions
): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = dims.width;
      canvas.height = dims.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo crear el canvas.'));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const srcRatio = img.width / img.height;
      const dstRatio = dims.width / dims.height;

      let sx = 0;
      let sy = 0;
      let sw = img.width;
      let sh = img.height;

      if (srcRatio > dstRatio) {
        // La generada es más ancha: recortamos a los costados.
        sw = img.height * dstRatio;
        sx = (img.width - sw) / 2;
      } else if (srcRatio < dstRatio) {
        // La generada es más alta: recortamos arriba y abajo.
        sh = img.width / dstRatio;
        sy = (img.height - sh) / 2;
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dims.width, dims.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('No se pudo cargar la imagen generada.'));
    img.src = dataUrl;
  });

/**
 * Elige qué imagen manda como "original" según el modo activo.
 * Devuelve null si en ese modo no hay una base clara.
 */
export const pickBaseImage = <T extends { file: File; type: string }>(
  images: T[],
  mode: string
): T | null => {
  const byType = (t: string) => images.find((i) => i.type === t) ?? null;

  switch (mode) {
    case 'edit':
      return byType('edit-base');
    case 'mockups':
      return byType('mockup-base');
    case 'product':
      return byType('product-base');
    case 'compose':
      return byType('background') ?? images[0] ?? null;
    case 'bulk':
      return byType('bulk-base');
    default:
      return images[0] ?? null;
  }
};
