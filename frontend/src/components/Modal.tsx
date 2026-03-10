import { useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) =>
        (e.target as HTMLElement) === overlayRef.current && onClose()
      }
    >
      <div
        className="rounded-lg bg-fantasy-surface border border-fantasy-border-soft shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-fantasy-border-soft">
          <h2 className="text-lg font-semibold font-heading text-fantasy-text-soft">
            {title}
          </h2>
        </div>
        <div className="p-4 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

interface ModalButtonsProps {
  children: React.ReactNode;
}

export function ModalButtons({ children }: ModalButtonsProps) {
  return (
    <div className="flex gap-2 justify-end mt-4 pt-4 border-t border-fantasy-border-soft">
      {children}
    </div>
  );
}

interface ModalConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function ModalConfirm({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
}: ModalConfirmProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-fantasy-text-soft text-sm">{message}</p>
      <ModalButtons>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-sm text-fantasy-text-soft"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className={`px-4 py-2 rounded text-sm font-medium ${
            danger
              ? 'bg-fantasy-danger hover:bg-fantasy-error'
              : 'bg-fantasy-accent hover:bg-fantasy-accent-hover'
          }`}
        >
          {confirmLabel}
        </button>
      </ModalButtons>
    </Modal>
  );
}

interface ModalPromptProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  submitLabel?: string;
  cancelLabel?: string;
}

export function ModalPrompt({
  open,
  onClose,
  onSubmit,
  title,
  label,
  defaultValue = '',
  placeholder,
  submitLabel = 'Valider',
  cancelLabel = 'Annuler',
}: ModalPromptProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(defaultValue);

  useEffect(() => {
    if (open) {
      valueRef.current = defaultValue;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, defaultValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(valueRef.current || inputRef.current?.value || '');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit}>
        {label && (
          <label className="block text-sm text-fantasy-muted-soft mb-2">
            {label}
          </label>
        )}
        <input
          ref={inputRef}
          type="text"
          defaultValue={defaultValue}
          onChange={(e) => (valueRef.current = e.target.value)}
          placeholder={placeholder}
          className="w-full rounded bg-fantasy-input-soft px-3 py-2 text-sm text-fantasy-text-soft placeholder:text-fantasy-muted-soft border border-fantasy-border-soft focus:border-fantasy-accent focus:outline-none"
        />
        <ModalButtons>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded bg-fantasy-input-soft hover:bg-fantasy-input-hover-soft text-sm text-fantasy-text-soft"
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg text-sm font-medium"
          >
            {submitLabel}
          </button>
        </ModalButtons>
      </form>
    </Modal>
  );
}

interface ModalAlertProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  buttonLabel?: string;
}

export function ModalAlert({
  open,
  onClose,
  title,
  message,
  buttonLabel = 'OK',
}: ModalAlertProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-fantasy-text-soft text-sm">{message}</p>
      <ModalButtons>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded bg-fantasy-accent hover:bg-fantasy-accent-hover text-fantasy-bg text-sm font-medium"
        >
          {buttonLabel}
        </button>
      </ModalButtons>
    </Modal>
  );
}
