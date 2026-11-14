import { Geom, Scene, Scenes, type GameObjects } from 'phaser';
import { paletteNumber } from '../../ui/kit/palette.ts';
import { EventBus } from '../EventBus.ts';
import { currentBody, isDepleted, type BodyId, type Run } from '../sim/index.ts';
import { bodySprite } from './landedView.ts';
import {
  BRACKET_ARM,
  BRACKET_GAP,
  CHART,
  chartReducer,
  crossSegments,
  dashedSegments,
  initialChartState,
  layoutChart,
  MARK_GAP,
  ringSegments,
  routeEnds,
  type ChartCommand,
  type ChartLayout,
  type ChartNode,
  type ChartState,
} from './navChartView.ts';
import { SceneKey } from './keys.ts';

export interface NavChartData {
  /** The Run whose Star System the chart shows. */
  readonly run: Run;
}

/** Smallest hit circle (px): a 12 px Moon would be fiddly to click otherwise. */
const MIN_HIT_RADIUS = 9;

/**
 * The Nav Chart: the whole Star System in miniature, drawn over the dimmed Landed scene. Phaser draws the
 * chart's contents (rings, real `body_*` sprites, focus, target, route) and takes mouse input; React owns
 * the panel frame, labels and the keyboard, and the two talk only through the `EventBus`.
 */
export class NavChart extends Scene {
  private run!: Run;
  private layout!: ChartLayout;
  private chartState!: ChartState;
  private marks!: GameObjects.Graphics;

  constructor() {
    super(SceneKey.NavChart);
  }

  init(data: NavChartData): void {
    this.run = data.run;
    this.layout = layoutChart(data.run);
    this.chartState = initialChartState(data.run);
  }

  create(): void {
    this.add.rectangle(0, 0, 640, 360, paletteNumber('void'), 0.65).setOrigin(0);
    const chart = this.add.container(CHART.x, CHART.y);
    chart.add(
      this.add.rectangle(0, 0, CHART.width, CHART.height, paletteNumber('scr0'), 0.95).setOrigin(0),
    );
    chart.add(this.drawRings());
    chart.add(
      this.add.image(this.layout.star.x, this.layout.star.y, 'body_star').setOrigin(0.5, 0.5),
    );
    for (const node of this.layout.nodes) chart.add(this.addBody(node));
    this.marks = this.add.graphics();
    chart.add(this.marks);
    this.drawMarks();

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
    this.events.once(Scenes.Events.SHUTDOWN, unsubscribe);
    this.events.once(Scenes.Events.DESTROY, unsubscribe);

    EventBus.emit('nav-chart-state', this.chartState);
  }

  private apply(command: ChartCommand): void {
    const before = this.chartState;
    this.chartState = chartReducer(this.run, this.layout, before, command);
    if (
      this.chartState.focusedId === before.focusedId &&
      this.chartState.selectedId === before.selectedId
    ) {
      return;
    }
    this.drawMarks();
    EventBus.emit('nav-chart-state', this.chartState);
    if (this.chartState.selectedId !== before.selectedId) {
      EventBus.emit('nav-target-selected', this.chartState.selectedId);
    }
  }

  /** The orbit rings, and the Heliopause (dashed violet), clipped to the chart. */
  private drawRings(): GameObjects.Graphics {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, paletteNumber('cy0'));
    for (const planet of this.run.starSystem.planets) {
      for (const { from, to } of ringSegments(
        this.layout.star,
        this.layout.orbitRadius(planet.id),
      )) {
        graphics.lineBetween(...from, ...to);
      }
    }
    graphics.lineStyle(1, paletteNumber('vi2'));
    const segments = ringSegments(this.layout.star, this.layout.heliopauseRadius);
    // Every other short segment: a dashed ring.
    for (const [index, { from, to }] of segments.entries()) {
      if (index % 4 < 2) graphics.lineBetween(...from, ...to);
    }
    return graphics;
  }

  /** A Body's real sprite at 1x, with a hit circle for the mouse. */
  private addBody(node: ChartNode): GameObjects.Image {
    const image = this.add.image(node.x, node.y, bodySprite(this.run, node.body));
    const radius = Math.max(node.radius, MIN_HIT_RADIUS);
    const hitArea = new Geom.Circle(image.width / 2, image.height / 2, radius);
    image.setInteractive({
      hitArea,
      hitAreaCallback: (area: Geom.Circle, x: number, y: number) => area.contains(x, y),
    });
    if (image.input) image.input.cursor = 'pointer';
    image.on('pointerover', () => {
      this.apply({ kind: 'focus', id: node.body.id });
    });
    image.on('pointerdown', () => {
      this.apply({ kind: 'click', id: node.body.id });
    });
    return image;
  }

  /** Where the Spacecraft is, what has focus, and the chosen target with its route. */
  private drawMarks(): void {
    const g = this.marks;
    g.clear();
    const at = (id: BodyId): ChartNode | undefined =>
      this.layout.nodes.find((n) => n.body.id === id);

    // Gas Giants carry a dotted ring: no surface to land on (shape, not just colour).
    for (const node of this.layout.nodes) {
      if (node.body.kind === 'gas-giant') this.dottedRing(node, node.radius + MARK_GAP);
    }

    // A Depleted Body is crossed out: an X over it, which is a shape, not just a colour.
    g.lineStyle(1, paletteNumber('am3'));
    for (const node of this.layout.nodes) {
      if (!isDepleted(this.run, node.body.id)) continue;
      for (const { from, to } of crossSegments(node)) g.lineBetween(...from, ...to);
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
      for (const { from, to } of dashedSegments(...routeEnds(here, target), 2, 2)) {
        g.lineBetween(...from, ...to);
      }
      g.strokeRect(
        target.x - target.radius - MARK_GAP,
        target.y - target.radius - MARK_GAP,
        2 * (target.radius + MARK_GAP),
        2 * (target.radius + MARK_GAP),
      );
    }

    const focus = at(this.chartState.focusedId);
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
  private cornerBrackets(node: ChartNode, half: number): void {
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
