import type { Kilograms } from '../game/sim/index.ts';
import { formatFuel } from './format.ts';
import { fuelFillShare } from './fuelFill.ts';

interface FuelGaugeProps {
  fuel: Kilograms;
  capacity: Kilograms;
  /** `bar` runs left to right (the top bar); `tank` fills from the bottom (beside the Spacecraft). */
  shape: 'bar' | 'tank';
  /** The `data-testid` of the gauge; its fill has the same id with `-fill`. */
  testId: string;
  className?: string;
}

/**
 * Fuel as a fill: how full the tank is, in amber like the Fuel readout. A meter for assistive technology
 * ("Fuel, 1,234 kg of 8,000 kg"); the fill's `data-share` carries the exact share (0 to 1) for tests.
 */
export function FuelGauge({ fuel, capacity, shape, testId, className }: FuelGaugeProps) {
  const share = fuelFillShare(fuel, capacity);
  const percent = `${(share * 100).toFixed(1)}%`;
  const fill = shape === 'bar' ? { width: percent } : { height: percent };
  return (
    <div
      role="meter"
      aria-label="Fuel"
      aria-valuemin={0}
      aria-valuemax={Math.round(capacity)}
      aria-valuenow={Math.round(fuel)}
      aria-valuetext={`${formatFuel(fuel)} of ${formatFuel(capacity)}`}
      className={['fuel-gauge', `fuel-gauge--${shape}`, className ?? ''].filter(Boolean).join(' ')}
      data-testid={testId}
    >
      <div
        className="fuel-gauge__fill"
        data-testid={`${testId}-fill`}
        data-share={share}
        style={fill}
      />
    </div>
  );
}
