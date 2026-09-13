import React, { useMemo, useState } from 'react';
import { Download, FolderPlus, Search, Sparkles, Trash2 } from 'lucide-react';
import { useGallery, folderName } from '../../lib/galleryContext';
import { formatBytes } from '../../lib/gallery';
import { Button } from '../ui/controls';
import { useDialog } from '../ui/Dialog';
import { useToast } from '../ui/Toast';
import { cn } from '../../lib/utils';

interface GalleryViewProps {
  onOpenImage: (id: string, ids: string[]) => void;
  onGoToStudio: () => void;
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export const GalleryView: React.FC<GalleryViewProps> = ({ onOpenImage, onGoToStudio }) => {
  const { ready, images, folders, storage, createFolder, deleteFolder, exportZip } = useGallery();
  const { confirm, prompt } = useDialog();
  const toast = useToast();
  const [folderId, setFolderId] = useState('all');
  const [query, setQuery] = useState('');
  const [zipping, setZipping] = useState(false);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return images
      .filter((i) => folderId === 'all' || i.folderId === folderId)
      .filter((i) => !q || normalize(i.prompt).includes(q));
  }, [images, folderId, query]);

  const countIn = (id: string) => (id === 'all' ? images.length : images.filter((i) => i.folderId === id).length);
  const current = folders.find((f) => f.id === folderId);

  const newFolder = async () => {
    const name = await prompt({ title: 'Nueva carpeta', label: 'Nombre', placeholder: 'Ej: Campaña otoño', confirmLabel: 'Crear' });
    if (!name) return;
    try {
      const folder = await createFolder(name);
      setFolderId(folder.id);
    } catch {
      toast({ message: 'No se pudo crear la carpeta.', tone: 'error' });
    }
  };

  const removeFolder = async () => {
    if (!current || current.isDefault) return;
    const ok = await confirm({
      title: 'Borrar carpeta',
      message: `Se borra la carpeta “${current.name}”. Las imágenes no se borran: quedan en Todas.`,
      confirmLabel: 'Borrar carpeta',
      danger: true,
    });
    if (!ok) return;
    await deleteFolder(current.id);
    setFolderId('all');
  };

  const download = async () => {
    setZipping(true);
    try {
      const n = await exportZip(filtered.map((i) => i.id));
      if (!n) toast({ message: 'No hay imágenes para descargar.' });
    } catch {
      toast({ message: 'No se pudo armar el .zip.', tone: 'error' });
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="px-4 py-6 lg:px-10 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl lg:text-6xl tracking-tight leading-none">Galería</h1>
          <p className="mt-3 text-[15px] text-muted">
            {images.length} {images.length === 1 ? 'imagen guardada' : 'imágenes guardadas'} en este navegador
          </p>
        </div>
        <Button onClick={download} loading={zipping} disabled={!filtered.length}>
          {!zipping && <Download className="w-4 h-4" />}
          {filtered.length === images.length ? 'Descargar todo' : `Descargar ${filtered.length}`} (.zip)
        </Button>
      </div>

      <div className="mt-6 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative lg:w-72 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por prompt"
            aria-label="Buscar por prompt"
            className="input pl-9"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0">
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => setFolderId(f.id)}
              aria-pressed={f.id === folderId}
              className={cn(
                'h-9 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap border transition-colors',
                f.id === folderId ? 'bg-white text-black border-white' : 'border-line text-muted hover:text-ink hover:bg-white/[0.04]'
              )}
            >
              {folderName(f)}
              <span className="ml-1.5 opacity-60 tabular-nums">{countIn(f.id)}</span>
            </button>
          ))}
          <button
            onClick={newFolder}
            className="h-9 px-3.5 rounded-full text-[13px] whitespace-nowrap border border-dashed border-white/15 text-muted hover:text-ink inline-flex items-center gap-1.5"
          >
            <FolderPlus className="w-4 h-4" />
            Carpeta
          </button>
        </div>
        {current && !current.isDefault && (
          <Button size="sm" variant="ghost" className="lg:ml-auto self-start lg:self-auto text-red-300 hover:text-red-200 hover:bg-red-500/10" onClick={removeFolder}>
            <Trash2 className="w-4 h-4" />
            Borrar carpeta
          </Button>
        )}
      </div>

      {!ready ? null : images.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line py-20 px-6 text-center">
          <p className="font-display text-4xl leading-none">Tu galería está vacía</p>
          <p className="mt-3 text-[14px] text-muted">Todo lo que generes se guarda acá automáticamente.</p>
          <Button variant="primary" className="mt-6" onClick={onGoToStudio}>
            <Sparkles className="w-4 h-4" />
            Ir al estudio
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-10 py-16 text-center text-[14px] text-muted">No hay imágenes que coincidan.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 lg:gap-3">
          {filtered.map((img) => (
            <button
              key={img.id}
              onClick={() => onOpenImage(img.id, filtered.map((i) => i.id))}
              title={img.prompt}
              className="group aspect-square rounded-xl overflow-hidden bg-white/[0.03]"
            >
              <img
                src={img.url}
                alt={img.prompt}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            </button>
          ))}
        </div>
      )}

      {storage && (
        <p className="mt-10 max-w-2xl text-[12px] text-faint leading-relaxed">
          Ocupa {formatBytes(storage.usedBytes)} en este navegador. Cada dirección (por ejemplo localhost o
          detolab-five.vercel.app) tiene su propia galería, y si borrás los datos del sitio se pierde: descargá lo importante.
        </p>
      )}
    </div>
  );
};
