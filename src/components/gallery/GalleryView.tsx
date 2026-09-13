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
    const name = await prompt({ title: 'New folder', label: 'Name', placeholder: 'e.g. Fall campaign', confirmLabel: 'Create' });
    if (!name) return;
    try {
      const folder = await createFolder(name);
      setFolderId(folder.id);
    } catch {
      toast({ message: "Couldn't create the folder.", tone: 'error' });
    }
  };

  const removeFolder = async () => {
    if (!current || current.isDefault) return;
    const ok = await confirm({
      title: 'Delete folder',
      message: `The folder “${current.name}” will be deleted. Its images won't: they stay in All.`,
      confirmLabel: 'Delete folder',
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
      if (!n) toast({ message: 'No images to download.' });
    } catch {
      toast({ message: "Couldn't build the .zip.", tone: 'error' });
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 lg:px-10 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight leading-none">Gallery</h1>
          <p className="mt-3 text-[15px] text-muted">
            {images.length} {images.length === 1 ? 'image' : 'images'} saved in this browser
          </p>
        </div>
        <Button onClick={download} loading={zipping} disabled={!filtered.length}>
          {!zipping && <Download className="w-4 h-4" />}
          {filtered.length === images.length ? 'Download all' : `Download ${filtered.length}`} (.zip)
        </Button>
      </div>

      <div className="mt-6 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative lg:w-72 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by prompt"
            aria-label="Search by prompt"
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
                'h-9 px-4 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors',
                f.id === folderId ? 'bg-white text-black' : 'bg-white/[0.1] text-ink hover:bg-white/[0.16]'
              )}
            >
              {folderName(f)}
              <span className="ml-1.5 opacity-60 tabular-nums">{countIn(f.id)}</span>
            </button>
          ))}
          <button
            onClick={newFolder}
            className="h-9 px-3.5 rounded-full text-[13px] whitespace-nowrap bg-white/[0.06] text-muted hover:text-ink inline-flex items-center gap-1.5"
          >
            <FolderPlus className="w-4 h-4" />
            Folder
          </button>
        </div>
        {current && !current.isDefault && (
          <Button
            size="sm"
            variant="ghost"
            className="lg:ml-auto self-start lg:self-auto text-red-300 hover:text-red-200 hover:bg-red-500/10"
            onClick={removeFolder}
          >
            <Trash2 className="w-4 h-4" />
            Delete folder
          </Button>
        )}
      </div>

      {!ready ? null : images.length === 0 ? (
        <div className="mt-10 rounded-3xl bg-raised py-20 px-6 text-center">
          <p className="text-3xl font-bold tracking-tight leading-none">Your gallery is empty</p>
          <p className="mt-3 text-[14px] text-muted">Everything you generate is saved here automatically.</p>
          <Button variant="primary" className="mt-6" onClick={onGoToStudio}>
            <Sparkles className="w-4 h-4" />
            Go to studio
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-10 py-16 text-center text-[14px] text-muted">No images match.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 lg:gap-3">
          {filtered.map((img) => (
            <button
              key={img.id}
              onClick={() => onOpenImage(img.id, filtered.map((i) => i.id))}
              title={img.prompt}
              className="relative aspect-square rounded-xl overflow-hidden bg-raised transition-[transform,box-shadow] duration-300 ease-out hover:z-10 hover:scale-[1.04] hover:shadow-[0_24px_48px_rgba(0,0,0,0.65)]"
            >
              {img.thumbUrl ? (
                <img src={img.thumbUrl} alt={img.prompt} loading="lazy" decoding="async" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full animate-pulse bg-white/[0.04]" />
              )}
            </button>
          ))}
        </div>
      )}

      {storage && (
        <p className="mt-10 max-w-2xl text-[12px] text-faint leading-relaxed">
          Uses {formatBytes(storage.usedBytes)} in this browser. Each address (e.g. localhost or detolab-five.vercel.app)
          has its own gallery, and clearing the site's data deletes it: download anything important.
        </p>
      )}
    </div>
  );
};
