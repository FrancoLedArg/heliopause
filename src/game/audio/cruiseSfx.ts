import type { CruiseEventKind, Run } from '../sim/index.ts';

/**
 * The strike sound of each kind of Cruise event (#264). A new event kind adds one line here, and a
 * recipe in `sfxRecipes.ts`; a kind with no line strikes in silence.
 */
export const STRIKE_CUES: Readonly<Partial<Record<CruiseEventKind, string>>> = {
  'fuel-leak': 'sfx_leak',
};

export const REPAIR_START_CUE = 'sfx_repair_start';
export const REPAIR_DONE_CUE = 'sfx_repair_done';
export const RUSH_CUE = 'sfx_rush';

const struckCount = (run: Run): number =>
  run.status.kind === 'cruising' ? run.status.cruise.struck.length : 0;

/**
 * The sounds a Cruise update makes, in order: each newly struck event's cue, a Repair that began, and
 * a Damage that cleared (a Rush when it cost Materials, otherwise a Repair that finished).
 */
export function cruiseCues(before: Run, after: Run): string[] {
  const cues: string[] = [];
  if (after.status.kind === 'cruising') {
    for (const event of after.status.cruise.struck.slice(struckCount(before))) {
      const cue = STRIKE_CUES[event.kind];
      if (cue) cues.push(cue);
    }
  }
  const slots = Math.max(before.spacecraft.damage.length, after.spacecraft.damage.length);
  for (let slot = 0; slot < slots; slot++) {
    const was = before.spacecraft.damage[slot] ?? null;
    const now = after.spacecraft.damage[slot] ?? null;
    if (was && now && was.repair === null && now.repair !== null) cues.push(REPAIR_START_CUE);
    if (was && !now) {
      cues.push(after.materials < before.materials ? RUSH_CUE : REPAIR_DONE_CUE);
    }
  }
  return cues;
}
