import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';

type Tone = 'info' | 'success' | 'error';

export interface ToastOptions {
  message: string;
  tone?: Tone;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(opts: ToastOptions) => void>(() => {});

export const useToast = () => useContext(ToastContext);

const ICONS: Record<Tone, React.ReactNode> = {
  info: <Info className="w-4 h-4 text-muted" />,
  success: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  error: <AlertCircle className="w-4 h-4 text-red-400" />,
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (opts: ToastOptions) => {
      const id = nextId.current++;
      setItems((prev) => [...prev.slice(-2), { ...opts, id }]);
      const duration = opts.duration ?? (opts.tone === 'error' ? 9000 : opts.action ? 7000 : 4000);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="fixed z-[300] inset-x-3 bottom-20 lg:bottom-6 lg:inset-x-auto lg:right-6 flex flex-col gap-2 items-stretch lg:items-end pointer-events-none"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto w-full lg:w-auto lg:max-w-md flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px] leading-snug shadow-2xl backdrop-blur-xl',
                t.tone === 'error' ? 'bg-[#1d1414]/95 border-red-500/20' : 'bg-raised/95 border-line'
              )}
            >
              <span className="mt-0.5 shrink-0">{ICONS[t.tone ?? 'info']}</span>
              <p className="flex-1 text-ink">{t.message}</p>
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                  className="shrink-0 font-semibold text-white underline underline-offset-4 hover:no-underline"
                >
                  {t.action.label}
                </button>
              )}
              <button onClick={() => dismiss(t.id)} aria-label="Cerrar" className="shrink-0 text-faint hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
