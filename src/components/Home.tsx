import React from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { TOOLS, type ToolId } from '../lib/tools';
import { useGallery } from '../lib/galleryContext';
import { Button, CoverImage } from './ui/controls';
import { TvCard } from './ui/TvCard';

interface HomeProps {
  userName: string;
  onOpenTool: (t: ToolId) => void;
  onOpenGallery: () => void;
  onOpenImage: (id: string) => void;
}

const SHELF_TOOLS: ToolId[] = ['edit', 'mockup', 'product', 'bulk'];

const ShelfHeader: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
  <div className="flex items-baseline justify-between gap-4">
    <h2 className="text-[22px] font-bold tracking-tight">{title}</h2>
    {action}
  </div>
);

export const Home: React.FC<HomeProps> = ({ userName, onOpenTool, onOpenGallery, onOpenImage }) => {
  const { images, ready } = useGallery();
  const firstName = userName.trim().split(/\s+/)[0];
  const recent = images.slice(0, 16);

  return (
    <div className="max-w-[1600px] mx-auto px-4 pt-4 pb-10 lg:px-10 lg:pt-8 space-y-10 lg:space-y-12">
      {/* Destacado, como el "top shelf" de Apple TV */}
      <section className="relative overflow-hidden rounded-3xl bg-raised h-[64dvh] min-h-[440px] md:h-auto md:aspect-[21/9] md:min-h-[400px]">
        <CoverImage src={TOOLS.create.cover} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent md:bg-gradient-to-r md:from-black/85 md:via-black/35 md:to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 md:p-10 lg:p-14 max-w-2xl">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white/70">
            {firstName ? `Welcome back, ${firstName}` : 'Detolab Studio'}
          </p>
          <h1 className="mt-2 text-6xl lg:text-8xl font-bold tracking-tight leading-[0.95] text-white">Create</h1>
          <p className="mt-4 text-[16px] lg:text-[19px] leading-snug text-white/80 max-w-lg">{TOOLS.create.description}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" onClick={() => onOpenTool('create')}>
              <Sparkles className="w-4 h-4" />
              Start creating
            </Button>
            <Button size="lg" className="hidden sm:inline-flex" onClick={onOpenGallery}>
              Open gallery
            </Button>
          </div>
        </div>
      </section>

      {/* Fila de herramientas */}
      <section>
        <ShelfHeader title="Tools" />
        <div className="mt-4 -mx-4 px-4 scroll-px-4 pb-3 pt-1 flex gap-4 overflow-x-auto snap-x snap-mandatory no-scrollbar md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-4 md:gap-6 md:overflow-visible">
          {SHELF_TOOLS.map((id) => (
            <TvCard
              key={id}
              onClick={() => onOpenTool(id)}
              className="snap-start shrink-0 w-[78%] sm:w-[46%] md:w-auto"
              artClassName="aspect-video rounded-2xl"
              art={<CoverImage src={TOOLS[id].cover} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            >
              <p className="mt-3 text-[16px] font-semibold text-ink">{TOOLS[id].name}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted line-clamp-2">{TOOLS[id].description}</p>
            </TvCard>
          ))}
        </div>
      </section>

      {/* Recientes */}
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
                art={<img src={img.url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
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
