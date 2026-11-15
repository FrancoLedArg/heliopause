import { describe, expect, it } from 'vitest';
import {
  CRUISE_EVENT_KINDS,
  CRUISE_TUNING,
  cruiseSchedule,
  newSpacecraft,
  refit,
  startRun,
  type CruiseEventKind,
} from './index.ts';
import { radarReach, withDamage } from './spacecraft.ts';

const SEEDS = Array.from({ length: 500 }, (_, i) => i * 104_729 + 7);
const ALL: readonly CruiseEventKind[] = CRUISE_EVENT_KINDS;
const fullSpacecraft = refit(newSpacecraft('scout'), [
  'engine-1',
  'fuel-tank-1',
  'drill-1',
  'engine-2',
  null,
  null,
]);

const anyPart = refit(newSpacecraft('scout'), [
  'engine-1',
  'fuel-tank-1',
  'drill-1',
  'radar-1',
  null,
  null,
]);

describe('a flickering Radar', () => {
  it('a Damaged Radar reaches less far until it is Repaired', () => {
    const sound = radarReach(anyPart);
    const slot = anyPart.slots.indexOf('radar-1');
    const flickering = withDamage(
      anyPart,
      anyPart.damage.map((_, i) => (i === slot ? { repair: null, burning: null } : null)),
    );
    expect(sound).toBeDefined();
    expect(radarReach(flickering)?.range).toBeLessThan(sound?.range ?? 0);
    expect(radarReach(flickering)?.range).toBeGreaterThan(0);
  });
});

describe('the Cruise event schedule', () => {
  it('every Cruise has one or two events from the first Hop of a Run', () => {
    for (const hop of [1, 2, 5, 12]) {
      for (const seed of SEEDS) {
        const count = cruiseSchedule(seed, hop, 1, fullSpacecraft, ALL).length;
        expect(count).toBeGreaterThanOrEqual(1);
        expect(count).toBeLessThanOrEqual(2);
      }
    }
  });

  it('the first Hops of a Run get only a Fuel leak or a Debris field, and never an Engine fire', () => {
    for (let hop = 1; hop <= CRUISE_TUNING.mildHops; hop++) {
      for (const seed of SEEDS) {
        for (const event of cruiseSchedule(seed, hop, 1, fullSpacecraft, ALL)) {
          expect(['fuel-leak', 'debris-field']).toContain(event.kind);
        }
      }
    }
  });

  it('a Debris field on the first Hops hits any installed part but the Jump Drive, and never misses', () => {
    const kinds = new Set<string>();
    for (const seed of SEEDS) {
      for (let hop = 1; hop <= CRUISE_TUNING.mildHops; hop++) {
        for (const event of cruiseSchedule(seed, hop, 1, anyPart, ['debris-field'])) {
          expect(event.slot).not.toBeNull();
          kinds.add(String(anyPart.slots[event.slot ?? 0]).replace(/-\d$/, ''));
        }
      }
    }
    expect([...kinds].sort()).toEqual(['drill', 'engine', 'fuel-tank', 'radar']);
  });

  it('an Instrument is never hit by a Cruise event', () => {
    const withCamera = refit(newSpacecraft('scout'), [
      'engine-1',
      'fuel-tank-1',
      'camera',
      'sample-lab',
      null,
      null,
    ]);
    for (const seed of SEEDS) {
      for (const hop of [1, 5]) {
        for (const event of cruiseSchedule(seed, hop, 1, withCamera, ALL)) {
          expect([2, 3]).not.toContain(event.slot);
        }
      }
    }
  });

  it('the first 3 Hops hit at least 2 different Component kinds in most Runs, never the same part back to back', () => {
    let varied = 0;
    for (const seed of SEEDS) {
      const kinds = [1, 2, 3].map((hop) =>
        cruiseSchedule(seed, hop, 1, anyPart, ['debris-field']).map((event) => event.slot),
      );
      const slots = kinds.flat();
      if (new Set(slots).size >= 2) varied++;
      for (let i = 1; i < kinds.length; i++) {
        const [prev, next] = [kinds[i - 1] ?? [], kinds[i] ?? []];
        expect(next.length > 0 && next.every((slot) => prev.includes(slot))).toBe(false);
      }
    }
    expect(varied / SEEDS.length).toBeGreaterThan(0.8);
  });

  it('on the real Scout, the first 3 Hops hit both Engine and Tank in most Runs, rotating from Hop to Hop', () => {
    let both = 0;
    for (const seed of SEEDS) {
      const { spacecraft } = startRun(seed, 'scout');
      const debris = [1, 2, 3].map((hop) =>
        cruiseSchedule(seed, hop, 1, spacecraft, ['debris-field']).map((event) => event.slot),
      );
      for (let i = 1; i < debris.length; i++) {
        const [prev, next] = [debris[i - 1] ?? [], debris[i] ?? []];
        // Two events in one Hop can hit both parts of a 2-part ship; then a repeat is unavoidable.
        if (new Set(prev).size >= 2) continue;
        expect(next.every((slot) => prev.includes(slot))).toBe(false);
      }
      const real = [1, 2, 3].flatMap((hop) =>
        cruiseSchedule(seed, hop, 1, spacecraft, CRUISE_TUNING.enabledKinds),
      );
      const kinds = new Set(real.map((e) => spacecraft.slots[e.slot ?? -1]?.replace(/-\d$/, '')));
      if (kinds.has('engine') && kinds.has('fuel-tank')) both++;
    }
    expect(both / SEEDS.length).toBeGreaterThan(0.5);
  });

  it('harsh events come later, and more often in later Star Systems', () => {
    const harsh = (hop: number, system: number) =>
      SEEDS.flatMap((seed) => cruiseSchedule(seed, hop, system, fullSpacecraft, ALL)).filter(
        (event) => event.kind === 'engine-fire' || event.kind === 'solar-flare',
      ).length;
    const late = harsh(CRUISE_TUNING.mildHops + 1, 1);
    expect(late).toBeGreaterThan(0);
    expect(harsh(12, 4)).toBeGreaterThan(late);
  });

  it('later Star Systems have more Cruises with two events', () => {
    const doubles = (system: number) =>
      SEEDS.filter((seed) => cruiseSchedule(seed, 8, system, fullSpacecraft, ALL).length === 2)
        .length;
    expect(doubles(4)).toBeGreaterThan(doubles(1));
  });

  it('two events are at least 20 s apart, and every event fits in the Cruise', () => {
    for (const seed of SEEDS) {
      const events = cruiseSchedule(seed, 9, 3, fullSpacecraft, ALL);
      for (const event of events) {
        expect(event.tick).toBeGreaterThanOrEqual(100);
        expect(event.tick).toBeLessThanOrEqual(event.kind === 'engine-fire' ? 800 : 1_000);
      }
      const [first, second] = events;
      if (first && second) expect(second.tick - first.tick).toBeGreaterThanOrEqual(200);
    }
  });

  it('the same seed and Hop give the same schedule', () => {
    expect(cruiseSchedule(42, 6, 2, fullSpacecraft, ALL)).toEqual(
      cruiseSchedule(42, 6, 2, fullSpacecraft, ALL),
    );
  });

  it('only the kinds switched on are scheduled', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      expect(
        cruiseSchedule(seed, 6, 2, fullSpacecraft, ['debris-field']).every(
          (e) => e.kind === 'debris-field',
        ),
      ).toBe(true);
    }
  });

  it('every Cruise of a real Run has one or two events, mild ones on the first Hops and an Engine fire only after them (#250, #251, #252, #253)', () => {
    const later: CruiseEventKind[] = [];
    for (const hop of [1, 2, 3, 6]) {
      for (const seed of SEEDS) {
        const schedule = cruiseSchedule(seed, hop, 1, fullSpacecraft, CRUISE_TUNING.enabledKinds);
        expect(schedule.length).toBeGreaterThanOrEqual(1);
        expect(schedule.length).toBeLessThanOrEqual(2);
        const kinds = schedule.map((event) => event.kind);
        const allowed: readonly CruiseEventKind[] =
          hop <= CRUISE_TUNING.mildHops
            ? ['fuel-leak', 'debris-field']
            : ['fuel-leak', 'debris-field', 'solar-flare', 'engine-fire'];
        expect(kinds.every((kind) => allowed.includes(kind))).toBe(true);
        if (hop > CRUISE_TUNING.mildHops) later.push(...kinds);
      }
    }
    expect(later).toContain('engine-fire');
  });

  it('the Engine fire keeps its own share of the harsh events, whichever others are switched on', () => {
    const fires = (kinds: readonly CruiseEventKind[]) =>
      SEEDS.flatMap((seed) => cruiseSchedule(seed, 8, 2, fullSpacecraft, kinds)).filter(
        (event) => event.kind === 'engine-fire',
      ).length;
    const alone = fires(['fuel-leak', 'engine-fire']);
    const withFlare = fires(['fuel-leak', 'engine-fire', 'solar-flare']);
    expect(alone).toBeGreaterThan(0);
    expect(Math.abs(alone - withFlare)).toBeLessThanOrEqual(withFlare * 0.25);
  });

  it('a later Debris field hits or misses, and what it hits is an Engine, a Fuel Tank or a Drill', () => {
    const struck = new Set<string>();
    let hits = 0;
    let misses = 0;
    for (const seed of SEEDS) {
      for (const event of cruiseSchedule(seed, 8, 1, fullSpacecraft, ['debris-field'])) {
        if (event.slot === null) {
          misses++;
          continue;
        }
        hits++;
        struck.add(String(fullSpacecraft.slots[event.slot]).replace(/-\d+$/, ''));
      }
    }
    expect(misses).toBeGreaterThan(0);
    expect(hits).toBeGreaterThan(misses / 4);
    expect([...struck].sort()).toEqual(['drill', 'engine', 'fuel-tank']);
  });

  it('a solar flare strikes the Radar when one is aboard, and passes harmlessly without one', () => {
    const withRadar = refit(newSpacecraft('scout'), [
      'engine-1',
      'fuel-tank-1',
      'radar-1',
      null,
      null,
      null,
    ]);
    let hit = 0;
    for (const seed of SEEDS) {
      for (const event of cruiseSchedule(seed, 8, 2, withRadar, ['solar-flare'])) {
        expect(event.slot).toBe(2);
        hit++;
      }
      for (const event of cruiseSchedule(seed, 8, 2, fullSpacecraft, ['solar-flare'])) {
        expect(event.slot).toBeNull();
      }
    }
    expect(hit).toBeGreaterThan(0);
  });

  it('the Jump Drive is never a target', () => {
    const withJump = refit(newSpacecraft('scout'), [
      'engine-1',
      'fuel-tank-1',
      'jump-drive',
      null,
      null,
      null,
    ]);
    for (const seed of SEEDS) {
      for (const event of cruiseSchedule(seed, 9, 2, withJump, ALL)) {
        expect(event.slot).not.toBe(2);
      }
    }
  });
});
