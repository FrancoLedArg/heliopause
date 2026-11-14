import type { Kilograms, MetersPerSecond } from '../game/sim/index.ts';
import { formatDeltaV, formatFuel } from './format.ts';
import { KitFrame } from './kit/KitFrame.tsx';

const BAR_WIDTH = 624;
const BAR_HEIGHT = 40;

interface TopBarProps {
  systemName: string;
  fuel: Kilograms;
  deltaV: MetersPerSecond;
}

/** The top bar over every in-Run screen: the Star System, the Fuel on board and the Δv it provides. */
export function TopBar({ systemName, fuel, deltaV }: TopBarProps) {
  return (
    <header className="top-bar" style={{ width: BAR_WIDTH, height: BAR_HEIGHT }}>
      <KitFrame frame="panel_holo" width={BAR_WIDTH} height={BAR_HEIGHT} />
      <p className="top-bar__label top-bar__system-label">Star System</p>
      <p className="top-bar__value top-bar__system">{systemName}</p>
      <KitFrame frame="res_fuel" className="top-bar__icon top-bar__fuel-icon" />
      <p className="top-bar__label top-bar__fuel-label">Fuel</p>
      <p className="top-bar__value top-bar__fuel" data-testid="fuel">
        {formatFuel(fuel)}
      </p>
      <KitFrame frame="res_delta_v" className="top-bar__icon top-bar__dv-icon" />
      <p className="top-bar__label top-bar__dv-label">Δv available</p>
      <p className="top-bar__value top-bar__dv" data-testid="delta-v">
        {formatDeltaV(deltaV)}
      </p>
    </header>
  );
}
