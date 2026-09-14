// Galería online: cada imagen se guarda en la cuenta del usuario.
//
// - El archivo original y una miniatura liviana van a Supabase Storage,
//   en un bucket privado dentro de la carpeta <user_id>/.
// - La ficha (prompt, carpeta, herramienta, modelo) va a la tabla "images".
// - Para mostrarlas se usan links firmados que vencen a las 6 horas.
//
// Las grillas usan la miniatura: mostrar el PNG completo en un cuadradito
// obliga al navegador a decodificar millones de píxeles y todo se pone lento.

import { GALLERY_BUCKET, supabase } from './supabase';

/** Lado mayor de las miniaturas: alcanza para verse nítidas en pantallas retina. */
const THUMB_SIZE = 640;
const SIGNED_URL_SECONDS = 60 * 60 * 6;

export interface GalleryFolder {
  id: string;
  name: string;
  isDefault?: boolean;
}

export interface GalleryImage {
  id: string;
  /** Imagen completa: para ver en grande, editar y descargar */
  url: string;
  /** Miniatura: para grillas y tiras */
  thumbUrl?: string;
  prompt: string;
  folderId: string;
  createdAt: number;
  path: string;
  thumbPath: string | null;
  bytes: number;
}

interface ImageRow {
  id: string;
  folder_id: string;
  prompt: string;
  path: string;
  thumb_path: string | null;
  bytes: number;
  created_at: string;
}

const bucket = () => supabase.storage.from(GALLERY_BUCKET);

const requireUserId = async (): Promise<string> => {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Your session expired. Sign in again.');
  return id;
};

// --- Links -----------------------------------------------------------------

// Imágenes recién generadas: se muestran desde la memoria, sin volver a bajarlas.
const localUrls = new Set<string>();

const localUrl = (blob: Blob) => {
  const url = URL.createObjectURL(blob);
  localUrls.add(url);
  return url;
};

export const releaseAllUrls = () => {
  localUrls.forEach((url) => URL.revokeObjectURL(url));
  localUrls.clear();
};

const signPaths = async (paths: string[]): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 200) {
    const { data, error } = await bucket().createSignedUrls(paths.slice(i, i + 200), SIGNED_URL_SECONDS);
    if (error) throw error;
    data?.forEach((d) => {
      if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
    });
  }
  return out;
};

const pathsOf = (items: { path: string; thumbPath?: string | null; thumb_path?: string | null }[]) =>
  items.flatMap((i) => {
    const thumb = i.thumbPath ?? i.thumb_path;
    return thumb ? [i.path, thumb] : [i.path];
  });

/** Los links firmados vencen: esto los renueva (las imágenes locales quedan igual). */
export const refreshUrls = async (images: GalleryImage[]): Promise<GalleryImage[]> => {
  const remote = images.filter((i) => !i.url.startsWith('blob:'));
  if (!remote.length) return images;
  const urls = await signPaths(pathsOf(remote));
  return images.map((i) =>
    i.url.startsWith('blob:')
      ? i
      : { ...i, url: urls.get(i.path) ?? i.url, thumbUrl: i.thumbPath ? urls.get(i.thumbPath) ?? i.thumbUrl : i.thumbUrl }
  );
};

// --- Conversión ------------------------------------------------------------

export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const res = await fetch(dataUrl);
  return res.blob();
};

/** Achica la imagen a un JPEG liviano. Devuelve null si no se pudo. */
export const makeThumbnail = async (blob: Blob, max = THUMB_SIZE): Promise<Blob | null> => {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return null;
    }
    // Fondo oscuro por si la imagen tiene transparencia (JPEG no la soporta)
    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82));
  } catch {
    return null;
  }
};

// --- Carpetas --------------------------------------------------------------

export const DEFAULT_FOLDERS: GalleryFolder[] = [
  { id: 'all', name: 'All', isDefault: true },
  { id: 'mockups', name: 'Mockups', isDefault: true },
  { id: 'products', name: 'Products', isDefault: true },
];

export const listFolders = async (): Promise<GalleryFolder[]> => {
  const { data, error } = await supabase.from('folders').select('id, name').order('created_at');
  if (error) throw error;
  return [...DEFAULT_FOLDERS, ...((data ?? []) as GalleryFolder[])];
};

export const createFolder = async (name: string): Promise<GalleryFolder> => {
  const { data, error } = await supabase.from('folders').insert({ name }).select('id, name').single();
  if (error) throw error;
  return data as GalleryFolder;
};

export const deleteFolder = async (id: string): Promise<void> => {
  if (DEFAULT_FOLDERS.some((f) => f.id === id)) return;
  // Las imágenes de esa carpeta vuelven a "all", no se borran.
  const moved = await supabase.from('images').update({ folder_id: 'all' }).eq('folder_id', id);
  if (moved.error) throw moved.error;
  const removed = await supabase.from('folders').delete().eq('id', id);
  if (removed.error) throw removed.error;
};

// --- Imágenes --------------------------------------------------------------

export const listImages = async (): Promise<GalleryImage[]> => {
  const { data, error } = await supabase
    .from('images')
    .select('id, folder_id, prompt, path, thumb_path, bytes, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as ImageRow[];
  const urls = await signPaths(pathsOf(rows));
  return rows.map((r) => ({
    id: r.id,
    url: urls.get(r.path) ?? '',
    thumbUrl: r.thumb_path ? urls.get(r.thumb_path) : undefined,
    prompt: r.prompt,
    folderId: r.folder_id,
    createdAt: new Date(r.created_at).getTime(),
    path: r.path,
    thumbPath: r.thumb_path,
    bytes: Number(r.bytes) || 0,
  }));
};

export interface SaveMeta {
  tool?: string;
  model?: string;
}

export const saveImage = async (
  dataUrl: string,
  prompt: string,
  folderId: string,
  meta: SaveMeta = {}
): Promise<GalleryImage> => {
  const userId = await requireUserId();
  const blob = await dataUrlToBlob(dataUrl);
  const thumb = await makeThumbnail(blob);
  const id = crypto.randomUUID();
  const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const path = `${userId}/${id}.${ext}`;
  let thumbPath: string | null = thumb ? `${userId}/${id}_thumb.jpg` : null;

  const original = await bucket().upload(path, blob, { contentType: blob.type || 'image/png', upsert: false });
  if (original.error) throw original.error;

  if (thumb && thumbPath) {
    const small = await bucket().upload(thumbPath, thumb, { contentType: 'image/jpeg', upsert: false });
    if (small.error) thumbPath = null;
  }

  const row = {
    id,
    folder_id: folderId,
    prompt: prompt || 'Generated image',
    tool: meta.tool ?? null,
    model: meta.model ?? null,
    path,
    thumb_path: thumbPath,
    bytes: blob.size + (thumbPath && thumb ? thumb.size : 0),
  };

  const { data, error } = await supabase.from('images').insert(row).select('created_at').single();
  if (error) {
    await bucket().remove(thumbPath ? [path, thumbPath] : [path]);
    throw error;
  }

  return {
    id,
    url: localUrl(blob),
    thumbUrl: thumb ? localUrl(thumb) : undefined,
    prompt: row.prompt,
    folderId,
    createdAt: new Date((data as { created_at: string }).created_at).getTime(),
    path,
    thumbPath,
    bytes: row.bytes,
  };
};

export const deleteImage = async (img: Pick<GalleryImage, 'id' | 'path' | 'thumbPath'>): Promise<void> => {
  const { error } = await supabase.from('images').delete().eq('id', img.id);
  if (error) throw error;
  await bucket().remove(img.thumbPath ? [img.path, img.thumbPath] : [img.path]);
};

export const moveImage = async (id: string, folderId: string): Promise<void> => {
  const { error } = await supabase.from('images').update({ folder_id: folderId }).eq('id', id);
  if (error) throw error;
};

// --- Tamaños ---------------------------------------------------------------

export const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
};

// --- Export ----------------------------------------------------------------

/** Baja las imágenes indicadas en un solo .zip, con la calidad original. */
export const exportZip = async (images: Pick<GalleryImage, 'id' | 'path' | 'createdAt'>[]): Promise<number> => {
  if (!images.length) return 0;
  const { zipSync } = await import('fflate');
  const files: Record<string, Uint8Array> = {};

  for (const img of images) {
    const { data, error } = await bucket().download(img.path);
    if (error || !data) continue;
    const ext = (data.type.split('/')[1] || img.path.split('.').pop() || 'png').replace('jpeg', 'jpg');
    const day = new Date(img.createdAt).toISOString().slice(0, 10);
    files[`detolab-${day}-${img.id.slice(0, 8)}.${ext}`] = new Uint8Array(await data.arrayBuffer());
  }

  const count = Object.keys(files).length;
  if (!count) return 0;

  // Nivel 0: las imágenes ya vienen comprimidas, recomprimir solo gasta tiempo.
  const zipped = zipSync(files, { level: 0 });
  const url = URL.createObjectURL(new Blob([zipped], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `detolab-gallery-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return count;
};
