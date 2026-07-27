'use client';

/**
 * App-wide, non-blocking feedback UI. Replaces window.alert / window.confirm /
 * window.prompt (which we never use).
 *
 *   const toast = useToast();
 *   toast.success('Saved.');  toast.error('Could not save.');  toast.info('Heads up.');
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Delete rule?', destructive: true }))) return;
 *
 * Mount <NotificationsProvider> once, in the root layout, wrapping all pages.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

type ToastItem = { id: number; variant: ToastVariant; message: string };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmState = ConfirmOptions & { resolve: (value: boolean) => void };

const ToastContext = createContext<ToastApi | null>(null);
const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <NotificationsProvider>');
  return ctx;
}

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within <NotificationsProvider>');
  return ctx;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const nextId = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = (nextId.current += 1);
      setToasts((list) => [...list, { id, variant, message }]);
      setTimeout(() => remove(id), variant === 'error' ? 6000 : 4000);
    },
    [remove],
  );

  const toastApi = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({ ...opts, resolve });
      }),
    [],
  );

  const closeConfirm = useCallback((value: boolean) => {
    setConfirmState((cur) => {
      cur?.resolve(value);
      return null;
    });
  }, []);

  return (
    <ToastContext.Provider value={toastApi}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <ToastViewport toasts={toasts} onDismiss={remove} />
        {confirmState ? <ConfirmDialog state={confirmState} onClose={closeConfirm} /> : null}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-rose-200 bg-rose-50 text-rose-900',
  info: 'border-slate-200 bg-white text-slate-900',
};

const VARIANT_ICON: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
  error: <AlertCircle className="h-5 w-5 text-rose-600" />,
  info: <Info className="h-5 w-5 text-slate-500" />,
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          aria-live="polite"
          className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${VARIANT_STYLES[t.variant]}`}
        >
          <span className="mt-0.5 shrink-0">{VARIANT_ICON[t.variant]}</span>
          <p className="flex-1 whitespace-pre-line leading-snug">{t.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function ConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmState;
  onClose: (value: boolean) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
      onClick={() => onClose(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900">{state.title}</h2>
        {state.message ? <p className="mt-2 text-sm text-slate-600">{state.message}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {state.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => onClose(true)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
              state.destructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {state.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
