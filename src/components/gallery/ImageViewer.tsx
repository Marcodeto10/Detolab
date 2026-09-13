import React, { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Copy, Download, Trash2, X } from 'lucide-react';
import { useGallery, folderName } from '../../lib/galleryContext';
import { downloadName, downloadUrl } from '../../lib/imageInput';
import { USE_AS, type SlotId, type ToolId } from '../../lib/tools';
import { Button, Label, Select } from '../ui/controls';
import { useToast } from '../ui/Toast';

interface ImageViewerProps {
  imageId: string | null;
  ids: string[];
  onClose: () => void;
  onNavigate: (id: string) => void;
  onUseAs: (url: string, tool: ToolId, slot: SlotId) => void;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ imageId, ids, onClose, onNavigate, onUseAs }) => {
  const { images, folders, move, remove, restore } = useGallery();
  const toast = useToast();
  const touchX = useRef<number | null>(null);

  const liveIds = ids.filter((id) => images.some((i) => i.id === id));
  const img = imageId ? images.find((i) => i.id === imageId) : undefined;
  const index = img ? liveIds.indexOf(img.id) : -1;
  const prevId = index > 0 ? liveIds[index - 1] : null;
  const nextId = index >= 0 && index < liveIds.length - 1 ? liveIds[index + 1] : null;

  useEffect(() => {
    if (imageId && !img) onClose();
  }, [imageId, img, onClose]);

  useEffect(() => {
    if (!img) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select')) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && prevId) onNavigate(prevId);
      if (e.key === 'ArrowRight' && nextId) onNavigate(nextId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [img, prevId, nextId, onClose, onNavigate]);

  if (!img) return null;

  const handleDelete = async () => {
    const id = img.id;
    const target = nextId ?? prevId;
    if (target) onNavigate(target);
    else onClose();
    try {
      await remove(id);
      toast({ message: 'Imagen borrada.', action: { label: 'Deshacer', onClick: () => restore(id) } });
    } catch {
      toast({ message: 'No se pudo borrar la imagen.', tone: 'error' });
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(img.prompt);
      toast({ message: 'Prompt copiado.', tone: 'success' });
    } catch {
      toast({ message: 'No se pudo copiar.', tone: 'error' });
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Imagen" className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-sm flex flex-col lg:flex-row">
      <div
        className="relative flex-1 min-h-0 flex items-center justify-center p-4 lg:p-12"
        onClick={(e) => e.target === e.currentTarget && onClose()}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (dx > 60 && prevId) onNavigate(prevId);
          if (dx < -60 && nextId) onNavigate(nextId);
        }}
      >
        <img src={img.url} alt={img.prompt} className="max-w-full max-h-full object-contain rounded-lg" />

        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3 lg:top-5 lg:right-5 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"
        >
          <X className="w-5 h-5" />
        </button>
        {prevId && (
          <button
            onClick={() => onNavigate(prevId)}
            aria-label="Anterior"
            className="absolute left-2 lg:left-5 top-1/2 -translate-y-1/2 w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {nextId && (
          <button
            onClick={() => onNavigate(nextId)}
            aria-label="Siguiente"
            className="absolute right-2 lg:right-5 top-1/2 -translate-y-1/2 w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      <aside className="lg:w-[340px] shrink-0 max-h-[46dvh] lg:max-h-none overflow-y-auto custom-scrollbar border-t lg:border-t-0 lg:border-l border-line bg-panel p-5 space-y-6">
        <div className="flex items-center justify-between text-[12px] text-faint tabular-nums">
          <span>{new Date(img.createdAt).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          {liveIds.length > 1 && (
            <span>
              {index + 1} de {liveIds.length}
            </span>
          )}
        </div>

        <Button variant="primary" className="w-full" onClick={() => downloadUrl(img.url, downloadName('imagen', img.id))}>
          <Download className="w-4 h-4" />
          Descargar
        </Button>

        <div>
          <Label>Usar en el estudio</Label>
          <div className="grid gap-1.5">
            {USE_AS.map((u) => (
              <Button key={u.label} size="sm" className="justify-start h-9" onClick={() => onUseAs(img.url, u.tool, u.slot)}>
                {u.label}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <Label>Carpeta</Label>
          <Select
            aria-label="Carpeta"
            value={img.folderId}
            onChange={(e) => move(img.id, e.target.value)}
            options={folders.map((f) => ({ value: f.id, label: f.id === 'all' ? 'Sin carpeta' : folderName(f) }))}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-medium">Prompt</span>
            <button onClick={copyPrompt} className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink">
              <Copy className="w-3.5 h-3.5" />
              Copiar
            </button>
          </div>
          <p className="text-[14px] text-muted leading-relaxed whitespace-pre-wrap break-words">{img.prompt}</p>
        </div>

        <Button variant="ghost" className="w-full text-red-300 hover:text-red-200 hover:bg-red-500/10" onClick={handleDelete}>
          <Trash2 className="w-4 h-4" />
          Borrar imagen
        </Button>
      </aside>
    </div>
  );
};
