import { Scene, Scenes, type GameObjects, type Input } from 'phaser';
import { paletteNumber } from '../../ui/kit/palette.ts';
import { EventBus } from '../EventBus.ts';
import { prefersReducedMotion } from '../lib/motion.ts';
import {
  bodyKnowledge,
  currentBody,
  type BodyId,
  isDepleted,
  type HopTarget,
  type Run,
  type StarSystem,
} from '../sim/index.ts';
import { bodySprite } from './landedView.ts';
import {
  BRACKET_ARM,
  BRACKET_GAP,
  chartReducer,
  crossSegments,
  dashedSegments,
  HELIOPAUSE_MARK_RADIUS,
  initialChartState,
  layoutChart,
  MARK_GAP,
  ringSegments,
  routeEnds,
  starfield,
  type ChartCommand,
  type ChartLayout,
  type ChartNode,
  type ChartSpot,
  type ChartState,
} from './navChartView.ts';
import { hitTest, spotOf, ZOOM } from './navChartMap.ts';
import { SceneKey } from './keys.ts';
import { KIT_ATLAS_KEY } from '../../ui/kit/kit.ts';
import { yieldIcon } from '../../ui/yieldIcon.ts';

export interface NavChartData {
  /** The Run whose Star System the chart shows. */
  readonly run: Run;
  /** Bodies Comms just Detected on the landing this chart follows: each gets one ping ring. */
  readonly newBlips?: readonly BodyId[];
}

/** Screen pixels a press may move and still count as a click, not a drag (touch wobbles). */
const DRAG_THRESHOLD = 5;

/** The side (px) of a Body's yield icon on the map: the kit's 32 px icon at five sixteenths. */
const YIELD_MARK_SIZE = 10;

/** The Heliopause's reveal on the chart (gameplay tuning, ms): its fade-in and the ping from its mark. */
const HELIOPAUSE_REVEAL = { fadeMs: 900, pingMs: 1_100, pingScale: 5 } as const;

/** The Star Systems whose found Heliopause the chart has already revealed: it fades in once. */
const REVEALED = new WeakSet<StarSystem>();

/** Gameplay tuning: a Detected Body's blip, and its pulse (ms). */
const BLIP = { radius: 3, pulseMs: 1_600, pulseScale: 3 } as const;

/** The backdrop stars sit below every other chart object. */
const STARFIELD_DEPTH = -10;

/** Gameplay tuning: the ping on a newly Detected Body (ms, and how far it grows). */
const NEW_BLIP_PING = { ms: 1_400, scale: 6 } as const;

/**
 * The Nav Chart (#193): the whole known Star System as a map several screens big, over the dimmed
 * Landed scene. Phaser draws the map (rings, the star, Surveyed Bodies' real sprites, Detected Bodies'
 * blips, the "you" ring, the route and the target) and takes the pointer: drag to pan, wheel or pinch to
 * zoom, a click to open a Body's card. React owns the card, the labels, the Hop plan and the keyboard;
 * the two talk only through the `EventBus`, and both read the camera from the chart state.
 */
export class NavChart extends Scene {
  private run!: Run;
  private newBlips: readonly BodyId[] = [];
  private layout!: ChartLayout;
  private chartState!: ChartState;
  private marks!: GameObjects.Graphics;
  private sprites = new Map<HopTarget, GameObjects.Image | GameObjects.Graphics>();
  private hovered: HopTarget | undefined;
  /** The press under way: where it started and was last seen, and whether it became a drag. */
  private press:
    { x: number; y: number; lastX: number; lastY: number; dragged: boolean } | undefined;
  /** The two-finger distance at the last pinch step. */
  private pinch: number | undefined;

  constructor() {
    super(SceneKey.NavChart);
  }

  init(data: NavChartData): void {
    this.run = data.run;
    this.newBlips = data.newBlips ?? [];
    this.layout = layoutChart(data.run);
    this.chartState = initialChartState(data.run, this.layout);
    this.sprites = new Map();
    this.hovered = undefined;
    this.press = undefined;
    this.pinch = undefined;
  }

  create(): void {
    // Full screen and opaque: while it is open, the map is the whole view.
    this.cameras.main.setBackgroundColor(paletteNumber('scr0'));
    this.drawStarfield();
    this.drawRings();
    const heliopauseRing = this.drawHeliopauseRing();
    this.add.image(this.layout.star.x, this.layout.star.y, 'body_star');
    for (const node of this.layout.nodes) this.addBody(node);
    this.pingNewBlips();
    const mark = this.addHeliopauseMark();
    if (heliopauseRing && mark) this.revealHeliopause(heliopauseRing, mark);
    this.drawYieldMarks();
    this.marks = this.add.graphics();
    this.drawMarks();
    this.applyView();
    this.listenToPointer();

    const offs = [
      EventBus.on('nav-chart-command', (command) => {
        this.apply(command);
      }),
      EventBus.on('nav-chart-close-requested', () => {
        this.scene.stop();
      }),
    ];
    // A destroyed game (React StrictMode remounts, tests) never shuts its scenes down, so unsubscribe on
    // both; whichever fires first removes the other listener.
    const unsubscribe = (): void => {
      for (const off of offs) off();
      this.events.off(Scenes.Events.SHUTDOWN, unsubscribe);
      this.events.off(Scenes.Events.DESTROY, unsubscribe);
      // The chart is gone, and so is its target.
      if (this.chartState.selectedId !== undefined) EventBus.emit('nav-target-selected', undefined);
      EventBus.emit('nav-chart-state', undefined);
    };
    // The grab hand is the map's: the Landed view gets its own pointer back.
    this.events.once(Scenes.Events.SHUTDOWN, () => {
      this.input.setDefaultCursor('default');
    });
    this.events.once(Scenes.Events.SHUTDOWN, unsubscribe);
    this.events.once(Scenes.Events.DESTROY, unsubscribe);

    EventBus.emit('nav-chart-state', this.chartState);
  }

  private apply(command: ChartCommand): void {
    const before = this.chartState;
    this.chartState = chartReducer(this.run, this.layout, before, command);
    if (this.chartState === before) return;
    if (this.chartState.view !== before.view) this.applyView();
    if (
      this.chartState.focusedId !== before.focusedId ||
      this.chartState.card !== before.card ||
      this.chartState.selectedId !== before.selectedId
    ) {
      this.drawMarks();
    }
    EventBus.emit('nav-chart-state', this.chartState);
    if (this.chartState.selectedId !== before.selectedId) {
      EventBus.emit('nav-target-selected', this.chartState.selectedId);
    }
  }

  /** Points the camera where the chart state says: the world point at the screen's centre, and zoom. */
  private applyView(): void {
    const { x, y, zoom } = this.chartState.view;
    this.cameras.main.setZoom(zoom).centerOn(x, y);
  }

  /**
   * Drag to pan (a press that moves past a few pixels is a drag, never a click), two fingers to pinch,
   * the wheel to zoom round the pointer, and a click to open a Body's card or, on empty space, close it.
   */
  private listenToPointer(): void {
    const input = this.input;
    input.addPointer(1);
    input.setDefaultCursor('grab');
    input.on('pointerdown', (pointer: Input.Pointer) => {
      this.press = {
        x: pointer.x,
        y: pointer.y,
        lastX: pointer.x,
        lastY: pointer.y,
        dragged: false,
      };
    });
    input.on('pointermove', (pointer: Input.Pointer) => {
      const [first, second] = [input.pointer1, input.pointer2];
      if (first.isDown && second.isDown) {
        this.pinchStep(first, second);
        return;
      }
      const press = this.press;
      if (!press || !pointer.isDown) {
        this.hover(hitTest(this.chartState.view, this.layout, pointer));
        return;
      }
      if (!press.dragged && Math.hypot(pointer.x - press.x, pointer.y - press.y) < DRAG_THRESHOLD) {
        return;
      }
      press.dragged = true;
      input.setDefaultCursor('grabbing');
      this.apply({ kind: 'pan', dx: pointer.x - press.lastX, dy: pointer.y - press.lastY });
      press.lastX = pointer.x;
      press.lastY = pointer.y;
    });
    const release = (pointer: Input.Pointer): void => {
      const press = this.press;
      this.press = undefined;
      this.pinch = undefined;
      input.setDefaultCursor('grab');
      if (!press || press.dragged) return;
      const id = hitTest(this.chartState.view, this.layout, pointer);
      this.apply(id === undefined ? { kind: 'dismiss' } : { kind: 'click', id });
    };
    input.on('pointerup', release);
    input.on('pointerupoutside', () => {
      this.press = undefined;
      this.pinch = undefined;
    });
    input.on('wheel', (pointer: Input.Pointer, _over: unknown, _dx: number, dy: number): void => {
      if (dy === 0) return;
      const factor = dy > 0 ? 1 / ZOOM.step : ZOOM.step;
      this.apply({ kind: 'zoom', factor, at: { x: pointer.x, y: pointer.y } });
    });
  }

  /** One step of a two-finger pinch: zoom by how much the fingers spread, round the point between them. */
  private pinchStep(a: Input.Pointer, b: Input.Pointer): void {
    if (this.press) this.press.dragged = true;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const before = this.pinch;
    this.pinch = distance;
    if (before === undefined || before === 0) return;
    this.apply({
      kind: 'zoom',
      factor: distance / before,
      at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    });
  }

  /** Hover only brightens the Body itself: no card, no panel. */
  private hover(id: HopTarget | undefined): void {
    if (id === this.hovered) return;
    if (this.hovered !== undefined) this.sprites.get(this.hovered)?.setAlpha(REST_ALPHA);
    this.hovered = id;
    if (id !== undefined) this.sprites.get(id)?.setAlpha(1);
    this.input.setDefaultCursor(id === undefined ? 'grab' : 'pointer');
  }

  /**
   * Faint layered stars behind everything (depth -10): the far layer barely follows the camera, the
   * near one a little more, which is the parallax. Under reduced motion they are stuck to the map.
   */
  private drawStarfield(): void {
    const still = prefersReducedMotion();
    for (const layer of starfield(this.run.seed, this.layout.world)) {
      const graphics = this.add.graphics().setDepth(STARFIELD_DEPTH).setName('starfield');
      graphics.setScrollFactor(still ? 1 : layer.parallax);
      graphics.fillStyle(paletteNumber('cy4'), layer.alpha);
      for (const { x, y } of layer.stars) graphics.fillRect(x, y, layer.size, layer.size);
    }
  }

  /** A ring grows once from each Body Comms just Detected: the new blip, shown, not told. */
  private pingNewBlips(): void {
    if (prefersReducedMotion()) return;
    for (const id of this.newBlips) {
      const spot = spotOf(this.layout, id);
      if (!spot) continue;
      const ring = this.add.graphics({ x: spot.x, y: spot.y }).setName('new-blip-ping');
      ring.lineStyle(1, paletteNumber('cy4'));
      ring.strokeCircle(0, 0, BLIP.radius + 2);
      this.tweens.add({
        targets: ring,
        scale: { from: 1, to: NEW_BLIP_PING.scale },
        alpha: { from: 1, to: 0 },
        duration: NEW_BLIP_PING.ms,
        ease: 'Sine.easeOut',
        onComplete: () => {
          ring.destroy();
        },
      });
    }
  }

  /** The orbit rings of known planets, and the Heliopause's dashed violet ring once it is found. */
  private drawRings(): void {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, paletteNumber('cy0'));
    for (const { body: planet } of this.layout.nodes) {
      if (planet.kind === 'moon') continue;
      for (const { from, to } of ringSegments(
        this.layout.star,
        this.layout.orbitRadius(planet.id),
        this.layout.world,
      )) {
        graphics.lineBetween(...from, ...to);
      }
    }
  }

  /** The Heliopause's ring, dashed violet; none until the Radar finds it. */
  private drawHeliopauseRing(): GameObjects.Graphics | undefined {
    if (!this.layout.heliopause) return undefined;
    const graphics = this.add.graphics();
    graphics.lineStyle(1, paletteNumber('vi2'));
    const segments = ringSegments(
      this.layout.star,
      this.layout.heliopauseRadius,
      this.layout.world,
    );
    // Every other short segment: a dashed ring.
    for (const [index, { from, to }] of segments.entries()) {
      if (index % 4 < 2) graphics.lineBetween(...from, ...to);
    }
    return graphics;
  }

  /**
   * The first time the chart shows a found Heliopause, its ring and mark fade in and a ping grows from
   * the mark: the way out, shown rather than told (#191). Under reduced motion they are simply there.
   */
  private revealHeliopause(ring: GameObjects.Graphics, mark: GameObjects.Graphics): void {
    if (REVEALED.has(this.run.starSystem)) return;
    REVEALED.add(this.run.starSystem);
    if (prefersReducedMotion()) return;
    this.tweens.add({
      targets: [ring, mark],
      alpha: { from: 0, to: 1 },
      duration: HELIOPAUSE_REVEAL.fadeMs,
    });
    const ping = this.add.graphics({ x: mark.x, y: mark.y });
    ping.lineStyle(1, paletteNumber('vi4'));
    ping.strokeCircle(0, 0, HELIOPAUSE_MARK_RADIUS + 2);
    this.tweens.add({
      targets: ping,
      delay: HELIOPAUSE_REVEAL.fadeMs / 2,
      scale: { from: 1, to: HELIOPAUSE_REVEAL.pingScale },
      alpha: { from: 1, to: 0 },
      duration: HELIOPAUSE_REVEAL.pingMs,
      ease: 'Sine.easeOut',
      onComplete: () => {
        ping.destroy();
      },
    });
  }

  /**
   * A Surveyed Body's real sprite at 1x; a Detected one is only a pulsing blip (its "?" is React's),
   * since all the player knows of it is where it is.
   */
  private addBody(node: ChartNode): void {
    if (bodyKnowledge(this.run, node.body.id) === 'surveyed') {
      const image = this.add.image(node.x, node.y, bodySprite(this.run, node.body));
      this.sprites.set(node.body.id, image.setAlpha(REST_ALPHA));
      return;
    }
    const blip = this.add.graphics({ x: node.x, y: node.y });
    blip.fillStyle(paletteNumber('cy3'));
    blip.fillCircle(0, 0, BLIP.radius);
    this.sprites.set(node.body.id, blip.setAlpha(REST_ALPHA));
    const pulse = this.add.graphics({ x: node.x, y: node.y });
    pulse.lineStyle(1, paletteNumber('cy3'));
    pulse.strokeCircle(0, 0, BLIP.radius + 1);
    if (prefersReducedMotion()) return;
    this.tweens.add({
      targets: pulse,
      scale: { from: 1, to: BLIP.pulseScale },
      alpha: { from: 1, to: 0 },
      duration: BLIP.pulseMs,
      repeat: -1,
      ease: 'Sine.easeOut',
    });
  }

  /** The Heliopause's mark: a violet diamond on its ring (a shape, not just a colour), once found. */
  private addHeliopauseMark(): GameObjects.Graphics | undefined {
    if (!this.layout.heliopause) return undefined;
    const { x, y, radius } = this.layout.heliopause;
    const mark = this.add.graphics({ x, y });
    mark.fillStyle(paletteNumber('vi4'));
    mark.lineStyle(1, paletteNumber('vi2'));
    mark.beginPath();
    mark.moveTo(0, -radius);
    mark.lineTo(radius, 0);
    mark.lineTo(0, radius);
    mark.lineTo(-radius, 0);
    mark.closePath();
    mark.fillPath();
    mark.strokePath();
    return mark;
  }

  /**
   * The Fuel or Materials icon at the upper right of each Surveyed landable Body, dimmed and struck
   * through once it is Depleted. An Unsurveyed Body's resources are unknown, so it has none.
   */
  private drawYieldMarks(): void {
    const strikes = this.add.graphics();
    for (const node of this.layout.nodes) {
      const icon =
        bodyKnowledge(this.run, node.body.id) === 'surveyed'
          ? yieldIcon(this.run, node.body)
          : undefined;
      if (!icon) continue;
      const [cx, cy] = [node.x + node.radius + 3, node.y - node.radius - 3];
      const image =
        icon.resource === 'fuel'
          ? this.add.image(cx, cy, KIT_ATLAS_KEY, 'res_fuel')
          : this.add.image(cx, cy, 'res_materials');
      image.setScale(YIELD_MARK_SIZE / image.width).setAlpha(icon.depleted ? 0.4 : 1);
      if (!icon.depleted) continue;
      const half = YIELD_MARK_SIZE / 2;
      // The same strike as the DOM icon: a dark stroke under a bright one, so it shows over any sprite.
      for (const [width, colour] of [
        [3, paletteNumber('void')],
        [1, paletteNumber('am3')],
      ] as const) {
        strikes.lineStyle(width, colour);
        strikes.lineBetween(cx - half, cy + half, cx + half, cy - half);
      }
    }
  }

  /** Where the Spacecraft is, the open card's Body, and the chosen target with its route. */
  private drawMarks(): void {
    const g = this.marks;
    g.clear();
    const at = (id: HopTarget): ChartSpot | undefined => spotOf(this.layout, id);

    // Surveyed Gas Giants carry a dotted ring: no surface to land on (shape, not just colour).
    for (const node of this.layout.nodes) {
      if (node.body.kind !== 'gas-giant') continue;
      if (bodyKnowledge(this.run, node.body.id) !== 'surveyed') continue;
      this.dottedRing(node, node.radius + MARK_GAP);
    }

    // A Depleted Body is crossed out: an X over it, which is a shape, not just a colour.
    // A 3 px dark stroke with a 1 px bright one on top, so it shows over any sprite.
    for (const [width, colour] of [
      [3, paletteNumber('void')],
      [1, paletteNumber('am3')],
    ] as const) {
      g.lineStyle(width, colour);
      for (const node of this.layout.nodes) {
        if (!isDepleted(this.run, node.body.id)) continue;
        for (const { from, to } of crossSegments(node)) g.lineBetween(...from, ...to);
      }
    }

    const here = at(currentBody(this.run).id);
    if (here) {
      g.lineStyle(1, paletteNumber('am3'));
      g.strokeCircle(here.x, here.y, here.radius + MARK_GAP);
    }

    const target =
      this.chartState.selectedId === undefined ? undefined : at(this.chartState.selectedId);
    if (here && target) {
      g.lineStyle(1, paletteNumber('cy3'));
      for (const { from, to } of dashedSegments(...routeEnds(here, target), 3, 3)) {
        g.lineBetween(...from, ...to);
      }
      g.strokeRect(
        target.x - target.radius - MARK_GAP,
        target.y - target.radius - MARK_GAP,
        2 * (target.radius + MARK_GAP),
        2 * (target.radius + MARK_GAP),
      );
    }

    // Brackets only round the Body whose card is open: nothing is highlighted until the player asks.
    const focus = this.chartState.card ? at(this.chartState.focusedId) : undefined;
    if (focus) this.cornerBrackets(focus, focus.radius + BRACKET_GAP);
  }

  /** Dots round a Body, 2 px each: bright enough to read over the dark chart. */
  private dottedRing(node: ChartNode, radius: number): void {
    this.marks.fillStyle(paletteNumber('wh2'));
    const dots = Math.round((2 * Math.PI * radius) / 6);
    for (let i = 0; i < dots; i += 1) {
      const angle = (i / dots) * 2 * Math.PI;
      this.marks.fillRect(
        Math.round(node.x + radius * Math.cos(angle)) - 1,
        Math.round(node.y + radius * Math.sin(angle)) - 1,
        2,
        2,
      );
    }
  }

  /** The focus mark: four pale corner brackets round a Body. */
  private cornerBrackets(node: ChartSpot, half: number): void {
    const g = this.marks;
    const arm = BRACKET_ARM;
    g.lineStyle(1, paletteNumber('wh3'));
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const cx = node.x + sx * half;
      const cy = node.y + sy * half;
      g.lineBetween(cx, cy, cx - sx * arm, cy);
      g.lineBetween(cx, cy, cx, cy - sy * arm);
    }
  }
}

/** A Body at rest is a touch dim, so hover can brighten it. */
const REST_ALPHA = 0.85;
