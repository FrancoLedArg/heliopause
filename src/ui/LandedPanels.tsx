import {
  assessStranding,
  availableDeltaV,
  currentBody,
  starSystemNumber,
  type Run,
} from '../game/sim/index.ts';
import { useEffect, useRef } from 'react';
import { EventBus } from '../game/EventBus.ts';
import { bodyFullLabel, formatDistanceAu, formatGravity } from './format.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import { ResourceIcon } from './ResourceIcon.tsx';
import { describeSpacecraft } from './spacecraftPanelView.ts';
import { yieldIcon } from './yieldIcon.ts';
import { TopBar } from './TopBar.tsx';

const PLATE_WIDTH = 284;
const PLATE_HEIGHT = 62;
/** The Stranded warning: as wide as the plate, tall enough for its heading and three lines of advice. */
const WARNING = { width: 284, height: 62 } as const;

interface LandedPanelsProps {
  run: Run;
  /** The Nav Chart is open and covers the plate and the Nav Chart button. */
  chartOpen: boolean;
  /** The Spacecraft panel is open and covers the plate and both buttons. */
  spacecraftOpen: boolean;
  /** The player pressed the Spacecraft button. */
  onOpenSpacecraft: () => void;
  /** Counts requests to put focus on the Nav Chart button (after the Hop report closes, or a New Run). */
  focusRequest?: number;
  /** The UTC day of the Daily Star System being played; `undefined` for any other Run. */
  dailyDay?: string | undefined;
}

/** The Landed view's panels: the top bar (Star System, Fuel, Δv, Materials) and the plate naming the Body. */
export function LandedPanels({
  run,
  chartOpen,
  spacecraftOpen,
  onOpenSpacecraft,
  focusRequest = 0,
  dailyDay,
}: LandedPanelsProps) {
  const body = currentBody(run);
  const type = bodyFullLabel(run, body);
  const yields = yieldIcon(run, body);
  // Kept per Run by the simulation, so asking on every render costs nothing.
  const stranding = assessStranding(run);

  // Closing the Nav Chart hands focus back to the button that opened it.
  const buttonSlot = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(chartOpen);
  useEffect(() => {
    if (wasOpen.current && !chartOpen) buttonSlot.current?.querySelector('button')?.focus();
    wasOpen.current = chartOpen;
  }, [chartOpen]);

  // Closing the Spacecraft panel hands focus back to the Spacecraft button.
  const spacecraftSlot = useRef<HTMLDivElement>(null);
  const spacecraftWasOpen = useRef(spacecraftOpen);
  useEffect(() => {
    if (spacecraftWasOpen.current && !spacecraftOpen) {
      spacecraftSlot.current?.querySelector('button')?.focus();
    }
    spacecraftWasOpen.current = spacecraftOpen;
  }, [spacecraftOpen]);

  useEffect(() => {
    if (focusRequest > 0) buttonSlot.current?.querySelector('button')?.focus();
  }, [focusRequest]);

  return (
    <>
      <TopBar
        systemNumber={starSystemNumber(run)}
        systemName={run.starSystem.name}
        fuel={run.spacecraft.fuelMass}
        deltaV={availableDeltaV(run.spacecraft)}
        materials={run.materials}
        dailyDay={dailyDay}
      />
      {/* The drawn Spacecraft's text alternative: the canvas shows it, this names its parts. */}
      <p className="sr-only landed-spacecraft-alt" data-testid="spacecraft-alt">
        {describeSpacecraft(run.spacecraft)}
      </p>

      {!chartOpen && !spacecraftOpen && (
        <>
          {stranding.kind === 'warning' && (
            <section
              className="stranded-warning"
              role="alert"
              aria-labelledby="stranded-warning-title"
              data-testid="stranded-warning"
              style={{ width: WARNING.width, height: WARNING.height }}
            >
              <KitFrame frame="tooltip_warn" width={WARNING.width} height={WARNING.height} />
              <h2 id="stranded-warning-title" className="stranded-warning__title">
                <KitFrame frame="badge_warning" />
                No Hop possible
              </h2>
              <p className="stranded-warning__advice" data-testid="stranded-advice">
                {stranding.warning}
              </p>
            </section>
          )}
          <section
            className="landed-plate"
            aria-labelledby="landed-title"
            style={{ width: PLATE_WIDTH, height: PLATE_HEIGHT }}
          >
            <KitFrame frame="panel_holo" width={PLATE_WIDTH} height={PLATE_HEIGHT} />
            <h1 id="landed-title" className="landed-plate__title">
              {body.name}
            </h1>
            <p className="landed-plate__kind" data-testid="landed-kind">
              {yields && (
                <ResourceIcon
                  resource={yields.resource}
                  depleted={yields.depleted}
                  className="resource-icon--inline"
                  testId={yields.depleted ? 'landed-depleted' : 'resource-icon'}
                />
              )}
              <span>{type}</span>
            </p>
            <p className="landed-plate__detail">
              Gravity {formatGravity(body.surfaceGravity)} ·{' '}
              {formatDistanceAu(body.distanceFromStar)} from the star
            </p>
          </section>
          <div ref={spacecraftSlot} className="landed-spacecraft-button">
            <KitButton width={116} onClick={onOpenSpacecraft}>
              Spacecraft
            </KitButton>
          </div>
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
