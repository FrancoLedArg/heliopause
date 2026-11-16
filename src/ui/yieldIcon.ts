import {
  depositLevel,
  isDepleted,
  type Body,
  type DepositLevel,
  type Run,
} from '../game/sim/index.ts';

/** Which resource a Body yields: an Icy Body gives Fuel, a Rocky Body gives Materials. */
export type YieldResource = 'fuel' | 'materials';

/** The icon that shows what a Body yields: what, whether it is Depleted, and the words for assistive technology. */
export interface YieldIcon {
  readonly resource: YieldResource;
  /** Its yield is taken: drawn dimmed and struck through. */
  readonly depleted: boolean;
  /** How much is left to give, for the deposit gauge; `undefined` until the Body is Surveyed. */
  readonly level: DepositLevel | undefined;
  /** "yields Fuel", "yields Materials" or "Depleted, yields nothing": the icon's accessible name. */
  readonly name: string;
}

const RESOURCE_WORD: Record<YieldResource, string> = { fuel: 'Fuel', materials: 'Materials' };

/** The words for a resource icon, whichever screen draws it. */
export function yieldIconName(resource: YieldResource, depleted: boolean): string {
  return depleted ? 'Depleted, yields nothing' : `yields ${RESOURCE_WORD[resource]}`;
}

/** The yield icon a Body carries in `run`, or `undefined` for a Body with nothing to yield (a Gas Giant). */
export function yieldIcon(run: Run, body: Body): YieldIcon | undefined {
  if (!body.landable) return undefined;
  const resource: YieldResource = body.composition === 'icy' ? 'fuel' : 'materials';
  const depleted = isDepleted(run, body.id);
  const level = depositLevel(run, body.id);
  return { resource, depleted, level, name: yieldIconName(resource, depleted) };
}
