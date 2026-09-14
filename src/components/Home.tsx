import React from 'react';
import { ChevronRight } from 'lucide-react';
import { TOOLS, TOOL_ORDER, GALLERY_COVER, type ToolId } from '../lib/tools';
import { useGallery } from '../lib/galleryContext';
import { CoverImage } from './ui/controls';
import { TvCard } from './ui/TvCard';

interface HomeProps {
  userName: string;
  onOpenTool: (t: ToolId) => void;
  onOpenGallery: () => void;
  onOpenImage: (id: string) => void;
}

// Una línea corta por card (la descripción larga queda para el Studio)
const TAGLINES: Record<ToolId | 'gallery', string> = {
  create: 'Any image from a prompt.',
  edit: 'Change anything in a photo.',
  mockup: 'Your design on a mockup.',
  product: 'Studio shots of your product.',
  bulk: 'One edit, many photos.',
  gallery: 'All your images, in folders.',
};

const ShelfHeader: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
  <div className="flex items-baseline justify-between gap-4">
    <h2 className="text-[22px] font-bold tracking-tight">{title}</h2>
    {action}
  </div>
);

export const Home: React.FC<HomeProps> = ({ onOpenTool, onOpenGallery, onOpenImage }) => {
  const { images, ready } = useGallery();
  const recent = images.slice(0, 16);

  // Las 5 herramientas + la galería: 3 y 3
  const cards = [
    ...TOOL_ORDER.map((id) => ({
      key: id,
      title: TOOLS[id].name,
      description: TAGLINES[id],
      cover: TOOLS[id].cover,
      onClick: () => onOpenTool(id),
    })),
    {
      key: 'gallery',
      title: 'Gallery',
      description: TAGLINES.gallery,
      cover: GALLERY_COVER,
      onClick: onOpenGallery,
    },
  ];

  return (
    <div className="max-w-[1040px] mx-auto px-4 pt-6 pb-10 lg:px-10 lg:pt-10 space-y-10 lg:space-y-12">
      <section>
        <h1 className="sr-only">Detolab</h1>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 lg:gap-6">
          {cards.map((c) => (
            <TvCard
              key={c.key}
              onClick={c.onClick}
              artClassName="aspect-[3/4] rounded-2xl"
              art={
                <>
                  <CoverImage src={c.cover} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div aria-hidden className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4 lg:p-5">
                    <p className="text-[18px] sm:text-[24px] lg:text-[30px] font-bold tracking-tight leading-none text-white truncate">{c.title}</p>
                    <p className="hidden sm:block mt-2 text-[13px] lg:text-[14px] leading-snug text-white truncate">{c.description}</p>
                  </div>
                </>
              }
            />
          ))}
        </div>
      </section>

      <section>
        <ShelfHeader
          title="Recent"
          action={
            images.length > 0 && (
              <button onClick={onOpenGallery} className="inline-flex items-center gap-0.5 text-[15px] text-muted hover:text-ink transition-colors">
                See All
                <ChevronRight className="w-4 h-4" />
              </button>
            )
          }
        />
        {recent.length > 0 ? (
          <div className="mt-4 -mx-4 px-4 scroll-px-4 lg:-mx-10 lg:px-10 lg:scroll-px-10 pb-4 pt-1 flex gap-4 overflow-x-auto snap-x no-scrollbar">
            {recent.map((img) => (
              <TvCard
                key={img.id}
                onClick={() => onOpenImage(img.id)}
                title={img.prompt}
                ariaLabel={img.prompt}
                className="snap-start shrink-0 w-40 lg:w-52"
                artClassName="aspect-square rounded-2xl"
                art={
                  img.thumbUrl ? (
                    <img src={img.thumbUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 animate-pulse bg-white/[0.04]" />
                  )
                }
              />
            ))}
          </div>
        ) : (
          ready && (
            <div className="mt-4 rounded-2xl bg-raised py-12 px-6 text-center text-[15px] text-muted">
              Nothing generated yet. Your images will show up here.
            </div>
          )
        )}
      </section>
    </div>
  );
};
