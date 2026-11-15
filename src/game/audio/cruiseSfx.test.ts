import { describe, expect, it } from 'vitest';
import type { Run } from '../sim/index.ts';
import { cruiseCues } from './cruiseSfx.ts';
import { RECIPES } from './sfxRecipes.ts';

type Dmg = { repair: number | null; burning: number | null } | null;

function run(damage: Dmg[], struck: { kind: string }[], mats = 5): Run {
  return {
    materials: mats,
    spacecraft: { damage },
    status: { kind: 'cruising', cruise: { struck } },
  } as unknown as Run;
}

const sound = run([null, null], []);
const leaking = run([null, { repair: null, burning: null }], [{ kind: 'fuel-leak' }]);
const repairing = run([null, { repair: 0, burning: null }], [{ kind: 'fuel-leak' }]);

describe('cruiseCues', () => {
  it('plays the leak when a fuel leak strikes, once', () => {
    expect(cruiseCues(sound, leaking)).toEqual(['sfx_leak']);
    expect(cruiseCues(leaking, leaking)).toEqual([]);
  });

  it('plays nothing for a kind with no cue yet', () => {
    expect(cruiseCues(sound, run([null], [{ kind: 'solar-flare' }]))).toEqual([]);
  });

  it('plays the Repair start, then the finish', () => {
    expect(cruiseCues(leaking, repairing)).toEqual(['sfx_repair_start']);
    expect(cruiseCues(repairing, run([null, null], [{ kind: 'fuel-leak' }]))).toEqual([
      'sfx_repair_done',
    ]);
  });

  it('plays the Rush when the Damage clears for Materials', () => {
    expect(cruiseCues(repairing, run([null, null], [{ kind: 'fuel-leak' }], 3))).toEqual([
      'sfx_rush',
    ]);
  });

  it('has a recipe for every cue', () => {
    for (const key of [
      'sfx_leak',
      'sfx_debris',
      'sfx_repair_start',
      'sfx_repair_done',
      'sfx_rush',
    ]) {
      expect(RECIPES).toHaveProperty(key);
    }
  });
});
