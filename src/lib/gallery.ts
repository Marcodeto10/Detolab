// Galería persistente en IndexedDB.
//
// Reemplaza los endpoints /api/gallery y /api/folders del server.ts.
// Motivo: en un deploy estático no hay backend, y cualquier servicio
// externo exigiría credenciales que quedarían públicas en el bundle.
//
// Las imágenes se guardan como Blob (no como base64) porque un PNG en 4K
// pesa mucho y base64 le suma ~33% encima.

const DB_NAME = 'detolab';
const DB_VERSION = 1;
const STORE_IMAGES = 'images';
const STORE_FOLDERS = 'folders';

export interface GalleryFolder {
  id: string;
  name: string;
  isDefault?: boolean;
}

export interface GalleryRecord {
  id: string;
  blob: Blob;
  prompt: string;
  folderId: string;
  createdAt: number;
}

/** Lo que consume la UI: igual que antes, con `url` string. */
export interface GalleryImage {
  id: string;
  url: string;
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
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB'));
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
// Mantenemos un registro id -> objectURL para poder revocarlos al borrar
// y no dejar memoria colgada.

const urlCache = new Map<string, string>();

const toUrl = (id: string, blob: Blob): string => {
  const existing = urlCache.get(id);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
};

const releaseUrl = (id: string) => {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
};

export const releaseAllUrls = () => {
  urlCache.forEach((url) => URL.revokeObjectURL(url));
  urlCache.clear();
};

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
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        id: r.id,
        url: toUrl(r.id, r.blob),
        prompt: r.prompt,
        folderId: r.folderId,
        createdAt: r.createdAt,
      }));
  } catch (err) {
    console.error('No se pudo leer la galería:', err);
    return [];
  }
};

export const saveImage = async (
  dataUrl: string,
  prompt: string,
  folderId: string
): Promise<GalleryImage> => {
  const blob = await dataUrlToBlob(dataUrl);
  const record: GalleryRecord = {
    id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    blob,
    prompt: prompt || 'Generated Image',
    folderId,
    createdAt: Date.now(),
  };

  await tx(STORE_IMAGES, 'readwrite', (s) => s.put(record));

  return {
    id: record.id,
    url: toUrl(record.id, blob),
    prompt: record.prompt,
    folderId: record.folderId,
    createdAt: record.createdAt,
  };
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

// --- Export / import -------------------------------------------------------

/** Baja toda la galería como archivos sueltos (uno por imagen). */
export const exportAll = async (): Promise<number> => {
  const rows = await tx<GalleryRecord[]>(STORE_IMAGES, 'readonly', (s) => s.getAll());
  for (const r of rows) {
    const url = URL.createObjectURL(r.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `detolab-${r.id}.png`;
    a.click();
    URL.revokeObjectURL(url);
    await new Promise((res) => setTimeout(res, 150));
  }
  return rows.length;
};
