import { describe, expect, it } from 'vitest';
import { currentBody, HELIOPAUSE, listBodies, startRun, type Run } from '../sim/index.ts';
import { chartReducer, initialChartState, layoutChart, TOOLTIP_SIZE } from './navChartView.ts';
import {
  edgeMarkers,
  hitTest,
  MAP_AREA,
  panView,
  placeCard,
  SCREEN,
  toScreen,
  toWorld,
  zoomView,
  ZOOM,
} from './navChartMap.ts';

/** A New Run stood on its innermost planet, knowing every Body: a full map. */
const fullRun = (seed: number): Run => {
  const run = startRun(seed, 'scout');
  const ids = listBodies(run.starSystem).map((body) => body.id);
  const [inner] = run.starSystem.planets;
  if (!inner) throw new Error('A Star System has planets');
  return {
    ...run,
    status: { kind: 'landed', bodyId: inner.id },
    knowledge: { detected: ids, surveyed: ids, heliopauseFound: true },
  };
};

const opened = (run: Run) => {
  const layout = layoutChart(run);
  return { layout, view: initialChartState(run, layout).view };
};

describe('the Nav Chart map (#193)', () => {
  it('is several screens big', () => {
    for (const seed of [1, 5, 123, 2024]) {
      const { world } = layoutChart(fullRun(seed));
      const screens = (world.width * world.height) / (SCREEN.width * SCREEN.height);
      expect(screens).toBeGreaterThanOrEqual(3);
      expect(screens).toBeLessThanOrEqual(4.5);
    }
  });

  it('a drag moves the map with the pointer, and stops at the map’s edge', () => {
    const { layout, view } = opened(fullRun(5));
    const point = { x: 300, y: 200 };
    const under = toWorld(view, point);
    const dragged = panView(view, -40, -25, layout.world);
    const moved = toScreen(dragged, under);
    expect(moved.x).toBeCloseTo(260, 5);
    expect(moved.y).toBeCloseTo(175, 5);
    // However far it is dragged, the map still fills the screen.
    const far = panView(view, 1e5, 1e5, layout.world);
    expect(toWorld(far, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('zooms round the pointer, within its limits', () => {
    const { layout, view } = opened(fullRun(5));
    const at = { x: 500, y: 100 };
    const under = toWorld(view, at);
    const zoomed = zoomView(view, 1.5, layout.world, at);
    expect(zoomed.zoom).toBeCloseTo(1.5, 5);
    const stays = toScreen(zoomed, under);
    expect(stays.x).toBeCloseTo(at.x, 0);
    expect(stays.y).toBeCloseTo(at.y, 0);
    expect(zoomView(view, 100, layout.world).zoom).toBe(ZOOM.max);
    expect(zoomView(view, 0.001, layout.world).zoom).toBe(ZOOM.min);
  });

  it('a click lands on the Body under it, and on nothing over empty space', () => {
    const { layout, view } = opened(fullRun(5));
    for (const node of layout.nodes) {
      const at = toScreen(view, node);
      expect(hitTest(view, layout, at)).toBe(node.body.id);
    }
    expect(hitTest(view, layout, toScreen(view, layout.star))).toBeUndefined();
  });

  it('marks each known Body off screen at the edge, pointing toward it, and none on screen', () => {
    for (const seed of [1, 5, 9, 123]) {
      const run = fullRun(seed);
      const { layout, view } = opened(run);
      const markers = edgeMarkers(view, layout);
      const spots = [
        ...layout.nodes.map((n) => ({ id: n.body.id, at: n })),
        ...(layout.heliopause ? [{ id: HELIOPAUSE, at: layout.heliopause }] : []),
      ];
      for (const { id, at } of spots) {
        const s = toScreen(view, at);
        const onScreen =
          s.x >= MAP_AREA.x &&
          s.x <= MAP_AREA.x + MAP_AREA.w &&
          s.y >= MAP_AREA.y &&
          s.y <= MAP_AREA.y + MAP_AREA.h;
        const marker = markers.find((m) => m.id === id);
        expect(marker === undefined, `seed ${seed} ${id}`).toBe(onScreen);
        if (!marker) continue;
        expect(marker.x).toBeGreaterThanOrEqual(MAP_AREA.x);
        expect(marker.x).toBeLessThanOrEqual(MAP_AREA.x + MAP_AREA.w);
        expect(marker.y).toBeGreaterThanOrEqual(MAP_AREA.y);
        expect(marker.y).toBeLessThanOrEqual(MAP_AREA.y + MAP_AREA.h);
        // The marker points the way the Body lies.
        expect(Math.cos(marker.angle) * (s.x - marker.x)).toBeGreaterThanOrEqual(-1);
        expect(Math.sin(marker.angle) * (s.y - marker.y)).toBeGreaterThanOrEqual(-1);
      }
      // The opening view is the Spacecraft's neighbourhood: on a full map, something lies off screen.
      expect(markers.length, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it('never puts the card over its Body, where the Spacecraft is, or the target, seeds 1–400', () => {
    const card = { w: TOOLTIP_SIZE.w, h: TOOLTIP_SIZE.h + 40 };
    const covers = (
      box: { x: number; y: number; w: number; h: number },
      c: { x: number; y: number },
      r: number,
    ) =>
      Math.hypot(
        Math.max(box.x - c.x, 0, c.x - (box.x + box.w)),
        Math.max(box.y - c.y, 0, c.y - (box.y + box.h)),
      ) < r;
    for (let seed = 1; seed <= 400; seed += 1) {
      const run = fullRun(seed);
      const layout = layoutChart(run);
      const here = currentBody(run).id;
      // The farthest Body is the target; each Body in turn gets the card, brought into view.
      const target = layout.nodes.at(-1)?.body.id;
      let state = initialChartState(run, layout);
      for (const node of layout.nodes) {
        state = chartReducer(run, layout, state, { kind: 'click', id: node.body.id });
        const box = placeCard(state.view, layout, { card: node.body.id, here, target }, card);
        expect(box.x).toBeGreaterThanOrEqual(MAP_AREA.x);
        expect(box.y).toBeGreaterThanOrEqual(MAP_AREA.y);
        expect(box.x + box.w).toBeLessThanOrEqual(MAP_AREA.x + MAP_AREA.w);
        expect(box.y + box.h).toBeLessThanOrEqual(MAP_AREA.y + MAP_AREA.h);
        for (const id of [node.body.id, here, target]) {
          const spot = layout.nodes.find((n) => n.body.id === id);
          if (!spot) continue;
          const r = (spot.radius + 6) * state.view.zoom;
          expect(covers(box, toScreen(state.view, spot), r), `seed ${seed} ${id}`).toBe(false);
        }
      }
    }
  });
});
