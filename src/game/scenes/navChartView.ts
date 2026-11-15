// Pure view rules for the Nav Chart: where each Body sits on the chart, how the arrow keys move
// between them, and which Bodies may be chosen as a Hop target. No Phaser here, so the scene and the
// React panel stay thin and these rules are tested in Node. Whether a Body is a valid target is
// the simulation's rule (`planHop`); nothing here re-implements it.
import {
  currentBody,
  HELIOPAUSE,
  hopRange,
  planHop,
  type Body,
  type BodyId,
  type HopTarget,
  type InvalidTargetReason,
  type Planet,
  type Run,
} from '../sim/index.ts';
import { SPRITE_SIZE } from './landedView.ts';
import {
  centreOn,
  fitInView,
  keepInView,
  PLAN_MAP_AREA,
  panView,
  spotOf,
  zoomView,
  type MapView,
  type WorldSize,
} from './navChartMap.ts';

/**
 * The grid the Star System is first laid out on, in pixels: the old in-panel chart. The map spreads it
 * out to several screens (`MAP_SPREAD`), so Bodies keep the same arrangement with real room between.
 */
export const CHART = { width: 412, height: 220 } as const;

/**
 * Gameplay tuning (#193, tuned by eye): how much the map spreads the chart's planets apart, and Moons
 * from their planet (less, so a Moon still reads as its planet's). Sprites stay 1x, so Bodies get room.
 * With the margin, the map is about 3.6 times the screen's area.
 */
export const MAP_SPREAD = { planets: 2.6, moons: 1.6, margin: 60 } as const;

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
  /** The orbit ring of a planet, in map pixels from the star. */
  orbitRadius(planetId: BodyId): number;
  readonly heliopauseRadius: number;
  /**
   * Where the Heliopause can be focused and chosen: a small mark on its ring (see
   * `placeHeliopauseMark`). `undefined` until it is found: then neither its ring nor its mark is drawn.
   */
  readonly heliopause: HeliopauseMark | undefined;
  /** The whole map, in map pixels: everything above lies inside it. */
  readonly world: WorldSize;
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

/** Pixels kept between a Moon spread out onto the map and any other Body. */
const MOON_CLEAR = 8;

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
    // The map's reach, not the Heliopause's: it lies just past the outermost planet (#191), and
    // scaling to it would crowd the outer planets against the map's edge.
    const fraction = (planet.distanceFromStar / system.mapRadius) ** DISTANCE_EXPONENT;
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
  const mark = run.knowledge.heliopauseFound
    ? placeHeliopauseMark(nodes, heliopauseRadius)
    : undefined;

  // Spread the chart out into the map: planets (and the star, and the Heliopause) by one factor, and
  // each planet's Moons from it by a smaller one, or more where that would crowd another Body. The
  // whole Star System is spread, so a Body keeps its place as the player learns of more.
  const { planets: far, moons: near, margin } = MAP_SPREAD;
  const spread = <T extends Point>(p: T): T => ({
    ...p,
    x: Math.round(margin + p.x * far),
    y: Math.round(margin + p.y * far),
  });
  const spreadStar = spread(STAR);
  const placed: ChartNode[] = placements.flatMap((p) => p.cluster.slice(0, 1).map(spread));
  for (const { cluster } of placements) {
    const [planet, ...moons] = cluster;
    if (!planet) continue;
    const at = spread(planet);
    const roomy = (moon: ChartNode): boolean =>
      [spreadStar, ...placed].every(
        (o) => Math.hypot(moon.x - o.x, moon.y - o.y) > o.radius + moon.radius + MOON_CLEAR,
      );
    for (const factor of [near, (near + far) / 2, far]) {
      const spreadMoons = moons.map((moon) => ({
        ...moon,
        x: Math.round(at.x + (moon.x - planet.x) * factor),
        y: Math.round(at.y + (moon.y - planet.y) * factor),
      }));
      if (factor === far || spreadMoons.every(roomy)) {
        placed.push(...spreadMoons);
        break;
      }
    }
  }
  const world = new Map(placed.map((n) => [n.body.id, n]));
  return {
    star: spreadStar,
    nodes: nodes.map((node) => world.get(node.body.id) ?? node),
    orbitRadius(planetId) {
      const ring = rings.get(planetId);
      if (ring === undefined) throw new Error(`Nav Chart has no orbit ring for ${planetId}`);
      return ring * far;
    },
    heliopauseRadius: heliopauseRadius * far,
    heliopause: mark && spread(mark),
    world: {
      width: Math.round(CHART.width * far + 2 * margin),
      height: Math.round(CHART.height * far + 2 * margin),
    },
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

/** The part of a circle round the star that lies on the map, as short straight segments. */
export function ringSegments(centre: Point, radius: number, bounds: WorldSize): Segment[] {
  const inside = (x: number, y: number): boolean =>
    x >= 0 && x <= bounds.width && y >= 0 && y <= bounds.height;
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

/** The Hop range as two rings round the star, in map pixels (0 inner means the star itself). */
export interface HopBand {
  readonly inner: number;
  readonly outer: number;
}

/**
 * Where `hopRange(run)`'s inner and outer distances fall on the map: a planet's distance is that
 * planet's orbit ring, the Heliopause's is the Heliopause ring, and the star is 0.
 */
export function hopBand(run: Run, layout: ChartLayout): HopBand {
  const range = hopRange(run);
  const radiusOf = (au: number): number => {
    if (au === 0) return 0;
    const planet = run.starSystem.planets.find((p) => p.distanceFromStar === au);
    return planet ? layout.orbitRadius(planet.id) : layout.heliopauseRadius;
  };
  return { inner: radiusOf(range.inner), outer: radiusOf(range.outer) };
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
    ...(layout.heliopause ? [{ id: HELIOPAUSE, at: layout.heliopause }] : []),
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

/**
 * What the Nav Chart is showing (#193): the Body (or the Heliopause) focus is on, whether its card is
 * open, the chosen target, if any, and where the camera looks over the map. It opens with no card: a
 * card shows only when the player picks a Body, and the Hop plan only after "Plan Hop".
 */
export interface ChartState {
  readonly focusedId: HopTarget;
  /** The focused Body's card is open. */
  readonly card: boolean;
  readonly selectedId: HopTarget | undefined;
  readonly view: MapView;
}

/** What can happen to the chart: keys, the mouse, touch, or the chart's buttons. */
export type ChartCommand =
  /** Arrow keys and Page Up / Down: focus the next Body that way and open its card. */
  | { readonly kind: 'move'; readonly direction: Direction }
  | { readonly kind: 'step'; readonly delta: 1 | -1 }
  /** Enter: open the focused Body's card, or, with it open, plan the Hop there. */
  | { readonly kind: 'select' }
  /** The card's "Plan Hop": the focused Body becomes the target, and the card gives way to the plan. */
  | { readonly kind: 'plan' }
  /** Cancel the Hop plan: no target. */
  | { readonly kind: 'clear' }
  /** A click on a Body or its edge marker: its card opens, brought into view. */
  | { readonly kind: 'click'; readonly id: HopTarget }
  /** A click on empty space, or Escape: the card closes. */
  | { readonly kind: 'dismiss' }
  /** A drag, or the pan keys: the map moves by this many screen pixels. */
  | { readonly kind: 'pan'; readonly dx: number; readonly dy: number }
  /** The wheel, a pinch or the zoom keys, round a screen point (the centre by default). */
  | {
      readonly kind: 'zoom';
      readonly factor: number;
      readonly at?: { readonly x: number; readonly y: number };
    }
  /** The re-centre button: back to where the Spacecraft is. */
  | { readonly kind: 'recentre' };

/** Opens centred on the Body the Spacecraft is on, focus there, no card and nothing chosen. */
export function initialChartState(run: Run, layout: ChartLayout): ChartState {
  const here = currentBody(run).id;
  return {
    focusedId: here,
    card: false,
    selectedId: undefined,
    view: centreOn({ x: 0, y: 0, zoom: 1 }, spotOf(layout, here) ?? layout.star, layout.world),
  };
}

/**
 * Applies a command. Planning a Hop to a Body that is not a valid target changes nothing: its card
 * stays open with the reason, and any earlier target stays. Panning and zooming never touch focus,
 * the card or the target.
 */
export function chartReducer(
  run: Run,
  layout: ChartLayout,
  state: ChartState,
  command: ChartCommand,
): ChartState {
  const open = (id: HopTarget): ChartState => {
    const spot = spotOf(layout, id);
    return {
      ...state,
      focusedId: id,
      card: true,
      view: spot ? keepInView(state.view, spot, layout.world) : state.view,
    };
  };
  switch (command.kind) {
    case 'move':
      return open(moveFocus(layout, state.focusedId, command.direction));
    case 'step':
      return open(stepFocus(layout, state.focusedId, command.delta));
    case 'click':
      return open(command.id);
    case 'select':
      return state.card ? plan(run, layout, state) : open(state.focusedId);
    case 'plan':
      return plan(run, layout, state);
    case 'dismiss':
      return state.card ? { ...state, card: false } : state;
    case 'clear':
      return { ...state, selectedId: undefined };
    case 'pan':
      return { ...state, view: panView(state.view, command.dx, command.dy, layout.world) };
    case 'zoom':
      return { ...state, view: zoomView(state.view, command.factor, layout.world, command.at) };
    case 'recentre': {
      const here = spotOf(layout, currentBody(run).id) ?? layout.star;
      return { ...state, view: centreOn(state.view, here, layout.world) };
    }
  }
}

/** Chooses the target; the camera frames it and "you" left of the Hop plan's panel. */
function plan(run: Run, layout: ChartLayout, state: ChartState): ChartState {
  if (!targetStatus(run, state.focusedId).valid) return state;
  const spots = [currentBody(run).id, state.focusedId].flatMap((id) => {
    const spot = spotOf(layout, id);
    return spot ? [spot] : [];
  });
  return {
    ...state,
    selectedId: state.focusedId,
    card: false,
    view: fitInView(state.view, spots, layout.world, PLAN_MAP_AREA),
  };
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
