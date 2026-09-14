import React, { useRef, useState } from 'react';
import { Images, Link2, Loader2, Plus, Upload, X } from 'lucide-react';
import type { SlotSpec } from '../../lib/tools';
import { imageFilesFrom, urlFromDataTransfer, type InputImage } from '../../lib/imageInput';
import { Button } from '../ui/controls';
import { cn } from '../../lib/utils';

interface ImageSlotProps {
  spec: SlotSpec;
  images: InputImage[];
  active: boolean;
  loading: boolean;
  pasteHint: string;
  onActivate: () => void;
  onAddFiles: (files: File[]) => void;
  onAddUrl: (url: string, source: 'link' | 'gallery') => Promise<boolean>;
  onRemove: (id: string) => void;
  onClear: () => void;
  onPickFromGallery: () => void;
}

const SmallAction: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, children, ...props }) => (
  <button
    type="button"
    {...props}
    className={cn(
      'inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] text-muted hover:text-ink hover:bg-white/[0.06] transition-colors [&_svg]:w-3.5 [&_svg]:h-3.5',
      className
    )}
  >
    {children}
  </button>
);

export const ImageSlot: React.FC<ImageSlotProps> = ({
  spec,
  images,
  active,
  loading,
  pasteHint,
  onActivate,
  onAddFiles,
  onAddUrl,
  onRemove,
  onClear,
  onPickFromGallery,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');

  const single = spec.max === 1;
  const isEmpty = images.length === 0;
  const openFiles = () => fileRef.current?.click();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    onActivate();
    const files = imageFilesFrom(e.dataTransfer.files);
    if (files.length) {
      onAddFiles(files);
      return;
    }
    const url = urlFromDataTransfer(e.dataTransfer);
    if (url) onAddUrl(url, url.startsWith('blob:') ? 'gallery' : 'link');
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={handleDrop}
      onPointerDown={onActivate}
      onFocusCapture={onActivate}
      className={cn(
        'rounded-2xl p-3 ring-1 transition',
        dragging ? 'ring-white bg-white/[0.1]' : active ? 'ring-white/20 bg-fill-soft' : 'ring-transparent bg-fill-soft'
      )}
    >
      <div className="flex items-baseline justify-between gap-3 px-0.5 mb-2.5">
        <p className="text-[13px] font-semibold text-ink shrink-0">
          {spec.label}
          {spec.required && <span className="ml-0.5 text-faint">*</span>}
        </p>
        <p className="min-w-0 text-right text-[12px] leading-snug text-faint">{spec.hint}</p>
      </div>

      {isEmpty ? (
        <button
          type="button"
          onClick={openFiles}
          className={cn(
            'group w-full h-24 rounded-xl border border-dashed flex flex-col items-center justify-center gap-1.5 transition-colors',
            dragging ? 'border-white text-ink' : 'border-white/15 text-muted hover:text-ink hover:border-white/35 hover:bg-white/[0.03]'
          )}
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5 transition-transform duration-200 group-hover:-translate-y-0.5" />}
          <span className="text-[13px]">
            {loading ? 'Loading…' : dragging ? 'Drop it here' : single ? 'Upload or drop an image' : 'Upload or drop images'}
          </span>
          {active && !loading && <span className="hidden lg:block text-[11px] text-faint">or paste with {pasteHint}</span>}
        </button>
      ) : (
        <div
          className={cn(
            'grid gap-2',
            single ? 'grid-cols-1' : 'grid-cols-4',
            images.length > 8 && 'max-h-60 overflow-y-auto custom-scrollbar pr-1'
          )}
        >
          {images.map((img, i) => (
            <div key={img.id} className={cn('relative rounded-lg overflow-hidden bg-black/30', single ? 'h-36' : 'aspect-square')}>
              <img
                src={img.preview}
                alt={spec.numbered ? `Image ${i + 1}` : spec.label}
                className={cn('w-full h-full', single ? 'object-contain' : 'object-cover')}
              />
              {spec.numbered && (
                <span className="absolute bottom-1.5 left-1.5 min-w-5 h-5 px-1 rounded-md bg-black/75 text-[11px] font-semibold grid place-items-center tabular-nums">
                  {i + 1}
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemove(img.id)}
                aria-label="Remove image"
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 backdrop-blur grid place-items-center text-white/90 hover:bg-black"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              {loading && single && (
                <div className="absolute inset-0 bg-black/60 grid place-items-center">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              )}
            </div>
          ))}
          {!single && images.length < spec.max && (
            <button
              type="button"
              onClick={openFiles}
              aria-label="Add image"
              className="aspect-square rounded-lg border border-dashed border-white/15 hover:border-white/35 grid place-items-center text-muted hover:text-ink"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
            </button>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1 -mx-1">
        <SmallAction onClick={onPickFromGallery}>
          <Images />
          Gallery
        </SmallAction>
        <SmallAction onClick={() => setLinkOpen((o) => !o)} aria-expanded={linkOpen}>
          <Link2 />
          Link
        </SmallAction>
        {!isEmpty && single && (
          <SmallAction onClick={openFiles}>
            <Upload />
            Replace
          </SmallAction>
        )}
        {images.length > 1 && (
          <SmallAction className="ml-auto" onClick={onClear}>
            Clear all
          </SmallAction>
        )}
      </div>

      {linkOpen && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!link.trim()) return;
            const ok = await onAddUrl(link, 'link');
            if (ok) {
              setLink('');
              setLinkOpen(false);
            }
          }}
          className="mt-2 flex gap-2"
        >
          <input
            autoFocus
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…"
            className="input h-9 text-[13px]"
          />
          <Button type="submit" size="sm" variant="primary" className="h-9" disabled={!link.trim() || loading}>
            Add
          </Button>
        </form>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple={!single}
        hidden
        onChange={(e) => {
          onAddFiles(imageFilesFrom(e.target.files));
          e.target.value = '';
        }}
      />
    </div>
  );
};
