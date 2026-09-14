import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Gem, History, Star, Zap } from 'lucide-react';
import { MODELS, MODEL_ORDER, type ModelType } from '../../lib/models';
import { cn } from '../../lib/utils';

const BADGE_ICONS: Record<ModelType, React.ElementType> = {
  pro: Gem,
  'flash-v2': Star,
  'flash-lite': Zap,
  legacy: History,
};

const Badge: React.FC<{ type: ModelType; className?: string }> = ({ type, className }) => {
  const Icon = BADGE_ICONS[type];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 h-5 px-1.5 rounded-md bg-white/[0.08] text-[11px] font-medium text-muted whitespace-nowrap',
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {MODELS[type].badge}
    </span>
  );
};

/** Selector de modelo: el nombre real más una etiqueta corta que dice para qué conviene cada uno. */
export const ModelPicker: React.FC<{ value: ModelType; onChange: (m: ModelType) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open && ref.current) {
      // Si abajo no entra (la barra de Generate lo taparía), se abre hacia arriba
      setUpward(window.innerHeight - ref.current.getBoundingClientRect().bottom < 420);
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Model"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        className="w-full h-10 flex items-center gap-2 rounded-[10px] bg-fill pl-3 pr-9 text-left text-[14px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        <span className="truncate">{MODELS[value].label}</span>
        <Badge type={value} className="ml-auto" />
      </button>
      <ChevronDown
        className={cn(
          'pointer-events-none absolute right-3 top-5 -translate-y-1/2 w-4 h-4 text-faint transition-transform duration-200',
          open && 'rotate-180'
        )}
      />

      {open && (
        <div
          role="listbox"
          aria-label="Model"
          className={cn(
            'pop-in absolute z-50 inset-x-0 p-1.5 rounded-[14px] bg-[#2c2c2e]/95 backdrop-blur-2xl backdrop-saturate-150 border border-white/10 shadow-2xl',
            upward ? 'bottom-full mb-2' : 'top-full mt-2'
          )}
        >
          {MODEL_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              role="option"
              aria-selected={m === value}
              onClick={() => {
                setOpen(false);
                onChange(m);
              }}
              className={cn(
                'w-full flex items-start gap-3 px-3 py-2.5 rounded-[10px] text-left transition-colors',
                m === value ? 'bg-white/[0.08]' : 'hover:bg-white/[0.06]'
              )}
            >
              <span className="flex-1 min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium text-ink">{MODELS[m].label}</span>
                  <Badge type={m} />
                </span>
                <span className="block mt-0.5 text-[12px] leading-snug text-muted">{MODELS[m].note}</span>
              </span>
              <Check className={cn('w-4 h-4 mt-0.5 shrink-0', m === value ? 'text-ink' : 'invisible')} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
