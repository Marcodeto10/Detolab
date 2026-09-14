import React from 'react';
import { Modal } from '../ui/Dialog';
import { useGallery } from '../../lib/galleryContext';
import type { GalleryImage } from '../../lib/gallery';

interface GalleryPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (img: GalleryImage) => void;
}

export const GalleryPicker: React.FC<GalleryPickerProps> = ({ open, onClose, onPick }) => {
  const { images } = useGallery();

  return (
    <Modal open={open} onClose={onClose} title="Choose from gallery" className="sm:max-w-2xl">
      {images.length === 0 ? (
        <p className="py-12 text-center text-[14px] text-muted">No images in your gallery yet.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[60dvh] overflow-y-auto custom-scrollbar p-1 -m-1">
          {images.map((img) => (
            <button
              key={img.id}
              onClick={() => onPick(img)}
              title={img.prompt}
              className="aspect-square rounded-lg overflow-hidden bg-white/[0.03] hover:ring-2 hover:ring-white transition duration-200 hover:scale-[1.03] active:scale-[0.97]"
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
    </Modal>
  );
};
