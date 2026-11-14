import { availableDeltaV, currentBody, isDepleted, type Run } from '../game/sim/index.ts';
import { useEffect, useRef } from 'react';
import { EventBus } from '../game/EventBus.ts';
import { bodyFullLabel, formatDistanceAu, formatGravity } from './format.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import { TopBar } from './TopBar.tsx';

const PLATE_WIDTH = 284;
const PLATE_HEIGHT = 62;
/** A Depleted Body adds a row for its badge under the detail line. */
const DEPLETED_ROW = 14;

interface LandedPanelsProps {
  run: Run;
  /** The Nav Chart is open and covers the plate and the Nav Chart button. */
  chartOpen: boolean;
  /** Counts requests to put focus on the Nav Chart button (after the Hop report closes, or a New Run). */
  focusRequest?: number;
}

/** The Landed view's panels: the top bar (Star System, Fuel, Δv, Materials) and the plate naming the Body. */
export function LandedPanels({ run, chartOpen, focusRequest = 0 }: LandedPanelsProps) {
  const body = currentBody(run);
  const type = bodyFullLabel(run, body);
  const depleted = isDepleted(run, body.id);
  const plateHeight = depleted ? PLATE_HEIGHT + DEPLETED_ROW : PLATE_HEIGHT;

  // Closing the Nav Chart hands focus back to the button that opened it.
  const buttonSlot = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(chartOpen);
  useEffect(() => {
    if (wasOpen.current && !chartOpen) buttonSlot.current?.querySelector('button')?.focus();
    wasOpen.current = chartOpen;
  }, [chartOpen]);

  useEffect(() => {
    if (focusRequest > 0) buttonSlot.current?.querySelector('button')?.focus();
  }, [focusRequest]);

  return (
    <>
      <TopBar
        systemName={run.starSystem.name}
        fuel={run.spacecraft.fuelMass}
        deltaV={availableDeltaV(run.spacecraft)}
        materials={run.materials}
      />

      {!chartOpen && (
        <>
          <section
            className="landed-plate"
            aria-labelledby="landed-title"
            style={{ width: PLATE_WIDTH, height: plateHeight }}
          >
            <KitFrame frame="panel_holo" width={PLATE_WIDTH} height={plateHeight} />
            <h1 id="landed-title" className="landed-plate__title">
              {body.name}
            </h1>
            <p className="landed-plate__kind" data-testid="landed-kind">
              {type}
            </p>
            {depleted && (
              <p className="landed-plate__depleted" data-testid="landed-depleted">
                <KitFrame frame="badge_warning" />
                Depleted
              </p>
            )}
            <p className="landed-plate__detail">
              Gravity {formatGravity(body.surfaceGravity)} ·{' '}
              {formatDistanceAu(body.distanceFromStar)} from the star
            </p>
          </section>
          <div ref={buttonSlot} className="landed-nav-button">
            <KitButton
              variant="primary"
              width={116}
              aria-keyshortcuts="M"
              onClick={() => {
                EventBus.emit('nav-chart-open-requested');
              }}
            >
              Nav Chart (M)
            </KitButton>
          </div>
        </>
      )}
    </>
  );
}
