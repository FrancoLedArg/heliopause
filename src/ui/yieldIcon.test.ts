import { describe, expect, it } from 'vitest';
import { listBodies, startRun } from '../game/sim/index.ts';
import { yieldIcon } from './yieldIcon.ts';

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe('the yield icon of a Body', () => {
  it('an Icy Body offers the Fuel icon, a Rocky Body the Materials icon, a Depleted Body the struck-through icon, and a Gas Giant none', () => {
    const seen = { icy: false, rocky: false, gas: false };
    for (const seed of SEEDS) {
      // Nothing Depleted yet: since #189 a Run starts with its Starting Moon's yield taken.
      const run = { ...startRun(seed, 'scout'), depleted: [] };
      for (const body of listBodies(run.starSystem)) {
        const icon = yieldIcon(run, body);
        if (!body.landable) {
          expect(icon).toBeUndefined();
          seen.gas = true;
          continue;
        }
        const resource = body.composition === 'icy' ? 'fuel' : 'materials';
        expect(icon).toEqual({
          resource,
          depleted: false,
          name: resource === 'fuel' ? 'yields Fuel' : 'yields Materials',
        });
        seen[body.composition] = true;

        const emptied = yieldIcon({ ...run, depleted: [body.id] }, body);
        expect(emptied).toEqual({ resource, depleted: true, name: 'Depleted, yields nothing' });
      }
    }
    expect(seen).toEqual({ icy: true, rocky: true, gas: true });
  });

  it('a Body is struck through only in the Run that emptied it', () => {
    const run = { ...startRun(1, 'scout'), depleted: [] };
    const [first, second] = listBodies(run.starSystem).filter((b) => b.landable);
    if (!first || !second) throw new Error('Seed 1 needs two landable Bodies');
    const emptied = { ...run, depleted: [first.id] };
    expect(yieldIcon(emptied, first)?.depleted).toBe(true);
    expect(yieldIcon(emptied, second)?.depleted).toBe(false);
  });
});
