import { describe, expect, it } from 'vitest';
import { landedOn, withDeltaV } from './testing.ts';
import {
  bodyKnowledge,
  CHASSIS_IDS,
  componentEffect,
  currentBody,
  distanceBetween,
  findBody,
  flyHop,
  HELIOPAUSE,
  install,
  listBodies,
  materials,
  planHop,
  remove,
  startRun,
  type Body,
  type BodyId,
  type ComponentId,
  type Run,
} from './index.ts';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7_919 + 11);

/** Every Burn at its estimate. */
const AT_ESTIMATE = { next: () => 0.5, int: (min: number) => min };

/** The same Run with `radar` installed in its first empty Slot, paid for from Materials to spare. */
function withRadar(run: Run, radar: ComponentId): Run {
  const result = install(
    { ...run, materials: materials(1_000) },
    run.spacecraft.slots.indexOf(null),
    radar,
  );
  if (result.kind !== 'installed') throw new Error(`Expected an install: ${result.reason.kind}`);
  return result.run;
}

/** A Radar's range, as the Spacecraft panel shows it. */
function rangeOf(radar: ComponentId): number {
  const effect = componentEffect('scout', radar);
  if (effect.kind !== 'radar') throw new Error(`${radar} is not a Radar`);
  return effect.range;
}

/** The Bodies within `range` of the Body the Run is on. */
function inRange(run: Run, range: number): Body[] {
  const here = currentBody(run);
  return listBodies(run.starSystem).filter(
    (body) => distanceBetween(run.starSystem, here, body) <= range,
  );
}

/** Flies a Hop to `target` at its estimate, with Fuel to spare: what a landing there teaches. */
function landOn(run: Run, target: BodyId): Run {
  const fuelled = withDeltaV(run, 1e6);
  const planned = planHop(fuelled, target);
  if (planned.kind !== 'planned') throw new Error(`No plan to ${target}: ${planned.why}`);
  const { run: after } = flyHop(fuelled, planned.plan, AT_ESTIMATE);
  if (after.status.kind !== 'landed') throw new Error(`The Hop to ${target} should land`);
  return after;
}

describe('the Radar', () => {
  it('a level-1 Radar Detects every Body in range but Surveys none', () => {
    let detectedFromAfar = 0;
    for (const seed of SEEDS) {
      const run = startRun(seed, 'scout');
      const range = rangeOf('radar-1');
      // On install...
      const installed = withRadar(run, 'radar-1');
      for (const body of inRange(installed, range)) {
        expect(bodyKnowledge(installed, body.id)).not.toBe('unknown');
      }
      expect(installed.knowledge.surveyed).toEqual(run.knowledge.surveyed);
      detectedFromAfar += installed.knowledge.detected.length - run.knowledge.detected.length;
      // ...and at each landing.
      const target = run.knowledge.detected.find((id) => findBody(run.starSystem, id)?.landable);
      const next = installed.knowledge.detected.find(
        (id) => id !== currentBody(run).id && findBody(run.starSystem, id)?.landable,
      );
      if (!target || !next) throw new Error('A new Run knows a Body to Hop to');
      const landed = landOn(installed, next);
      for (const body of inRange(landed, range)) {
        expect(bodyKnowledge(landed, body.id)).not.toBe('unknown');
      }
      expect(landed.knowledge.surveyed.filter((id) => id !== next)).toEqual(
        installed.knowledge.surveyed,
      );
    }
    expect(detectedFromAfar).toBeGreaterThan(SEEDS.length);
  });

  it('a level-2 Radar Surveys every Body in range', () => {
    for (const seed of SEEDS) {
      const installed = withRadar(startRun(seed, 'scout'), 'radar-2');
      const reached = inRange(installed, rangeOf('radar-2'));
      expect(reached.length).toBeGreaterThan(2);
      for (const body of reached) expect(bodyKnowledge(installed, body.id)).toBe('surveyed');
    }
  });

  it("the Heliopause is found only when the Radar's range reaches it", () => {
    let found = 0;
    let notFound = 0;
    for (const seed of SEEDS.slice(0, 10)) {
      const run = startRun(seed, 'scout');
      const radius = run.starSystem.heliopauseRadius;
      for (const body of listBodies(run.starSystem)) {
        if (!body.landable) continue;
        const here = landedOn(run, body.id);
        // Without a Radar nothing finds it.
        expect(here.knowledge.heliopauseFound).toBe(false);
        const swept = withRadar(here, 'radar-1');
        const reaches = body.distanceFromStar + rangeOf('radar-1') >= radius;
        expect(swept.knowledge.heliopauseFound).toBe(reaches);
        if (reaches) found += 1;
        else notFound += 1;
      }
    }
    expect(found).toBeGreaterThan(0);
    expect(notFound).toBeGreaterThan(found);
  });

  it('removing the Radar forgets nothing', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const run = startRun(seed, 'scout');
      const outermost = listBodies(run.starSystem)
        .filter((body) => body.landable)
        .at(-1);
      if (!outermost) throw new Error('A Star System has landable Bodies');
      const swept = withRadar(landedOn(run, outermost.id), 'radar-2');
      expect(swept.knowledge.heliopauseFound).toBe(true);
      const removed = remove(swept, swept.spacecraft.slots.indexOf('radar-2'));
      if (removed.kind !== 'removed') throw new Error(`Expected a removal: ${removed.reason.kind}`);
      expect(removed.run.knowledge).toEqual(swept.knowledge);
      // ...and a landing with no Radar aboard takes nothing away either.
      const known = removed.run.knowledge.detected.find(
        (id) => id !== outermost.id && findBody(run.starSystem, id)?.landable,
      );
      if (!known) throw new Error('The Radar Detected a landable Body');
      const after = landOn(removed.run, known);
      expect(after.knowledge.heliopauseFound).toBe(true);
      for (const id of swept.knowledge.surveyed) expect(bodyKnowledge(after, id)).toBe('surveyed');
      expect(planHop(withDeltaV(after, 1e6), HELIOPAUSE).kind).toBe('invalid-target');
    }
  });

  it('a level-1 Radar is affordable at the start', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      for (const chassis of CHASSIS_IDS) {
        const run = startRun(seed, chassis);
        const slot = run.spacecraft.slots.indexOf(null);
        expect(install(run, slot, 'radar-1').kind).toBe('installed');
        // #189's guard holds: no opening pays for a Jump Drive before the first Hop.
        expect(install(run, slot, 'jump-drive').kind).toBe('refused');
      }
    }
  });
});

describe('the Radar balance', () => {
  /**
   * The Hops a Run takes from the Starting Moon to the Heliopause, played by a model player: it
   * builds a level-1 Radar before its first Hop, then always Hops to the nearest Body it knows of
   * and has not landed on that lies no nearer the star (falling back to any it knows), until the
   * Radar finds the Heliopause, and then Hops there. Every Hop counts, along a band as well as out
   * from it: each is a step of the way out. Fuel is never short, so the count measures the map's
   * scale against the Radar's range, not the Δv balance.
   */
  function hopsToHeliopause(seed: number): number {
    let run = withRadar(startRun(seed, 'scout'), 'radar-1');
    const visited = new Set<BodyId>([currentBody(run).id]);
    for (let hops = 0; hops < 100; hops += 1) {
      if (run.knowledge.heliopauseFound) return hops + 1;
      const here = currentBody(run);
      const options = run.knowledge.detected.flatMap((id) => {
        const body = findBody(run.starSystem, id);
        return body?.landable && !visited.has(id) ? [body] : [];
      });
      const outward = options.filter((body) => body.distanceFromStar >= here.distanceFromStar);
      const [next] = (outward.length > 0 ? outward : options).sort(
        (a, b) =>
          distanceBetween(run.starSystem, here, a) - distanceBetween(run.starSystem, here, b),
      );
      if (!next) return Infinity;
      run = landOn(run, next.id);
      visited.add(next.id);
    }
    return Infinity;
  }

  it('across 300 seeds, the median Run from the Starting Moon to the Heliopause is 10 to 15 outward Hops', () => {
    const hops = Array.from({ length: 300 }, (_, i) => hopsToHeliopause(i * 104_729 + 3)).sort(
      (a, b) => a - b,
    );
    // Every Heliopause can be found.
    expect(hops.at(-1)).toBeLessThan(Infinity);
    const median = hops[hops.length / 2] ?? 0;
    expect(median).toBeGreaterThanOrEqual(10);
    expect(median).toBeLessThanOrEqual(15);
  });
});
