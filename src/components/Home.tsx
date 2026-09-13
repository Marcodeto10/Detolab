import React from 'react';
import { ArrowRight } from 'lucide-react';
import { TOOLS, TOOL_ORDER, GALLERY_COVER, type ToolId } from '../lib/tools';
import { useGallery } from '../lib/galleryContext';
import { Button, CoverImage } from './ui/controls';

interface HomeProps {
  userName: string;
  onOpenTool: (t: ToolId) => void;
  onOpenGallery: () => void;
  onOpenImage: (id: string) => void;
}

const HomeCard: React.FC<{ title: string; description: string; cover: string; onClick: () => void }> = ({
  title,
  description,
  cover,
  onClick,
}) => (
  <button
    onClick={onClick}
    className="group relative w-full h-52 md:h-64 lg:h-[36vh] lg:min-h-[260px] rounded-xl overflow-hidden text-left bg-raised"
  >
    <CoverImage
      src={cover}
      alt=""
      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
    />
    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
    <div className="absolute inset-0 p-4 lg:p-6 flex flex-col justify-end">
      <h3 className="font-display text-3xl lg:text-[2.75rem] tracking-tight text-white leading-none">{title}</h3>
      <p className="mt-1.5 lg:mt-2 text-[12px] lg:text-[14px] text-white/75 leading-snug line-clamp-2">{description}</p>
    </div>
  </button>
);

export const Home: React.FC<HomeProps> = ({ userName, onOpenTool, onOpenGallery, onOpenImage }) => {
  const { images, ready } = useGallery();
  const firstName = userName.trim().split(/\s+/)[0];
  const recent = images.slice(0, 12);

  return (
    <div className="px-4 py-6 lg:px-10 lg:py-10 space-y-12">
      <section>
        <h1 className="font-display text-5xl lg:text-6xl tracking-tight leading-none">Estudio creativo</h1>
        <p className="mt-3 text-[15px] text-muted">
          {firstName ? `Hola ${firstName}, elegí` : 'Elegí'} una herramienta para empezar.
        </p>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3 lg:gap-4">
          {TOOL_ORDER.map((id) => (
            <HomeCard
              key={id}
              title={TOOLS[id].name}
              description={TOOLS[id].description}
              cover={TOOLS[id].cover}
              onClick={() => onOpenTool(id)}
            />
          ))}
          <HomeCard
            title="Galería"
            description="Todo lo que generaste, ordenado en carpetas."
            cover={GALLERY_COVER}
            onClick={onOpenGallery}
          />
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-4xl lg:text-5xl tracking-tight leading-none">Recientes</h2>
            <p className="mt-2 text-[14px] text-muted">Lo último que generaste.</p>
          </div>
          {images.length > 0 && (
            <Button variant="ghost" onClick={onOpenGallery}>
              Ver todas ({images.length})
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>

        {recent.length > 0 ? (
          <div className="mt-5 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 lg:gap-3">
            {recent.map((img) => (
              <button
                key={img.id}
                onClick={() => onOpenImage(img.id)}
                title={img.prompt}
                className="group aspect-square rounded-lg overflow-hidden bg-white/[0.03]"
              >
                <img
                  src={img.url}
                  alt={img.prompt}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              </button>
            ))}
          </div>
        ) : (
          ready && (
            <div className="mt-5 rounded-xl border border-dashed border-line py-12 px-6 text-center text-[14px] text-muted">
              Todavía no generaste nada. Tus imágenes van a aparecer acá.
            </div>
          )
        )}
      </section>
    </div>
  );
};
