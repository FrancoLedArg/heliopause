import { availableDeltaV, newSpacecraft, type ChassisId } from '../game/sim/index.ts';
import { chassisName, formatDeltaVKmS, formatFuel, formatMass } from './format.ts';

export type ChassisBarKind = 'mass' | 'fuel' | 'dv';

export interface ChassisBar {
  readonly kind: ChassisBarKind;
  /** What the bar measures, as the player reads it. */
  readonly label: string;
  /** The short word shown beside the bar. */
  readonly shortLabel: string;
  /** The number at the bar's end. */
  readonly value: string;
  /** How full the bar is, 0 to 1: this Chassis against the largest of the Chassis shown. */
  readonly share: number;
  /** Chassis, measure and value in words, for a screen reader. */
  readonly ariaLabel: string;
}

const SHORT_LABELS: Record<ChassisBarKind, string> = { mass: 'Dry mass', fuel: 'Fuel', dv: 'Δv' };

const KINDS: readonly ChassisBarKind[] = ['mass', 'fuel', 'dv'];

const LABELS: Record<ChassisBarKind, string> = {
  mass: 'Dry mass',
  fuel: 'Fuel capacity',
  dv: 'Δv',
};

/** The raw figures of a new Spacecraft on this Chassis, from the sim, each with its number as shown. */
function figures(id: ChassisId): Record<ChassisBarKind, { amount: number; text: string }> {
  const spacecraft = newSpacecraft(id);
  const dv = availableDeltaV(spacecraft);
  return {
    mass: { amount: spacecraft.dryMass, text: formatMass(spacecraft.dryMass) },
    fuel: { amount: spacecraft.fuelCapacity, text: formatFuel(spacecraft.fuelCapacity) },
    dv: { amount: dv, text: formatDeltaVKmS(dv) },
  };
}

/** The three comparison bars of each Chassis: every bar is relative to the same measure on the others. */
export function chassisBars(ids: readonly ChassisId[]): Map<ChassisId, readonly ChassisBar[]> {
  const own = new Map(ids.map((id) => [id, figures(id)]));
  const largest = (kind: ChassisBarKind): number =>
    Math.max(...[...own.values()].map((f) => f[kind].amount));
  return new Map(
    ids.map((id) => {
      const mine = own.get(id) ?? figures(id);
      return [
        id,
        KINDS.map((kind): ChassisBar => {
          const { amount, text: value } = mine[kind];
          const max = largest(kind);
          return {
            kind,
            label: LABELS[kind],
            shortLabel: SHORT_LABELS[kind],
            value,
            share: max > 0 ? amount / max : 0,
            ariaLabel: `${chassisName(id)} ${LABELS[kind]}: ${value}`,
          };
        }),
      ];
    }),
  );
}
