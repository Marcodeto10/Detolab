import React, { useRef, useState } from 'react';
import { MoveHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils';

/** Antes y después superpuestos, con una barra para deslizar. */
export const CompareSlider: React.FC<{ before: string; after: string; className?: string }> = ({ before, after, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [pos, setPos] = useState(50);

  const update = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Compare before and after"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pos)}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && update(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5));
        if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5));
      }}
      className={cn('relative select-none touch-none overflow-hidden rounded-xl cursor-ew-resize', className)}
    >
      <img src={after} alt="After" draggable={false} className="absolute inset-0 w-full h-full object-contain" />
      <img
        src={before}
        alt="Before"
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />
      <div className="absolute inset-y-0 w-px bg-white/80 pointer-events-none" style={{ left: `${pos}%` }}>
        <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white text-black grid place-items-center shadow-xl">
          <MoveHorizontal className="w-4 h-4" />
        </div>
      </div>
      <span className="absolute top-3 left-3 px-2 py-1 rounded-md bg-black/60 text-[12px] pointer-events-none">Before</span>
      <span className="absolute top-3 right-3 px-2 py-1 rounded-md bg-black/60 text-[12px] pointer-events-none">After</span>
    </div>
  );
};
