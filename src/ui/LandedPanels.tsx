import { availableDeltaV, currentBody, type Run } from '../game/sim/index.ts';
import { useEffect, useRef } from 'react';
import { EventBus } from '../game/EventBus.ts';
import { bodyFullLabel, formatDistanceAu, formatGravity } from './format.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import { TopBar } from './TopBar.tsx';

const PLATE_WIDTH = 284;
const PLATE_HEIGHT = 62;

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
}

/** The Landed view's panels: the top bar (Star System, Fuel, Δv, Materials) and the plate naming the Body. */
export function LandedPanels({
  run,
  chartOpen,
  spacecraftOpen,
  onOpenSpacecraft,
  focusRequest = 0,
}: LandedPanelsProps) {
  const body = currentBody(run);
  const type = bodyFullLabel(run, body);

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
        systemName={run.starSystem.name}
        fuel={run.spacecraft.fuelMass}
        deltaV={availableDeltaV(run.spacecraft)}
        materials={run.materials}
      />

      {!chartOpen && !spacecraftOpen && (
        <>
          <section
            className="landed-plate"
            aria-labelledby="landed-title"
            style={{ width: PLATE_WIDTH, height: PLATE_HEIGHT }}
          >
            <KitFrame frame="panel_holo" width={PLATE_WIDTH} height={PLATE_HEIGHT} />
            <h1 id="landed-title" className="landed-plate__title">
              {body.name}
            </h1>
            <p className="landed-plate__kind">{type}</p>
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
