import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { HINT_TEXT, nextHint, type HintId } from '../game/lib/firstRunHints.ts';
import { anchorFor } from './firstRunHintAnchor.ts';
import './FirstRunHint.css';

const STAGE_WIDTH = 640;
/** Keeps the callout's edges off the stage's. */
const MARGIN = 4;

interface Place {
  /** The hint this was measured for: a place measured for another hint is stale. */
  readonly id: HintId;
  /** The arrow's tip, in stage pixels. */
  readonly x: number;
  readonly y: number;
}

interface FirstRunHintProps {
  /** The hints whose moment is now, most important first. */
  wanted: readonly HintId[];
  /** The hints already dismissed or acted on. */
  seen: ReadonlySet<HintId>;
  /** The player clicked or pressed Esc: this hint is done for good. */
  onDismiss: (id: HintId) => void;
}

/**
 * A one-line arrow callout for the first Run on a device (#290). It never takes a click or a key: any
 * click or Esc dismisses it, and the click or key still does its own work. Its line is announced
 * through a polite live region that is always in the page, so a hint appearing is read out.
 */
export function FirstRunHint({ wanted, seen, onDismiss }: FirstRunHintProps) {
  const id = nextHint(wanted, seen);
  const calloutRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place | undefined>(undefined);
  const anchor = id === undefined ? undefined : anchorFor(id);

  // Finds the anchor now and once more after panels have settled; the arrow tracks it.
  useLayoutEffect(() => {
    if (anchor === undefined || id === undefined) return;
    const measure = (): void => {
      const target = document.querySelector(anchor.selector);
      const stage = target?.closest('.game-ui');
      if (!target || !stage) return;
      const scale = stage.getBoundingClientRect().width / STAGE_WIDTH || 1;
      const box = target.getBoundingClientRect();
      const frame = stage.getBoundingClientRect();
      const next: Place = {
        id,
        x: (box.left + box.width / 2 - frame.left) / scale,
        y: ((anchor.side === 'above' ? box.top : box.bottom) - frame.top) / scale,
      };
      setPlace((now) => (now?.id === next.id && now.x === next.x && now.y === next.y ? now : next));
    };
    measure();
    const later = window.setTimeout(measure, 150);
    return () => {
      window.clearTimeout(later);
    };
  }, [anchor, id]);

  // Any click or Esc dismisses; neither is swallowed.
  useEffect(() => {
    if (id === undefined) return;
    const dismiss = (): void => {
      onDismiss(id);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [id, onDismiss]);

  // Centred on the anchor, then nudged back inside the stage; the arrow keeps pointing at the anchor.
  const here = place?.id === id ? place : undefined;
  useLayoutEffect(() => {
    const callout = calloutRef.current;
    if (!callout || !here || !anchor) return;
    const width = callout.offsetWidth;
    const left = here.x - width / 2;
    const clamped = Math.min(Math.max(left, MARGIN), STAGE_WIDTH - MARGIN - width);
    const shift = left - clamped;
    const lift = anchor.side === 'above' ? 'calc(-100% - 8px)' : '8px';
    callout.style.transform = `translate(calc(-50% - ${String(shift)}px), ${lift})`;
    callout.style.setProperty('--arrow-shift', `${String(shift)}px`);
  }, [here, anchor]);

  return (
    <div aria-live="polite" data-testid="first-run-hint-live">
      {id !== undefined && anchor !== undefined && here !== undefined && (
        <div
          ref={calloutRef}
          className={`first-run-hint first-run-hint--${anchor.side}`}
          data-testid="first-run-hint"
          data-hint={id}
          style={{ left: here.x, top: here.y }}
        >
          {HINT_TEXT[id]}
        </div>
      )}
    </div>
  );
}
