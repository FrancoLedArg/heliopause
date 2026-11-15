// Pure view rules for the Nav Chart: where each Body sits on the chart, how the arrow keys move
// between them, and which Bodies may be chosen as a Hop target. No Phaser here, so the scene and the
// React panel stay thin and these rules are tested in Node. Whether a Body is a valid target is
// the simulation's rule (`planHop`); nothing here re-implements it.
import {
  currentBody,
  HELIOPAUSE,
  planHop,
  type Body,
  type BodyId,
  type HopTarget,
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

/** Something round on the chart that focus can rest on: its centre in chart pixels and its radius. */
export interface ChartSpot {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** One Body on the chart: its centre in chart pixels and the radius of its 1x sprite. */
export interface ChartNode extends ChartSpot {
  readonly body: Body;
}

export interface ChartLayout {
  readonly star: Point & { readonly radius: number };
  /**
   * Every Body the player knows of (Detected or Surveyed), planets in order out from the star, each
   * followed by its known Moons. Unknown Bodies are not on the chart (#96).
   */
  readonly nodes: readonly ChartNode[];
  /** The orbit ring of a planet, in chart pixels from the star. */
  orbitRadius(planetId: BodyId): number;
  readonly heliopauseRadius: number;
  /** Where the Heliopause can be focused and chosen: a small mark on its ring (see `placeHeliopauseMark`). */
  readonly heliopause: HeliopauseMark;
}

/** The Heliopause's mark on the chart: a small diamond on its ring, focused and targeted like a Body. */
export type HeliopauseMark = ChartSpot;

/** Half the size of the Heliopause's diamond, in pixels. */
export const HELIOPAUSE_MARK_RADIUS = 4;

/** A box on the chart, in chart pixels. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Silkscreen at 8 px: measured advance per character, rounded up (gameplay tuning, kept generous). */
export const LABEL = { charWidth: 6, height: 8 } as const;

/** Pixels between a Body's sprite and the ring or square round it. */
export const MARK_GAP = 3;
/** Pixels between a Body's sprite and the corner brackets that show it has focus. */
export const BRACKET_GAP = 6;
/** Length of each arm of a focus bracket, in pixels. */
export const BRACKET_ARM = 4;

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

const clampToChart = (box: Rect): Rect => ({
  ...box,
  x: Math.min(Math.max(box.x, 0), CHART.width - box.w),
  y: Math.min(Math.max(box.y, 0), CHART.height - box.h),
});

const insideBox = (r: Rect): boolean =>
  r.x >= 0 && r.y >= 0 && r.x + r.w <= CHART.width && r.y + r.h <= CHART.height;

/** Pixels from a box to the edge of a round sprite; 0 when they touch. */
const edgeDistance = (box: Rect, c: Point & { readonly radius: number }): number => {
  const dx = Math.max(box.x - c.x, 0, c.x - (box.x + box.w));
  const dy = Math.max(box.y - c.y, 0, c.y - (box.y + box.h));
  return Math.max(0, Math.hypot(dx, dy) - c.radius);
};

/** The star sits near the left edge so the system opens out to the right. */
const STAR: ChartLayout['star'] = { x: 34, y: CHART.height / 2, radius: SPRITE_SIZE.star / 2 };
/** Gameplay tuning: the first orbit ring, clear of the star and the innermost planet's Moons. */
const INNER_RING = 62;
/** Gameplay tuning: the Heliopause ring when the planets leave room; it moves out to clear them. */
const MIN_HELIOPAUSE = 328;
/** Gameplay tuning: how far apart outward distances look (1 would be linear; smaller spreads inner planets). */
const DISTANCE_EXPONENT = 0.4;
/** Pixels kept clear between two Bodies (or a Body and the star). */
const GAP = 3;
/**
 * Moons hang on a small ring round their planet: a gap, then a little growth per extra Moon. Round a
 * planet with a surface the gap is wider, so a Hop between it and its Moon (either way, even on a
 * diagonal) leaves a run of dashes visible past the "you" ring and the target's focus brackets. Nothing
 * hops to or from a Gas Giant, so its Moons sit closer.
 */
const MOON_RING_GAP = { landable: 30, gasGiant: 20 } as const;
const MOON_RING_GROWTH = 3;
const ANGLE_STEP = (2 * Math.PI) / 180;

const spriteRadius = (body: Body): number => SPRITE_SIZE[body.kind] / 2;

function moonRing(planet: Planet, index: number): number {
  const gap = planet.landable ? MOON_RING_GAP.landable : MOON_RING_GAP.gasGiant;
  return spriteRadius(planet) + gap + index * MOON_RING_GROWTH;
}

/** How far round its planet a ring of Moons is turned when the first try overlaps something. */
const MOON_TURNS = 8;

/**
 * Lays the Star System out as a chart: the star at the left, each planet on its own orbit ring (farther
 * from the star means a larger ring), and Moons beside their planet. A planet's angle follows its
 * orbit angle, nudged round its ring (and its Moons turned round it) until every sprite clears the chart
 * edge and every other Body, and every Body keeps room for its label (see `placeCluster`). The whole Star
 * System is laid out, so a Body keeps its place as the player learns of more, but only known Bodies are
 * on it. The same Star System always gives the same chart.
 */
export function layoutChart(run: Run): ChartLayout {
  const system = run.starSystem;
  const planets = [...system.planets].sort(
    (a, b) => a.distanceFromStar - b.distanceFromStar || a.id.localeCompare(b.id),
  );
  const firstRing = (planet: Planet, previousRing: number): number => {
    const fraction = (planet.distanceFromStar / system.heliopauseRadius) ** DISTANCE_EXPONENT;
    return Math.max(
      Math.round(INNER_RING + (MIN_HELIOPAUSE - INNER_RING) * fraction),
      previousRing + 1,
    );
  };

  // Leaving room for labels can walk planets so far out that a later one has nowhere to go; then the
  // chart is laid out with every planet at its first free spot instead.
  const placements =
    placePlanets(planets, firstRing, true) ?? placePlanets(planets, firstRing, false);
  if (!placements) throw new Error(`Nav Chart has no room for ${system.name}`);

  const known = new Set<BodyId>(run.knowledge.detected);
  const nodes = placements.flatMap((p) => p.cluster).filter((node) => known.has(node.body.id));
  const rings = new Map(placements.map((p) => [p.planet.id, p.ring]));
  const heliopauseRadius = Math.max(MIN_HELIOPAUSE, (placements.at(-1)?.ring ?? 0) + 30);
  return {
    star: STAR,
    nodes,
    orbitRadius(planetId) {
      const ring = rings.get(planetId);
      if (ring === undefined) throw new Error(`Nav Chart has no orbit ring for ${planetId}`);
      return ring;
    },
    heliopauseRadius,
    heliopause: placeHeliopauseMark(nodes, heliopauseRadius),
  };
}

/**
 * The Heliopause's mark: on its ring, as near the star's level as it can be while its focus brackets
 * stay on the chart and clear of every Body. When the ring runs off the chart there, it sits at the
 * right edge instead, the way out of the Star System.
 */
function placeHeliopauseMark(nodes: readonly ChartNode[], ringRadius: number): HeliopauseMark {
  const radius = HELIOPAUSE_MARK_RADIUS;
  const room = radius + BRACKET_GAP;
  const fitsAt = (x: number, y: number): boolean =>
    x - room >= 0 &&
    x + room <= CHART.width &&
    y - room >= 0 &&
    y + room <= CHART.height &&
    nodes.every((n) => Math.hypot(n.x - x, n.y - y) > n.radius + room + GAP);
  for (let step = 0; step * 2 < CHART.height / 2; step += 1) {
    for (const dy of step === 0 ? [0] : [2 * step, -2 * step]) {
      if (Math.abs(dy) >= ringRadius) continue;
      const x = Math.round(STAR.x + Math.sqrt(ringRadius ** 2 - dy ** 2));
      const y = Math.round(STAR.y + dy);
      if (fitsAt(x, y)) return { x, y, radius };
    }
  }
  for (let dy = 0; dy < CHART.height / 2; dy += 2) {
    for (const y of [STAR.y + dy, STAR.y - dy]) {
      if (fitsAt(CHART.width - room, y)) return { x: CHART.width - room, y, radius };
    }
  }
  return { x: CHART.width - room, y: STAR.y, radius };
}

/**
 * Places the planets in order out from the star. With `labelRoom`, each takes the first spot that leaves
 * every Body room for its label; when there is none, the planet before it is moved to let it in, or it
 * takes the spot that leaves the fewest Bodies without room. Without, each takes the first spot that
 * fits. `undefined` when some planet has no spot at all.
 */
function placePlanets(
  planets: readonly Planet[],
  firstRing: (planet: Planet, previousRing: number) => number,
  labelRoom: boolean,
): Placement[] | undefined {
  const placements: Placement[] = [];

  /** Tries the planet before at its next few roomy spots, keeping the first that leaves `planet` one too. */
  const movePlanetBefore = (before: Placement, planet: Planet): Placement[] | undefined => {
    const placed = placements.slice(0, -1).flatMap((p) => p.cluster);
    const others = roomyClusters(before.planet, before.firstRing, placed);
    others.next(); // where it is now
    for (let tries = 0; tries < MOVE_BACK_TRIES; tries += 1) {
      const other = others.next();
      if (other.done) return undefined;
      const next = roomyClusters(planet, firstRing(planet, other.value.ring), [
        ...placed,
        ...other.value.cluster,
      ]).next();
      if (!next.done) return [other.value, next.value];
    }
    return undefined;
  };

  for (const planet of planets) {
    const before = placements.at(-1);
    const start = firstRing(planet, before?.ring ?? 0);
    const placed = placements.flatMap((p) => p.cluster);
    if (!labelRoom) {
      const first = clusters(planet, start, placed).next();
      if (first.done) return undefined;
      placements.push(first.value);
      continue;
    }
    const roomy = roomyClusters(planet, start, placed).next();
    if (!roomy.done) {
      placements.push(roomy.value);
      continue;
    }
    const moved = before && movePlanetBefore(before, planet);
    if (moved) {
      placements.splice(-1, 1, ...moved);
      continue;
    }
    const found = leastCrampedCluster(planet, start, placed);
    if (!found) return undefined;
    placements.push(found);
  }
  return placements;
}

/** Where one planet and its Moons went: the ring it sits on, and the ring its search started from. */
interface Placement {
  readonly planet: Planet;
  readonly cluster: ChartNode[];
  readonly ring: number;
  readonly firstRing: number;
}

/** How many other spots the planet before is tried at when a planet finds no room. */
const MOVE_BACK_TRIES = 24;

/**
 * Every spot for a planet and its Moons that fits on the chart, walking outward from `firstRing` over the
 * angles on each ring and the turns of its Moons.
 */
function* clusters(
  planet: Planet,
  firstRing: number,
  placed: readonly ChartNode[],
  /** Seen first with the planet alone: `false` skips every turn of its Moons there. */
  worth: (cluster: readonly ChartNode[]) => boolean = () => true,
): Generator<Placement> {
  for (let ring = firstRing; ring <= CHART.width; ring += 2) {
    const widest = Math.asin(Math.min(1, CHART.height / 2 / ring));
    const home = (wrapAngle(planet.orbitAngle) / Math.PI) * widest;
    for (let step = 0; step * ANGLE_STEP <= widest * 2; step += 1) {
      for (const sign of step === 0 ? [1] : [1, -1]) {
        const angle = home + sign * step * ANGLE_STEP;
        if (Math.abs(angle) > widest) continue;
        const at = {
          x: Math.round(STAR.x + ring * Math.cos(angle)),
          y: Math.round(STAR.y + ring * Math.sin(angle)),
        };
        const alone = [{ body: planet, ...at, radius: spriteRadius(planet) }];
        if (!fits(alone, placed) || !worth(alone)) continue;
        for (let turn = 0; turn < MOON_TURNS; turn += 1) {
          const cluster = clusterAt(planet, at, (turn * 2 * Math.PI) / MOON_TURNS);
          if (fits(cluster, placed) && worth(cluster)) yield { planet, cluster, ring, firstRing };
        }
      }
    }
  }
}

/** The spots where every Body of the cluster, and every Body near it, keeps room for its label. */
function roomyClusters(
  planet: Planet,
  firstRing: number,
  placed: readonly ChartNode[],
): Generator<Placement> {
  const cramped = crampedBodies(placed);
  // Moons only take room away, so a planet without room on its own rules out every turn of its Moons.
  return clusters(planet, firstRing, placed, (cluster) => cramped(cluster, 1) === 0);
}

/** When no spot leaves room for every label: the spot that leaves the fewest Bodies without. */
function leastCrampedCluster(
  planet: Planet,
  firstRing: number,
  placed: readonly ChartNode[],
): Placement | undefined {
  const cramped = crampedBodies(placed);
  let best: { placement: Placement; cramped: number } | undefined;
  for (const placement of clusters(planet, firstRing, placed)) {
    const count = cramped(placement.cluster, best?.cramped ?? Infinity);
    if (!best || count < best.cramped) best = { placement, cramped: count };
  }
  return best?.placement;
}

/** Pixels between a Body's sprite and the label room kept for it: clear of the focus brackets. */
const ROOM_GAP = BRACKET_GAP + 2;

/**
 * Counts, for a new cluster, how many of its Bodies and of the Bodies already `placed` have no spot left
 * for their label (name over a "target" note, the widest a label gets on two lines) beside them: on the
 * chart and nearer to them than to any other Body. Counting stops at `enough`.
 */
function crampedBodies(
  placed: readonly ChartNode[],
): (cluster: readonly ChartNode[], enough: number) => number {
  // A placed Body's spots against the other placed Bodies stay the same whatever cluster is tried.
  const free = new Map<ChartNode, Rect[]>();
  const freeSpots = (node: ChartNode): Rect[] => {
    const known = free.get(node);
    if (known) return known;
    const spots = roomSpots(node, placed);
    free.set(node, spots);
    return spots;
  };
  const keeps = (box: Rect, node: ChartNode, others: readonly ChartNode[]): boolean => {
    const mine = edgeDistance(box, node);
    return others.every((o) => o === node || edgeDistance(box, o) >= mine);
  };

  return (cluster, enough) => {
    let cramped = 0;
    const all = [...placed, ...cluster];
    for (const node of cluster) {
      if (roomSpots(node, all).length === 0) cramped += 1;
      if (cramped >= enough) return cramped;
    }
    for (const node of placed) {
      const spots = freeSpots(node);
      if (spots.length === 0) continue; // it had none before this cluster either
      if (!spots.some((box) => keeps(box, node, cluster))) cramped += 1;
      if (cramped >= enough) return cramped;
    }
    return cramped;
  };
}

/** The spots beside a Body (right, left, below, above) that are on the chart and nearer it than any other. */
function roomSpots(node: ChartNode, all: readonly ChartNode[]): Rect[] {
  const w = Math.max(node.body.name.length, 'target'.length) * LABEL.charWidth;
  const h = 2 * LABEL.height + 1;
  const out = node.radius + ROOM_GAP;
  const spots: Rect[] = [
    { x: node.x + out, y: node.y - h / 2, w, h },
    { x: node.x - out - w, y: node.y - h / 2, w, h },
    { x: node.x - w / 2, y: node.y + out, w, h },
    { x: node.x - w / 2, y: node.y - out - h, w, h },
    { x: node.x - 2, y: node.y + out, w, h },
    { x: node.x + 2 - w, y: node.y + out, w, h },
    { x: node.x - 2, y: node.y - out - h, w, h },
    { x: node.x + 2 - w, y: node.y - out - h, w, h },
  ];
  // Every spot is ROOM_GAP from its own Body, so only a Body that close to a spot can be nearer to it.
  const reach = out + w + ROOM_GAP + STAR.radius;
  const nearby = [STAR, ...all].filter(
    (o) => o !== node && Math.abs(o.x - node.x) < reach && Math.abs(o.y - node.y) < reach,
  );
  return spots.filter((box) => {
    if (!insideBox(box)) return false;
    const mine = edgeDistance(box, node);
    return nearby.every((o) => edgeDistance(box, o) >= mine);
  });
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
    const distance = moonRing(planet, index);
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
      n.x - n.radius >= STAR.x &&
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

/** The two diagonals of the X that marks a Depleted Body: through its centre, reaching 2 px past its sprite so it shows on a small one, inside the focus brackets. */
export function crossSegments(node: ChartNode): [Segment, Segment] {
  const arm = node.radius + 2;
  const at = (dx: number, dy: number): [number, number] => [node.x + dx, node.y + dy];
  return [
    { from: at(-arm, -arm), to: at(arm, arm) },
    { from: at(-arm, arm), to: at(arm, -arm) },
  ];
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
 * The ends of the route line: from just outside the "you" ring to the edge of the box the focus brackets
 * draw round the target (which holds the target square), so the dashes are never hidden under a mark.
 */
export function routeEnds(from: ChartSpot, to: ChartSpot): [Point, Point] {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const [ux, uy] = [(to.x - from.x) / length, (to.y - from.y) / length];
  const start = from.radius + MARK_GAP + 1;
  // Along the route, a square's edge is farther from its centre than its half-size, most on a diagonal.
  const end = (to.radius + BRACKET_GAP) / Math.max(Math.abs(ux), Math.abs(uy));
  return [
    { x: from.x + ux * start, y: from.y + uy * start },
    { x: to.x - ux * end, y: to.y - uy * end },
  ];
}

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

/** Whether a Body, or the Heliopause, can be chosen as the Hop target, and if not, why, in the simulation's own words. */
export type TargetStatus =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: InvalidTargetReason; readonly why: string };

export function targetStatus(run: Run, id: HopTarget): TargetStatus {
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

/** Everything focus can rest on, in order out from the star: each planet before its Moons, the Heliopause last. */
function focusStops(layout: ChartLayout): { readonly id: HopTarget; readonly at: Point }[] {
  return [
    ...layout.nodes.map((node) => ({ id: node.body.id, at: node })),
    { id: HELIOPAUSE, at: layout.heliopause },
  ];
}

/**
 * The Body (or the Heliopause) an arrow key moves focus to: the nearest one in that direction,
 * counting sideways distance double so a key follows its own line. At the edge of the chart focus
 * stays put.
 */
export function moveFocus(layout: ChartLayout, from: HopTarget, direction: Direction): HopTarget {
  const stops = focusStops(layout);
  const origin = stops.find((stop) => stop.id === from);
  if (!origin) return from;
  const heading = HEADING[direction];
  let best: { id: HopTarget; score: number } | undefined;
  for (const { id, at } of stops) {
    if (id === origin.id) continue;
    const dx = at.x - origin.at.x;
    const dy = at.y - origin.at.y;
    const along = dx * heading.x + dy * heading.y;
    if (along <= 0) continue;
    const across = Math.abs(dx * heading.y - dy * heading.x);
    const score = along + 2 * across;
    if (!best || score < best.score || (score === best.score && id < best.id)) {
      best = { id, score };
    }
  }
  return best?.id ?? from;
}

/** The next (`1`) or previous (`-1`) stop in order out from the star, each planet before its Moons, the Heliopause last. */
export function stepFocus(layout: ChartLayout, from: HopTarget, delta: 1 | -1): HopTarget {
  const stops = focusStops(layout);
  const index = stops.findIndex((stop) => stop.id === from);
  return stops[index + delta]?.id ?? from;
}

/** What the Nav Chart is showing: the Body (or the Heliopause) focus is on, and the chosen target, if any. */
export interface ChartState {
  readonly focusedId: HopTarget;
  readonly selectedId: HopTarget | undefined;
}

/** What can happen to the chart: keys, or the mouse. */
export type ChartCommand =
  | { readonly kind: 'move'; readonly direction: Direction }
  | { readonly kind: 'step'; readonly delta: 1 | -1 }
  | { readonly kind: 'select' }
  /** Cancel the Hop plan: no target. */
  | { readonly kind: 'clear' }
  | { readonly kind: 'focus'; readonly id: HopTarget }
  | { readonly kind: 'click'; readonly id: HopTarget };

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
    case 'clear':
      return { ...state, selectedId: undefined };
    case 'select':
      return choose(run, state, state.focusedId);
    case 'click':
      return choose(run, { ...state, focusedId: command.id }, command.id);
  }
}

function choose(run: Run, state: ChartState, id: HopTarget): ChartState {
  return targetStatus(run, id).valid ? { ...state, selectedId: id } : state;
}

/** What the labels depend on: where the Spacecraft is, the chosen target and the Body in focus. */
export interface LabelContext {
  readonly hereId: BodyId;
  readonly targetId: HopTarget | undefined;
  readonly focusedId: HopTarget;
}

export interface PlacedLabel {
  readonly id: HopTarget;
  readonly text: string;
  /** The text as drawn: one line, or the name over its "you" / "target" note when that fits better. */
  readonly lines: readonly string[];
  readonly kind: 'here' | 'target' | 'focused' | 'planet' | 'heliopause';
  readonly box: Rect;
}

/** The label context for a Run on the chart in `state`. */
export function labelContextOf(run: Run, state: ChartState): LabelContext {
  return { hereId: currentBody(run).id, targetId: state.selectedId, focusedId: state.focusedId };
}

/** The label text: the Body's name, then "you" or "target" where that applies. */
export function labelText(body: Body, context: LabelContext): string {
  if (body.id === context.hereId) return `${body.name} · you`;
  if (body.id === context.targetId) return `${body.name} · target`;
  return body.name;
}
/**
 * What a Body takes up on the chart, its marks included: the sprite (or the ring round it: "you", or a
 * Gas Giant's dots), the target square, and the four corner brackets when it has focus.
 */
interface Footprint {
  readonly circle: Point & { readonly radius: number };
  readonly boxes: readonly Rect[];
}

function footprint(node: ChartNode, context: LabelContext): Footprint {
  const ringed = node.body.id === context.hereId || node.body.kind === 'gas-giant';
  return markFootprint(node, node.body.id, ringed, context);
}

/** The side (px) of a Body's yield icon on the chart: the kit's 32 px icon at five sixteenths. */
export const YIELD_MARK_SIZE = 10;

/**
 * Where each landable Body's yield icon sits on the chart: tucked into a corner of its sprite's square
 * (the upper right if it can, else the lower right, upper left or lower left), on the chart and clear of
 * the labels and of every other Body's sprite. A Gas Giant has no yield, so no icon. Placed after the
 * labels, so the labels (which have enough to do) are not asked to leave room for them. The same chart
 * and labels always give the same icons.
 */
export function placeYieldMarks(
  layout: ChartLayout,
  labels: readonly PlacedLabel[],
): ReadonlyMap<BodyId, Rect> {
  const size = YIELD_MARK_SIZE;
  const marks = new Map<BodyId, Rect>();
  for (const node of layout.nodes) {
    if (!node.body.landable) continue;
    // Tucked into the empty corner of a round sprite's square.
    const reach = Math.round(node.radius * Math.SQRT1_2) + 1;
    const boxes = [
      { x: node.x + reach, y: node.y - reach - size },
      { x: node.x + reach, y: node.y + reach },
      { x: node.x - reach - size, y: node.y - reach - size },
      { x: node.x - reach - size, y: node.y + reach },
    ].map((corner): Rect => ({ ...corner, w: size, h: size }));
    const clear = (box: Rect): boolean =>
      insideBox(box) &&
      labels.every((label) => !boxesTouch(label.box, box, 0)) &&
      layout.nodes.every((other) => other === node || !circleTouchesBox(other, box, 1)) &&
      !circleTouchesBox(layout.star, box, 1);
    const chosen = boxes.find(clear) ?? boxes.find(insideBox) ?? boxes[0];
    if (chosen) marks.set(node.body.id, chosen);
  }
  return marks;
}

/** The Heliopause mark's footprint: its diamond, and the target square and brackets when it has them. */
function heliopauseFootprint(layout: ChartLayout, context: LabelContext): Footprint {
  return markFootprint(layout.heliopause, HELIOPAUSE, false, context);
}

function markFootprint(
  spot: ChartSpot,
  id: HopTarget,
  ringed: boolean,
  context: LabelContext,
): Footprint {
  const boxes: Rect[] = [];
  if (id === context.targetId) {
    const half = spot.radius + MARK_GAP + 1;
    boxes.push({ x: spot.x - half, y: spot.y - half, w: 2 * half, h: 2 * half });
  }
  if (id === context.focusedId) boxes.push(...bracketArms(spot));
  const radius = spot.radius + (ringed ? MARK_GAP + 1 : 0);
  return { circle: { x: spot.x, y: spot.y, radius }, boxes };
}

/** The focus brackets' arms, each a 1 px line, as boxes. */
function bracketArms(node: ChartSpot): Rect[] {
  const half = node.radius + BRACKET_GAP;
  const arms: Rect[] = [];
  for (const [sx, sy] of CORNERS) {
    const [cx, cy] = [node.x + sx * half, node.y + sy * half];
    arms.push({
      x: Math.min(cx, cx - sx * BRACKET_ARM) - 0.5,
      y: cy - 0.5,
      w: BRACKET_ARM + 1,
      h: 1,
    });
    arms.push({
      x: cx - 0.5,
      y: Math.min(cy, cy - sy * BRACKET_ARM) - 0.5,
      w: 1,
      h: BRACKET_ARM + 1,
    });
  }
  return arms;
}

const CORNERS = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
] as const;

const touches = (f: Footprint, box: Rect, margin: number): boolean =>
  circleTouchesBox(f.circle, box, margin) || f.boxes.some((b) => boxesTouch(b, box, margin));

/** Gaps tried between a label and the edge of its Body's sprite; the marks round it rule out the nearest. */
const LABEL_GAPS = [1, 2, 3, 4, 6, 8, 10, 13, 17, 22, 30, 40];
/** Where along its width a label below or above a Body may sit, as a fraction of that width left of centre. */
const SLIDES = Array.from({ length: 9 }, (_, i) => i / 8);

/** Spots for a box of `w` x `h` round a Body: below and above (slid along), right and left, and the corners. */
function spotsAround(node: ChartSpot, w: number, h: number): Rect[] {
  const spots: Rect[] = [];
  for (const gap of LABEL_GAPS) {
    const out = node.radius + gap;
    // Slid along, and just past centre either way (where the layout keeps room for a label).
    for (const x of [...SLIDES.map((s) => node.x - s * w), node.x - 2, node.x + 2 - w]) {
      spots.push({ x, y: node.y + out, w, h });
      spots.push({ x, y: node.y - out - h, w, h });
    }
    for (const slide of [0.5, 0.25, 0.75, 0, 1]) {
      spots.push({ x: node.x + out, y: node.y - slide * h, w, h });
      spots.push({ x: node.x - out - w, y: node.y - slide * h, w, h });
    }
    for (const corner of [out * Math.SQRT1_2, out]) {
      for (const [sx, sy] of CORNERS) {
        spots.push({
          x: sx > 0 ? node.x + corner : node.x - corner - w,
          y: sy > 0 ? node.y + corner : node.y - corner - h,
          w,
          h,
        });
      }
    }
  }
  return spots.map((box) => ({ ...box, x: Math.round(box.x), y: Math.round(box.y) }));
}

/** A spot a label could take, and how far it is from what it names. */
interface LabelOption {
  readonly lines: readonly string[];
  readonly box: Rect;
  /** Pixels from the box to the edge of its own Body (or, for the Heliopause, to its ring). */
  readonly d: number;
}

/** Spots already worked out for a Body and a label text; they depend on nothing else. */
const optionCache = new WeakMap<ChartNode, Map<string, LabelOption[]>>();
/** How far each spot strays toward another Body (see `placeLabels`); it depends only on the chart. */
const strays = new WeakMap<LabelOption, number>();

/** One-line and two-line spots (name over its "you" / "target" note) round a Body together, nearest first. */
function labelOptions(node: ChartNode, text: string): readonly LabelOption[] {
  const known = optionCache.get(node) ?? new Map<string, LabelOption[]>();
  optionCache.set(node, known);
  const cached = known.get(text);
  if (cached) return cached;
  const shapes: { lines: string[]; w: number; h: number }[] = [
    { lines: [text], w: text.length * LABEL.charWidth, h: LABEL.height },
  ];
  if (text !== node.body.name) {
    const note = text.slice(node.body.name.length + 3);
    shapes.push({
      lines: [node.body.name, note],
      w: Math.max(node.body.name.length, note.length) * LABEL.charWidth,
      h: 2 * LABEL.height + 1,
    });
  }
  const options = shapes
    .flatMap(({ lines, w, h }) =>
      spotsAround(node, w, h).map((box) => ({ lines, box, d: edgeDistance(box, node) })),
    )
    .sort((a, b) => a.d - b.d);
  known.set(text, options);
  return options;
}

/** Pixels a label keeps from other Bodies' footprints when it can; 1 px is the least it ever keeps. */
const ROOMY = 4;
/** How much nearer (in pixels) a cramped spot must be to win over a roomy one. */
const CRAMPED_COST = 3;
/** Planet and Heliopause labels are only worth drawing right beside what they name. */
const OPTIONAL_REACH = 8;
/** Pixels a label may sit nearer another Body than its own and still read as its own. */
const STRAY_LEEWAY = 2;
/** Heights (px from the star's level) tried for the Heliopause label along its ring, nearest first. */
const RING_LABEL_STEPS = [
  0,
  ...Array.from({ length: 15 }, (_, i) => (i + 1) * 7).flatMap((d) => [-d, d]),
];
/** For the Heliopause label with nowhere clear: covering another label costs this many marks. */
const LABEL_OVER_LABEL = 10;
/** How much worse than straying a label is when it covers another label or a mark, per thing covered. */
const NOWHERE_CLEAR = 1000;

/**
 * Where each label goes. Every label sits beside its own Body, no more than `STRAY_LEEWAY` nearer any
 * other Body (or the star), and touches no other label, Body or mark. The nearest such spot wins, a roomy
 * one if it is as near as a cramped one. The Spacecraft's Body and the target always get a label (on the
 * spot that strays least if no good one is free, which the layout makes rare). The focused Body gets one
 * when a good spot is free; its tooltip names it either way. The Heliopause and the other planets are
 * drawn only within `OPTIONAL_REACH` of what they name. Same chart and focus, same labels.
 */
export function placeLabels(layout: ChartLayout, context: LabelContext): PlacedLabel[] {
  const marks = new Map(layout.nodes.map((n) => [n, footprint(n, context)]));
  const star: Footprint = { circle: layout.star, boxes: [] };
  const edge = heliopauseFootprint(layout, context);
  let placed: PlacedLabel[] = [];

  /** On the chart, clear of the labels so far and of every footprint (its own Body's by just 1 px). */
  const fits = (box: Rect, own: ChartNode | undefined, margin: number): boolean =>
    insideBox(box) &&
    placed.every((l) => !boxesTouch(l.box, box, margin === 1 ? 1 : 2)) &&
    !touches(star, box, margin) &&
    !touches(edge, box, margin) &&
    layout.nodes.every((n) => !touches(marks.get(n) ?? star, box, n === own ? 1 : margin));
  /** How much nearer a box is to some other Body (or the star) than to its own; 0 when its own is nearest. */
  const stray = (option: LabelOption, own: ChartNode): number => {
    const known = strays.get(option);
    if (known !== undefined) return known;
    // Only a Body nearer than its own matters, so a cheap bound skips most of them.
    const { box, d: mine } = option;
    let nearest = Math.min(mine, edgeDistance(box, layout.star));
    for (const n of layout.nodes) {
      if (n === own) continue;
      const dx = Math.max(box.x - n.x, 0, n.x - (box.x + box.w));
      const dy = Math.max(box.y - n.y, 0, n.y - (box.y + box.h));
      if (Math.max(dx, dy) - n.radius >= nearest) continue;
      nearest = Math.min(nearest, Math.max(0, Math.hypot(dx, dy) - n.radius));
    }
    const by = mine - nearest;
    strays.set(option, by);
    return by;
  };

  /** The nearest option that fits, preferring a roomy one unless a cramped one is clearly nearer. */
  const nearestFit = (
    options: readonly LabelOption[],
    own: ChartNode | undefined,
    ok: (option: LabelOption) => boolean,
    maxD = Infinity,
  ): LabelOption | undefined => {
    let best: { option: LabelOption; cost: number } | undefined;
    for (const option of options) {
      if (option.d > maxD || (best && option.d >= best.cost)) break;
      if (!ok(option) || !fits(option.box, own, 1)) continue;
      const cost = option.d + (fits(option.box, own, ROOMY) ? 0 : CRAMPED_COST);
      if (!best || cost < best.cost) best = { option, cost };
    }
    return best?.option;
  };

  /**
   * Places a label, and says how far it strays: 0 when it found a spot nearer its own Body than any other.
   * A required label with no such spot takes the one that strays least.
   */
  const labelFor = (node: ChartNode, kind: PlacedLabel['kind']): number => {
    const text = labelText(node.body, context);
    // The focused Body's tooltip, beside it, names it too, so its label can be left out when it has no good spot.
    const required = kind === 'here' || kind === 'target';
    const options = labelOptions(node, text);
    const maxD = kind === 'planet' ? OPTIONAL_REACH : Infinity;
    const near = nearestFit(options, node, (option) => stray(option, node) <= STRAY_LEEWAY, maxD);
    if (near) {
      placed.push({ id: node.body.id, text, kind, lines: near.lines, box: near.box });
      return 0;
    }
    if (!required) return 0;
    let least: { option: LabelOption; by: number } | undefined;
    for (const option of options) {
      if (!fits(option.box, node, 1)) continue;
      const by = stray(option, node);
      if (!least || by < least.by) least = { option, by };
    }
    if (!least) {
      // Nowhere clear at all: the spot on the chart that covers the fewest labels and marks, and above
      // all no Body or the star (a label may sit over a ring or bracket, never over a sprite).
      const covers = (box: Rect): number =>
        placed.filter((l) => boxesTouch(l.box, box, 0)).length +
        [star, edge, ...marks.values()].filter((f) => touches(f, box, 0)).length +
        [layout.star, ...layout.nodes].filter((n) => circleTouchesBox(n, box, 0)).length *
          NOWHERE_CLEAR;
      for (const o of options) {
        const box = clampToChart(o.box);
        const option = { ...o, box, d: edgeDistance(box, node) };
        const by = NOWHERE_CLEAR * covers(option.box) + stray(option, node);
        if (!least || by < least.by) least = { option, by };
      }
    }
    if (!least) return Infinity;
    placed.push({ id: node.body.id, text, kind, lines: least.option.lines, box: least.option.box });
    return least.by;
  };

  /**
   * A spot for the Heliopause label beside its mark, the way a Body's label sits beside its sprite:
   * nearer the mark than any Body, on one line or as "Heliopause" over "target". `undefined` when
   * none is clear; when `crowded`, the spot beside it that covers least instead.
   */
  const besideMark = (text: string, crowded: boolean): LabelOption | undefined => {
    const mark = layout.heliopause;
    const shapes: { lines: string[]; w: number; h: number }[] = [
      { lines: [text], w: text.length * LABEL.charWidth, h: LABEL.height },
    ];
    if (text !== 'Heliopause') {
      shapes.push({
        lines: ['Heliopause', 'target'],
        w: 10 * LABEL.charWidth,
        h: 2 * LABEL.height + 1,
      });
    }
    const options = shapes
      .flatMap(({ lines, w, h }) =>
        spotsAround(mark, w, h).map((box) => ({ lines, box, d: edgeDistance(box, mark) })),
      )
      // Right beside the mark, or it would not read as its name.
      .filter((option) => option.d <= OPTIONAL_REACH)
      .sort((a, b) => a.d - b.d);
    const ownIsNearest = (option: LabelOption): boolean =>
      [layout.star, ...layout.nodes].every(
        (n) => edgeDistance(option.box, n) + STRAY_LEEWAY >= option.d,
      );
    if (!crowded) {
      return (
        nearestFit(options, undefined, ownIsNearest) ?? nearestFit(options, undefined, () => true)
      );
    }
    // Nowhere clear (a crowded edge of the chart): the spot beside the mark that covers the fewest
    // labels and marks, and never a Body, the star or the mark itself.
    let least: { option: LabelOption; cost: number } | undefined;
    for (const o of options) {
      const box = clampToChart(o.box);
      if (circleTouchesBox(mark, box, 1)) continue;
      const cost =
        [layout.star, ...layout.nodes].filter((n) => circleTouchesBox(n, box, 0)).length *
          NOWHERE_CLEAR +
        placed.filter((l) => boxesTouch(l.box, box, 0)).length * LABEL_OVER_LABEL +
        [star, edge, ...marks.values()].filter((f) => touches(f, box, 0)).length +
        edgeDistance(box, mark) / 100;
      if (!least || cost < least.cost) least = { option: { ...o, box }, cost };
    }
    return least?.option;
  };

  // The Spacecraft's Body, the target and the focused Body, each labelled once. One label can take
  // another's only good spot, so when the usual order (here, target, focus) leaves one straying, the
  // other orders are tried and the first that strays least wins.
  const required: [ChartNode, PlacedLabel['kind']][] = [];
  for (const [id, kind] of [
    [context.hereId, 'here'],
    [context.targetId, 'target'],
    [context.focusedId, 'focused'],
  ] as const) {
    const node = layout.nodes.find((n) => n.body.id === id);
    if (node && !required.some(([n]) => n === node)) required.push([node, kind]);
  }
  let best: { labels: PlacedLabel[]; strays: number } | undefined;
  for (const order of orders(required)) {
    placed = [];
    const strays = order.reduce((sum, [node, kind]) => sum + labelFor(node, kind), 0);
    if (!best || strays < best.strays) best = { labels: placed, strays };
    if (strays === 0) break;
  }
  placed = best?.labels ?? [];
  const shown = new Set(required.map(([node]) => node.body.id));

  // The Heliopause label hangs just inside its ring, wherever there is room along it.
  const ringText = context.targetId === HELIOPAUSE ? 'Heliopause · target' : 'Heliopause';
  const w = ringText.length * LABEL.charWidth;
  const ringOptions: LabelOption[] = [];
  for (const dy of RING_LABEL_STEPS) {
    const ringX = layout.star.x + Math.sqrt(layout.heliopauseRadius ** 2 - dy * dy);
    const box = {
      x: Math.round(ringX - 4 - w),
      y: Math.round(layout.star.y + dy - LABEL.height / 2),
      w,
      h: LABEL.height,
    };
    ringOptions.push({ lines: [ringText], box, d: Math.abs(dy) / 100 });
  }
  // A ring spot clear of every sprite, label and the Heliopause's own mark, though over a ring or a
  // focus bracket: on a crowded edge, better than a spot beside the mark that covers a Body.
  const overMarks = (): LabelOption | undefined =>
    ringOptions.find(
      ({ box }) =>
        insideBox(box) &&
        !circleTouchesBox(layout.heliopause, box, 1) &&
        placed.every((l) => !boxesTouch(l.box, box, 1)) &&
        [layout.star, ...layout.nodes].every((n) => !circleTouchesBox(n, box, 1)),
    );
  // The goal is always named: when its ring has no room, the label sits beside its mark instead.
  const ring =
    nearestFit(ringOptions, undefined, () => true) ??
    besideMark(ringText, false) ??
    overMarks() ??
    besideMark(ringText, true);
  if (ring) {
    placed.push({
      id: HELIOPAUSE,
      text: ringText,
      kind: 'heliopause',
      lines: ring.lines,
      box: ring.box,
    });
  }

  for (const node of layout.nodes) {
    if (node.body.kind !== 'moon' && !shown.has(node.body.id)) labelFor(node, 'planet');
  }
  return placed;
}

/** Every order of a few items, the given order first. */
function orders<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((first, i) =>
    orders([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [first, ...rest]),
  );
}

/** Width of the Body tooltip, and its height without the lines saying why a Body is not a target. */
export const TOOLTIP_SIZE = { w: 150, h: 58 } as const;

/**
 * The reason a Body is not a target, in VT323 at 14 px: where it starts in the tooltip, its line height,
 * and how many characters fit on a line (5.6 px each across the 136 px between the tooltip's insets).
 */
const REASON = { top: 55, lineHeight: 11, charsPerLine: 24, bottomPad: 7 } as const;

/**
 * The Body type line is Silkscreen at 8 px (5.6 px a character across the 136 px between the insets):
 * a longer one wraps onto a second line of 9 px. The cut-off is 22 characters, leaving room for the
 * wider fonts CI draws.
 */
const KIND = { charsPerLine: 22, lineHeight: 9 } as const;

/** How many pixels the lines under the Body type move down when it wraps: 0 or one line. */
export function tooltipKindExtra(kind: string): number {
  return kind.length > KIND.charsPerLine ? KIND.lineHeight : 0;
}

/**
 * How tall the tooltip is: taller by a line for each line the reason wraps to, and by `kindExtra`
 * (from `tooltipKindExtra`) when the Body type wraps.
 */
export function tooltipHeight(why: string | undefined, kindExtra = 0): number {
  if (why === undefined) return TOOLTIP_SIZE.h + kindExtra;
  let lines = 1;
  let line = 0;
  for (const word of why.split(' ')) {
    const wanted = line === 0 ? word.length : line + 1 + word.length;
    if (wanted > REASON.charsPerLine && line > 0) {
      lines += 1;
      line = word.length;
    } else {
      line = wanted;
    }
  }
  return REASON.top + lines * REASON.lineHeight + REASON.bottomPad + kindExtra;
}

/**
 * Where the focused Body's tooltip goes: on the chart, right beside the Body's focus brackets (right,
 * left, below, above, then the corners), and never over the star, the Body itself, where the Spacecraft
 * is, the target, or their labels. Of the spots beside it, the one that hides the fewest other Bodies and
 * labels wins, then the nearest. Only when no spot beside it is clear does it move farther out.
 */
export function placeTooltip(
  layout: ChartLayout,
  context: LabelContext,
  height: number,
  labels: readonly PlacedLabel[],
): Rect {
  const focusedNode = layout.nodes.find((n) => n.body.id === context.focusedId);
  const onEdge = context.focusedId === HELIOPAUSE;
  const node = onEdge ? layout.heliopause : focusedNode;
  if (!node) throw new Error(`Nav Chart has no Body ${context.focusedId}`);
  const [w, h] = [TOOLTIP_SIZE.w, height];

  const kept = new Set<HopTarget | undefined>([
    context.focusedId,
    context.hereId,
    context.targetId,
  ]);
  const keepOff: Footprint[] = [
    { circle: layout.star, boxes: [] },
    ...layout.nodes
      .filter((n) => n !== node && kept.has(n.body.id))
      .map((n) => footprint(n, context)),
    // The Heliopause stays in view once it is the target, and its mark is never covered anyway.
    ...(onEdge ? [] : [heliopauseFootprint(layout, context)]),
  ];
  const ownMarks = focusedNode
    ? footprint(focusedNode, context)
    : heliopauseFootprint(layout, context);
  const keptLabel = (l: PlacedLabel): boolean => l.kind === 'here' || l.kind === 'target';
  const keepOffLabels = labels.filter(keptLabel);
  const others = layout.nodes.filter((n) => !kept.has(n.body.id));
  const otherLabels = labels.filter((l) => !keptLabel(l));

  /** On the chart and off everything kept in view; `overBrackets` lets it cover the Body's own marks. */
  const clear = (box: Rect, overBrackets = false): boolean =>
    insideBox(box) &&
    (overBrackets ? !circleTouchesBox(node, box, 1) : !touches(ownMarks, box, 1)) &&
    keepOff.every((f) => !touches(f, box, 1)) &&
    keepOffLabels.every((l) => !boxesTouch(l.box, box, 1));
  /** What a spot hides: other Bodies count more than labels, and distance breaks ties. */
  const cost = (box: Rect): number =>
    others.filter((n) => circleTouchesBox(n, box, 1)).length * TOOLTIP_HIDES_BODY +
    otherLabels.filter((l) => boxesTouch(l.box, box, 0)).length * TOOLTIP_HIDES_LABEL +
    // The Heliopause's name is the goal: hiding it costs as much as hiding a Body.
    otherLabels.filter((l) => l.kind === 'heliopause' && boxesTouch(l.box, box, 0)).length *
      (TOOLTIP_HIDES_BODY - TOOLTIP_HIDES_LABEL) +
    edgeDistance(box, node);

  const best = (spots: readonly Rect[], overBrackets = false): Rect | undefined => {
    let pick: { box: Rect; cost: number } | undefined;
    for (const spot of spots) {
      const box = { ...spot, x: Math.round(spot.x), y: Math.round(spot.y) };
      if (!clear(box, overBrackets)) continue;
      const c = cost(box);
      if (!pick || c < pick.cost) pick = { box, cost: c };
    }
    return pick?.box;
  };

  const beside: Rect[] = [];
  for (const gap of TOOLTIP_GAPS) {
    const out = node.radius + gap;
    for (const t of [0.5, 0.25, 0.75, 0, 1, 0.125, 0.375, 0.625, 0.875]) {
      beside.push({ x: node.x + out, y: node.y - t * h, w, h });
      beside.push({ x: node.x - out - w, y: node.y - t * h, w, h });
      beside.push({ x: node.x - t * w, y: node.y + out, w, h });
      beside.push({ x: node.x - t * w, y: node.y - out - h, w, h });
    }
    for (const [sx, sy] of CORNERS) {
      beside.push({
        x: sx > 0 ? node.x + out : node.x - out - w,
        y: sy > 0 ? node.y + out : node.y - out - h,
        w,
        h,
      });
    }
  }
  // A spot past the chart edge slides back onto it, staying beside the Body.
  const nearby = beside.map(clampToChart);
  const near = best(nearby);
  if (near) return near;
  // Beside it but over the corners of its own focus brackets is still better than far away.
  const overBrackets = best(nearby, true);
  if (overBrackets) return overBrackets;

  // Nothing clear beside it: every spot on the chart, on a 4 px grid.
  const anywhere: Rect[] = [];
  for (let y = 0; y <= CHART.height - h; y += 4) {
    for (let x = 0; x <= CHART.width - w; x += 4) anywhere.push({ x, y, w, h });
  }
  // Within reach of the Body, whatever it hides, before anywhere else on the chart.
  const reachable = anywhere.filter((box) => edgeDistance(box, node) <= TOOLTIP_REACH);
  const far = best(reachable) ?? best(reachable, true) ?? best(anywhere);
  if (far) return far;

  // Nowhere clear at all (a very full chart): the spot that hides the fewest of them, never the Body
  // itself. A ring or bracket may go under it before the star, a kept Body or its label does.
  const keptSprites = [
    layout.star,
    ...layout.nodes.filter((n) => n !== node && kept.has(n.body.id)),
  ];
  const hides = (box: Rect): number =>
    (keptSprites.filter((n) => circleTouchesBox(n, box, 0)).length +
      keepOffLabels.filter((l) => boxesTouch(l.box, box, 0)).length) *
      TOOLTIP_HIDES_KEPT +
    [ownMarks, ...keepOff].filter((f) => touches(f, box, 0)).length;
  let least: { box: Rect; cost: number } | undefined;
  for (const box of anywhere) {
    if (circleTouchesBox(node, box, 1)) continue;
    const c = hides(box) * TOOLTIP_HIDES_KEPT + cost(box);
    if (!least || c < least.cost) least = { box, cost: c };
  }
  if (least) return least.box;
  throw new Error(`Nav Chart has no room for a tooltip beside ${context.focusedId}`);
}

/** Gaps tried between the tooltip and the focused Body, nearest first; its brackets rule out the nearest. */
const TOOLTIP_GAPS = [2, 3, 5, 7, 9, 11, 14, 17, 20];
/** How far (in pixels) from the focused Body a tooltip still reads as beside it. */
const TOOLTIP_REACH = 40;
/** What hiding another Body costs a tooltip spot, in pixels of distance. */
const TOOLTIP_HIDES_BODY = 60;
/** What hiding another label costs a tooltip spot, in pixels of distance. */
const TOOLTIP_HIDES_LABEL = 20;
/** What hiding the star, where the Spacecraft is, the target or their labels costs, when nothing else is left. */
const TOOLTIP_HIDES_KEPT = 1000;
