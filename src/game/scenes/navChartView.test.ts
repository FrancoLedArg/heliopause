import { beforeAll, describe, expect, it } from 'vitest';
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
  CHART,
  chartReducer,
  crossSegments,
  dashedSegments,
  initialChartState,
  layoutChart,
  labelText,
  moveFocus,
  placeLabels,
  placeTooltip,
  routeEnds,
  placeYieldMarks,
  TOOLTIP_SIZE,
  tooltipHeight,
  tooltipKindExtra,
  type ChartLayout,
  type ChartNode,
  type LabelContext,
  type PlacedLabel,
  type Rect,
  ringSegments,
  stepFocus,
  targetStatus,
  type Direction,
} from './navChartView.ts';

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
/** The Heliopause's mark on a chart whose Run has found it. */
function markOf(layout: ChartLayout): NonNullable<ChartLayout['heliopause']> {
  if (!layout.heliopause) throw new Error('The Heliopause is not found on this chart');
  return layout.heliopause;
}

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

  it('keeps every Body, drawn at 1x, inside the chart and clear of the star and of each other', () => {
    for (const seed of SEEDS) {
      const { nodes, star } = layoutFor(seed);
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
  it('is not on the chart until the Radar finds it: no ring mark, no focus stop and no label', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const run = freshRun(seed);
      const layout = layoutChart(run);
      expect(layout.heliopause).toBeUndefined();
      const here = homeMoon(run).id;
      let id: HopTarget = here;
      for (let step = 0; step < 10; step += 1) id = stepFocus(layout, id, 1);
      expect(id).not.toBe(HELIOPAUSE);
      const context: LabelContext = { hereId: here, focusedId: here, targetId: undefined };
      expect(placeLabels(layout, context).filter((l) => l.kind === 'heliopause')).toEqual([]);
    }
  });

  /** The Run with a Jump Drive installed. */
  const withJumpDrive = (run: Run): Run => {
    const result = install({ ...run, materials: materials(100) }, 2, 'jump-drive');
    if (result.kind !== 'installed') throw new Error('Expected an install');
    return result.run;
  };

  it('marks the Heliopause on its ring, on the chart and clear of every Body', () => {
    for (const seed of SEEDS) {
      const layout = layoutFor(seed);
      const mark = markOf(layout);
      expect(mark.x - mark.radius - BRACKET_GAP, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      expect(mark.x + mark.radius + BRACKET_GAP).toBeLessThanOrEqual(CHART.width);
      expect(mark.y - mark.radius - BRACKET_GAP).toBeGreaterThanOrEqual(0);
      expect(mark.y + mark.radius + BRACKET_GAP).toBeLessThanOrEqual(CHART.height);
      for (const node of layout.nodes) {
        expect(Math.hypot(node.x - mark.x, node.y - mark.y), `seed ${seed}`).toBeGreaterThan(
          node.radius + mark.radius + BRACKET_GAP,
        );
      }
    }
    // Where its ring crosses the chart, the mark sits on it.
    const layout = layoutFor(9);
    const { star } = layout;
    const heliopause = markOf(layout);
    expect(Math.hypot(heliopause.x - star.x, heliopause.y - star.y)).toBeCloseTo(
      layout.heliopauseRadius,
      -1,
    );
  });

  it('says why the Heliopause cannot be the target without a Jump Drive', () => {
    const run = newRun(5);
    const status = targetStatus(run, HELIOPAUSE);
    expect(status).toMatchObject({ valid: false, reason: 'no-jump-drive' });
    expect(status.valid ? '' : status.why).toMatch(/Jump Drive/);
    expect(targetStatus(withJumpDrive(run), HELIOPAUSE)).toEqual({ valid: true });
  });

  it('Enter on the focused Heliopause makes it the target only with a Jump Drive', () => {
    const run = newRun(5);
    const layout = layoutChart(run);
    const focused = chartReducer(run, layout, initialChartState(run), {
      kind: 'focus',
      id: HELIOPAUSE,
    });
    expect(chartReducer(run, layout, focused, { kind: 'select' }).selectedId).toBeUndefined();
    const ready = withJumpDrive(run);
    expect(chartReducer(ready, layout, focused, { kind: 'select' })).toEqual({
      focusedId: HELIOPAUSE,
      selectedId: HELIOPAUSE,
    });
  });

  it('keeps the labels and the tooltip off the Heliopause mark when it has focus or is the target', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const run = newRun(seed);
      const layout = layoutFor(seed);
      const mark = markOf(layout);
      for (const targetId of [undefined, HELIOPAUSE]) {
        const context = { hereId: currentBody(run).id, targetId, focusedId: HELIOPAUSE };
        const labels = placeLabels(layout, context);
        for (const label of labels) {
          expect(touchesCircle(label.box, mark), `seed ${seed}: ${label.text}`).toBe(false);
        }
        const tip = placeTooltip(layout, context, tooltipHeight('a reason that wraps'), labels);
        expect(insideChart(tip)).toBe(true);
        expect(touchesCircle(tip, { ...mark, radius: mark.radius + BRACKET_GAP })).toBe(false);
      }
    }
  });

  it('always names the Heliopause on the chart, targeted or not, clear of Bodies, marks and labels', () => {
    const problems: string[] = [];
    for (const seed of Array.from({ length: 200 }, (_, i) => i + 1)) {
      const run = newRun(seed);
      const layout = layoutFor(seed);
      const here = currentBody(run).id;
      for (const [targetId, focusedId] of [
        [undefined, here],
        [HELIOPAUSE, here],
        [HELIOPAUSE, HELIOPAUSE],
        [undefined, HELIOPAUSE],
      ] as const) {
        const context = { hereId: here, targetId, focusedId };
        const labels = placeLabels(layout, context);
        const where = `seed ${seed}, target ${targetId ?? 'none'}, focus ${focusedId}`;
        const edge = labels.find((l) => l.kind === 'heliopause');
        if (!edge) {
          problems.push(`${where}: no Heliopause label`);
          continue;
        }
        if (!insideChart(edge.box)) problems.push(`${where}: off the chart`);
        problems.push(...farLabels({ where, layout, context, labels: [edge] }));
        if (touchesCircle(edge.box, markOf(layout))) problems.push(`${where}: on its mark`);
        for (const n of [...layout.nodes, layout.star]) {
          if (touchesCircle(edge.box, n)) problems.push(`${where}: on a Body`);
        }
        for (const other of labels) {
          if (other !== edge && overlaps(other.box, edge.box)) {
            problems.push(`${where}: over ${other.text}`);
          }
        }
      }
    }
    expect(problems.join('\n')).toBe('');
  });

  it('puts a yield icon by every landable Body, on the chart and clear of the labels, and none by a Gas Giant', () => {
    const problems: string[] = [];
    const covered: string[] = [];
    let icons = 0;
    for (const seed of SEEDS.slice(0, 60)) {
      const run = newRun(seed);
      const layout = layoutFor(seed);
      const here = currentBody(run).id;
      const labels = placeLabels(layout, { hereId: here, targetId: undefined, focusedId: here });
      const marks = placeYieldMarks(layout, labels);
      for (const node of layout.nodes) {
        const box = marks.get(node.body.id);
        if (!node.body.landable) {
          if (box) problems.push(`seed ${seed}: ${node.body.name} is a Gas Giant with an icon`);
          continue;
        }
        icons += 1;
        if (!box || !insideChart(box)) {
          problems.push(`seed ${seed}: ${node.body.name}'s icon is off the chart`);
          continue;
        }
        for (const label of labels) {
          if (overlaps(label.box, box)) covered.push(`seed ${seed}: ${label.text} covers an icon`);
        }
      }
    }
    expect(icons).toBeGreaterThan(100);
    expect(problems.join('\n')).toBe('');
    // In the most crowded charts a corner is not always free; that is rare.
    expect(covered.length / icons, covered.join('\n')).toBeLessThan(0.03);
  });

  it('labels the targeted Heliopause as the target', () => {
    const run = newRun(9);
    const context = { hereId: currentBody(run).id, targetId: HELIOPAUSE, focusedId: HELIOPAUSE };
    const label = placeLabels(layoutFor(9), context).find((l) => l.id === 'heliopause');
    expect(label?.text).toBe('Heliopause · target');
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

/** Pixels from a box to the edge of a round sprite; 0 when they touch. */
const edgeDistance = (r: Rect, c: { x: number; y: number; radius: number }): number => {
  const dx = Math.max(r.x - c.x, 0, c.x - (r.x + r.w));
  const dy = Math.max(r.y - c.y, 0, c.y - (r.y + r.h));
  return Math.max(0, Math.hypot(dx, dy) - c.radius);
};

interface ChartCase {
  readonly where: string;
  readonly layout: ChartLayout;
  readonly context: LabelContext;
  readonly labels: readonly PlacedLabel[];
}

function chartCase(seed: number, context: LabelContext): ChartCase {
  const layout = layoutFor(seed);
  return {
    where: `seed ${seed}, focus ${context.focusedId}, target ${context.targetId ?? 'none'}`,
    layout,
    context,
    labels: placeLabels(layout, context),
  };
}

/** Works a list out the first time it is asked for, then hands back the same list. */
function once<T>(make: () => T): () => T {
  let made: { value: T } | undefined;
  return () => (made ??= { value: make() }).value;
}

/**
 * Chart states to check labels on: each seed's sampled focus, with no target, the Home Moon, and one
 * other valid target that changes with the focus, so targets all over the chart get a turn.
 */
const sampledCases = once(() =>
  SEEDS.flatMap((seed) => {
    const run = newRun(seed);
    const ids = layoutFor(seed).nodes.map((n) => n.body.id);
    const moon = homeMoon(run).id;
    const others = ids.filter((id) => id !== moon && targetStatus(run, id).valid);
    return focusSample(ids, seed).flatMap((focusedId, i) =>
      [undefined, moon, others[(seed + i) % others.length]].map((targetId) =>
        chartCase(seed, { hereId: currentBody(run).id, targetId, focusedId }),
      ),
    );
  }),
);

const REVIEW_SEEDS = [5, 74, 123, 135, 2024];

/** Every focus with every valid target (or none), on the seeds the reviews looked at. */
const reviewCases = once(() =>
  REVIEW_SEEDS.flatMap((seed) => {
    const run = newRun(seed);
    const ids = layoutFor(seed).nodes.map((n) => n.body.id);
    const targets = [undefined, ...ids.filter((id) => targetStatus(run, id).valid)];
    return ids.flatMap((focusedId) =>
      targets.map((targetId) =>
        chartCase(seed, { hereId: currentBody(run).id, targetId, focusedId }),
      ),
    );
  }),
);

/** What is wrong with the labels of one chart state: overlaps, Bodies covered, no "you" or "target" label. */
function labelClashes({ where, layout, context, labels }: ChartCase): string[] {
  const problems: string[] = [];
  for (const id of [context.hereId, context.targetId]) {
    if (id !== undefined && !labels.some((l) => l.id === id)) problems.push(`${where}: no ${id}`);
  }
  for (const [i, a] of labels.entries()) {
    if (!insideChart(a.box)) problems.push(`${where}: ${a.text} off the chart`);
    for (const b of labels.slice(i + 1)) {
      if (overlaps(a.box, b.box)) problems.push(`${where}: ${a.text} over ${b.text}`);
    }
    for (const n of [...layout.nodes, layout.star]) {
      if (touchesCircle(a.box, n)) problems.push(`${where}: ${a.text} on a Body`);
    }
  }
  return problems;
}

/** Labels that sit nearer another Body (or the star) than their own, by more than 2 px. */
function strayLabels({ where, layout, labels }: ChartCase): string[] {
  const problems: string[] = [];
  for (const label of labels) {
    if (label.id === 'heliopause') continue;
    const own = layout.nodes.find((n) => n.body.id === label.id);
    if (!own) throw new Error(`no node for ${label.id}`);
    const mine = edgeDistance(label.box, own);
    const nearest = Math.min(
      ...[layout.star, ...layout.nodes.filter((n) => n !== own)].map((n) =>
        edgeDistance(label.box, n),
      ),
    );
    if (mine > nearest + 2) {
      problems.push(`${where}: ${label.text} is ${mine} px from its Body, ${nearest} from another`);
    }
  }
  return problems;
}

/** Planet labels more than 8 px from their planet, and a Heliopause label off its ring. */
function farLabels({ where, layout, labels }: ChartCase): string[] {
  const problems: string[] = [];
  for (const label of labels) {
    if (label.kind === 'heliopause') {
      const { x, y, w, h } = label.box;
      const inside = [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ].map(
        ([cx = 0, cy = 0]) =>
          layout.heliopauseRadius - Math.hypot(cx - layout.star.x, cy - layout.star.y),
      );
      const fromRing = Math.min(...inside);
      // Hanging just inside its ring, or, where the ring has no room, beside its mark.
      const fromMark = edgeDistance(label.box, markOf(layout));
      if ((fromRing > 8 || fromRing < 0) && fromMark > 8) {
        problems.push(
          `${where}: Heliopause ${fromRing} px from its ring, ${fromMark} from its mark`,
        );
      }
    } else if (label.kind === 'planet') {
      const own = layout.nodes.find((n) => n.body.id === label.id);
      if (own && edgeDistance(label.box, own) > 8) problems.push(`${where}: ${label.text}`);
    }
  }
  return problems;
}

describe('Body labels on the Nav Chart', () => {
  // Building the 150 sampled charts takes ~1 s warm and over 4 s on a loaded machine, so it is done
  // once up front under its own generous limit instead of inside the first test's 5 s default.
  beforeAll(() => {
    sampledCases();
    reviewCases();
  }, 60_000);

  it('never overlap each other or a Body, stay on the chart, and always show where the Spacecraft is and the target', () => {
    expect(sampledCases().flatMap(labelClashes).join('\n')).toBe('');
  });

  it('never overlap anything for any target on the review seeds', () => {
    expect(reviewCases().flatMap(labelClashes).join('\n')).toBe('');
  });

  // Re-pinned for #189 (was seed 292's Zarla-2) and #247 (was seed 155's Vutho): generation changed.
  // Seed 86 is the fullest 7-planet chart of the first 400 (29 Bodies), its far Moon Prota the target.
  it('keep off every Body even on a chart too full to label well (seed 86, Prota as the target)', () => {
    const run = newRun(86);
    const layout = layoutFor(86);
    const target = layout.nodes.find((n) => n.body.id === 'planet-7-moon-3');
    if (!target) throw new Error('seed 86 has no planet-7-moon-3');
    const problems = layout.nodes.flatMap((n) =>
      labelClashes(
        chartCase(86, {
          hereId: currentBody(run).id,
          targetId: target.body.id,
          focusedId: n.body.id,
        }),
      ),
    );
    expect(problems.join('\n')).toBe('');
  });

  // Re-pinned for #188: generation changed. Seed 62 shows a planet label with a number suffix,
  // Cioxtaexta-4, with a Gas Giant's Moon in focus and another planet's far Moon as the target.
  it('keep Cioxtaexta-4 off the Bodies on seed 62 with a far Moon as the target', () => {
    const layout = layoutFor(62);
    const id = (wanted: string) => {
      const node = layout.nodes.find((n) => n.body.id === wanted);
      if (!node) throw new Error(`seed 62 has no ${wanted}`);
      return node.body.id;
    };
    const context = {
      hereId: currentBody(newRun(62)).id,
      focusedId: id('planet-7-moon-3'),
      targetId: id('planet-5-moon-1'),
    };
    const seed62 = chartCase(62, context);
    expect(seed62.labels.map((l) => l.text)).toContain('Cioxtaexta-4');
    expect(labelClashes(seed62)).toEqual([]);
    expect(strayLabels(seed62)).toEqual([]);
  });

  it('sit nearer their own Body than any other, all but a very few crowded charts', () => {
    // Since #188 every rocky planet has two Moons, and on a few crowded inner systems a long "you" or
    // "target" label has no spot nearer its own Body (seeds 109, 116 and 120 of 150: the layout keeps
    // room for each Body's label, not for two neighbours' at once). It still never covers anything.
    const cases = sampledCases();
    const strays = cases.filter((c) => strayLabels(c).length > 0);
    expect(strays.length / cases.length, strays.flatMap(strayLabels).join('\n')).toBeLessThan(
      0.005,
    );
    expect(reviewCases().flatMap(strayLabels).join('\n')).toBe('');
  });

  it('label the focused Body too, unless no spot beside it is free (its tooltip names it then)', () => {
    const cases = sampledCases();
    const unlabelled = cases.filter(
      ({ context, labels }) => !labels.some((l) => l.id === context.focusedId),
    );
    expect(unlabelled.length / cases.length).toBeLessThan(0.01);
  });

  it('draw a planet or the Heliopause only right beside it', () => {
    expect(sampledCases().flatMap(farLabels).join('\n')).toBe('');
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
  interface TooltipCase {
    readonly where: string;
    readonly layout: ChartLayout;
    readonly context: LabelContext;
    readonly labels: readonly PlacedLabel[];
    readonly box: Rect;
  }

  /** Every Body of every seed in focus, with the Home Moon as the target, as the panel would show it. */
  const tooltipCases = once(() =>
    SEEDS.flatMap((seed) => {
      const run = newRun(seed);
      const layout = layoutFor(seed);
      return layout.nodes.map((node): TooltipCase => {
        const context = {
          hereId: currentBody(run).id,
          targetId: homeMoon(run).id,
          focusedId: node.body.id,
        };
        const labels = placeLabels(layout, context);
        const status = targetStatus(run, node.body.id);
        const height = tooltipHeight(status.valid ? undefined : status.why);
        return {
          where: `seed ${seed}, focus ${node.body.name}`,
          layout,
          context,
          labels,
          box: placeTooltip(layout, context, height, labels),
        };
      });
    }),
  );

  const nodeOf = (layout: ChartLayout, id: string | undefined) =>
    layout.nodes.find((n) => n.body.id === id);

  // Same as the label cases: built once, under its own limit, not inside the first test's 5 s default.
  beforeAll(() => {
    tooltipCases();
  }, 60_000);

  /**
   * Charts with no clear spot anywhere (#247's generation): a Gas Giant in focus mid-right, its
   * 95 px why too tall for the room above or below it, and the left full of kept marks. There the
   * tooltip falls back to hiding the fewest kept things: one label, never a Body.
   */
  const NO_CLEAR_SPOT = ['seed 117, focus Rupro Minor', 'seed 142, focus Xaezio'];

  /** What a tooltip covers that it must keep in view. */
  const tooltipProblems = ({ where, layout, context, labels, box }: TooltipCase): string[] => {
    const found: string[] = [];
    if (!insideChart(box)) found.push(`${where}: off the chart`);
    if (box.w !== TOOLTIP_SIZE.w) found.push(`${where}: ${box.w} px wide`);
    if (touchesCircle(box, layout.star)) found.push(`${where}: covers the star`);
    for (const id of [context.focusedId, context.hereId, context.targetId]) {
      const node = nodeOf(layout, id);
      if (node && touchesCircle(box, node)) found.push(`${where}: covers ${node.body.name}`);
    }
    for (const label of labels) {
      if ((label.kind === 'here' || label.kind === 'target') && overlaps(box, label.box)) {
        found.push(`${where}: covers the label ${label.text}`);
      }
    }
    return found;
  };

  it('sits on the chart and never covers the focused Body, the star, where the Spacecraft is or the target', () => {
    const problems = tooltipCases()
      .filter(({ where }) => !NO_CLEAR_SPOT.includes(where))
      .flatMap(tooltipProblems);
    expect(problems.join('\n')).toBe('');
  });

  it('on a chart with no clear spot, hides one kept label and never a Body', () => {
    const crowded = tooltipCases().filter(({ where }) => NO_CLEAR_SPOT.includes(where));
    expect(crowded).toHaveLength(NO_CLEAR_SPOT.length);
    for (const problems of crowded.map(tooltipProblems)) {
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/covers the label/);
    }
  });

  it('as the chart opens, sits beside where the Spacecraft is and off the star, on every seed', () => {
    const problems = [...SEEDS, 74, 2024].flatMap((seed) => {
      const run = newRun(seed);
      const layout = layoutFor(seed);
      const context = initialChartState(run);
      const labelContext = { ...context, hereId: currentBody(run).id, targetId: undefined };
      const labels = placeLabels(layout, labelContext);
      const why = targetStatus(run, context.focusedId);
      const box = placeTooltip(
        layout,
        labelContext,
        tooltipHeight(why.valid ? undefined : why.why),
        labels,
      );
      const here = nodeOf(layout, context.focusedId);
      if (!here) throw new Error('no node for the Spacecraft');
      const found: string[] = [];
      if (touchesCircle(box, layout.star)) found.push(`seed ${seed}: covers the star`);
      if (edgeDistance(box, here) > 40)
        found.push(`seed ${seed}: ${edgeDistance(box, here)} px off`);
      return found;
    });
    expect(problems.join('\n')).toBe('');
  });

  it('sits within 40 px of the focused Body, but for the rare spot boxed in by the marks it must not hide', () => {
    const cases = tooltipCases();
    const far = cases.filter(({ layout, context, box }) => {
      const node = nodeOf(layout, context.focusedId);
      if (!node) throw new Error('no focused node');
      return edgeDistance(box, node) > 40;
    });
    expect(far.length / cases.length).toBeLessThan(0.05);
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

  it('clear drops the target and keeps the focus', () => {
    const run = newRun(5);
    const layout = layoutChart(run);
    const moon = homeMoon(run);
    const clicked = chartReducer(run, layout, initialChartState(run), {
      kind: 'click',
      id: moon.id,
    });
    expect(chartReducer(run, layout, clicked, { kind: 'clear' })).toEqual({
      focusedId: moon.id,
      selectedId: undefined,
    });
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
