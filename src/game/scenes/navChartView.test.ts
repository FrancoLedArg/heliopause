import { beforeAll, describe, expect, it } from 'vitest';
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
  tooltipHeight,
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

const newRun = (seed: number): Run => startRun(seed, 'scout');
const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);

function homeMoon(run: Run) {
  const moon = run.starSystem.planets.find((p) => p.id === run.starSystem.homePlanetId)?.moons[0];
  if (!moon) throw new Error('Home Planet has no Moon');
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
      if (fromRing > 8 || fromRing < 0) problems.push(`${where}: Heliopause ${fromRing} px`);
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

  it('keep off every Body even on a chart too full to label well (seed 72, Sonios Minor as the target)', () => {
    const run = newRun(72);
    const layout = layoutFor(72);
    const target = layout.nodes.find((n) => n.body.id === 'planet-7-moon-1');
    if (!target) throw new Error('seed 72 has no planet-7-moon-1');
    const problems = layout.nodes.flatMap((n) =>
      labelClashes(
        chartCase(72, {
          hereId: currentBody(run).id,
          targetId: target.body.id,
          focusedId: n.body.id,
        }),
      ),
    );
    expect(problems.join('\n')).toBe('');
  });

  it('keep Cequyntaen-4 off the Bodies on seed 135 with a far Moon as the target', () => {
    const layout = layoutFor(135);
    const id = (wanted: string) => {
      const node = layout.nodes.find((n) => n.body.id === wanted);
      if (!node) throw new Error(`seed 135 has no ${wanted}`);
      return node.body.id;
    };
    const context = {
      hereId: currentBody(newRun(135)).id,
      focusedId: id('planet-7-moon-3'),
      targetId: id('planet-5-moon-1'),
    };
    const seed135 = chartCase(135, context);
    expect(seed135.labels.map((l) => l.text)).toContain('Cequyntaen-4');
    expect(labelClashes(seed135)).toEqual([]);
    expect(strayLabels(seed135)).toEqual([]);
  });

  it('sit nearer their own Body than any other', () => {
    expect(sampledCases().flatMap(strayLabels).join('\n')).toBe('');
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

  it('sits on the chart and never covers the focused Body, the star, where the Spacecraft is or the target', () => {
    const problems = tooltipCases().flatMap(({ where, layout, context, labels, box }) => {
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
    });
    expect(problems.join('\n')).toBe('');
  });

  it('as the chart opens, sits beside where the Spacecraft is and off the star, on every seed', () => {
    const problems = [...SEEDS, 74, 2024].flatMap((seed) => {
      const run = newRun(seed);
      const layout = layoutFor(seed);
      const context = initialChartState(run);
      const labelContext = { hereId: context.focusedId, targetId: undefined, ...context };
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
