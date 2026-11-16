// Blueprints locked and unlocked (#319): a primitive lock icon, the Science progress bar a locked
// catalogue row shows, and the short unlock moment. Icons and a bar first ("Show, don't tell").
import { useEffect, useState } from 'react';
import { imageUrl } from '../game/assets/manifest.ts';
import type { BlueprintId } from '../game/sim/index.ts';
import { componentLabel } from './spacecraftPanelView.ts';
import { ScienceIcon } from './ScienceIcon.tsx';
import './BlueprintLock.css';

/** The kit's 16 px padlock, closed or open. Presentational: the row carries the words. */
export function LockIcon({ open = false, size = 8 }: { open?: boolean; size?: number }) {
  return (
    <img
      src={imageUrl(open ? 'ui_lock_open' : 'ui_lock')}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="lock-icon"
    />
  );
}

/** A locked blueprint's way to its threshold: lock, bar, and only the Science still needed. */
export function BlueprintProgress({
  remaining,
  progress,
}: {
  remaining: number;
  progress: number;
}) {
  return (
    <span className="blueprint-progress" data-testid="blueprint-progress" aria-hidden="true">
      <LockIcon />
      <span className="blueprint-progress__bar">
        <span
          className="blueprint-progress__fill"
          style={{ width: `${String(Math.round(progress * 100))}%` }}
        />
      </span>
      <ScienceIcon size={8} />
      <span className="blueprint-progress__remaining">{remaining}</span>
    </span>
  );
}

/** How long the unlock moment stays up, in ms. */
export const UNLOCK_MOMENT_MS = 3_000;

/** The unlock moment: an open lock and the blueprint's name, gone after a few seconds. */
export function BlueprintUnlocked({
  blueprints,
  onDone,
}: {
  blueprints: readonly BlueprintId[];
  onDone: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, UNLOCK_MOMENT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [onDone]);
  // The live region mounts empty and its words follow, so screen readers announce them.
  const [said, setSaid] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSaid(`${blueprints.map(componentLabel).join(', ')} unlocked`);
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [blueprints]);
  return (
    <p className="blueprint-unlocked" role="status" data-testid="blueprint-unlocked">
      <LockIcon open size={12} />
      <span>{said}</span>
    </p>
  );
}
