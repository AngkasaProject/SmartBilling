import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';
interface ToastMessage { id: number; title: string; description?: string; variant: ToastVariant }
interface ToastContextValue {
  toast: (title: string, variant?: ToastVariant, description?: string) => void;
  confirm: (title: string, description: string, destructive?: boolean) => Promise<boolean>;
}
const ToastContext = createContext<ToastContextValue | null>(null);
let toastSequence = 0;

export const useToast = (): ToastContextValue => {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used within ToastProvider');
  return value;
};

export const ToastProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    destructive: boolean;
    resolve: (accepted: boolean) => void;
  } | null>(null);

  const toast = useCallback((title: string, variant: ToastVariant = 'info', description?: string) => {
    const id = ++toastSequence;
    setMessages(current => [...current, { id, title, variant, description }]);
    window.setTimeout(() => setMessages(current => current.filter(message => message.id !== id)), 5000);
  }, []);

  const confirm = useCallback((title: string, description: string, destructive = false) =>
    new Promise<boolean>(resolve => setConfirmation(current => {
      current?.resolve(false);
      return { title, description, destructive, resolve };
    })), []);

  const closeConfirmation = (accepted: boolean) => {
    confirmation?.resolve(accepted);
    setConfirmation(null);
  };

  useEffect(() => {
    if (!confirmation) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeConfirmation(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [confirmation]);

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}
      <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {messages.map(message => {
          const Icon = message.variant === 'success' ? CheckCircle2 : message.variant === 'error' ? CircleAlert : Info;
          return (
            <div key={message.id} role={message.variant === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-lg">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${message.variant === 'success' ? 'text-emerald-500' : message.variant === 'error' ? 'text-destructive' : 'text-primary'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{message.title}</p>
                {message.description && <p className="mt-1 break-words text-xs text-muted-foreground">{message.description}</p>}
              </div>
              <button type="button" aria-label="Tutup notifikasi" onClick={() => setMessages(current => current.filter(item => item.id !== message.id))} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
      {confirmation && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={event => {
          if (event.target === event.currentTarget) closeConfirmation(false);
        }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-lg border bg-card p-6 text-card-foreground shadow-xl">
            <h2 id="confirm-title" className="text-lg font-semibold">{confirmation.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{confirmation.description}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => closeConfirmation(false)} className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground">Batal</button>
              <button type="button" onClick={() => closeConfirmation(true)} className={`inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium text-white ${confirmation.destructive ? 'bg-destructive hover:opacity-90' : 'bg-primary hover:opacity-90'}`}>Lanjutkan</button>
            </div>
          </section>
        </div>
      )}
    </ToastContext.Provider>
  );
};
