// Galería persistente en IndexedDB.
//
// Reemplaza los endpoints /api/gallery y /api/folders del server.ts.
// Motivo: en un deploy estático no hay backend, y cualquier servicio
// externo exigiría credenciales que quedarían públicas en el bundle.
//
// Las imágenes se guardan como Blob (no como base64) porque un PNG en 4K
// pesa mucho y base64 le suma ~33% encima.
//
// Cada imagen guarda además una miniatura liviana. Las grillas usan la
// miniatura: mostrar el PNG completo en un cuadradito de 200px obliga al
// navegador a decodificar millones de píxeles por imagen y todo se pone lento.

const DB_NAME = 'detolab';
const DB_VERSION = 1;
const STORE_IMAGES = 'images';
const STORE_FOLDERS = 'folders';

/** Lado mayor de las miniaturas: alcanza para verse nítidas en pantallas retina. */
const THUMB_SIZE = 640;

export interface GalleryFolder {
  id: string;
  name: string;
  isDefault?: boolean;
}

export interface GalleryRecord {
  id: string;
  blob: Blob;
  /** Miniatura JPEG liviana para grillas (las imágenes viejas no la tienen hasta que se genera) */
  thumb?: Blob;
  prompt: string;
  folderId: string;
  createdAt: number;
}

/** Lo que consume la UI. */
export interface GalleryImage {
  id: string;
  /** Imagen completa: para ver en grande, editar y descargar */
  url: string;
  /** Miniatura: para grillas y tiras. Undefined mientras se genera */
  thumbUrl?: string;
  prompt: string;
  folderId: string;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        const store = db.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('folderId', 'folderId');
      }
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB'));
  });

  return dbPromise;
};

const tx = async <T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest
): Promise<T> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
};

// --- Object URLs -----------------------------------------------------------
// Registro id -> objectURL para poder revocarlos al borrar y no dejar memoria colgada.

const urlCache = new Map<string, string>();
const thumbCache = new Map<string, string>();

const cachedUrl = (cache: Map<string, string>, id: string, blob: Blob): string => {
  const existing = cache.get(id);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  cache.set(id, url);
  return url;
};

const toUrl = (id: string, blob: Blob) => cachedUrl(urlCache, id, blob);
const toThumbUrl = (id: string, blob: Blob) => cachedUrl(thumbCache, id, blob);

const releaseUrl = (id: string) => {
  for (const cache of [urlCache, thumbCache]) {
    const url = cache.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      cache.delete(id);
    }
  }
};

export const releaseAllUrls = () => {
  for (const cache of [urlCache, thumbCache]) {
    cache.forEach((url) => URL.revokeObjectURL(url));
    cache.clear();
  }
};

const toImage = (r: GalleryRecord): GalleryImage => ({
  id: r.id,
  url: toUrl(r.id, r.blob),
  thumbUrl: r.thumb ? toThumbUrl(r.id, r.thumb) : undefined,
  prompt: r.prompt,
  folderId: r.folderId,
  createdAt: r.createdAt,
});

// --- Conversión ------------------------------------------------------------

export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const res = await fetch(dataUrl);
  return res.blob();
};

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// --- Miniaturas ------------------------------------------------------------

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

/**
 * Genera las miniaturas que falten (imágenes guardadas antes de que existieran).
 * Va de a una y le da respiro al navegador entre cada una, así no traba la pantalla.
 */
export const backfillThumbnails = async (
  ids: string[],
  onDone: (id: string, thumbUrl: string | null) => void,
  shouldStop: () => boolean
) => {
  for (const id of ids) {
    if (shouldStop()) return;
    try {
      const rec = await tx<GalleryRecord | undefined>(STORE_IMAGES, 'readonly', (s) => s.get(id));
      if (!rec) continue;
      if (rec.thumb) {
        onDone(id, toThumbUrl(id, rec.thumb));
        continue;
      }
      const thumb = await makeThumbnail(rec.blob);
      if (!thumb) {
        onDone(id, null);
        continue;
      }
      // Releemos por si la imagen se movió de carpeta o se borró mientras tanto
      const fresh = await tx<GalleryRecord | undefined>(STORE_IMAGES, 'readonly', (s) => s.get(id));
      if (!fresh || shouldStop()) continue;
      await tx(STORE_IMAGES, 'readwrite', (s) => s.put({ ...fresh, thumb }));
      onDone(id, toThumbUrl(id, thumb));
    } catch {
      onDone(id, null);
    }
    await new Promise((r) => setTimeout(r, 0));
  }
};

// --- Carpetas --------------------------------------------------------------

export const DEFAULT_FOLDERS: GalleryFolder[] = [
  { id: 'all', name: 'All Visions', isDefault: true },
  { id: 'mockups', name: 'Mockups', isDefault: true },
  { id: 'products', name: 'Products', isDefault: true },
];

export const listFolders = async (): Promise<GalleryFolder[]> => {
  try {
    const rows = await tx<GalleryFolder[]>(STORE_FOLDERS, 'readonly', (s) => s.getAll());
    const custom = rows.filter((f) => !f.isDefault);
    return [...DEFAULT_FOLDERS, ...custom];
  } catch {
    return DEFAULT_FOLDERS;
  }
};

export const createFolder = async (name: string): Promise<GalleryFolder> => {
  const folder: GalleryFolder = {
    id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
  };
  await tx(STORE_FOLDERS, 'readwrite', (s) => s.put(folder));
  return folder;
};

export const deleteFolder = async (id: string): Promise<void> => {
  if (DEFAULT_FOLDERS.some((f) => f.id === id)) return;
  await tx(STORE_FOLDERS, 'readwrite', (s) => s.delete(id));

  // Las imágenes de esa carpeta vuelven a "all", no se borran.
  const all = await tx<GalleryRecord[]>(STORE_IMAGES, 'readonly', (s) => s.getAll());
  const orphans = all.filter((r) => r.folderId === id);
  for (const r of orphans) {
    await tx(STORE_IMAGES, 'readwrite', (s) => s.put({ ...r, folderId: 'all' }));
  }
};

// --- Imágenes --------------------------------------------------------------

export const listImages = async (): Promise<GalleryImage[]> => {
  try {
    const rows = await tx<GalleryRecord[]>(STORE_IMAGES, 'readonly', (s) => s.getAll());
    return rows.sort((a, b) => b.createdAt - a.createdAt).map(toImage);
  } catch (err) {
    console.error('Could not read the gallery:', err);
    return [];
  }
};

export const saveImage = async (
  dataUrl: string,
  prompt: string,
  folderId: string
): Promise<GalleryImage> => {
  const blob = await dataUrlToBlob(dataUrl);
  const thumb = await makeThumbnail(blob);
  const record: GalleryRecord = {
    id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    blob,
    thumb: thumb ?? undefined,
    prompt: prompt || 'Generated image',
    folderId,
    createdAt: Date.now(),
  };

  await tx(STORE_IMAGES, 'readwrite', (s) => s.put(record));
  return toImage(record);
};

export const deleteImage = async (id: string): Promise<void> => {
  await tx(STORE_IMAGES, 'readwrite', (s) => s.delete(id));
  releaseUrl(id);
};

export const moveImage = async (id: string, folderId: string): Promise<void> => {
  const rec = await tx<GalleryRecord | undefined>(STORE_IMAGES, 'readonly', (s) => s.get(id));
  if (!rec) return;
  await tx(STORE_IMAGES, 'readwrite', (s) => s.put({ ...rec, folderId }));
};

export const clearGallery = async (): Promise<void> => {
  await tx(STORE_IMAGES, 'readwrite', (s) => s.clear());
  releaseAllUrls();
};

// --- Cuota -----------------------------------------------------------------

export interface StorageInfo {
  usedBytes: number;
  quotaBytes: number;
  persisted: boolean;
}

/**
 * Le pide al navegador que marque el storage como persistente.
 * Sin esto, el navegador puede desalojar la galería cuando le falta espacio.
 */
export const requestPersistence = async (): Promise<boolean> => {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
};

export const getStorageInfo = async (): Promise<StorageInfo | null> => {
  if (!navigator.storage?.estimate) return null;
  try {
    const est = await navigator.storage.estimate();
    const persisted = (await navigator.storage.persisted?.()) ?? false;
    return {
      usedBytes: est.usage ?? 0,
      quotaBytes: est.quota ?? 0,
      persisted,
    };
  } catch {
    return null;
  }
};

export const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
};

// --- Deshacer borrado ------------------------------------------------------

export const getRecord = (id: string) =>
  tx<GalleryRecord | undefined>(STORE_IMAGES, 'readonly', (s) => s.get(id));

/** Vuelve a guardar un registro borrado (para "Undo"). */
export const putRecord = async (record: GalleryRecord): Promise<GalleryImage> => {
  await tx(STORE_IMAGES, 'readwrite', (s) => s.put(record));
  return toImage(record);
};

// --- Export ----------------------------------------------------------------

/** Baja la galería (o las imágenes indicadas) en un solo .zip. */
export const exportZip = async (ids?: string[]): Promise<number> => {
  const rows = await tx<GalleryRecord[]>(STORE_IMAGES, 'readonly', (s) => s.getAll());
  const wanted = ids ? new Set(ids) : null;
  const selected = rows.filter((r) => !wanted || wanted.has(r.id));
  if (!selected.length) return 0;

  const { zipSync } = await import('fflate');
  const files: Record<string, Uint8Array> = {};
  for (const r of selected) {
    const ext = (r.blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const day = new Date(r.createdAt).toISOString().slice(0, 10);
    files[`detolab-${day}-${r.id}.${ext}`] = new Uint8Array(await r.blob.arrayBuffer());
  }

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
  return selected.length;
};
