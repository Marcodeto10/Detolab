// Estado compartido de la galería online: lo usan el inicio, el estudio y la galería.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as db from './gallery';

interface GalleryApi {
  ready: boolean;
  /** Error al cargar la galería (por ejemplo, sin conexión) */
  loadError: string | null;
  images: db.GalleryImage[];
  folders: db.GalleryFolder[];
  usedBytes: number;
  save: (dataUrl: string, prompt: string, folderId: string, meta?: db.SaveMeta) => Promise<db.GalleryImage>;
  remove: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  move: (id: string, folderId: string) => Promise<void>;
  createFolder: (name: string) => Promise<db.GalleryFolder>;
  deleteFolder: (id: string) => Promise<void>;
  exportZip: (ids?: string[]) => Promise<number>;
  reload: () => void;
}

const GalleryContext = createContext<GalleryApi | null>(null);

export const useGallery = () => {
  const ctx = useContext(GalleryContext);
  if (!ctx) throw new Error('useGallery must be used inside GalleryProvider');
  return ctx;
};

const FOLDER_NAMES: Record<string, string> = { all: 'All', mockups: 'Mockups', products: 'Products' };

export const folderName = (f: db.GalleryFolder) => FOLDER_NAMES[f.id] ?? f.name;

/** Tiempo para tocar "Undo" antes de que la imagen se borre de verdad. */
const UNDO_MS = 8000;
/** Los links firmados duran 6 horas; los renovamos antes. */
const REFRESH_MS = 5 * 60 * 60 * 1000;

export const GalleryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [images, setImages] = useState<db.GalleryImage[]>([]);
  const [folders, setFolders] = useState<db.GalleryFolder[]>(db.DEFAULT_FOLDERS);
  const [reloadKey, setReloadKey] = useState(0);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  // Borrados pendientes: se ejecutan pasado el tiempo de "Undo"
  const pending = useRef(new Map<string, { img: db.GalleryImage; timer: number }>());

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    (async () => {
      try {
        const [f, imgs] = await Promise.all([db.listFolders(), db.listImages()]);
        if (!alive) return;
        setFolders(f);
        setImages(imgs);
      } catch (err) {
        if (!alive) return;
        setLoadError(err instanceof Error ? err.message : "Couldn't load your gallery.");
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  // Renovar links firmados cada tanto
  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const refreshed = await db.refreshUrls(imagesRef.current);
        setImages(refreshed);
      } catch {
        // si falla, se intenta en la próxima vuelta
      }
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  // Al salir (cerrar sesión), ejecutar los borrados pendientes y liberar memoria
  useEffect(() => {
    const queue = pending.current;
    return () => {
      queue.forEach(({ img, timer }) => {
        window.clearTimeout(timer);
        db.deleteImage(img).catch(() => {});
      });
      queue.clear();
      db.releaseAllUrls();
    };
  }, []);

  const save = useCallback(async (dataUrl: string, prompt: string, folderId: string, meta?: db.SaveMeta) => {
    const img = await db.saveImage(dataUrl, prompt, folderId, meta);
    setImages((prev) => [img, ...prev]);
    return img;
  }, []);

  const remove = useCallback(async (id: string) => {
    const img = imagesRef.current.find((i) => i.id === id);
    if (!img) return;
    setImages((prev) => prev.filter((i) => i.id !== id));
    const timer = window.setTimeout(() => {
      pending.current.delete(id);
      db.deleteImage(img).catch(() => {
        // si no se pudo borrar, la volvemos a mostrar
        setImages((prev) => [...prev, img].sort((a, b) => b.createdAt - a.createdAt));
      });
    }, UNDO_MS);
    pending.current.set(id, { img, timer });
  }, []);

  const restore = useCallback(async (id: string) => {
    const entry = pending.current.get(id);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    pending.current.delete(id);
    setImages((prev) => [...prev.filter((i) => i.id !== id), entry.img].sort((a, b) => b.createdAt - a.createdAt));
  }, []);

  const move = useCallback(async (id: string, folderId: string) => {
    setImages((prev) => prev.map((i) => (i.id === id ? { ...i, folderId } : i)));
    await db.moveImage(id, folderId);
  }, []);

  const createFolder = useCallback(async (name: string) => {
    const folder = await db.createFolder(name);
    setFolders((prev) => [...prev, folder]);
    return folder;
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    await db.deleteFolder(id);
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setImages((prev) => prev.map((i) => (i.folderId === id ? { ...i, folderId: 'all' } : i)));
  }, []);

  const exportZip = useCallback(async (ids?: string[]) => {
    const wanted = ids ? new Set(ids) : null;
    return db.exportZip(imagesRef.current.filter((i) => !wanted || wanted.has(i.id)));
  }, []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const usedBytes = useMemo(() => images.reduce((sum, i) => sum + i.bytes, 0), [images]);

  const value = useMemo(
    () => ({ ready, loadError, images, folders, usedBytes, save, remove, restore, move, createFolder, deleteFolder, exportZip, reload }),
    [ready, loadError, images, folders, usedBytes, save, remove, restore, move, createFolder, deleteFolder, exportZip, reload]
  );

  return <GalleryContext.Provider value={value}>{children}</GalleryContext.Provider>;
};
