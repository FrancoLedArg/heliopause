import { useEffect, useRef, type KeyboardEvent } from 'react';
import { EventBus } from '../game/EventBus.ts';
import {
  CHART,
  layoutChart,
  targetStatus,
  type ChartCommand,
  type ChartState,
  type Direction,
} from '../game/scenes/navChartView.ts';
import { currentBody, findBody, type Body, type Run } from '../game/sim/index.ts';
import { bodyTypeLabel, formatDistanceAu, formatGravity } from './format.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';

const PANEL = { x: 8, y: 52, width: 432, height: 284 } as const;
const SIDE = { x: 444, y: 52, width: 188, height: 284 } as const;

const ARROWS: Partial<Record<string, Direction>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/** The command a key press on the chart means, if any. */
function commandForKey(key: string): ChartCommand | undefined {
  const direction = ARROWS[key];
  if (direction) return { kind: 'move', direction };
  if (key === 'PageDown') return { kind: 'step', delta: 1 };
  if (key === 'PageUp') return { kind: 'step', delta: -1 };
  if (key === 'Enter' || key === ' ') return { kind: 'select' };
  return undefined;
}

/** A label sits under its Body, or above it when it would run off the bottom of the chart. */
function labelTop(y: number, radius: number): number {
  const LABEL_HEIGHT = 8;
  const below = y + radius + 3;
  return below + LABEL_HEIGHT > CHART.height ? y - radius - 3 - LABEL_HEIGHT : below;
}

const requestClose = (): void => {
  EventBus.emit('nav-chart-close-requested');
};

interface NavChartPanelProps {
  run: Run;
  state: ChartState;
}

/**
 * The panel round the Nav Chart: frame, title, a label for each Body, the Body inspector and the
 * keyboard. The chart itself is Phaser's (behind this layer, so the translucent frame lets it show);
 * this layer sends key presses to it as commands and shows what it reports back.
 */
export function NavChartPanel({ run, state }: NavChartPanelProps) {
  const layout = layoutChart(run);
  const here = currentBody(run);
  const focused = findBody(run.starSystem, state.focusedId);
  const target =
    state.selectedId === undefined ? undefined : findBody(run.starSystem, state.selectedId);
  if (!focused) throw new Error(`Nav Chart is focused on unknown Body ${state.focusedId}`);
  const status = targetStatus(run, focused.id);

  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chartRef.current?.focus();
  }, []);

  // Escape closes from anywhere in the panel, and so does M, the key that opened it.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      const isM =
        event.key.toLowerCase() === 'm' && !event.ctrlKey && !event.metaKey && !event.altKey;
      if (event.key === 'Escape' || (isM && !event.repeat)) {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const onChartKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    const command = commandForKey(event.key);
    if (!command) return;
    event.preventDefault();
    if (!event.repeat || command.kind !== 'select') EventBus.emit('nav-chart-command', command);
  };

  const optionId = (body: Body): string => `nav-option-${body.id}`;
  const stateWords = (body: Body): string => {
    const words = [bodyTypeLabel(run, body)];
    if (body.id === here.id) words.push('you are here');
    if (!body.landable) words.push('no surface');
    if (body.id === target?.id) words.push('target');
    return words.join(', ');
  };

  return (
    <section className="nav-chart" role="dialog" aria-label="Nav Chart">
      <div className="nav-chart__panel" style={{ left: PANEL.x, top: PANEL.y }}>
        <KitFrame frame="panel_holo" width={PANEL.width} height={PANEL.height} />
      </div>
      <div className="nav-chart__titlebar" style={{ left: PANEL.x + 8, top: PANEL.y + 8 }}>
        <KitFrame frame="titlebar" width={PANEL.width - 16} height={14} />
        <h1 className="nav-chart__title">Nav Chart</h1>
        <p className="nav-chart__system">{run.starSystem.name}</p>
      </div>

      <div
        ref={chartRef}
        className="nav-chart__chart"
        role="listbox"
        tabIndex={0}
        aria-label="Bodies in the Star System"
        aria-activedescendant={optionId(focused)}
        onKeyDown={onChartKey}
        style={{ left: CHART.x, top: CHART.y, width: CHART.width, height: CHART.height }}
      >
        {layout.nodes.map(({ body }) => (
          <div
            key={body.id}
            id={optionId(body)}
            role="option"
            aria-selected={body.id === target?.id}
            aria-disabled={!targetStatus(run, body.id).valid}
            className="sr-only"
          >
            {body.name}, {stateWords(body)}
          </div>
        ))}
      </div>

      {layout.nodes.map(({ body, x, y, radius }) => {
        const isHere = body.id === here.id;
        const isTarget = body.id === target?.id;
        if (body.kind === 'moon' && !isHere && !isTarget && body.id !== focused.id) return null;
        return (
          <p
            key={body.id}
            className={`nav-chart__label${isHere ? ' nav-chart__label--here' : ''}${isTarget ? ' nav-chart__label--target' : ''}`}
            style={{ left: CHART.x + x, top: CHART.y + labelTop(y, radius) }}
          >
            {body.name}
            {isHere && ' · you'}
            {isTarget && ' · target'}
          </p>
        );
      })}

      <p
        className="nav-chart__label nav-chart__label--heliopause"
        style={{
          left: CHART.x + layout.star.x + layout.heliopauseRadius - 4,
          top: CHART.y + layout.star.y - 4,
        }}
      >
        Heliopause
      </p>

      <p className="nav-chart__help">
        Arrow keys or the mouse look at a Body; Enter or a click makes it the target. PgUp and PgDn
        step through them all. Esc closes.
      </p>

      <div className="nav-chart__side" style={{ left: SIDE.x, top: SIDE.y }}>
        <KitFrame frame="panel_metal" width={SIDE.width} height={SIDE.height} />
      </div>
      <div className="nav-chart__titlebar" style={{ left: SIDE.x + 8, top: SIDE.y + 8 }}>
        <KitFrame frame="titlebar" width={SIDE.width - 16} height={14} />
        <h2 className="nav-chart__title">Body</h2>
      </div>
      <div className="nav-chart__inspect" data-testid="inspect" aria-live="polite">
        <h2 className="nav-chart__body-name">{focused.name}</h2>
        <p className="nav-chart__body-kind">{bodyTypeLabel(run, focused)}</p>
        <p className="nav-chart__body-fact">
          {focused.kind === 'gas-giant' ? 'Gravity at cloud tops' : 'Gravity'}{' '}
          {formatGravity(focused.surfaceGravity)}
        </p>
        <p className="nav-chart__body-fact">
          {formatDistanceAu(focused.distanceFromStar)} from the star
        </p>
        <p
          className={`nav-chart__badge ${focused.landable ? 'nav-chart__badge--ok' : 'nav-chart__badge--warn'}`}
          data-testid="landable"
        >
          <KitFrame frame={focused.landable ? 'badge_ok' : 'badge_lock'} />
          {focused.landable ? 'Landable' : 'No surface'}
        </p>
        <KitFrame frame="divider" width={164} height={5} className="nav-chart__divider" />
        <p className="nav-chart__verdict" data-testid="verdict">
          {status.valid ? 'Can be the target: press Enter or click.' : status.why}
        </p>
      </div>

      <div className="nav-chart__target" data-testid="target">
        <p className="nav-chart__target-label">Hop target</p>
        <p className="nav-chart__target-name">{target ? target.name : 'None chosen'}</p>
      </div>

      <KitButton
        width={76}
        className="nav-chart__close"
        onClick={requestClose}
        aria-keyshortcuts="Escape"
      >
        Close
      </KitButton>
    </section>
  );
}
