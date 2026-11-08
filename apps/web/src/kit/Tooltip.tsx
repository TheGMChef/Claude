import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import type { FocusEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';

const GAP = 8;
const EDGE = 8;

interface Placed {
  left: number;
  top: number;
}

/**
 * A real tooltip for icon-only controls (VectorLab icon-buttons): it shows on mouse hover and on
 * keyboard focus, Escape dismisses it, and it is described-by (not named-by) the trigger, which
 * keeps its own aria-label. Rendered in a portal with fixed placement, clamped to the viewport,
 * so it never widens the page and never moves with a pressed key. Opacity-only, 100ms.
 */
export function useTooltip(
  label: string,
  ref: RefObject<HTMLElement>,
): {
  triggerProps: {
    'aria-describedby': string | undefined;
    onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerLeave: () => void;
    onFocus: (e: FocusEvent<HTMLElement>) => void;
    onBlur: () => void;
    onKeyDown: (e: { key: string }) => void;
  };
  tip: ReactNode;
} {
  const id = useId();
  const tipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState<Placed | null>(null);

  useLayoutEffect(() => {
    const trigger = ref.current;
    const tip = tipRef.current;
    if (!open || !trigger || !tip) {
      setPlaced(null);
      return;
    }
    const r = trigger.getBoundingClientRect();
    const w = tip.offsetWidth;
    const vw = document.documentElement.clientWidth;
    const centred = r.left + r.width / 2 - w / 2;
    const left = Math.max(EDGE, Math.min(centred, vw - w - EDGE));
    // Prefer below the key; flip above when there is no room.
    const below = r.bottom + GAP;
    const top =
      below + tip.offsetHeight > window.innerHeight ? r.top - GAP - tip.offsetHeight : below;
    setPlaced({ left, top });
  }, [open, ref, label]);

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);

  return {
    triggerProps: {
      'aria-describedby': open ? id : undefined,
      // Touch taps also emit pointerenter; only a real mouse should pop a tooltip.
      onPointerEnter: (e) => {
        if (e.pointerType === 'mouse') show();
      },
      onPointerLeave: hide,
      onFocus: (e) => {
        let visible = true;
        try {
          visible = e.currentTarget.matches(':focus-visible');
        } catch {
          // Engines without :focus-visible: treat every focus as keyboard focus.
        }
        if (visible) show();
      },
      onBlur: hide,
      onKeyDown: (e) => {
        if (e.key === 'Escape') hide();
      },
    },
    tip: open
      ? createPortal(
          <span
            ref={tipRef}
            id={id}
            role="tooltip"
            className="tip"
            style={
              placed
                ? { left: placed.left, top: placed.top }
                : { left: 0, top: 0, visibility: 'hidden' }
            }
          >
            {label}
          </span>,
          document.body,
        )
      : null,
  };
}
