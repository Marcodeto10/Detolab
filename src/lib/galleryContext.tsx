// Estado compartido de la galería: lo usan el inicio, el estudio y la galería.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as db from './gallery';

interface GalleryApi {
  ready: boolean;
  images: db.GalleryImage[];
  folders: db.GalleryFolder[];
  storage: db.StorageInfo | null;
  save: (dataUrl: string, prompt: string, folderId: string) => Promise<db.GalleryImage>;
  remove: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  move: (id: string, folderId: string) => Promise<void>;
  createFolder: (name: string) => Promise<db.GalleryFolder>;
  deleteFolder: (id: string) => Promise<void>;
  exportZip: (ids?: string[]) => Promise<number>;
}

const GalleryContext = createContext<GalleryApi | null>(null);

export const useGallery = () => {
  const ctx = useContext(GalleryContext);
  if (!ctx) throw new Error('useGallery tiene que usarse dentro de GalleryProvider');
  return ctx;
};

const FOLDER_NAMES: Record<string, string> = { all: 'Todas', mockups: 'Mockups', products: 'Productos' };

export const folderName = (f: db.GalleryFolder) => FOLDER_NAMES[f.id] ?? f.name;

export const GalleryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [images, setImages] = useState<db.GalleryImage[]>([]);
  const [folders, setFolders] = useState<db.GalleryFolder[]>(db.DEFAULT_FOLDERS);
  const [storage, setStorage] = useState<db.StorageInfo | null>(null);
  // Registros borrados recientemente, para poder deshacer.
  const trash = useRef(new Map<string, db.GalleryRecord>());

  const refreshStorage = useCallback(() => {
    db.getStorageInfo().then(setStorage);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Restos de versiones anteriores que ocupaban espacio sin usarse.
        ['ai-explorer-gallery', 'ai-explorer-folders', 'deto-lab-stats'].forEach((k) => localStorage.removeItem(k));
      } catch {
        // storage bloqueado
      }
      await db.requestPersistence();
      const [f, imgs] = await Promise.all([db.listFolders(), db.listImages()]);
      if (!alive) return;
      setFolders(f);
      setImages(imgs);
      setReady(true);
      refreshStorage();
    })();
    return () => {
      alive = false;
      db.releaseAllUrls();
    };
  }, [refreshStorage]);

  const save = useCallback(
    async (dataUrl: string, prompt: string, folderId: string) => {
      const img = await db.saveImage(dataUrl, prompt, folderId);
      setImages((prev) => [img, ...prev]);
      refreshStorage();
      return img;
    },
    [refreshStorage]
  );

  const remove = useCallback(
    async (id: string) => {
      const record = await db.getRecord(id);
      if (record) trash.current.set(id, record);
      setImages((prev) => prev.filter((i) => i.id !== id));
      await db.deleteImage(id);
      refreshStorage();
    },
    [refreshStorage]
  );

  const restore = useCallback(
    async (id: string) => {
      const record = trash.current.get(id);
      if (!record) return;
      trash.current.delete(id);
      const img = await db.putRecord(record);
      setImages((prev) => [...prev.filter((i) => i.id !== id), img].sort((a, b) => b.createdAt - a.createdAt));
      refreshStorage();
    },
    [refreshStorage]
  );

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

  const exportZip = useCallback((ids?: string[]) => db.exportZip(ids), []);

  return (
    <GalleryContext.Provider
      value={{ ready, images, folders, storage, save, remove, restore, move, createFolder, deleteFolder, exportZip }}
    >
      {children}
    </GalleryContext.Provider>
  );
};
