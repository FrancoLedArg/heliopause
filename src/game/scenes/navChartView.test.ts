import { describe, expect, it } from 'vitest';
import {
  currentBody,
  findBody,
  firstDetectedBody,
  HELIOPAUSE,
  install,
  listBodies,
  materials,
  startRun,
  type HopTarget,
  type Run,
} from '../sim/index.ts';
import {
  BRACKET_GAP,
  chartReducer,
  crossSegments,
  dashedSegments,
  initialChartState,
  layoutChart,
  MARK_BOX,
  moveFocus,
  starfield,
  unsurveyedMarkAt,
  routeEnds,
  TOOLTIP_SIZE,
  tooltipHeight,
  tooltipKindExtra,
  type ChartLayout,
  type ChartNode,
  type ChartState,
  ringSegments,
  stepFocus,
  targetStatus,
  type Direction,
} from './navChartView.ts';
import { heliopauseInRange } from '../sim/testing.ts';
import { edgeMarkers, MAP_AREA, PLAN_MAP_AREA, SCREEN, toScreen } from './navChartMap.ts';

/** A New Run as the player starts it: on its Starting Moon, knowing only the opening. */
const freshRun = (seed: number): Run => startRun(seed, 'scout');

/**
 * A New Run stood on its innermost planet (always rocky), knowing every Body: the layout, focus and
 * label rules are tested on a full chart, from where Runs opened before the Starting Moon (#96).
 */
const newRun = (seed: number): Run => {
  const run = freshRun(seed);
  const ids = listBodies(run.starSystem).map((body) => body.id);
  const [inner] = run.starSystem.planets;
  if (!inner) throw new Error('A Star System has planets');
  return {
    ...run,
    status: { kind: 'landed', bodyId: inner.id },
    knowledge: { detected: ids, surveyed: ids, heliopauseFound: true },
  };
};
const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);

/** The innermost planet's nearest Moon. */
function homeMoon(run: Run) {
  const moon = run.starSystem.planets[0]?.moons[0];
  if (!moon) throw new Error('The innermost planet has a Moon');
  return moon;
}

/** One layout per seed, shared by the sweeps below so each is only worked out once. */
const layouts = new Map<number, ChartLayout>();
function layoutFor(seed: number): ChartLayout {
  const known = layouts.get(seed);
  if (known) return known;
  const layout = layoutChart(newRun(seed));
  layouts.set(seed, layout);
  return layout;
}

describe('what the Nav Chart shows (#96)', () => {
  it('a new Run charts only its Starting Moon, a Gas Giant it orbits, and the one Body Comms Detected', () => {
    for (const seed of SEEDS) {
      const run = freshRun(seed);
      const charted = layoutChart(run).nodes.map((node) => node.body.id);
      const moon = findBody(run.starSystem, run.starSystem.startingMoonId);
      if (moon?.kind !== 'moon') throw new Error('The Starting Moon is a Moon');
      const planet = findBody(run.starSystem, moon.planetId);
      const expected = [moon.id, firstDetectedBody(run.starSystem).id];
      if (planet?.kind === 'gas-giant') expected.push(planet.id);
      expect(charted.sort(), `seed ${seed}`).toEqual(expected.sort());
    }
  });

  it('a Body keeps its place on the chart as the player learns of more', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const fresh = layoutChart(freshRun(seed)).nodes;
      const full = layoutChart({ ...newRun(seed), status: freshRun(seed).status }).nodes;
      for (const node of fresh) {
        const same = full.find((n) => n.body.id === node.body.id);
        expect(same && { x: same.x, y: same.y }).toEqual({ x: node.x, y: node.y });
      }
    }
  });
});

describe('the Nav Chart layout', () => {
  it('places every Body of the Star System once, and the same way for the same seed', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const run = newRun(seed);
      const layout = layoutChart(run);
      expect(layout.nodes.map((n) => n.body.id).sort()).toEqual(
        listBodies(run.starSystem)
          .map((b) => b.id)
          .sort(),
      );
      const again = layoutChart(newRun(seed));
      expect(again.nodes).toEqual(layout.nodes);
      expect(again.heliopauseRadius).toBe(layout.heliopauseRadius);
    }
  });

  it('keeps every Body, drawn at 1x, inside the map and clear of the star and of each other', () => {
    for (const seed of SEEDS) {
      const { nodes, star, world } = layoutFor(seed);
      for (const node of nodes) {
        expect(node.x - node.radius, `seed ${seed} ${node.body.name}`).toBeGreaterThanOrEqual(0);
        expect(node.x + node.radius).toBeLessThanOrEqual(world.width);
        expect(node.y - node.radius).toBeGreaterThanOrEqual(0);
        expect(node.y + node.radius).toBeLessThanOrEqual(world.height);
        expect(Math.hypot(node.x - star.x, node.y - star.y)).toBeGreaterThan(
          star.radius + node.radius,
        );
      }
      for (const [i, a] of nodes.entries()) {
        for (const b of nodes.slice(i + 1)) {
          expect(
            Math.hypot(a.x - b.x, a.y - b.y),
            `seed ${seed}: ${a.body.name} overlaps ${b.body.name}`,
          ).toBeGreaterThan(a.radius + b.radius);
        }
      }
    }
  });

  it('draws planets farther from the star on larger orbit rings, with the Heliopause outside them all', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const run = newRun(seed);
      const layout = layoutChart(run);
      const planets = run.starSystem.planets;
      const byRing = [...planets].sort(
        (a, b) => layout.orbitRadius(a.id) - layout.orbitRadius(b.id),
      );
      expect(byRing.map((p) => p.id)).toEqual(
        [...planets].sort((a, b) => a.distanceFromStar - b.distanceFromStar).map((p) => p.id),
      );
      for (const p of planets) {
        expect(layout.heliopauseRadius).toBeGreaterThan(layout.orbitRadius(p.id));
      }
    }
  });

  it('clips orbit rings and the Heliopause to the map', () => {
    const layout = layoutChart(newRun(3));
    const segments = ringSegments(layout.star, layout.heliopauseRadius, layout.world);
    const { world } = layout;
    expect(segments.length).toBeGreaterThan(0);
    for (const s of segments) {
      for (const [x, y] of [s.from, s.to] as const) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(world.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(world.height);
      }
    }
  });

  it('crosses a Depleted Body with an X that reaches past its sprite, inside the focus brackets', () => {
    const layout = layoutChart(newRun(123));
    for (const node of layout.nodes) {
      const [a, b] = crossSegments(node);
      // Two diagonals through the centre, a shape cue that does not depend on colour.
      expect(a.from[0] + a.to[0]).toBe(2 * node.x);
      expect(a.from[1] + a.to[1]).toBe(2 * node.y);
      expect(b.from[0] + b.to[0]).toBe(2 * node.x);
      expect(b.from[1] + b.to[1]).toBe(2 * node.y);
      for (const [x, y] of [a.from, a.to, b.from, b.to]) {
        // The corners sit 2 px outside the sprite's box and within the bracket corners (radius + 6).
        expect(Math.abs(x - node.x)).toBe(node.radius + 2);
        expect(Math.abs(y - node.y)).toBe(node.radius + 2);
        // The brackets sit at radius + BRACKET_GAP, so the X's corner is clear of them by the difference.
        expect(BRACKET_GAP + node.radius - Math.abs(x - node.x)).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('breaks a route into dashes along the line', () => {
    expect(dashedSegments({ x: 0, y: 0 }, { x: 20, y: 0 }, 4, 2)).toEqual([
      { from: [0, 0], to: [4, 0] },
      { from: [6, 0], to: [10, 0] },
      { from: [12, 0], to: [16, 0] },
      { from: [18, 0], to: [20, 0] },
    ]);
  });
});

describe('choosing a Hop target on the Nav Chart', () => {
  it('rejects a Gas Giant as having no surface, with the reason', () => {
    const run = newRun(5);
    const giant = listBodies(run.starSystem).find((b) => b.kind === 'gas-giant');
    if (!giant) throw new Error('no Gas Giant');
    const status = targetStatus(run, giant.id);
    expect(status).toMatchObject({ valid: false, reason: 'no-surface' });
    expect(status.valid ? '' : status.why).toContain('no surface');
  });

  it('rejects the Body the Spacecraft is on', () => {
    const run = newRun(5);
    expect(targetStatus(run, currentBody(run).id)).toMatchObject({
      valid: false,
      reason: 'current-body',
    });
  });

  it('accepts a Moon of a Gas Giant, and the Moon of the Home Planet', () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const full = newRun(seed);
      const { planets } = full.starSystem;
      const giant = planets.findIndex((p) => p.kind === 'gas-giant');
      const giantMoon = planets[giant]?.moons[0];
      const before = planets[giant - 1];
      if (giantMoon && before) {
        // Stood on the planet before it, so the Moon is within the Hop range (#283).
        const run: Run = { ...full, status: { kind: 'landed', bodyId: before.id } };
        expect(targetStatus(run, giantMoon.id)).toEqual({ valid: true });
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(targetStatus(newRun(5), homeMoon(newRun(5)).id)).toEqual({ valid: true });
  });
});

describe('moving between Bodies with the arrow keys', () => {
  const DIRECTIONS: Direction[] = ['left', 'right', 'up', 'down'];

  it('reaches every Body from the Spacecraft with the arrows and the step keys, whatever the seed', () => {
    for (const seed of SEEDS) {
      const run = newRun(seed);
      const layout = layoutFor(seed);
      const seen = new Set<HopTarget>([currentBody(run).id]);
      const queue: HopTarget[] = [currentBody(run).id];
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        for (const direction of DIRECTIONS) {
          const next = moveFocus(layout, id, direction);
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
        for (const delta of [1, -1] as const) {
          const next = stepFocus(layout, id, delta);
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      // Every Body, and the Heliopause.
      expect(seen.size, `seed ${seed}`).toBe(listBodies(run.starSystem).length + 1);
      expect(seen.has(HELIOPAUSE)).toBe(true);
    }
  });

  it('steps through the Bodies in order out from the star, then the Heliopause, and stops at either end', () => {
    const layout = layoutChart(newRun(9));
    const ids = layout.nodes.map((n) => n.body.id);
    const [first, second] = ids;
    const last = ids.at(-1);
    if (!first || !second || !last) throw new Error('empty chart');
    expect(stepFocus(layout, first, 1)).toBe(second);
    expect(stepFocus(layout, second, -1)).toBe(first);
    expect(stepFocus(layout, first, -1)).toBe(first);
    expect(stepFocus(layout, last, 1)).toBe(HELIOPAUSE);
    expect(stepFocus(layout, HELIOPAUSE, -1)).toBe(last);
    expect(stepFocus(layout, HELIOPAUSE, 1)).toBe(HELIOPAUSE);
  });

  it('moves toward the key pressed, and stays put at the edge', () => {
    const layout = layoutChart(newRun(9));
    for (const node of layout.nodes) {
      const target = layout.nodes.find(
        (n) => n.body.id === moveFocus(layout, node.body.id, 'right'),
      );
      expect(target?.x ?? Infinity).toBeGreaterThanOrEqual(node.x);
    }
    // Past the outermost Body lies the Heliopause, and past it nothing.
    const rightmost = [...layout.nodes].sort((a, b) => b.x - a.x)[0];
    if (!rightmost) throw new Error('empty chart');
    expect(moveFocus(layout, rightmost.body.id, 'right')).toBe(HELIOPAUSE);
    expect(moveFocus(layout, HELIOPAUSE, 'right')).toBe(HELIOPAUSE);
  });
});

describe('the Heliopause on the Nav Chart', () => {
  it('is not on the chart until the Radar finds it: no mark and no focus stop', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const run = freshRun(seed);
      const layout = layoutChart(run);
      expect(layout.heliopause).toBeUndefined();
      let id: HopTarget = currentBody(run).id;
      for (let step = 0; step < 10; step += 1) id = stepFocus(layout, id, 1);
      expect(id).not.toBe(HELIOPAUSE);
    }
  });

  /** The Run with a Jump Drive installed. */
  const withJumpDrive = (run: Run): Run => {
    const result = install({ ...run, materials: materials(100) }, 2, 'jump-drive');
    if (result.kind !== 'installed') throw new Error('Expected an install');
    return result.run;
  };

  it('marks the Heliopause on its ring, on the map and clear of every Body', () => {
    for (const seed of SEEDS) {
      const layout = layoutFor(seed);
      const { heliopause: mark, world } = layout;
      if (!mark) throw new Error('the Heliopause is found on a full chart');
      expect(mark.x - mark.radius - BRACKET_GAP, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      expect(mark.x + mark.radius + BRACKET_GAP).toBeLessThanOrEqual(world.width);
      expect(mark.y - mark.radius - BRACKET_GAP).toBeGreaterThanOrEqual(0);
      expect(mark.y + mark.radius + BRACKET_GAP).toBeLessThanOrEqual(world.height);
      for (const node of layout.nodes) {
        expect(Math.hypot(node.x - mark.x, node.y - mark.y), `seed ${seed}`).toBeGreaterThan(
          node.radius + mark.radius + BRACKET_GAP,
        );
      }
    }
    // Where its ring crosses the chart, the mark sits on it.
    const layout = layoutFor(9);
    const { star, heliopause } = layout;
    if (!heliopause) throw new Error('the Heliopause is found on a full chart');
    // Within a couple of pixels: the spread rounds the mark and the star apart.
    expect(
      Math.abs(Math.hypot(heliopause.x - star.x, heliopause.y - star.y) - layout.heliopauseRadius),
    ).toBeLessThanOrEqual(4);
  });

  it('says why the Heliopause cannot be the target without a Jump Drive', () => {
    const run = heliopauseInRange(newRun(5));
    const status = targetStatus(run, HELIOPAUSE);
    expect(status).toMatchObject({ valid: false, reason: 'no-jump-drive' });
    expect(status.valid ? '' : status.why).toMatch(/Jump Drive/);
    expect(targetStatus(withJumpDrive(run), HELIOPAUSE)).toEqual({ valid: true });
  });

  it('Enter on the focused Heliopause makes it the target only with a Jump Drive', () => {
    const run = heliopauseInRange(newRun(5));
    const layout = layoutChart(run);
    const focused = chartReducer(run, layout, initialChartState(run, layout), {
      kind: 'click',
      id: HELIOPAUSE,
    });
    expect(chartReducer(run, layout, focused, { kind: 'select' }).selectedId).toBeUndefined();
    const ready = withJumpDrive(run);
    expect(chartReducer(ready, layout, focused, { kind: 'select' })).toMatchObject({
      focusedId: HELIOPAUSE,
      selectedId: HELIOPAUSE,
    });
  });
});

describe('the Nav Chart state (#193: no card by default, the card, then the plan)', () => {
  /** Applies commands in turn from the opening state. */
  const after = (run: Run, ...commands: Parameters<typeof chartReducer>[3][]): ChartState => {
    const layout = layoutChart(run);
    return commands.reduce(
      (state, command) => chartReducer(run, layout, state, command),
      initialChartState(run, layout),
    );
  };

  it('opens centred on the Spacecraft, with no card and nothing selected', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const run = freshRun(seed);
      const layout = layoutChart(run);
      const state = initialChartState(run, layout);
      expect(state).toMatchObject({
        focusedId: currentBody(run).id,
        card: false,
        selectedId: undefined,
      });
      const here = layout.nodes.find((n) => n.body.id === currentBody(run).id);
      if (!here) throw new Error('the Spacecraft is on the chart');
      const at = toScreen(state.view, here);
      expect(at.x, `seed ${seed}`).toBeGreaterThan(MAP_AREA.x);
      expect(at.x).toBeLessThan(MAP_AREA.x + MAP_AREA.w);
      expect(at.y).toBeGreaterThan(MAP_AREA.y);
      expect(at.y).toBeLessThan(MAP_AREA.y + MAP_AREA.h);
    }
  });

  it('a click opens the card without choosing a target; Plan Hop then chooses it and closes the card', () => {
    const run = newRun(5);
    const moon = homeMoon(run);
    const carded = after(run, { kind: 'click', id: moon.id });
    expect(carded).toMatchObject({ focusedId: moon.id, card: true, selectedId: undefined });
    expect(after(run, { kind: 'click', id: moon.id }, { kind: 'plan' })).toMatchObject({
      focusedId: moon.id,
      card: false,
      selectedId: moon.id,
    });
  });

  it('Plan Hop on a Body that is no target keeps its card open and the earlier target', () => {
    const run = newRun(5);
    const moon = homeMoon(run);
    const giant = run.starSystem.planets.find((p) => p.kind === 'gas-giant');
    if (!giant) throw new Error('no Gas Giant');
    const state = after(
      run,
      { kind: 'click', id: moon.id },
      { kind: 'plan' },
      { kind: 'click', id: giant.id },
      { kind: 'plan' },
    );
    expect(state).toMatchObject({ focusedId: giant.id, card: true, selectedId: moon.id });
  });

  it('by keyboard: a step opens the next Body’s card, Enter plans the Hop there', () => {
    const run = newRun(5);
    const stepped = after(run, { kind: 'step', delta: 1 });
    expect(stepped.card).toBe(true);
    expect(stepped.focusedId).not.toBe(currentBody(run).id);
    // Enter with no card open opens the focused Body's card first.
    expect(after(run, { kind: 'select' })).toMatchObject({ card: true, selectedId: undefined });
    const moon = homeMoon(run);
    expect(
      after(run, { kind: 'click', id: moon.id }, { kind: 'dismiss' }, { kind: 'select' }),
    ).toMatchObject({ card: true, selectedId: undefined });
    expect(after(run, { kind: 'click', id: moon.id }, { kind: 'select' })).toMatchObject({
      card: false,
      selectedId: moon.id,
    });
  });

  it('a click on empty space or Escape closes the card and keeps the target', () => {
    const run = newRun(5);
    const moon = homeMoon(run);
    const giant = run.starSystem.planets.find((p) => p.kind === 'gas-giant');
    if (!giant) throw new Error('no Gas Giant');
    expect(
      after(
        run,
        { kind: 'click', id: moon.id },
        { kind: 'plan' },
        { kind: 'click', id: giant.id },
        { kind: 'dismiss' },
      ),
    ).toMatchObject({ card: false, selectedId: moon.id, focusedId: giant.id });
  });

  it('panning and zooming move the camera and keep the card and the target', () => {
    const run = newRun(5);
    const moon = homeMoon(run);
    const planned = after(run, { kind: 'click', id: moon.id }, { kind: 'plan' });
    const carded = after(
      run,
      { kind: 'click', id: moon.id },
      { kind: 'plan' },
      { kind: 'click', id: moon.id },
    );
    for (const state of [planned, carded]) {
      const layout = layoutChart(run);
      const panned = chartReducer(run, layout, state, { kind: 'pan', dx: -80, dy: -40 });
      const zoomed = chartReducer(run, layout, panned, { kind: 'zoom', factor: 1.2 });
      for (const moved of [panned, zoomed]) {
        expect(moved.view).not.toEqual(state.view);
        expect({ ...moved, view: undefined }).toEqual({ ...state, view: undefined });
      }
    }
  });

  // Review of #292: the Hop plan's panel (x 444 on) hid the target and "you".
  it('Plan Hop puts the target left of the Hop plan’s panel, and "you" too or an edge marker for it', () => {
    const shown = (at: { x: number; y: number }): boolean =>
      at.x > 0 && at.x < PLAN_MAP_AREA.w && at.y > MAP_AREA.y && at.y < MAP_AREA.y + MAP_AREA.h;
    for (const seed of SEEDS.slice(0, 60)) {
      const run = newRun(seed);
      const layout = layoutChart(run);
      const here = layout.nodes.find((n) => n.body.id === currentBody(run).id);
      for (const node of layout.nodes) {
        if (!targetStatus(run, node.body.id).valid || !here) continue;
        const state = after(run, { kind: 'click', id: node.body.id }, { kind: 'plan' });
        const where = `seed ${String(seed)} ${node.body.name}`;
        expect(shown(toScreen(state.view, node)), where).toBe(true);
        const markers = edgeMarkers(state.view, layout, PLAN_MAP_AREA).map((m) => m.id);
        expect(shown(toScreen(state.view, here)) || markers.includes(here.body.id), where).toBe(
          true,
        );
      }
    }
  });

  it('re-centre brings the Spacecraft back to the middle of the screen', () => {
    const run = newRun(5);
    const layout = layoutChart(run);
    const here = layout.nodes.find((n) => n.body.id === currentBody(run).id);
    if (!here) throw new Error('the Spacecraft is on the chart');
    const opened = initialChartState(run, layout);
    const away = after(run, { kind: 'pan', dx: -600, dy: -300 });
    expect(away.view).not.toEqual(opened.view);
    expect(chartReducer(run, layout, away, { kind: 'recentre' }).view).toEqual(opened.view);
  });

  it('a step to a Body off screen brings it into view', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const run = newRun(seed);
      const layout = layoutChart(run);
      let state = initialChartState(run, layout);
      for (let i = 0; i < layout.nodes.length + 1; i += 1) {
        state = chartReducer(run, layout, state, { kind: 'step', delta: 1 });
        const spot =
          state.focusedId === HELIOPAUSE
            ? layout.heliopause
            : layout.nodes.find((n) => n.body.id === state.focusedId);
        if (!spot) throw new Error('focus is on the map');
        const at = toScreen(state.view, spot);
        expect(at.x, `seed ${seed} ${state.focusedId}`).toBeGreaterThanOrEqual(0);
        expect(at.x).toBeLessThanOrEqual(SCREEN.width);
        expect(at.y).toBeGreaterThanOrEqual(MAP_AREA.y);
        expect(at.y).toBeLessThanOrEqual(MAP_AREA.y + MAP_AREA.h);
      }
    }
  });
});

describe('the route line', () => {
  /**
   * How much of the route shows between the marks: the part of the line from the "you" Body to the target
   * that lies outside the amber ring (radius + 3, plus its 1 px stroke) and outside the box the focus
   * brackets draw round the target (half-size radius + 6), the widest mark a target carries.
   */
  function visibleRun(from: ChartNode, to: ChartNode): number {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const [ux, uy] = [(to.x - from.x) / length, (to.y - from.y) / length];
    const ring = from.radius + 3 + 1;
    const brackets = (to.radius + 6) / Math.max(Math.abs(ux), Math.abs(uy));
    return length - ring - brackets;
  }

  function homeHop(seed: number): [ChartNode, ChartNode] {
    const run = newRun(seed);
    const layout = layoutFor(seed);
    const from = layout.nodes.find((n) => n.body.id === currentBody(run).id);
    const to = layout.nodes.find((n) => n.body.id === homeMoon(run).id);
    if (!from || !to) throw new Error('missing node');
    return [from, to];
  }

  it('leaves at least 6 px of dashes between the "you" ring and the focused target, for every Home Planet and its Moon', () => {
    for (const seed of SEEDS) {
      expect(visibleRun(...homeHop(seed)), `seed ${seed}`).toBeGreaterThanOrEqual(6);
    }
  });

  it('runs from just outside the "you" ring to just outside the target\'s focus brackets', () => {
    for (const seed of [5, 74, 123, 2024]) {
      const [from, to] = homeHop(seed);
      const [a, b] = routeEnds(from, to);
      expect(Math.hypot(a.x - from.x, a.y - from.y), `seed ${seed}`).toBeCloseTo(
        from.radius + 4,
        5,
      );
      expect(Math.max(Math.abs(b.x - to.x), Math.abs(b.y - to.y))).toBeCloseTo(to.radius + 6, 5);
    }
  });
});

describe('the Body tooltip height', () => {
  it('is taller by one line when the Body type wraps, and by the same line with a reason', () => {
    const [short, long] = ['Moon of Zymir', 'Moon of Praespraethaen Prime'];
    expect(tooltipKindExtra(short)).toBe(0);
    expect(tooltipKindExtra(long)).toBe(9);
    expect(tooltipHeight(undefined, 9)).toBe(TOOLTIP_SIZE.h + 9);
    expect(tooltipHeight('Too far for this Spacecraft', 9)).toBe(
      tooltipHeight('Too far for this Spacecraft') + 9,
    );
  });
});

describe('the Nav Chart starfield (#303)', () => {
  const world = { width: 800, height: 600 };

  it('is the same stars for the same seed, and reaches past the map so parallax never shows an edge', () => {
    const a = starfield(123, world);
    expect(starfield(123, world)).toEqual(a);
    expect(starfield(124, world)).not.toEqual(a);
    const stars = a.flatMap((layer) => layer.stars);
    expect(stars.length).toBeGreaterThan(40);
    expect(Math.min(...stars.map((s) => s.x))).toBeLessThan(0);
    expect(Math.max(...stars.map((s) => s.x))).toBeGreaterThan(world.width);
  });

  it('has a far layer and a nearer one that moves more, none stuck to the map', () => {
    const [far, near] = starfield(123, world);
    expect(far?.parallax).toBeLessThan(near?.parallax ?? 0);
    expect(near?.parallax).toBeLessThan(1);
  });
});

describe('the "?" on an Unsurveyed Body (#303)', () => {
  it.each([123, 267, 346])('never touches the focus brackets, at any zoom (seed %i)', (seed) => {
    const layout = layoutChart(startRun(seed, 'scout'));
    for (const zoom of [0.5, 1, 2]) {
      for (const node of layout.nodes) {
        const mark = unsurveyedMarkAt(zoom, node);
        // The bracket square round the Body, relative to the Body's screen position.
        const half = (node.radius + BRACKET_GAP) * zoom + 1;
        const clearRight = mark.dx >= half;
        const clearAbove = mark.dy + MARK_BOX.h <= -half;
        expect(clearRight || clearAbove).toBe(true);
      }
    }
  });
});
