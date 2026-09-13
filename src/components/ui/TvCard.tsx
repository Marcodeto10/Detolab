import React, { useRef } from 'react';
import { cn } from '../../lib/utils';

interface TvCardProps {
  /** Contenido de la card (imagen) */
  art: React.ReactNode;
  /** Forma de la card: proporción y bordes */
  artClassName?: string;
  /** Texto debajo de la card, como en Apple TV */
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
  title?: string;
}

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Card con el efecto de foco de Apple TV: crece, se inclina apenas y brilla bajo el puntero. */
export const TvCard: React.FC<TvCardProps> = ({ art, artClassName, children, className, onClick, ariaLabel, title }) => {
  const artRef = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent) => {
    const el = artRef.current;
    if (!el || e.pointerType !== 'mouse' || reducedMotion()) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    el.style.setProperty('--rx', `${(0.5 - y) * 6}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 8}deg`);
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
  };

  const onLeave = () => {
    const el = artRef.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={cn('tv-lockup group block w-full min-w-0 self-start text-left', className)}
    >
      <div ref={artRef} className={cn('tv-card bg-raised', artClassName)}>
        {art}
        <span aria-hidden className="tv-card-shine" />
      </div>
      {children}
    </button>
  );
};
