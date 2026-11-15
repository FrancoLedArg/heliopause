import { describe, expect, it } from 'vitest';
import { knowingEverything, landedOn, readyToJump, withDeltaV } from './testing.ts';
import {
  currentBody,
  DISCOVERIES,
  DISCOVERY_IDS,
  discoveriesOn,
  findBody,
  flyHop,
  HELIOPAUSE,
  install,
  listBodies,
  materials,
  planHop,
  score,
  startRun,
  type Body,
  type BodyId,
  type ComponentId,
  type DiscoveryId,
  type DiscoveryReveal,
  type Run,
} from './index.ts';

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7_919 + 11);

/** Every Burn at its estimate. */
const AT_ESTIMATE = { next: () => 0.5, int: (min: number) => min };

/** Installs `id` in the first empty Slot with Materials to spare; returns the result. */
function installing(run: Run, id: ComponentId) {
  const result = install(
    { ...run, materials: materials(1_000) },
    run.spacecraft.slots.indexOf(null),
    id,
  );
  if (result.kind !== 'installed') throw new Error(`Expected an install: ${result.reason.kind}`);
  return result;
}

const withComponent = (run: Run, id: ComponentId): Run => installing(run, id).run;

/** Flies a Hop to `target` at its estimate, knowing every Body and with Fuel to spare. */
function landOn(run: Run, target: BodyId) {
  // From where the Run stands, or else from the first Body whose Hop range reaches the target (#283).
  const starts = [
    run,
    ...listBodies(run.starSystem)
      .filter((b) => b.landable && b.id !== target)
      .map((b) => landedOn(run, b.id)),
  ];
  const fuelled = starts
    .map((start) => withDeltaV(knowingEverything(start), 1e6))
    .find((start) => planHop(start, target).kind === 'planned');
  if (!fuelled) throw new Error(`No Body has ${target} in its Hop range`);
  const planned = planHop(fuelled, target);
  if (planned.kind !== 'planned') throw new Error(`No plan to ${target}: ${planned.reason}`);
  const flown = flyHop(fuelled, planned.plan, AT_ESTIMATE);
  if (flown.run.status.kind !== 'landed') throw new Error(`The Hop to ${target} should land`);
  return flown;
}

/** The first seed's Run and landable Body (not the Starting Moon) that `test` accepts. */
function find(test: (run: Run, body: Body) => boolean): { run: Run; body: Body } {
  for (const seed of SEEDS) {
    const run = startRun(seed, 'scout');
    const here = currentBody(run).id;
    const body = listBodies(run.starSystem).find(
      (candidate) => candidate.landable && candidate.id !== here && test(run, candidate),
    );
    if (body) return { run, body };
  }
  throw new Error('No seed has such a Body');
}

const hides = (run: Run, body: Body, id: DiscoveryId) =>
  discoveriesOn(run.starSystem, body.id).includes(id);

const ids = (revealed: readonly DiscoveryReveal[]) => revealed.map((r) => r.discoveryId);

describe('Discoveries', () => {
  it("a Camera reveals a Rocky Body's Camera Discovery on landing", () => {
    const { run, body } = find((r, b) => hides(r, b, 'river-delta'));
    const before = withComponent(run, 'camera');
    const landed = landOn(before, body.id);
    expect(landed.flight.discoveries).toContainEqual({
      kind: 'new',
      discoveryId: 'river-delta',
      bodyId: body.id,
      science: DISCOVERIES['river-delta'].science,
    });
    expect(landed.run.science).toBe(before.science + DISCOVERIES['river-delta'].science);
  });

  it('an Instrument reveals nothing it is not suited to', () => {
    const { run, body } = find(
      (r, b) =>
        b.landable &&
        b.composition === 'rocky' &&
        discoveriesOn(r.starSystem, b.id).every((id) => DISCOVERIES[id].instrument === 'camera'),
    );
    const landed = landOn(withComponent(run, 'chemistry-scanner'), body.id);
    expect(landed.flight.discoveries).toEqual([]);
  });

  it('installing an Instrument while landed reveals what it can on the current Body', () => {
    const { run, body } = find((r, b) => hides(r, b, 'river-delta'));
    const installed = installing(landedOn(run, body.id), 'camera');
    expect(ids(installed.discoveries)).toContain('river-delta');
    expect(installed.run.science).toBeGreaterThan(run.science);
  });

  it('a Depleted Body still reveals its Discoveries', () => {
    const { run, body } = find((r, b) => hides(r, b, 'river-delta'));
    const depleted = { ...withComponent(run, 'camera'), depleted: [body.id] };
    const landed = landOn(depleted, body.id);
    expect(landed.flight.collection).toEqual({ kind: 'depleted' });
    expect(ids(landed.flight.discoveries)).toContain('river-delta');
  });

  it("a Camera on a Gas Giant's Moon reveals the Gas Giant's Discoveries", () => {
    const { run, body } = find((r, b) => {
      if (b.kind !== 'moon') return false;
      return findBody(r.starSystem, b.planetId)?.kind === 'gas-giant';
    });
    if (body.kind !== 'moon') throw new Error('Expected a Moon');
    const giant = discoveriesOn(run.starSystem, body.planetId);
    const installed = installing(landedOn(run, body.id), 'camera');
    const fromGiant = installed.discoveries.filter((r) => r.bodyId === body.planetId);
    expect(ids(fromGiant)).toEqual(giant);
    expect(giant.length).toBeGreaterThan(0);
  });

  it('a Sample lab reveals nothing without a Drill aboard', () => {
    const { run, body } = find((r, b) => hides(r, b, 'water-salt'));
    const there = landedOn(run, body.id);
    expect(installing(there, 'sample-lab').discoveries).toEqual([]);
    const drilled = installing(withComponent(there, 'drill-1'), 'sample-lab');
    expect(ids(drilled.discoveries)).toContain('water-salt');
  });

  it('a Discovery gives Science once per Star System', () => {
    const { run, body } = find((r, b) => hides(r, b, 'river-delta'));
    const first = installing(landedOn(run, body.id), 'camera').run;
    const again = landOn(first, body.id);
    expect(again.flight.discoveries).toEqual([]);
    expect(again.run.science).toBe(first.science);
  });

  it('the same Discovery on a second Body in the Star System is already found here', () => {
    const pair = (r: Run) =>
      listBodies(r.starSystem).filter((b) => b.landable && hides(r, b, 'river-delta'));
    const run = SEEDS.map((seed) => startRun(seed, 'scout')).find((r) => pair(r).length >= 2);
    if (!run) throw new Error('No seed hides it twice');
    const [a, b] = pair(run) as [Body, Body];
    const onA = installing(landedOn(run, a.id), 'camera').run;
    const onB = landOn(onA, b.id);
    expect(onB.flight.discoveries).toContainEqual({
      kind: 'already-found-here',
      discoveryId: 'river-delta',
      bodyId: b.id,
    });
    expect(onB.run.science).toBe(onA.science);
  });

  it('a Discovery gives Science again after a Jump', () => {
    const ready = SEEDS.map((seed) => readyToJump(seed, 'scout')).find((r) => r !== undefined);
    if (!ready) throw new Error('No seed reaches the Heliopause');
    const camera = withComponent(ready, 'camera');
    const planned = planHop(camera, HELIOPAUSE);
    if (planned.kind !== 'planned') throw new Error('No plan to the Heliopause');
    const jumped = flyHop(camera, planned.plan, AT_ESTIMATE).run;
    expect(jumped.starSystemNumber).toBe(2);
    // Every Discovery was already made in Star System 1.
    const madeEverywhere = {
      ...jumped,
      discoveries: DISCOVERY_IDS.map((discoveryId) => ({
        discoveryId,
        bodyId: currentBody(ready).id,
        starSystemNumber: 1,
        science: 10,
      })),
    };
    const target = listBodies(jumped.starSystem).find(
      (b) =>
        b.landable &&
        b.id !== currentBody(jumped).id &&
        discoveriesOn(jumped.starSystem, b.id).some(
          (id) => DISCOVERIES[id].instrument === 'camera',
        ),
    );
    if (!target) throw new Error('Star System 2 hides no Camera Discovery');
    const landed = landOn(madeEverywhere, target.id);
    expect(landed.flight.discoveries.some((r) => r.kind === 'new')).toBe(true);
    expect(landed.run.science).toBeGreaterThan(madeEverywhere.science);
  });

  it('a Sample lab Discovery is worth more than a Chemistry scanner one, and that more than a Camera one', () => {
    expect(DISCOVERIES['water-salt'].science).toBeGreaterThan(
      DISCOVERIES['shadowed-crater-ice'].science,
    );
    expect(DISCOVERIES['shadowed-crater-ice'].science).toBeGreaterThan(
      DISCOVERIES['river-delta'].science,
    );
  });

  it('the Score is the same with or without Science', () => {
    const { run, body } = find((r, b) => hides(r, b, 'river-delta'));
    const without = landOn(run, body.id).run;
    const withScience = landOn(withComponent(run, 'camera'), body.id).run;
    expect(withScience.science).toBeGreaterThan(0);
    expect(score(withScience)).toEqual(score(without));
  });

  it('the same seed hides the same Discoveries', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const a = startRun(seed, 'scout');
      const b = startRun(seed, 'lancer');
      for (const body of listBodies(a.starSystem)) {
        expect(discoveriesOn(a.starSystem, body.id)).toEqual(discoveriesOn(b.starSystem, body.id));
      }
    }
  });

  it('every Body hides one or two Discoveries of its type, over many seeds', () => {
    const seen = new Set<DiscoveryId>();
    for (const seed of SEEDS) {
      const { starSystem } = startRun(seed, 'scout');
      for (const body of listBodies(starSystem)) {
        const hidden = discoveriesOn(starSystem, body.id);
        const type = body.landable ? body.composition : 'gas-giant';
        expect(hidden.length).toBeGreaterThanOrEqual(1);
        expect(hidden.length).toBeLessThanOrEqual(2);
        expect(new Set(hidden).size).toBe(hidden.length);
        for (const id of hidden) {
          expect(DISCOVERIES[id].bodyType).toBe(type);
          seen.add(id);
        }
      }
    }
    expect(seen.size).toBe(DISCOVERY_IDS.length);
  });
});

describe('the Discovery catalogue', () => {
  // Missions and instruments the research doc names: the Space Apps rule keeps them out of the text.
  const NAMES =
    /Perseverance|Curiosity|Cassini|Juno|New Horizons|Dawn|Voyager|LCROSS|LRO|Chandrayaan|Mineralogy|M3|VIMS|ISS|PIXL|Galileo|Rosetta|OSIRIS|MESSENGER|Magellan|Huygens|HiRISE|SAM/;

  it('has 3 Discoveries per landable Body type and 2 for Gas Giants', () => {
    const count = (type: string) =>
      DISCOVERY_IDS.filter((id) => DISCOVERIES[id].bodyType === type).length;
    expect([count('rocky'), count('icy'), count('gas-giant')]).toEqual([3, 3, 2]);
  });

  it.each(DISCOVERY_IDS)('%s has its texts and an https NASA or JPL source', (id) => {
    const entry = DISCOVERIES[id];
    expect(entry.id).toBe(id);
    for (const text of [entry.name, entry.fact, entry.tellMore, entry.place]) {
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toMatch(NAMES);
    }
    expect(entry.source).toMatch(/^https:\/\/(www\.|science\.)?(nasa\.gov|jpl\.nasa\.gov)\//);
  });
});
