// Pure view rules for the Nav Chart: where each Body sits on the chart, how the arrow keys move
// between them, and which Bodies may be chosen as a Hop target. No Phaser here, so the scene and the
// React panel stay thin and these rules are tested in Node. Whether a Body is a valid target is
// the simulation's rule (`planHop`); nothing here re-implements it.
import {
  currentBody,
  planHop,
  type Body,
  type BodyId,
  type InvalidTargetReason,
  type Planet,
  type Run,
} from '../sim/index.ts';
import { SPRITE_SIZE } from './landedView.ts';

/** The chart area on screen, in pixels (wireframe v2: inside the holo panel, left of the Hop plan). */
export const CHART = { x: 18, y: 80, width: 412, height: 220 } as const;

interface Point {
  readonly x: number;
  readonly y: number;
}

/** One Body on the chart: its centre in chart pixels and the radius of its 1x sprite. */
export interface ChartNode {
  readonly body: Body;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface ChartLayout {
  readonly star: Point & { readonly radius: number };
  /** Every Body, planets in order out from the star, each followed by its Moons. */
  readonly nodes: readonly ChartNode[];
  /** The orbit ring of a planet, in chart pixels from the star. */
  orbitRadius(planetId: BodyId): number;
  readonly heliopauseRadius: number;
}

/** The star sits near the left edge so the system opens out to the right. */
const STAR: ChartLayout['star'] = { x: 34, y: CHART.height / 2, radius: SPRITE_SIZE.star / 2 };
/** Gameplay tuning: the first orbit ring, clear of the star and the Home Planet's Moons. */
const INNER_RING = 62;
/** Gameplay tuning: the Heliopause ring when the planets leave room; it moves out to clear them. */
const MIN_HELIOPAUSE = 328;
/** Gameplay tuning: how far apart outward distances look (1 would be linear; smaller spreads inner planets). */
const DISTANCE_EXPONENT = 0.4;
/** Pixels kept clear between two Bodies (or a Body and the star). */
const GAP = 3;
/** Moons hang on a small ring round their planet: gap, then a little growth per extra Moon. */
const MOON_RING_GAP = 20;
const MOON_RING_GROWTH = 3;
const ANGLE_STEP = (2 * Math.PI) / 180;

const spriteRadius = (body: Body): number => SPRITE_SIZE[body.kind] / 2;

function moonRing(planetRadius: number, index: number): number {
  return planetRadius + MOON_RING_GAP + index * MOON_RING_GROWTH;
}

/** How far round its planet a ring of Moons is turned when the first try overlaps something. */
const MOON_TURNS = 8;

/**
 * Lays the Star System out as a chart: the star at the left, each planet on its own orbit ring (farther
 * from the star means a larger ring), and Moons beside their planet. A planet's angle follows its
 * orbit angle, nudged round its ring (and its Moons turned round it) until every sprite clears the chart
 * edge and every other Body. The same Star System always gives the same chart.
 */
export function layoutChart(run: Run): ChartLayout {
  const system = run.starSystem;
  const planets = [...system.planets].sort(
    (a, b) => a.distanceFromStar - b.distanceFromStar || a.id.localeCompare(b.id),
  );
  const nodes: ChartNode[] = [];
  const rings = new Map<BodyId, number>();
  let previousRing = 0;

  for (const planet of planets) {
    const fraction = (planet.distanceFromStar / system.heliopauseRadius) ** DISTANCE_EXPONENT;
    let ring = Math.max(
      Math.round(INNER_RING + (MIN_HELIOPAUSE - INNER_RING) * fraction),
      previousRing + 1,
    );

    // Walk the planet outward until some angle on its ring (and some turn of its Moons) is free.
    let cluster: ChartNode[] | undefined;
    for (; cluster === undefined; ring += 2) {
      if (ring > CHART.width) throw new Error(`Nav Chart has no room for ${planet.name}`);
      const widest = Math.asin(Math.min(1, CHART.height / 2 / ring));
      const home = (wrapAngle(planet.orbitAngle) / Math.PI) * widest;
      for (let step = 0; cluster === undefined && step * ANGLE_STEP <= widest * 2; step += 1) {
        for (const sign of step === 0 ? [1] : [1, -1]) {
          const angle = home + sign * step * ANGLE_STEP;
          if (Math.abs(angle) > widest) continue;
          const at = {
            x: Math.round(STAR.x + ring * Math.cos(angle)),
            y: Math.round(STAR.y + ring * Math.sin(angle)),
          };
          for (let turn = 0; turn < MOON_TURNS; turn += 1) {
            const candidate = clusterAt(planet, at, (turn * 2 * Math.PI) / MOON_TURNS);
            if (fits(candidate, nodes)) {
              cluster = candidate;
              break;
            }
          }
          if (cluster) break;
        }
      }
    }
    ring -= 2;
    previousRing = ring;
    rings.set(planet.id, ring);
    nodes.push(...cluster);
  }

  return {
    star: STAR,
    nodes,
    orbitRadius(planetId) {
      const ring = rings.get(planetId);
      if (ring === undefined) throw new Error(`Nav Chart has no orbit ring for ${planetId}`);
      return ring;
    },
    heliopauseRadius: Math.max(MIN_HELIOPAUSE, previousRing + 30),
  };
}

/** An angle turned into the range -π to π, so a planet's orbit angle spreads planets over the whole chart height. */
function wrapAngle(angle: number): number {
  const turn = 2 * Math.PI;
  return ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
}

/** A planet at `at` and its Moons evenly round it, the first at `turn` plus its own orbit angle. */
function clusterAt(planet: Planet, at: Point, turn: number): ChartNode[] {
  const own = spriteRadius(planet);
  const [first] = planet.moons;
  const moons = planet.moons.map((moon, index): ChartNode => {
    const angle = (first?.orbitAngle ?? 0) + turn + (index * 2 * Math.PI) / planet.moons.length;
    const distance = moonRing(own, index);
    return {
      body: moon,
      x: Math.round(at.x + distance * Math.cos(angle)),
      y: Math.round(at.y + distance * Math.sin(angle)),
      radius: spriteRadius(moon),
    };
  });
  return [{ body: planet, x: at.x, y: at.y, radius: own }, ...moons];
}

/** Every sprite of a cluster is on the chart, off the star, and clear of the Bodies already placed. */
function fits(cluster: readonly ChartNode[], placed: readonly ChartNode[]): boolean {
  return cluster.every(
    (n) =>
      n.x - n.radius >= 0 &&
      n.x + n.radius <= CHART.width &&
      n.y - n.radius >= 0 &&
      n.y + n.radius <= CHART.height &&
      Math.hypot(n.x - STAR.x, n.y - STAR.y) > STAR.radius + n.radius + GAP &&
      placed.every((o) => Math.hypot(n.x - o.x, n.y - o.y) > o.radius + n.radius + GAP),
  );
}

/** A straight piece of a line, in chart pixels. */
export interface Segment {
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
}

/** The part of a circle round the star that lies on the chart, as short straight segments. */
export function ringSegments(centre: Point, radius: number): Segment[] {
  const inside = (x: number, y: number): boolean =>
    x >= 0 && x <= CHART.width && y >= 0 && y <= CHART.height;
  const steps = Math.max(24, Math.ceil((2 * Math.PI * radius) / 4));
  const segments: Segment[] = [];
  let previous: [number, number] | undefined;
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * 2 * Math.PI;
    const point: [number, number] = [
      Math.round(centre.x + radius * Math.cos(angle)),
      Math.round(centre.y + radius * Math.sin(angle)),
    ];
    if (previous && inside(...previous) && inside(...point)) {
      segments.push({ from: previous, to: point });
    }
    previous = point;
  }
  return segments;
}

/**
 * The ends of the route line: from the edge of the "you" ring to the edge of the target square, so even
 * a short Hop (a planet to its Moon) shows a clear run of dashes between the two marks.
 */
export function routeEnds(from: ChartNode, to: ChartNode): [Point, Point] {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const [ux, uy] = [(to.x - from.x) / length, (to.y - from.y) / length];
  const start = from.radius + MARK_GAP;
  const end = to.radius + MARK_GAP + 1;
  return [
    { x: from.x + ux * start, y: from.y + uy * start },
    { x: to.x - ux * end, y: to.y - uy * end },
  ];
}

/** Pixels between a Body's sprite and the ring or square round it. */
export const MARK_GAP = 3;

/** A line from `a` to `b` cut into dashes of `dash` pixels with `gap` pixels between them. */
export function dashedSegments(a: Point, b: Point, dash: number, gap: number): Segment[] {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length === 0) return [];
  const [ux, uy] = [(b.x - a.x) / length, (b.y - a.y) / length];
  const at = (t: number): [number, number] => [a.x + ux * t, a.y + uy * t];
  const segments: Segment[] = [];
  for (let start = 0; start < length; start += dash + gap) {
    segments.push({ from: at(start), to: at(Math.min(start + dash, length)) });
  }
  return segments;
}

/** Whether a Body can be chosen as the Hop target, and if not, why, in the simulation's own words. */
export type TargetStatus =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: InvalidTargetReason; readonly why: string };

export function targetStatus(run: Run, id: BodyId): TargetStatus {
  const result = planHop(run, id);
  return result.kind === 'planned'
    ? { valid: true }
    : { valid: false, reason: result.reason, why: result.why };
}

export type Direction = 'left' | 'right' | 'up' | 'down';

const HEADING: Record<Direction, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

/**
 * The Body an arrow key moves focus to: the nearest one in that direction, counting sideways
 * distance double so a key follows its own line. At the edge of the chart focus stays put.
 */
export function moveFocus(layout: ChartLayout, from: BodyId, direction: Direction): BodyId {
  const origin = layout.nodes.find((n) => n.body.id === from);
  if (!origin) return from;
  const heading = HEADING[direction];
  let best: { id: BodyId; score: number } | undefined;
  for (const node of layout.nodes) {
    if (node === origin) continue;
    const dx = node.x - origin.x;
    const dy = node.y - origin.y;
    const along = dx * heading.x + dy * heading.y;
    if (along <= 0) continue;
    const across = Math.abs(dx * heading.y - dy * heading.x);
    const score = along + 2 * across;
    if (!best || score < best.score || (score === best.score && node.body.id < best.id)) {
      best = { id: node.body.id, score };
    }
  }
  return best?.id ?? from;
}

/** The next (`1`) or previous (`-1`) Body in order out from the star, each planet before its Moons. */
export function stepFocus(layout: ChartLayout, from: BodyId, delta: 1 | -1): BodyId {
  const index = layout.nodes.findIndex((n) => n.body.id === from);
  return layout.nodes[index + delta]?.body.id ?? from;
}

/** What the Nav Chart is showing: the Body focus is on, and the chosen target, if any. */
export interface ChartState {
  readonly focusedId: BodyId;
  readonly selectedId: BodyId | undefined;
}

/** What can happen to the chart: keys, or the mouse. */
export type ChartCommand =
  | { readonly kind: 'move'; readonly direction: Direction }
  | { readonly kind: 'step'; readonly delta: 1 | -1 }
  | { readonly kind: 'select' }
  | { readonly kind: 'focus'; readonly id: BodyId }
  | { readonly kind: 'click'; readonly id: BodyId };

/** Opens with focus on the Body the Spacecraft is on, nothing chosen. */
export function initialChartState(run: Run): ChartState {
  return { focusedId: currentBody(run).id, selectedId: undefined };
}

/**
 * Applies a command. Choosing a Body that is not a valid target changes nothing but focus: the panel
 * shows the reason for the focused Body, and any earlier target stays.
 */
export function chartReducer(
  run: Run,
  layout: ChartLayout,
  state: ChartState,
  command: ChartCommand,
): ChartState {
  switch (command.kind) {
    case 'move':
      return { ...state, focusedId: moveFocus(layout, state.focusedId, command.direction) };
    case 'step':
      return { ...state, focusedId: stepFocus(layout, state.focusedId, command.delta) };
    case 'focus':
      return { ...state, focusedId: command.id };
    case 'select':
      return choose(run, state, state.focusedId);
    case 'click':
      return choose(run, { ...state, focusedId: command.id }, command.id);
  }
}

function choose(run: Run, state: ChartState, id: BodyId): ChartState {
  return targetStatus(run, id).valid ? { ...state, selectedId: id } : state;
}

/** A box on the chart, in chart pixels. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** What the labels depend on: where the Spacecraft is, the chosen target and the Body in focus. */
export interface LabelContext {
  readonly hereId: BodyId;
  readonly targetId: BodyId | undefined;
  readonly focusedId: BodyId;
}

export interface PlacedLabel {
  readonly id: BodyId | 'heliopause';
  readonly text: string;
  /** The text as drawn: one line, or the name over its "you" / "target" note when that fits better. */
  readonly lines: readonly string[];
  readonly kind: 'here' | 'target' | 'focused' | 'planet' | 'heliopause';
  readonly box: Rect;
}

/** Silkscreen at 8 px: measured advance per character, rounded up (gameplay tuning, kept generous). */
export const LABEL = { charWidth: 6, height: 8 } as const;

/** The label text: the Body's name, then "you" or "target" where that applies. */
export function labelText(body: Body, context: LabelContext): string {
  if (body.id === context.hereId) return `${body.name} · you`;
  if (body.id === context.targetId) return `${body.name} · target`;
  return body.name;
}

const circleTouchesBox = (c: Point & { radius: number }, r: Rect, margin: number): boolean => {
  const dx = Math.max(r.x - c.x, 0, c.x - (r.x + r.w));
  const dy = Math.max(r.y - c.y, 0, c.y - (r.y + r.h));
  return Math.hypot(dx, dy) < c.radius + margin;
};

const boxesTouch = (a: Rect, b: Rect, margin: number): boolean =>
  a.x < b.x + b.w + margin &&
  b.x < a.x + a.w + margin &&
  a.y < b.y + b.h + margin &&
  b.y < a.y + a.h + margin;

const clampBox = (box: Rect): Rect => ({
  ...box,
  x: Math.min(Math.max(box.x, 0), CHART.width - box.w),
  y: Math.min(Math.max(box.y, 0), CHART.height - box.h),
});

/** Pixels a label keeps from any Body: room for the focus brackets and the ring or square round it. */
const BODY_CLEARANCE = 6;

/** Angles to try round a Body, best first: below, above, right, left, then the corners and in between. */
const SPOT_ANGLES = [90, 270, 0, 180, 45, 135, 315, 225, 60, 120, 240, 300, 20, 160, 200, 340];

/** Spots for a box of `w` x `h` round a Body, nearest first: the box's nearest edge `d` pixels off the Body. */
function spotsAround(node: ChartNode, w: number, h: number): Rect[] {
  const spots: Rect[] = [];
  for (const d of [3, 8, 16, 26, 40, 56, 76]) {
    for (const degrees of SPOT_ANGLES) {
      const angle = (degrees * Math.PI) / 180;
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      const reach = node.radius + d;
      const cx = node.x + cos * (reach + (w / 2) * Math.abs(cos));
      const cy = node.y + sin * (reach + (h / 2) * Math.abs(sin));
      spots.push({ x: cx - w / 2, y: cy - h / 2, w, h });
    }
  }
  return spots.map(clampBox).map((box) => ({ ...box, x: Math.round(box.x), y: Math.round(box.y) }));
}

/**
 * Where each label goes. Every label sits beside its own Body, on a spot that touches no other label and no
 * Body. The Spacecraft's Body, the target and the focused Body always get a label (they take the
 * least-bad spot if every clear one is taken); the Heliopause and the other planets are drawn only
 * when a clear spot exists. Same chart and focus, same labels.
 */
export function placeLabels(layout: ChartLayout, context: LabelContext): PlacedLabel[] {
  const bodies = [layout.star, ...layout.nodes];
  const placed: PlacedLabel[] = [];
  const clear = (box: Rect, margin: number = BODY_CLEARANCE): boolean =>
    placed.every((l) => !boxesTouch(l.box, box, 1)) &&
    bodies.every((b) => !circleTouchesBox(b, box, margin));
  const clashes = (box: Rect): number => placed.filter((l) => boxesTouch(l.box, box, 1)).length;

  interface Option {
    readonly lines: readonly string[];
    readonly box: Rect;
  }
  const place = (
    id: PlacedLabel['id'],
    text: string,
    kind: PlacedLabel['kind'],
    options: readonly Option[],
    required: boolean,
  ): void => {
    // Roomy spots first; a required label settles for any spot that touches nothing.
    const free =
      options.find((o) => clear(o.box)) ??
      (required ? options.find((o) => clear(o.box, 1)) : undefined);
    const pick =
      free ??
      (required ? [...options].sort((a, b) => clashes(a.box) - clashes(b.box))[0] : undefined);
    if (pick) placed.push({ id, text, kind, lines: pick.lines, box: pick.box });
  };

  /** One-line spots round a Body first; then, for a name with a note, the same on two lines. */
  const optionsFor = (node: ChartNode, text: string, name: string): Option[] => {
    const oneLine = spotsAround(node, text.length * LABEL.charWidth, LABEL.height).map((box) => ({
      lines: [text],
      box,
    }));
    if (text === name) return oneLine;
    const note = text.slice(name.length + 3);
    const width = Math.max(name.length, note.length) * LABEL.charWidth;
    const twoLines = spotsAround(node, width, 2 * LABEL.height + 1).map((box) => ({
      lines: [name, note],
      box,
    }));
    return [...oneLine, ...twoLines];
  };

  const shown = new Set<BodyId>();
  const labelFor = (id: BodyId | undefined, kind: PlacedLabel['kind']): void => {
    if (id === undefined || shown.has(id)) return;
    const node = layout.nodes.find((n) => n.body.id === id);
    if (!node) return;
    shown.add(id);
    const text = labelText(node.body, context);
    place(id, text, kind, optionsFor(node, text, node.body.name), true);
  };
  labelFor(context.hereId, 'here');
  labelFor(context.targetId, 'target');
  labelFor(context.focusedId, 'focused');

  // The Heliopause label hangs just inside its ring, wherever there is room along it.
  const w = 'heliopause'.length * LABEL.charWidth;
  const ringOptions: Option[] = [];
  for (const dy of [0, -14, 14, -28, 28, -42, 42, -56, 56, -70, 70, -84, 84]) {
    const ringX = layout.star.x + Math.sqrt(layout.heliopauseRadius ** 2 - dy * dy);
    const box = {
      x: Math.round(ringX - 4 - w),
      y: Math.round(layout.star.y + dy - LABEL.height / 2),
      w,
      h: LABEL.height,
    };
    if (insideBox(box)) ringOptions.push({ lines: ['Heliopause'], box });
  }
  place('heliopause', 'Heliopause', 'heliopause', ringOptions, false);

  for (const node of layout.nodes) {
    if (node.body.kind === 'moon' || shown.has(node.body.id)) continue;
    const text = labelText(node.body, context);
    place(node.body.id, text, 'planet', optionsFor(node, text, node.body.name), false);
  }
  return placed;
}

const insideBox = (r: Rect): boolean =>
  r.x >= 0 && r.y >= 0 && r.x + r.w <= CHART.width && r.y + r.h <= CHART.height;

/** Width of the Body tooltip, and its height with and without the line saying why a Body is not a target. */
export const TOOLTIP_SIZE = { w: 150, h: 58, hWithReason: 86 } as const;

/**
 * Where the focused Body's tooltip goes: on the chart, never over the Body itself, as near it as it can
 * be while hiding the fewest other Bodies and labels (`labels`, the boxes already placed).
 */
export function placeTooltip(
  layout: ChartLayout,
  id: BodyId,
  height: number = TOOLTIP_SIZE.h,
  labels: readonly Rect[] = [],
): Rect {
  const node = layout.nodes.find((n) => n.body.id === id);
  if (!node) throw new Error(`Nav Chart has no Body ${id}`);
  const w = TOOLTIP_SIZE.w;
  const h = height;
  // Every spot on an 8 px grid that leaves the focused Body in view; the cheapest, then the closest, wins.
  const others = [layout.star, ...layout.nodes.filter((n) => n !== node)];
  const cost = (box: Rect): number =>
    others.filter((n) => circleTouchesBox(n, box, 0)).length * 3 +
    labels.filter((l) => boxesTouch(l, box, 0)).length * 2 +
    Math.hypot(box.x + w / 2 - node.x, box.y + h / 2 - node.y) / 100;
  let best: Rect | undefined;
  for (let y = 0; y <= CHART.height - h; y += 8) {
    for (let x = 0; x <= CHART.width - w; x += 8) {
      const box = { x, y, w, h };
      if (circleTouchesBox(node, box, 6)) continue;
      if (!best || cost(box) < cost(best)) best = box;
    }
  }
  if (!best) throw new Error(`Nav Chart has no room for a tooltip beside ${node.body.name}`);
  return { ...best, x: Math.round(best.x), y: Math.round(best.y) };
}
