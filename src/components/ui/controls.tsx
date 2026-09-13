import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-white text-black hover:bg-white/90 disabled:bg-white/20 disabled:text-white/40',
  secondary: 'bg-white/[0.06] text-ink border border-line hover:bg-white/[0.1] disabled:opacity-40',
  ghost: 'text-muted hover:text-ink hover:bg-white/[0.06] disabled:opacity-40',
  danger: 'bg-red-500/90 text-white hover:bg-red-500 disabled:opacity-40',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-[14px] gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
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
      'inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed',
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
    <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
      {children}
    </label>
    {hint && <span className="text-[12px] text-faint">{hint}</span>}
  </div>
);

interface SegmentedProps<T extends string | number> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string; disabled?: boolean }[];
  className?: string;
  ariaLabel?: string;
}

export const Segmented = <T extends string | number>({ value, onChange, options, className, ariaLabel }: SegmentedProps<T>) => (
  <div role="radiogroup" aria-label={ariaLabel} className={cn('flex p-1 gap-1 rounded-xl bg-white/[0.04] border border-line', className)}>
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
          'flex-1 min-w-0 h-8 px-2 rounded-lg text-[13px] font-medium transition-colors truncate disabled:opacity-30',
          o.value === value ? 'bg-white text-black' : 'text-muted hover:text-ink hover:bg-white/[0.06]'
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({ options, className, ...props }) => (
  <div className={cn('relative', className)}>
    <select
      {...props}
      className="w-full h-10 appearance-none rounded-xl bg-white/[0.04] border border-line pl-3 pr-9 text-[14px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-white/30"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-panel">
          {o.label}
        </option>
      ))}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
  </div>
);

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
    className="w-full flex items-start justify-between gap-4 text-left disabled:opacity-40"
  >
    <span>
      <span className="block text-[13px] font-medium text-ink">{label}</span>
      {hint && <span className="block text-[12px] text-faint mt-0.5 leading-snug">{hint}</span>}
    </span>
    <span className={cn('mt-0.5 shrink-0 w-9 h-5 rounded-full p-0.5 transition-colors', checked ? 'bg-white' : 'bg-white/15')}>
      <span className={cn('block w-4 h-4 rounded-full transition-transform', checked ? 'translate-x-4 bg-black' : 'bg-white/70')} />
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
            'absolute z-50 min-w-[220px] p-1 rounded-xl bg-raised border border-line shadow-2xl',
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
                'w-full flex items-center gap-2.5 px-3 h-10 rounded-lg text-[14px] text-left transition-colors',
                item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-ink hover:bg-white/[0.06]'
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
export const CoverImage: React.FC<{ src: string; alt: string; className?: string }> = ({ src, alt, className }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div aria-hidden className={cn('bg-gradient-to-br from-[#2a2a2a] via-[#1a1a1a] to-[#0f0f0f]', className)} />;
  }
  return <img src={src} alt={alt} onError={() => setFailed(true)} referrerPolicy="no-referrer" className={className} />;
};
