// Entrada de imágenes: archivos subidos, pegados, links y drag & drop.

import { supabase } from './supabase';

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

const toFile = (blob: Blob, name: string) => new File([blob], `${name}.${extFor(blob.type)}`, { type: blob.type });

const fetchWithTimeout = async (url: string, init: RequestInit = {}, ms = 8000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

/** Convierte una URL (blob:, data: o http) en un File. */
export const fileFromUrl = async (url: string, name = 'image'): Promise<File> => {
  const u = url.trim();
  if (!/^(https?:|data:|blob:)/i.test(u)) {
    throw new Error('Paste a link that starts with http or https.');
  }

  if (/^(blob:|data:)/i.test(u)) {
    const blob = await (await fetch(u)).blob();
    if (!blob.type.startsWith('image/')) throw new Error("That link isn't an image.");
    return toFile(blob, name);
  }

  // 1) Directo: funciona con los sitios que lo permiten (y con nuestra galería)
  try {
    const res = await fetchWithTimeout(u, { mode: 'cors' }, 4000);
    if (res.ok) {
      const blob = await res.blob();
      if (blob.type.startsWith('image/')) return toFile(blob, name);
    }
  } catch {
    // el sitio no deja bajarla desde el navegador: probamos con el servidor
  }

  // 2) Nuestro servidor la trae del otro lado (y saca la imagen de páginas como Pinterest)
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `/api/fetch-image?url=${encodeURIComponent(u)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      30000
    );
  } catch {
    throw new Error('The site took too long to respond. Try again or download the image and upload it.');
  }

  if (!res.ok) {
    let message = "Couldn't fetch the image from that link. Download it and upload it manually.";
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // respuesta sin JSON
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) throw new Error("That link isn't an image.");
  return toFile(blob, name);
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

export const downloadUrl = async (url: string, filename: string) => {
  // Los links de otra dirección (la galería online) no se pueden descargar directo: primero se traen
  let href = url;
  let revoke = false;
  if (!/^(blob:|data:)/i.test(url)) {
    try {
      const blob = await (await fetch(url)).blob();
      href = URL.createObjectURL(blob);
      revoke = true;
    } catch {
      window.open(url, '_blank', 'noopener');
      return;
    }
  }
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(href), 10_000);
};

export const downloadName = (prefix: string, id?: string) => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `detolab-${prefix}-${id ?? stamp}.png`;
};
