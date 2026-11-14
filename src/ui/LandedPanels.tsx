import { currentBody, findBody, type Run } from '../game/sim/index.ts';
import { availableDeltaV } from './availableDeltaV.ts';
import { formatDeltaV, formatDistanceAu, formatFuel, formatGravity } from './format.ts';
import { KitFrame } from './kit/KitFrame.tsx';

const BAR_WIDTH = 624;
const BAR_HEIGHT = 40;
const PLATE_WIDTH = 284;
const PLATE_HEIGHT = 62;

interface LandedPanelsProps {
  run: Run;
}

/** The Landed view's panels: the top bar (Star System, Fuel, Δv) and the plate naming the Body. */
export function LandedPanels({ run }: LandedPanelsProps) {
  const body = currentBody(run);
  const parent = body.kind === 'moon' ? findBody(run.starSystem, body.planetId) : undefined;
  const type = body.kind === 'moon' ? `Moon of ${parent?.name ?? 'a planet'}` : 'Rocky planet';

  return (
    <>
      <header className="top-bar" style={{ width: BAR_WIDTH, height: BAR_HEIGHT }}>
        <KitFrame frame="panel_holo" width={BAR_WIDTH} height={BAR_HEIGHT} />
        <p className="top-bar__label top-bar__system-label">Star System</p>
        <p className="top-bar__value top-bar__system">{run.starSystem.name}</p>
        <KitFrame frame="res_fuel" className="top-bar__icon top-bar__fuel-icon" />
        <p className="top-bar__label top-bar__fuel-label">Fuel</p>
        <p className="top-bar__value top-bar__fuel" data-testid="fuel">
          {formatFuel(run.spacecraft.fuelMass)}
        </p>
        <KitFrame frame="res_delta_v" className="top-bar__icon top-bar__dv-icon" />
        <p className="top-bar__label top-bar__dv-label">Δv available</p>
        <p className="top-bar__value top-bar__dv" data-testid="delta-v">
          {formatDeltaV(availableDeltaV(run.spacecraft))}
        </p>
      </header>

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
          Gravity {formatGravity(body.surfaceGravity)} · {formatDistanceAu(body.distanceFromStar)}{' '}
          from the star
        </p>
      </section>
    </>
  );
}
