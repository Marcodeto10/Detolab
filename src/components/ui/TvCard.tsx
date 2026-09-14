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

/**
 * Efecto de foco de Apple TV: la card se inclina hacia el puntero, brilla y sus capas
 * (.tv-parallax-bg y .tv-parallax-fg) se mueven con profundidad.
 */
export const useTilt = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);

  const onPointerMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse' || reducedMotion()) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    el.style.setProperty('--rx', `${(0.5 - y) * 10}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 12}deg`);
    el.style.setProperty('--px', `${x - 0.5}`);
    el.style.setProperty('--py', `${y - 0.5}`);
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
  };

  const onPointerLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--px', '0');
    el.style.setProperty('--py', '0');
  };

  return { ref, onPointerMove, onPointerLeave };
};

export const TvCard: React.FC<TvCardProps> = ({ art, artClassName, children, className, onClick, ariaLabel, title }) => {
  const { ref, onPointerMove, onPointerLeave } = useTilt<HTMLDivElement>();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={cn('tv-lockup group block w-full min-w-0 self-start text-left', className)}
    >
      <div ref={ref} className={cn('tv-card bg-raised', artClassName)}>
        {art}
        <span aria-hidden className="tv-card-shine" />
      </div>
      {children}
    </button>
  );
};
