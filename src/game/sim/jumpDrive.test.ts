import { describe, expect, it } from 'vitest';
import {
  availableDeltaV,
  CHASSIS_IDS,
  COMPONENTS,
  componentCost,
  install,
  materials,
  preview,
  remove,
  startRun,
  type ChassisId,
  type Run,
} from './index.ts';

/** A New Run with Materials to spare. */
function rich(chassis: ChassisId): Run {
  return { ...startRun(2026, chassis), materials: materials(500) };
}

function installed(result: ReturnType<typeof install>): Run {
  if (result.kind !== 'installed') throw new Error(`Expected an install: ${result.reason.kind}`);
  return result.run;
}

describe('the Jump Drive', () => {
  it('is flagged as the Jump Drive', () => {
    expect(COMPONENTS['jump-drive'].kind).toBe('jump-drive');
  });

  it('the Jump Drive takes a Slot and costs Materials like any Component', () => {
    const run = rich('scout');
    const cost = componentCost('jump-drive', 1);
    const after = installed(install(run, 2, 'jump-drive'));
    expect(after.spacecraft.slots).toEqual(['engine-1', 'fuel-tank-1', 'jump-drive', null]);
    expect(after.materials).toBe(500 - cost);
    // With every Slot full, its Slot is one nothing else can have.
    const full = installed(install(after, 3, 'drill-1'));
    expect(install(full, 0, 'drill-1')).toEqual({
      kind: 'refused',
      reason: { kind: 'no-empty-slot' },
    });
  });

  it('a Spacecraft carries at most one Jump Drive', () => {
    const run = rich('lancer');
    const once = installed(install(run, 2, 'jump-drive'));
    expect(install(once, 3, 'jump-drive')).toEqual({
      kind: 'refused',
      reason: { kind: 'jump-drive-installed' },
    });
    // Removing it frees the way for another.
    const removed = remove(once, 2);
    if (removed.kind !== 'removed') throw new Error('Expected a removal');
    expect(install(removed.run, 3, 'jump-drive').kind).toBe('installed');
  });

  it('needs several Rocky Bodies yield, and more than a Run starts with', () => {
    // A Rocky Body gives 10 to 30 Materials before the Drill, so about 20 on average.
    expect(componentCost('jump-drive', 1)).toBeGreaterThanOrEqual(40);
    expect(install(startRun(2026, 'scout'), 2, 'jump-drive').kind).toBe('refused');
  });

  it('removing the Jump Drive refunds half its Materials', () => {
    const after = installed(install(rich('hauler'), 2, 'jump-drive'));
    const cost = componentCost('jump-drive', 1);
    const result = remove(after, 2);
    if (result.kind !== 'removed') throw new Error('Expected a removal');
    expect(result.refund).toBe(Math.floor(cost / 2));
    expect(result.run.materials).toBe(500 - cost + Math.floor(cost / 2));
  });

  it('the Jump Drive does not count as the last Engine or the last Fuel Tank', () => {
    const after = installed(install(rich('lancer'), 2, 'jump-drive'));
    expect(remove(after, 2).kind).toBe('removed');
    // The Engine and the Tank are still the last ones with a Jump Drive beside them.
    expect(remove(after, 0)).toEqual({ kind: 'refused', reason: { kind: 'last-engine' } });
    expect(remove(after, 1)).toEqual({ kind: 'refused', reason: { kind: 'last-fuel-tank' } });
  });

  it('a Run in System 3 is charged 51 for the Jump Drive and refunded 25', () => {
    const inSystem3 = { ...rich('hauler'), starSystemNumber: 3 };
    const after = installed(install(inSystem3, 2, 'jump-drive'));
    expect(after.materials).toBe(500 - 51);
    const result = remove(after, 2);
    if (result.kind !== 'removed') throw new Error('Expected a removal');
    expect(result.refund).toBe(25);
  });

  it("the Jump Drive's cost rises with the Star System number", () => {
    const costs = [1, 2, 3, 4, 5].map((n) => componentCost('jump-drive', n));
    for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeGreaterThan(costs[i - 1] ?? 0);
    expect(costs.every(Number.isInteger)).toBe(true);
  });

  it("the Jump Drive's cost stays within reach as Rocky yields shrink with each level", () => {
    // Total Rocky yield in a Star System at levels 1 to 5, from the difficulty review's figures
    // (level 4 between its neighbours). The cost must stay clearly under it.
    const rockyYield = [82, 78, 76, 71, 66];
    rockyYield.forEach((total, index) => {
      expect(componentCost('jump-drive', index + 1)).toBeLessThanOrEqual(total * 0.9);
    });
  });

  it("other Components' costs do not change with the Star System number", () => {
    expect(componentCost('engine-1', 4)).toBe(COMPONENTS['engine-1'].cost);
  });

  it('installing the Jump Drive lowers Δv on every Chassis, visibly', () => {
    for (const id of CHASSIS_IDS) {
      const { spacecraft } = startRun(2026, id);
      const after = preview(spacecraft, { kind: 'install', component: 'jump-drive' });
      if (after === undefined) throw new Error('Expected a preview');
      // Heavy: at least a tenth of the Δv gone on every Chassis.
      expect(after.deltaV).toBeLessThan(availableDeltaV(spacecraft) * 0.9);
    }
  });

  it('is heavier than any other Component', () => {
    for (const other of Object.values(COMPONENTS)) {
      if (other.kind === 'jump-drive') continue;
      expect(COMPONENTS['jump-drive'].mass).toBeGreaterThan(other.mass);
    }
  });

  it('is explained in one plain sentence that says it only fires at the Heliopause', () => {
    const { explanation } = COMPONENTS['jump-drive'];
    expect(explanation.length).toBeLessThanOrEqual(70);
    expect(explanation).toMatch(/Heliopause/);
    expect(explanation).toMatch(/only/i);
  });
});
