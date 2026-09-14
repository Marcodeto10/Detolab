import React, { useEffect, useId, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

// Botones cápsula, como en Apple TV
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-white text-black hover:bg-white/90 active:bg-white/80 disabled:bg-white/20 disabled:text-white/40',
  secondary: 'bg-white/[0.12] text-ink hover:bg-white/[0.18] active:bg-white/[0.24] backdrop-blur-xl disabled:opacity-40',
  ghost: 'text-ink/80 hover:text-ink hover:bg-white/[0.08] disabled:opacity-40',
  danger: 'bg-[#ff453a] text-white hover:bg-[#ff5b51] disabled:opacity-40',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3.5 text-[13px] gap-1.5',
  md: 'h-10 px-4.5 text-[14px] gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}) => (
  <button
    {...props}
    disabled={disabled || loading}
    className={cn(
      'inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap transition-[color,background-color,opacity,transform] duration-200 active:scale-[0.97] disabled:active:scale-100 disabled:cursor-not-allowed',
      VARIANTS[variant],
      SIZES[size],
      className
    )}
  >
    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
    {children}
  </button>
);

export const Label: React.FC<{ children: React.ReactNode; hint?: React.ReactNode; className?: string; htmlFor?: string }> = ({
  children,
  hint,
  className,
  htmlFor,
}) => (
  <div className={cn('flex items-baseline justify-between gap-3 mb-2', className)}>
    <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">
      {children}
    </label>
    {hint && <span className="text-[12px] text-faint truncate">{hint}</span>}
  </div>
);

interface SegmentedProps<T extends string | number> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string; disabled?: boolean }[];
  className?: string;
  ariaLabel?: string;
}

/** Control segmentado estilo iOS. */
export const Segmented = <T extends string | number>({ value, onChange, options, className, ariaLabel }: SegmentedProps<T>) => {
  // Cada control tiene su propio fondo que se desliza hasta la opción elegida
  const thumbId = useId();
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('flex p-0.5 gap-0.5 rounded-[10px] bg-fill', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative flex-1 min-w-0 h-8 px-2 rounded-[8px] text-[13px] font-semibold transition-[color,transform] duration-200 active:scale-[0.97] disabled:opacity-30',
            o.value === value ? 'text-white' : 'text-ink/80 hover:text-ink'
          )}
        >
          {o.value === value && (
            <motion.span
              layoutId={thumbId}
              aria-hidden
              className="absolute inset-0 rounded-[8px] bg-[#636366] shadow-[0_3px_8px_rgba(0,0,0,0.25)]"
              transition={{ type: 'spring', stiffness: 520, damping: 42, mass: 0.8 }}
            />
          )}
          <span className="relative block truncate">{o.label}</span>
        </button>
      ))}
    </div>
  );
};

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({ options, className, ...props }) => (
  <div className={cn('relative', className)}>
    <select
      {...props}
      className="w-full h-10 appearance-none rounded-[10px] bg-fill pl-3 pr-9 text-[14px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-white/30"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-raised">
          {o.label}
        </option>
      ))}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
  </div>
);

/** Interruptor estilo iOS. */
export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; hint?: React.ReactNode; disabled?: boolean }> = ({
  checked,
  onChange,
  label,
  hint,
  disabled,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className="w-full flex items-center justify-between gap-4 text-left disabled:opacity-40"
  >
    <span>
      <span className="block text-[14px] font-semibold text-ink">{label}</span>
      {hint && <span className="block text-[12px] text-faint mt-0.5 leading-snug">{hint}</span>}
    </span>
    <span className={cn('shrink-0 w-[46px] h-7 rounded-full p-0.5 transition-colors', checked ? 'bg-[#30d158]' : 'bg-fill')}>
      <span
        className={cn(
          'block w-6 h-6 rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.3)] transition-transform',
          checked && 'translate-x-[18px]'
        )}
      />
    </span>
  </button>
);

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}

/** Menú desplegable por click (funciona igual en celular, no depende del hover). */
export const Menu: React.FC<{ trigger: (open: boolean) => React.ReactNode; items: MenuItem[]; align?: 'left' | 'right'; side?: 'top' | 'bottom'; className?: string }> = ({
  trigger,
  items,
  align = 'left',
  side = 'bottom',
  className,
}) => {
  const [open, setOpen] = useState(false);
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

  return (
    <div ref={ref} className={cn('relative', className)}>
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div
          role="menu"
          className={cn(
            'pop-in absolute z-50 min-w-[220px] p-1.5 rounded-[14px] bg-[#2c2c2e]/90 backdrop-blur-2xl backdrop-saturate-150 border border-white/10 shadow-2xl',
            align === 'right' ? 'right-0' : 'left-0',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 h-10 rounded-[8px] text-[14px] text-left transition-colors',
                item.danger ? 'text-[#ff453a] hover:bg-white/[0.08]' : 'text-ink hover:bg-white/[0.1]'
              )}
            >
              {item.icon && <span className="text-muted">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** Imagen de portada que no se rompe si el link externo deja de existir. */
export const CoverImage: React.FC<{ src: string; alt: string; className?: string; style?: React.CSSProperties }> = ({ src, alt, className, style }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div aria-hidden className={cn('bg-gradient-to-br from-[#3a3a3c] via-[#1c1c1e] to-black', className)} style={style} />;
  }
  return <img src={src} alt={alt} onError={() => setFailed(true)} referrerPolicy="no-referrer" className={className} style={style} />;
};

/** Video de portada en loop y sin sonido. Si no carga, o el sistema pide menos movimiento, queda la foto. */
export const CoverVideo: React.FC<{ src: string; poster: string; className?: string }> = ({ src, poster, className }) => {
  const [failed, setFailed] = useState(false);
  const still = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (failed || still) return <CoverImage src={poster} alt="" className={className} />;
  return (
    <video
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
