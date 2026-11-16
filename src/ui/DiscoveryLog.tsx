// The Discovery log (#317): every Discovery as an icon row. A star marks New (first found on this
// device this Run), a check found before, a lock never found. State is in the accessible name.
import { useEffect, useMemo, useRef } from 'react';
import { readScienceProgress, discoveriesAtRunStart } from '../game/lib/scienceProgress.ts';
import { describeDiscoveryLog, nextBlueprint, type DiscoveryState } from './discoveryLogView.ts';
import { trapTab } from './focusTrap.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import { LockIcon } from './BlueprintLock.tsx';
import { ScienceIcon } from './ScienceIcon.tsx';
import './DiscoveryLog.css';

const PANEL = { width: 300, height: 212 } as const;

/** A five-point star: a primitive stand-in. Presentational; the row carries the words. */
export function StarBadge({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M5 0 L6.4 3.6 L10 3.8 L7.2 6.2 L8.1 10 L5 7.9 L1.9 10 L2.8 6.2 L0 3.8 L3.6 3.6 Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** A check mark: a primitive stand-in. Presentational. */
export function CheckBadge({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
      <path d="M1 5.5 L4 8.5 L9 1.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function DiscoveryBadge({ state }: { state: DiscoveryState }) {
  if (state === 'new') return <StarBadge />;
  if (state === 'found') return <CheckBadge />;
  return <LockIcon size={16} />;
}

interface DiscoveryLogProps {
  onClose: () => void;
}

/** Reads the device's progress as it opens; Escape or Close returns to the screen it came from. */
export function DiscoveryLog({ onClose }: DiscoveryLogProps) {
  const progress = useMemo(() => readScienceProgress(), []);
  const entries = describeDiscoveryLog(progress, discoveriesAtRunStart());
  const next = nextBlueprint(progress.lifetimeScience);
  const body = useRef<HTMLDivElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  useEffect(() => {
    actions.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);

  return (
    <section
      className="discovery-log"
      role="dialog"
      aria-modal="true"
      aria-label="Discovery log"
      data-testid="discovery-log"
      style={{ width: PANEL.width, height: PANEL.height }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
          return;
        }
        trapTab(event, body.current);
      }}
    >
      <KitFrame frame="panel_metal" width={PANEL.width} height={PANEL.height} />
      <div ref={body} className="discovery-log__body">
        <p
          className="discovery-log__progress"
          role="img"
          aria-label={next.label}
          data-testid="discovery-log-progress"
        >
          <ScienceIcon size={12} />
          <span aria-hidden="true">{progress.lifetimeScience}</span>
          <span className="discovery-log__bar" aria-hidden="true">
            <span
              className="discovery-log__fill"
              style={{ width: `${String(Math.round(next.progress * 100))}%` }}
            />
          </span>
        </p>
        <ul className="discovery-log__list">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={`discovery-log__entry discovery-log__entry--${entry.state}`}
              aria-label={entry.label}
              data-testid={`discovery-${entry.id}`}
              data-state={entry.state}
            >
              <span className="discovery-log__badge" aria-hidden="true">
                <DiscoveryBadge state={entry.state} />
              </span>
              <span className="discovery-log__name" aria-hidden="true">
                {entry.name}
              </span>
              {entry.source !== undefined && (
                <a
                  className="discovery-log__source"
                  href={entry.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${entry.name}: NASA source`}
                >
                  NASA
                </a>
              )}
            </li>
          ))}
        </ul>
        <div ref={actions} className="discovery-log__actions">
          <KitButton variant="primary" width={90} onClick={onClose}>
            Close
          </KitButton>
        </div>
      </div>
    </section>
  );
}
