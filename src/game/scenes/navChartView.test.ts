import { describe, expect, it } from 'vitest';
import { currentBody, listBodies, startRun, type Run } from '../sim/index.ts';
import {
  CHART,
  chartReducer,
  dashedSegments,
  initialChartState,
  layoutChart,
  moveFocus,
  ringSegments,
  stepFocus,
  targetStatus,
  type Direction,
} from './navChartView.ts';

const newRun = (seed: number): Run => startRun(seed, 'scout');
const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);

function homeMoon(run: Run) {
  const moon = run.starSystem.planets.find((p) => p.id === run.starSystem.homePlanetId)?.moons[0];
  if (!moon) throw new Error('Home Planet has no Moon');
  return moon;
}

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

  it('keeps every Body, drawn at 1x, inside the chart and clear of the star and of each other', () => {
    for (const seed of SEEDS) {
      const { nodes, star } = layoutChart(newRun(seed));
      for (const node of nodes) {
        expect(node.x - node.radius, `seed ${seed} ${node.body.name}`).toBeGreaterThanOrEqual(0);
        expect(node.x + node.radius).toBeLessThanOrEqual(CHART.width);
        expect(node.y - node.radius).toBeGreaterThanOrEqual(0);
        expect(node.y + node.radius).toBeLessThanOrEqual(CHART.height);
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

  it('clips orbit rings and the Heliopause to the chart', () => {
    const layout = layoutChart(newRun(3));
    const segments = ringSegments(layout.star, layout.heliopauseRadius);
    expect(segments.length).toBeGreaterThan(0);
    for (const s of segments) {
      for (const [x, y] of [s.from, s.to] as const) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(CHART.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(CHART.height);
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
      const run = newRun(seed);
      const giantMoon = run.starSystem.planets
        .filter((p) => p.kind === 'gas-giant')
        .flatMap((p) => p.moons)[0];
      if (giantMoon) {
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
      const layout = layoutChart(run);
      const seen = new Set([currentBody(run).id]);
      const queue = [currentBody(run).id];
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
      expect(seen.size, `seed ${seed}`).toBe(listBodies(run.starSystem).length);
    }
  });

  it('steps through the Bodies in order out from the star, and stops at either end', () => {
    const layout = layoutChart(newRun(9));
    const ids = layout.nodes.map((n) => n.body.id);
    const [first, second] = ids;
    const last = ids.at(-1);
    if (!first || !second || !last) throw new Error('empty chart');
    expect(stepFocus(layout, first, 1)).toBe(second);
    expect(stepFocus(layout, second, -1)).toBe(first);
    expect(stepFocus(layout, first, -1)).toBe(first);
    expect(stepFocus(layout, last, 1)).toBe(last);
  });

  it('moves toward the key pressed, and stays put at the edge', () => {
    const layout = layoutChart(newRun(9));
    for (const node of layout.nodes) {
      const target = layout.nodes.find(
        (n) => n.body.id === moveFocus(layout, node.body.id, 'right'),
      );
      expect(target?.x ?? Infinity).toBeGreaterThanOrEqual(node.x);
    }
    const rightmost = [...layout.nodes].sort((a, b) => b.x - a.x)[0];
    if (!rightmost) throw new Error('empty chart');
    expect(moveFocus(layout, rightmost.body.id, 'right')).toBe(rightmost.body.id);
  });
});

describe('the Nav Chart state', () => {
  it('opens with focus on the Spacecraft and nothing selected', () => {
    const run = newRun(5);
    expect(initialChartState(run)).toEqual({
      focusedId: currentBody(run).id,
      selectedId: undefined,
    });
  });

  it('selects a valid focused Body, and keeps the old target when the focused one is not valid', () => {
    const run = newRun(5);
    const layout = layoutChart(run);
    const moon = homeMoon(run);
    const giant = run.starSystem.planets.find((p) => p.kind === 'gas-giant');
    if (!giant) throw new Error('no Gas Giant');

    const focusedMoon = chartReducer(run, layout, initialChartState(run), {
      kind: 'focus',
      id: moon.id,
    });
    const selected = chartReducer(run, layout, focusedMoon, { kind: 'select' });
    expect(selected.selectedId).toBe(moon.id);

    const focusedGiant = chartReducer(run, layout, selected, { kind: 'focus', id: giant.id });
    const tried = chartReducer(run, layout, focusedGiant, { kind: 'select' });
    expect(tried).toEqual({ focusedId: giant.id, selectedId: moon.id });
  });

  it('a click focuses and selects a valid Body in one go, and only focuses an invalid one', () => {
    const run = newRun(5);
    const layout = layoutChart(run);
    const moon = homeMoon(run);
    const clicked = chartReducer(run, layout, initialChartState(run), {
      kind: 'click',
      id: moon.id,
    });
    expect(clicked).toEqual({ focusedId: moon.id, selectedId: moon.id });

    const here = currentBody(run).id;
    expect(chartReducer(run, layout, clicked, { kind: 'click', id: here })).toEqual({
      focusedId: here,
      selectedId: moon.id,
    });
  });
});
