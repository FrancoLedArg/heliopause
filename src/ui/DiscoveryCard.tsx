import { useEffect, useRef } from 'react';
import {
  COMPONENTS,
  DISCOVERIES,
  findBody,
  type DiscoveryReveal,
  type StarSystem,
} from '../game/sim/index.ts';
import { Disclosure, DisclosurePanel, TellMeMoreToggle } from './Disclosure.tsx';
import { trapTab } from './focusTrap.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import { ScienceIcon } from './ScienceIcon.tsx';
import './DiscoveryCard.css';

const PANEL = { width: 300, height: 196 } as const;

interface DiscoveryCardProps {
  reveal: DiscoveryReveal;
  starSystem: StarSystem;
  /** How many more cards wait after this one. */
  waiting: number;
  onContinue: () => void;
}

/**
 * One Discovery, as the Instrument revealed it: the plain name and one sentence of surprise, the
 * Science it gave (or a check when it was already found in this Star System). The longer text, where
 * the real find happened and the NASA source wait behind "Tell me more". One card at a time.
 */
export function DiscoveryCard({ reveal, starSystem, waiting, onContinue }: DiscoveryCardProps) {
  const entry = DISCOVERIES[reveal.discoveryId];
  const instrument = COMPONENTS[entry.instrument];
  const bodyName = findBody(starSystem, reveal.bodyId)?.name ?? '';
  const isNew = reveal.kind === 'new';
  const body = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLDivElement>(null);
  useEffect(() => {
    button.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [reveal]);

  return (
    <section
      className={`discovery-card discovery-card--${reveal.kind}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="discovery-card-title"
      aria-describedby="discovery-card-fact"
      data-testid="discovery-card"
      style={{ width: PANEL.width, height: PANEL.height }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onContinue();
          return;
        }
        trapTab(event, body.current);
      }}
    >
      <KitFrame frame="panel_metal" width={PANEL.width} height={PANEL.height} />
      <div ref={body} className="discovery-card__body">
        <p className="discovery-card__badge">
          <KitFrame frame={isNew ? 'badge_ok' : 'badge_info'} />
          <span>
            {instrument.name} · {bodyName}
          </span>
        </p>
        <h2 id="discovery-card-title" className="discovery-card__title">
          {entry.name}
        </h2>
        <p id="discovery-card-fact" className="discovery-card__fact">
          {entry.fact}
        </p>
        <p
          className="discovery-card__science"
          role="img"
          aria-label={
            isNew
              ? `${String(reveal.science)} Science`
              : 'Already found in this Star System: no Science'
          }
          data-testid="discovery-card-science"
        >
          <ScienceIcon />
          <span>{isNew ? `+${String(reveal.science)}` : '✓'}</span>
        </p>
        <Disclosure>
          <TellMeMoreToggle className="discovery-card__more" />
          <DisclosurePanel className="discovery-card__details">
            <p>{entry.tellMore}</p>
            <p className="discovery-card__place">
              {entry.place} ·{' '}
              <a href={entry.source} target="_blank" rel="noopener noreferrer">
                Source: NASA
              </a>
            </p>
          </DisclosurePanel>
        </Disclosure>
        <div ref={button} className="discovery-card__actions">
          <KitButton variant="primary" width={110} onClick={onContinue}>
            {waiting > 0 ? 'Next' : 'Continue'}
          </KitButton>
        </div>
      </div>
    </section>
  );
}
