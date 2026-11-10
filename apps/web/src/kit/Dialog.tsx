import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { useFocusTrap } from './useFocusTrap';

export interface DialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  cancelLabel?: string;
  tone?: 'destructive';
}

let locks = 0;
function lockScroll(): () => void {
  locks += 1;
  document.body.classList.add('scroll-locked');
  return () => {
    locks -= 1;
    if (locks <= 0) {
      locks = 0;
      document.body.classList.remove('scroll-locked');
    }
  };
}

/**
 * A modal confirmation (VectorLab surfaces): names the thing in its title, Cancel holds the default
 * focus, Tab is trapped, Escape cancels, focus returns to the opener, page scroll is locked. A
 * scrim click does nothing, so an errant tap can never confirm or silently dismiss.
 */
export function Dialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  cancelLabel = 'Cancel',
  tone,
}: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useFocusTrap(panel, open, cancel);

  useEffect(() => {
    if (!open) return;
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelRef.current();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      unlock();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="dialog-scrim">
      <div
        ref={panel}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="dialog__title">
          {title}
        </h2>
        <div id={bodyId} className="dialog__body">
          {children}
        </div>
        <div className="dialog__actions">
          <Button ref={cancel} variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            className={tone === 'destructive' ? 'btn--destructive' : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
