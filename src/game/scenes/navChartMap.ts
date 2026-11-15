// Pure rules for the full-screen Nav Chart's camera (#193): the map is several screens big, so the
// player drags, zooms and pans over it. Where the camera looks, which known Bodies sit off screen,
// what a click lands on, and where a Body's card goes so it never hides where the Spacecraft is or
// the target. No Phaser here: the scene and the React layer both read these, so they agree.
import { HELIOPAUSE, type HopTarget } from '../sim/index.ts';
import type { ChartLayout, ChartSpot, Rect } from './navChartView.ts';

interface Point {
  readonly x: number;
  readonly y: number;
}

/** The game's screen, in native pixels. */
export const SCREEN = { width: 640, height: 360 } as const;

/** The part of the screen the map shows through: under the top bar, above the chart's bottom bar. */
export const MAP_AREA: Rect = { x: 0, y: 48, w: SCREEN.width, h: 284 };

/** Gameplay tuning: how far the camera may zoom out (the whole map fits) and in, and one wheel notch. */
export const ZOOM = { min: 0.5, max: 2, step: 1.2 } as const;

/** Where the camera looks: the world point at the centre of the screen, and its zoom. */
export interface MapView {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/** The world's size, in map pixels. */
export interface WorldSize {
  readonly width: number;
  readonly height: number;
}

/** Keeps the zoom within its limits and the camera over the map; a map narrower than the screen is centred. */
export function clampView(view: MapView, world: WorldSize): MapView {
  const zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, view.zoom));
  const axis = (at: number, size: number, screen: number): number => {
    const half = screen / 2 / zoom;
    return 2 * half >= size ? size / 2 : Math.min(size - half, Math.max(half, at));
  };
  return {
    x: axis(view.x, world.width, SCREEN.width),
    y: axis(view.y, world.height, SCREEN.height),
    zoom,
  };
}

/** A world point's place on the screen. The camera zooms round the screen's centre. */
export function toScreen(view: MapView, p: Point): Point {
  return {
    x: (p.x - view.x) * view.zoom + SCREEN.width / 2,
    y: (p.y - view.y) * view.zoom + SCREEN.height / 2,
  };
}

/** The world point under a screen point. */
export function toWorld(view: MapView, s: Point): Point {
  return {
    x: (s.x - SCREEN.width / 2) / view.zoom + view.x,
    y: (s.y - SCREEN.height / 2) / view.zoom + view.y,
  };
}

/** Drags the map by `dx`, `dy` screen pixels: the map follows the pointer. */
export function panView(view: MapView, dx: number, dy: number, world: WorldSize): MapView {
  return clampView({ ...view, x: view.x - dx / view.zoom, y: view.y - dy / view.zoom }, world);
}

/** Zooms by `factor`, keeping the world point under `at` (a screen point; the centre by default) still. */
export function zoomView(
  view: MapView,
  factor: number,
  world: WorldSize,
  at: Point = { x: SCREEN.width / 2, y: SCREEN.height / 2 },
): MapView {
  const zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, view.zoom * factor));
  const anchor = toWorld(view, at);
  return clampView(
    {
      x: anchor.x - (at.x - SCREEN.width / 2) / zoom,
      y: anchor.y - (at.y - SCREEN.height / 2) / zoom,
      zoom,
    },
    world,
  );
}

/** The camera centred on a spot at the same zoom, as far as the map's edges allow. */
export function centreOn(view: MapView, spot: Point, world: WorldSize): MapView {
  return clampView({ ...view, x: spot.x, y: spot.y }, world);
}

/** Pixels kept between a Body the keyboard or a marker brings into view and the map area's edge. */
const IN_VIEW_MARGIN = 40;

/** Pans the least that brings a spot well inside the map area; a spot already there leaves it be. */
export function keepInView(view: MapView, spot: Point, world: WorldSize): MapView {
  const s = toScreen(view, spot);
  const [left, right] = [MAP_AREA.x + IN_VIEW_MARGIN, MAP_AREA.x + MAP_AREA.w - IN_VIEW_MARGIN];
  const [top, bottom] = [MAP_AREA.y + IN_VIEW_MARGIN, MAP_AREA.y + MAP_AREA.h - IN_VIEW_MARGIN];
  const dx = s.x < left ? left - s.x : s.x > right ? right - s.x : 0;
  const dy = s.y < top ? top - s.y : s.y > bottom ? bottom - s.y : 0;
  return dx === 0 && dy === 0 ? view : panView(view, dx, dy, world);
}

/** Where focus can rest on the map: every known Body, and the Heliopause's mark once found. */
export function mapSpots(
  layout: ChartLayout,
): { readonly id: HopTarget; readonly spot: ChartSpot }[] {
  return [
    ...layout.nodes.map((node) => ({ id: node.body.id, spot: node })),
    ...(layout.heliopause ? [{ id: HELIOPAUSE as HopTarget, spot: layout.heliopause }] : []),
  ];
}

/** The spot for a Body or the Heliopause, if it is on the map. */
export function spotOf(layout: ChartLayout, id: HopTarget): ChartSpot | undefined {
  return mapSpots(layout).find((s) => s.id === id)?.spot;
}

/** Smallest hit circle on screen (px): a 12 px Moon would be fiddly to click otherwise. */
const MIN_HIT_RADIUS = 9;

/** The Body (or the Heliopause) under a screen point, nearest first; `undefined` over empty space. */
export function hitTest(view: MapView, layout: ChartLayout, at: Point): HopTarget | undefined {
  let best: { id: HopTarget; d: number } | undefined;
  for (const { id, spot } of mapSpots(layout)) {
    const s = toScreen(view, spot);
    const d = Math.hypot(s.x - at.x, s.y - at.y);
    if (d > Math.max(spot.radius * view.zoom, MIN_HIT_RADIUS)) continue;
    if (!best || d < best.d) best = { id, d };
  }
  return best?.id;
}

/** A known Body off screen: a marker on the map area's edge, pointing toward it. */
export interface EdgeMarker {
  readonly id: HopTarget;
  /** The marker's centre on screen. */
  readonly x: number;
  readonly y: number;
  /** The way to the Body, in radians (0 points right, π/2 down). */
  readonly angle: number;
}

/** How far inside the map area's edge the markers sit. */
export const MARKER_INSET = 8;

/** A marker on the edge for every known Body (and the found Heliopause) outside the map area. */
export function edgeMarkers(view: MapView, layout: ChartLayout): EdgeMarker[] {
  const centre = { x: MAP_AREA.x + MAP_AREA.w / 2, y: MAP_AREA.y + MAP_AREA.h / 2 };
  const [halfW, halfH] = [MAP_AREA.w / 2 - MARKER_INSET, MAP_AREA.h / 2 - MARKER_INSET];
  const markers: EdgeMarker[] = [];
  for (const { id, spot } of mapSpots(layout)) {
    const s = toScreen(view, spot);
    const [dx, dy] = [s.x - centre.x, s.y - centre.y];
    if (Math.abs(dx) <= MAP_AREA.w / 2 && Math.abs(dy) <= MAP_AREA.h / 2) continue;
    const scale = Math.min(halfW / Math.abs(dx || 1e-9), halfH / Math.abs(dy || 1e-9));
    markers.push({
      id,
      x: Math.round(centre.x + dx * scale),
      y: Math.round(centre.y + dy * scale),
      angle: Math.atan2(dy, dx),
    });
  }
  return markers;
}

const boxesTouch = (a: Rect, b: Rect, margin: number): boolean =>
  a.x < b.x + b.w + margin &&
  b.x < a.x + a.w + margin &&
  a.y < b.y + b.h + margin &&
  b.y < a.y + a.h + margin;

const touchesCircle = (box: Rect, c: Point & { readonly radius: number }): boolean => {
  const dx = Math.max(box.x - c.x, 0, c.x - (box.x + box.w));
  const dy = Math.max(box.y - c.y, 0, c.y - (box.y + box.h));
  return Math.hypot(dx, dy) < c.radius;
};

const inArea = (box: Rect): boolean =>
  box.x >= MAP_AREA.x &&
  box.y >= MAP_AREA.y &&
  box.x + box.w <= MAP_AREA.x + MAP_AREA.w &&
  box.y + box.h <= MAP_AREA.y + MAP_AREA.h;

/** Pixels kept clear round a Body the card must not hide: its "you" ring, target square and brackets. */
const KEEP_CLEAR = 10;

/**
 * Where a Body's card goes on screen: beside the Body, inside the map area, and never over the Body
 * itself, where the Spacecraft is, or the target (#188's fold-in). The nearest clear spot wins.
 */
export function placeCard(
  view: MapView,
  layout: ChartLayout,
  ids: {
    readonly card: HopTarget;
    readonly here: HopTarget;
    readonly target?: HopTarget | undefined;
  },
  size: { readonly w: number; readonly h: number },
  /** Boxes it should also keep off when it can: the names of those Bodies. */
  avoid: readonly Rect[] = [],
): Rect {
  const kept = [ids.card, ids.here, ids.target].flatMap((id) => {
    const spot = id === undefined ? undefined : spotOf(layout, id);
    if (!spot) return [];
    const s = toScreen(view, spot);
    return [{ ...s, radius: spot.radius * view.zoom + KEEP_CLEAR }];
  });
  const [own] = kept;
  if (!own) throw new Error(`Nav Chart has no ${ids.card} for a card`);
  const clear = (box: Rect): boolean => inArea(box) && kept.every((c) => !touchesCircle(box, c));
  const named = (box: Rect): boolean => avoid.every((a) => !boxesTouch(a, box, 1));
  const { w, h } = size;
  const spots: Rect[] = [];
  for (let y = MAP_AREA.y; y + h <= MAP_AREA.y + MAP_AREA.h; y += 4) {
    for (let x = MAP_AREA.x; x + w <= MAP_AREA.x + MAP_AREA.w; x += 4) spots.push({ x, y, w, h });
  }
  // A box's distance from the Body's ring: the card sits as near the Body as it can.
  const distance = (box: Rect): number =>
    Math.hypot(
      Math.max(box.x - own.x, 0, own.x - (box.x + box.w)),
      Math.max(box.y - own.y, 0, own.y - (box.y + box.h)),
    );
  let best: { box: Rect; d: number } | undefined;
  for (const box of spots) {
    if (!clear(box)) continue;
    // Over a name costs as much as being farther away by a card's width.
    const d = distance(box) + (named(box) ? 0 : box.w);
    if (!best || d < best.d) best = { box, d };
  }
  if (best) return best.box;
  // Nowhere clear (the Body fills the screen at full zoom): the spot nearest its edge off its centre.
  return spots.find((box) => !touchesCircle(box, { ...own, radius: 1 })) ?? spots[0] ?? MAP_AREA;
}

/** A Body's name on the map, on screen. */
export interface MapLabel {
  readonly id: HopTarget;
  readonly box: Rect;
}

/** Silkscreen at 8 px: measured advance per character, rounded up. */
const CHAR_WIDTH = 6;
const LABEL_HEIGHT = 8;

/**
 * Where each name goes on screen: under its Body, or above, right or left when that would overlap a
 * name already placed or another Body. Placed in the order given, so the first ones (where the
 * Spacecraft is, the target) get their first choice.
 */
export function placeMapLabels(
  view: MapView,
  layout: ChartLayout,
  names: readonly { readonly id: HopTarget; readonly text: string }[],
): MapLabel[] {
  const circles = mapSpots(layout).map(({ id, spot }) => ({
    id,
    ...toScreen(view, spot),
    radius: spot.radius * view.zoom,
  }));
  const placed: MapLabel[] = [];
  for (const { id, text } of names) {
    const c = circles.find((circle) => circle.id === id);
    if (!c) continue;
    const [w, h, gap] = [text.length * CHAR_WIDTH, LABEL_HEIGHT, c.radius + 4];
    const options: Rect[] = [
      { x: c.x - w / 2, y: c.y + gap, w, h },
      { x: c.x - w / 2, y: c.y - gap - h, w, h },
      { x: c.x + gap, y: c.y - h / 2, w, h },
      { x: c.x - gap - w, y: c.y - h / 2, w, h },
    ].map((box) => ({ ...box, x: Math.round(box.x), y: Math.round(box.y) }));
    const free = (box: Rect): boolean =>
      placed.every((l) => !boxesTouch(l.box, box, 1)) &&
      circles.every((other) => !touchesCircle(box, { ...other, radius: other.radius + 1 }));
    const box = options.find(free) ?? options[0];
    if (box) placed.push({ id, box });
  }
  return placed;
}
