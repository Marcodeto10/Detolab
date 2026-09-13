// Entrada de imágenes: archivos subidos, pegados, links y drag & drop.

export type InputSource = 'upload' | 'paste' | 'link' | 'gallery' | 'result';

export interface InputImage {
  id: string;
  file: File;
  preview: string;
  source: InputSource;
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export const makeInput = (file: File, source: InputSource): InputImage => ({
  id: uid(),
  file,
  preview: URL.createObjectURL(file),
  source,
});

export const releaseInput = (img: InputImage) => URL.revokeObjectURL(img.preview);

export const imageFilesFrom = (list: FileList | File[] | null | undefined): File[] =>
  Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));

const extFor = (mime: string) => (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');

const fetchWithTimeout = async (url: string, init: RequestInit = {}, ms = 8000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

// Si el sitio de origen bloquea la descarga directa (CORS), probamos con proxies públicos.
const PROXIES = [
  (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];

/** Convierte una URL (blob:, data: o http) en un File. */
export const fileFromUrl = async (url: string, name = 'image'): Promise<File> => {
  const u = url.trim();
  if (!/^(https?:|data:|blob:)/i.test(u)) {
    throw new Error('Paste a link that starts with http or https.');
  }

  let res: Response | null = null;
  if (/^(blob:|data:)/i.test(u)) {
    res = await fetch(u);
  } else {
    try {
      res = await fetchWithTimeout(u, { mode: 'cors' });
    } catch {
      res = null;
    }
    if (!res?.ok) {
      for (const proxy of PROXIES) {
        try {
          const r = await fetchWithTimeout(proxy(u));
          if (r.ok) {
            res = r;
            break;
          }
        } catch {
          // probamos el siguiente
        }
      }
    }
  }

  if (!res?.ok) {
    throw new Error("Couldn't fetch the image from that link. Download it and upload it manually.");
  }
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error("That link isn't an image.");
  }
  return new File([blob], `${name}.${extFor(blob.type)}`, { type: blob.type });
};

/** Saca la URL de una imagen arrastrada desde otra pestaña o desde la galería. */
export const urlFromDataTransfer = (dt: DataTransfer): string | null => {
  let url = dt.getData('text/uri-list') || dt.getData('text/plain');
  if (!url) {
    const html = dt.getData('text/html');
    if (html) {
      const img = new DOMParser().parseFromString(html, 'text/html').querySelector('img');
      if (img?.src) url = img.src;
    }
  }
  url = url?.split('\n')[0]?.trim();
  return url || null;
};

export const downloadUrl = (url: string, filename: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

export const downloadName = (prefix: string, id?: string) => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `detolab-${prefix}-${id ?? stamp}.png`;
};
