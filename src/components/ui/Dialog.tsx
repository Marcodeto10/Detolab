import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { Button } from './controls';
import { cn } from '../../lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({ open, onClose, title, children, className }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[250] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6"
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className={cn(
              'w-full sm:max-w-md max-h-[90dvh] overflow-y-auto custom-scrollbar bg-panel border border-line rounded-t-2xl sm:rounded-2xl shadow-2xl',
              className
            )}
          >
            {title && (
              <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-2">
                <h2 className="font-display text-3xl leading-none text-ink">{title}</h2>
                <button onClick={onClose} aria-label="Cerrar" className="p-1.5 -mr-1.5 rounded-lg text-faint hover:text-ink hover:bg-white/5">
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
            <div className="px-6 pb-6 pt-2">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
}

type DialogState =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void };

interface DialogApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi>({
  confirm: async () => false,
  prompt: async () => null,
});

export const useDialog = () => useContext(DialogContext);

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<DialogState | null>(null);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ kind: 'confirm', opts, resolve })),
    []
  );

  const prompt = useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setValue(opts.initialValue ?? '');
        setState({ kind: 'prompt', opts, resolve });
      }),
    []
  );

  useEffect(() => {
    if (state?.kind === 'prompt') setTimeout(() => inputRef.current?.focus(), 50);
  }, [state]);

  const close = (result: boolean) => {
    if (!state) return;
    if (state.kind === 'confirm') state.resolve(result);
    else state.resolve(result && value.trim() ? value.trim() : null);
    setState(null);
  };

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.opts.title}>
        {state?.kind === 'confirm' && state.opts.message && (
          <p className="text-[14px] leading-relaxed text-muted">{state.opts.message}</p>
        )}
        {state?.kind === 'prompt' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              close(true);
            }}
            className="space-y-2"
          >
            {state.opts.label && <label className="block text-[13px] font-medium text-muted">{state.opts.label}</label>}
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={state.opts.placeholder}
              className="input"
            />
          </form>
        )}
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" onClick={() => close(false)}>
            {state?.kind === 'confirm' ? state.opts.cancelLabel ?? 'Cancelar' : 'Cancelar'}
          </Button>
          <Button
            variant={state?.kind === 'confirm' && state.opts.danger ? 'danger' : 'primary'}
            onClick={() => close(true)}
            disabled={state?.kind === 'prompt' && !value.trim()}
          >
            {state?.opts.confirmLabel ?? 'Aceptar'}
          </Button>
        </div>
      </Modal>
    </DialogContext.Provider>
  );
};
