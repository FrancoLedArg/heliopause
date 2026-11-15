import { describe, expect, it } from 'vitest';
import {
  carriesJumpDrive,
  componentCost,
  COMPONENTS,
  currentBody,
  generateSystem,
  HELIOPAUSE,
  homePlanet,
  install,
  isDepleted,
  jump,
  launchHop,
  listBodies,
  materials,
  score,
  startRun,
  starSystemNumber,
  type Run,
} from './index.ts';
import { homeMoon, plan, withDeltaV, withJumpDrive } from './testing.ts';

/** `from` flown out to the Heliopause with Fuel to spare: the Run waiting there for the Jump. */
function atHeliopause(from: Run): Run {
  const ready = withJumpDrive(from);
  const roomy = withDeltaV(ready, plan(ready, HELIOPAUSE).totalEstimate * 1.3);
  const launched = launchHop(roomy, HELIOPAUSE);
  if (launched.kind !== 'flown' || launched.run.status.kind !== 'at-heliopause') {
    throw new Error('Expected the Hop to reach the Heliopause');
  }
  return launched.run;
}

const waiting = atHeliopause(startRun(2026, 'hauler'));

describe('the Jump', () => {
  it("the Jump lands on the next Star System's Home Planet", () => {
    const jumped = jump(waiting);
    expect(jumped.starSystem).toEqual(generateSystem(2026, 2));
    expect(jumped.status).toEqual({ kind: 'landed', bodyId: jumped.starSystem.homePlanetId });
    expect(currentBody(jumped)).toEqual(homePlanet(jumped.starSystem));
  });

  it('the Jump raises the difficulty level', () => {
    const jumped = jump(waiting);
    expect(starSystemNumber(waiting)).toBe(1);
    expect(starSystemNumber(jumped)).toBe(2);
    // One Star System escaped, and the next Jump Drive costs more.
    expect(score(jumped).starSystemsEscaped).toBe(1);
    expect(componentCost('jump-drive', starSystemNumber(jumped))).toBeGreaterThan(
      componentCost('jump-drive', starSystemNumber(waiting)),
    );
  });

  it('the Jump keeps Components except the Jump Drive', () => {
    // A Drill in Slot 3 and the Jump Drive in Slot 4: the Jump burns out only the Jump Drive.
    const drilled = install(
      { ...startRun(2026, 'hauler'), materials: materials(1_000) },
      2,
      'drill-1',
    );
    if (drilled.kind !== 'installed') throw new Error('Expected an install');
    const before = atHeliopause(drilled.run);
    expect(before.spacecraft.slots).toEqual(['engine-1', 'fuel-tank-1', 'drill-1', 'jump-drive']);
    const jumped = jump(before);
    expect(jumped.spacecraft.slots).toEqual(['engine-1', 'fuel-tank-1', 'drill-1', null]);
    expect(carriesJumpDrive(jumped.spacecraft)).toBe(false);
    // Burnt out, not removed: no Materials come back for it.
    expect(jumped.materials).toBe(before.materials);
    // Without the Jump Drive the Spacecraft is lighter by exactly its mass.
    expect(jumped.spacecraft.dryMass).toBeCloseTo(
      before.spacecraft.dryMass - COMPONENTS['jump-drive'].mass,
    );
  });

  it('the Jump keeps Fuel and Materials', () => {
    const rich = atHeliopause({ ...startRun(2026, 'hauler'), materials: materials(73) });
    expect(rich.spacecraft.fuelMass).toBeGreaterThan(0);
    const jumped = jump(rich);
    expect(jumped.spacecraft.fuelMass).toBe(rich.spacecraft.fuelMass);
    expect(jumped.materials).toBe(materials(73));
    expect(jumped.hopsFlown).toBe(rich.hopsFlown);
  });

  it('every Body of the next Star System still has its yield, whatever was gathered before', () => {
    // Gather on the Home Planet's Moon first: its id is reused by a Body of the next Star System.
    const run = startRun(2026, 'hauler');
    const gathered = launchHop(run, homeMoon(run).id);
    if (gathered.kind !== 'flown') throw new Error('Expected a Hop to the Moon');
    expect(gathered.run.depleted).not.toEqual([]);
    const jumped = jump(atHeliopause(gathered.run));
    for (const body of listBodies(jumped.starSystem)) {
      expect(isDepleted(jumped, body.id)).toBe(false);
    }
  });

  it('the next Home Planet keeps the Home Planet guarantees: Rocky, with Icy Moons', () => {
    const home = homePlanet(jump(waiting).starSystem);
    expect(home.composition).toBe('rocky');
    expect(home.moons.length).toBeGreaterThan(0);
    for (const moon of home.moons) expect(moon.composition).toBe('icy');
  });

  it('only a Run at the Heliopause can Jump', () => {
    expect(() => jump(startRun(2026, 'hauler'))).toThrow(/Heliopause/);
  });

  it('a Run replays identically by seed across two Jumps', () => {
    /** Two Jumps, then a Hop to the third Home Planet's Moon. */
    const play = (seed: number) => {
      const second = jump(atHeliopause(startRun(seed, 'lancer')));
      const third = jump(atHeliopause(second));
      const hop = launchHop(third, homeMoon(third).id);
      return { second, third, hop };
    };
    const first = play(77);
    expect(play(77)).toEqual(first);
    expect(starSystemNumber(first.third)).toBe(3);
    expect(first.third.starSystem).toEqual(generateSystem(77, 3));
    expect(first.third.starSystem.name).not.toBe(first.second.starSystem.name);
    expect(play(78).third.starSystem.name).not.toBe(first.third.starSystem.name);
  });
});
