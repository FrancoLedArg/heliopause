import type { Kilograms, Materials, MetersPerSecond } from '../game/sim/index.ts';
import { imageUrl } from '../game/assets/manifest.ts';
import { formatDeltaVKmS, formatFuel } from './format.ts';
import { FuelGauge } from './FuelGauge.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import { MissionTracker } from './MissionTracker.tsx';
import type { MissionGoal } from './missionTrackerView.ts';
import { MusicControls } from './MusicControls.tsx';
import { ScienceIcon } from './ScienceIcon.tsx';

const BAR_WIDTH = 624;
const BAR_HEIGHT = 40;

interface TopBarProps {
  /** Which Star System of the Run this is, from 1. */
  systemNumber: number;
  systemName: string;
  fuel: Kilograms;
  /** What the tanks hold when full: the Fuel bar's full length. */
  fuelCapacity: Kilograms;
  deltaV: MetersPerSecond;
  materials: Materials;
  /** The Science this Run has earned (#318); omitted where no Run is in play. */
  science?: number | undefined;
  /** The UTC day of the Daily Star System being played, `YYYY-MM-DD`; `undefined` for any other Run. */
  dailyDay?: string | undefined;
  /** The readout a gathering moment is filling: its icon pulses as the resource arrives. */
  filling?: 'fuel' | 'materials' | undefined;
  /** The mission tracker's three goals, beside the speaker controls; omitted where no Run is in play. */
  goals?: readonly MissionGoal[] | undefined;
  /** Said once by a polite live region, e.g. what a gathering moment brought aboard. */
  announcement?: string;
}

/** The top bar over every in-Run screen: the Star System (and, in a Daily Run, its day), the Fuel on board, the Δv it provides and the Materials in stock. */
export function TopBar({
  systemNumber,
  systemName,
  fuel,
  fuelCapacity,
  deltaV,
  materials,
  science,
  dailyDay,
  filling,
  goals,
  announcement = '',
}: TopBarProps) {
  const pulse = (resource: 'fuel' | 'materials'): string =>
    filling === resource ? ' top-bar__icon--filling' : '';
  return (
    <header className="top-bar" style={{ width: BAR_WIDTH, height: BAR_HEIGHT }}>
      <KitFrame frame="panel_holo" width={BAR_WIDTH} height={BAR_HEIGHT} />
      <p className="top-bar__label top-bar__system-label" data-testid="system-number">
        System {systemNumber}
      </p>
      {dailyDay !== undefined && (
        <p className="top-bar__daily" data-testid="daily-tag">
          Daily {dailyDay} UTC
        </p>
      )}
      <p className="top-bar__value top-bar__system">{systemName}</p>
      {science !== undefined && (
        <p
          className="top-bar__value top-bar__science"
          role="img"
          aria-label={`Science ${String(science)}`}
          data-testid="science"
        >
          <ScienceIcon size={14} />
          <span>{science}</span>
        </p>
      )}
      <KitFrame frame="res_fuel" className={`top-bar__icon top-bar__fuel-icon${pulse('fuel')}`} />
      <p className="top-bar__label top-bar__fuel-label">Fuel</p>
      <p className="top-bar__value top-bar__fuel" data-testid="fuel">
        {formatFuel(fuel)}
      </p>
      <FuelGauge
        fuel={fuel}
        capacity={fuelCapacity}
        shape="bar"
        testId="fuel-bar"
        className="top-bar__fuel-bar"
      />
      <KitFrame frame="res_delta_v" className="top-bar__icon top-bar__dv-icon" />
      <p className="top-bar__label top-bar__dv-label">Δv available</p>
      <p className="top-bar__value top-bar__dv" data-testid="delta-v">
        {formatDeltaVKmS(deltaV)}
      </p>
      <img
        src={imageUrl('res_materials')}
        alt=""
        width={32}
        height={32}
        className={`top-bar__icon top-bar__materials-icon${pulse('materials')}`}
      />
      <p className="top-bar__label top-bar__materials-label">Materials</p>
      <p className="top-bar__value top-bar__materials" data-testid="materials">
        {materials}
      </p>
      <MusicControls className="music-controls--bar" />
      {goals !== undefined && <MissionTracker goals={goals} className="top-bar__tracker" />}
      <p className="sr-only" role="status" data-testid="top-bar-status">
        {announcement}
      </p>
    </header>
  );
}
