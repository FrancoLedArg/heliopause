import type { Kilograms, Materials, MetersPerSecond } from '../game/sim/index.ts';
import { imageUrl } from '../game/assets/manifest.ts';
import { formatDeltaV, formatFuel } from './format.ts';
import { KitFrame } from './kit/KitFrame.tsx';

const BAR_WIDTH = 624;
const BAR_HEIGHT = 40;

interface TopBarProps {
  systemName: string;
  fuel: Kilograms;
  deltaV: MetersPerSecond;
  materials: Materials;
}

/** The top bar over every in-Run screen: the Star System, the Fuel on board, the Δv it provides and the Materials in stock. */
export function TopBar({ systemName, fuel, deltaV, materials }: TopBarProps) {
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
      <img
        src={imageUrl('res_materials')}
        alt=""
        width={32}
        height={32}
        className="top-bar__icon top-bar__materials-icon"
      />
      <p className="top-bar__label top-bar__materials-label">Materials</p>
      <p className="top-bar__value top-bar__materials" data-testid="materials">
        {materials}
      </p>
    </header>
  );
}
