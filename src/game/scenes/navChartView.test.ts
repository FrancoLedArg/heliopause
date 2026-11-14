import { describe, expect, it } from 'vitest';
import { currentBody, listBodies, startRun, type Run } from '../sim/index.ts';
import {
  CHART,
  chartReducer,
  dashedSegments,
  initialChartState,
  layoutChart,
  labelText,
  moveFocus,
  placeLabels,
  placeTooltip,
  routeEnds,
  TOOLTIP_SIZE,
  type Rect,
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

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const insideChart = (r: Rect): boolean =>
  r.x >= 0 && r.y >= 0 && r.x + r.w <= CHART.width && r.y + r.h <= CHART.height;
const touchesCircle = (r: Rect, c: { x: number; y: number; radius: number }): boolean => {
  const dx = Math.max(r.x - c.x, 0, c.x - (r.x + r.w));
  const dy = Math.max(r.y - c.y, 0, c.y - (r.y + r.h));
  return Math.hypot(dx, dy) < c.radius;
};

/**
 * Every Body is focused on the first 30 seeds; on the rest only the first, middle and last Body are, which
 * keeps the sweep fast (it ran past the 5 s limit in CI) while every seed still gets its edges.
 */
function focusSample<T>(ids: readonly T[], seed: number): T[] {
  if (seed <= 30) return [...ids];
  return [ids[0], ids[Math.floor(ids.length / 2)], ids[ids.length - 1]].filter(
    (id): id is T => id !== undefined,
  );
}

describe('Body labels on the Nav Chart', () => {
  it('never overlap each other or a Body, stay on the chart, and always show here, target and focus', () => {
    for (const seed of SEEDS) {
      const run = newRun(seed);
      const layout = layoutChart(run);
      const here = currentBody(run).id;
      const targetId = homeMoon(run).id;
      for (const focused of focusSample(
        layout.nodes.map((n) => n.body.id),
        seed,
      )) {
        for (const target of [undefined, targetId]) {
          const labels = placeLabels(layout, {
            hereId: here,
            targetId: target,
            focusedId: focused,
          });
          const where = `seed ${seed}, focus ${focused}, target ${target ?? 'none'}`;
          for (const id of [here, target, focused]) {
            if (id !== undefined) {
              expect(
                labels.some((l) => l.id === id),
                `${where}: label for ${id}`,
              ).toBe(true);
            }
          }
          for (const [i, a] of labels.entries()) {
            expect(insideChart(a.box), `${where}: ${a.text} inside`).toBe(true);
            for (const b of labels.slice(i + 1)) {
              expect(overlaps(a.box, b.box), `${where}: ${a.text} / ${b.text}`).toBe(false);
            }
            for (const n of [...layout.nodes, { ...layout.star }]) {
              expect(touchesCircle(a.box, n), `${where}: ${a.text} on a Body`).toBe(false);
            }
          }
        }
      }
    }
  });

  it('sit nearest their own Body', () => {
    const run = newRun(123);
    const layout = layoutChart(run);
    const labels = placeLabels(layout, {
      hereId: currentBody(run).id,
      targetId: undefined,
      focusedId: currentBody(run).id,
    });
    for (const label of labels) {
      if (label.id === 'heliopause') continue;
      const own = layout.nodes.find((n) => n.body.id === label.id);
      const centre = { x: label.box.x + label.box.w / 2, y: label.box.y + label.box.h / 2 };
      const distance = (n: { x: number; y: number; radius: number }): number =>
        Math.hypot(centre.x - n.x, centre.y - n.y) - n.radius;
      if (!own) throw new Error(`no node for ${label.id}`);
      const nearest = Math.min(...layout.nodes.map(distance));
      expect(distance(own) - nearest).toBeLessThanOrEqual(24);
    }
  });

  it('writes the name, plus where the Spacecraft is and what the target is', () => {
    const run = newRun(5);
    const here = currentBody(run);
    expect(labelText(here, { hereId: here.id, targetId: undefined, focusedId: here.id })).toBe(
      `${here.name} · you`,
    );
    const moon = homeMoon(run);
    expect(labelText(moon, { hereId: here.id, targetId: moon.id, focusedId: here.id })).toBe(
      `${moon.name} · target`,
    );
  });
});

describe('the Body tooltip', () => {
  it('sits on the chart beside the focused Body without covering it', () => {
    for (const seed of SEEDS) {
      const layout = layoutChart(newRun(seed));
      for (const node of layout.nodes) {
        const box = placeTooltip(layout, node.body.id);
        expect(insideChart(box), `seed ${seed}`).toBe(true);
        expect(box.w).toBe(TOOLTIP_SIZE.w);
        expect(touchesCircle(box, node), `seed ${seed}: tooltip covers ${node.body.name}`).toBe(
          false,
        );
      }
    }
  });
});

describe('the route line', () => {
  it('leaves a clearly visible run between the "you" ring and the target square, even for a planet and its Moon', () => {
    for (const seed of SEEDS) {
      const run = newRun(seed);
      const layout = layoutChart(run);
      const from = layout.nodes.find((n) => n.body.id === currentBody(run).id);
      const to = layout.nodes.find((n) => n.body.id === homeMoon(run).id);
      if (!from || !to) throw new Error('missing node');
      const [a, b] = routeEnds(from, to);
      expect(Math.hypot(b.x - a.x, b.y - a.y), `seed ${seed}`).toBeGreaterThanOrEqual(6);
    }
  });
});
