import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { EventBus } from '../game/EventBus.ts';
import {
  CHART,
  LABEL,
  layoutChart,
  placeLabels,
  placeTooltip,
  targetStatus,
  TOOLTIP_SIZE,
  tooltipHeight,
  type ChartCommand,
  type ChartState,
  type Direction,
} from '../game/scenes/navChartView.ts';
import { currentBody, findBody, planHop, type Body, type Run } from '../game/sim/index.ts';
import { bodyTypeLabel, formatDistanceAu, formatGravity } from './format.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import { DELTA_V_EXPLANATION, describeHopPlan } from './hopPlanView.ts';

const PANEL = { x: 8, y: 52, width: 432, height: 284 } as const;
const SIDE = { x: 444, y: 52, width: 188, height: 284 } as const;
const TITLEBAR_HEIGHT = 14;

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

const requestClose = (): void => {
  EventBus.emit('nav-chart-close-requested');
};

const cancelPlan = (): void => {
  EventBus.emit('nav-chart-command', { kind: 'clear' });
};

/**
 * The holo frame with the chart's rectangle cut out of it. The chart is drawn by Phaser under this
 * layer, and a translucent frame over it would dim the sprites, so nothing may cover the chart.
 */
const FRAME_CLIP = (() => {
  const [left, top] = [CHART.x - PANEL.x, CHART.y - PANEL.y];
  const [right, bottom] = [left + CHART.width, top + CHART.height];
  const hole = `${left}px ${top}px, ${left}px ${bottom}px, ${right}px ${bottom}px, ${right}px ${top}px, ${left}px ${top}px`;
  const outer = `0 0, ${PANEL.width}px 0, ${PANEL.width}px ${PANEL.height}px, 0 ${PANEL.height}px, 0 0`;
  return `polygon(evenodd, ${outer}, ${hole})`;
})();

interface NavChartPanelProps {
  run: Run;
  state: ChartState;
}

/**
 * The panel round the Nav Chart: frame, title, a label for each Body, a tooltip for the focused Body,
 * the Hop plan side panel (target, Burns, totals, Success Chance, Cancel and Launch) and the keyboard. The chart itself is Phaser's,
 * behind this layer; this layer sends key presses to it as commands and shows what it reports back.
 */
export function NavChartPanel({ run, state }: NavChartPanelProps) {
  const layout = useMemo(() => layoutChart(run), [run]);
  const here = currentBody(run);
  const focused = findBody(run.starSystem, state.focusedId);
  const target =
    state.selectedId === undefined ? undefined : findBody(run.starSystem, state.selectedId);
  if (!focused) throw new Error(`Nav Chart is focused on unknown Body ${state.focusedId}`);
  const status = targetStatus(run, focused.id);

  // Labels and tooltip take about a millisecond, and the panel only renders when the chart changes.
  const context = { hereId: here.id, targetId: state.selectedId, focusedId: state.focusedId };
  const labels = placeLabels(layout, context);
  const tipHeight = tooltipHeight(status.valid ? undefined : status.why);
  const tooltip = placeTooltip(layout, context, tipHeight, labels);

  const planned = state.selectedId === undefined ? undefined : planHop(run, state.selectedId);
  const view =
    planned?.kind === 'planned' && target ? describeHopPlan(run, planned.plan) : undefined;

  const chartRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
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

  // The panel is modal: Tab goes round the chart, Cancel and Launch and never leaves. Launch is disabled
  // until there is a target, so the loop ends on the last button that can take focus.
  const onPanelKey = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Tab') return;
    const first = chartRef.current;
    const last =
      actionsRef.current?.querySelector<HTMLButtonElement>('button:last-of-type:enabled') ??
      actionsRef.current?.querySelector('button');
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const optionId = (body: Body): string => `nav-option-${body.id}`;
  const stateWords = (body: Body): string => {
    const words = [bodyTypeLabel(run, body)];
    if (body.id === here.id) words.push('you are here');
    if (!body.landable) words.push('no surface');
    if (body.id === target?.id) words.push('target');
    return words.join(', ');
  };
  const at = (box: { x: number; y: number }): CSSProperties => ({
    left: CHART.x + box.x,
    top: CHART.y + box.y,
  });

  return (
    <section
      className="nav-chart"
      role="dialog"
      aria-modal="true"
      aria-label="Nav Chart"
      onKeyDown={onPanelKey}
    >
      <div
        className="nav-chart__panel"
        style={{ left: PANEL.x, top: PANEL.y, clipPath: FRAME_CLIP }}
      >
        <KitFrame frame="panel_holo" width={PANEL.width} height={PANEL.height} />
      </div>
      <div
        className="nav-chart__titlebar"
        style={{ left: PANEL.x + 8, top: PANEL.y + 8, width: PANEL.width - 16 }}
      >
        <KitFrame frame="titlebar" width={PANEL.width - 16} height={TITLEBAR_HEIGHT} />
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
        aria-describedby="nav-chart-keys"
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

      {labels.map((label) => (
        <p
          key={label.id}
          className={`nav-chart__label nav-chart__label--${label.kind}`}
          style={{
            ...at(label.box),
            width: label.box.w,
            height: label.box.h,
            lineHeight: `${LABEL.height + 1}px`,
          }}
        >
          {label.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>
      ))}

      <div
        className="nav-chart__tooltip"
        data-testid="inspect"
        style={{ ...at(tooltip), width: TOOLTIP_SIZE.w, height: tipHeight }}
      >
        <KitFrame
          frame={status.valid ? 'tooltip' : 'tooltip_warn'}
          width={TOOLTIP_SIZE.w}
          height={tipHeight}
          className="nav-chart__tooltip-frame"
        />
        <h2 className="nav-chart__tip-name">{focused.name}</h2>
        <p className="nav-chart__tip-kind">{bodyTypeLabel(run, focused)}</p>
        <p className="nav-chart__tip-fact">
          {formatGravity(focused.surfaceGravity)} · {formatDistanceAu(focused.distanceFromStar)}
        </p>
        <p
          className={`nav-chart__badge ${focused.landable ? 'nav-chart__badge--ok' : 'nav-chart__badge--warn'}`}
          data-testid="landable"
        >
          <KitFrame frame={focused.landable ? 'badge_ok' : 'badge_lock'} />
          {focused.landable ? 'Landable' : 'No surface'}
        </p>
        {!status.valid && (
          <p className="nav-chart__tip-verdict" data-testid="verdict">
            {status.why}
          </p>
        )}
      </div>

      <p className="nav-chart__help" data-testid="plan-explain">
        Click a Body to set it as the target. {DELTA_V_EXPLANATION}
      </p>
      <p id="nav-chart-keys" className="sr-only">
        Arrow keys look at a Body; Page Up and Page Down step through them all; Enter makes the
        focused Body the target; Escape closes.
      </p>

      <div className="nav-chart__side" style={{ left: SIDE.x, top: SIDE.y }}>
        <KitFrame frame="panel_metal" width={SIDE.width} height={SIDE.height} />
      </div>
      <div
        className="nav-chart__titlebar"
        style={{ left: SIDE.x + 8, top: SIDE.y + 8, width: SIDE.width - 16 }}
      >
        <KitFrame frame="titlebar" width={SIDE.width - 16} height={TITLEBAR_HEIGHT} />
        <h2 className="nav-chart__title">Hop plan</h2>
      </div>

      <div className="nav-chart__target" data-testid="target">
        <p className="nav-chart__target-label">Target</p>
        <p className="nav-chart__target-name">{target ? target.name : 'None chosen'}</p>
        {target && (
          <>
            <p className="nav-chart__target-kind">
              {bodyTypeLabel(run, target)} · {formatGravity(target.surfaceGravity)}
            </p>
            <p className="nav-chart__badge nav-chart__badge--ok">
              <KitFrame frame="badge_ok" />
              Landable
            </p>
          </>
        )}
        <KitFrame frame="divider" width={164} height={5} className="nav-chart__divider" />
      </div>

      <div className="nav-chart__plan" data-testid="hop-plan">
        {view ? (
          <>
            <table className="nav-chart__burns">
              <thead className="sr-only">
                <tr>
                  <th scope="col">Burn</th>
                  <th scope="col">Est. Δv</th>
                </tr>
              </thead>
              <tbody>
                {view.burns.map((burn) => (
                  <Fragment key={burn.label}>
                    <tr>
                      <th scope="row">{burn.label}</th>
                      <td>{burn.estimate}</td>
                    </tr>
                    <tr className="nav-chart__reason-row">
                      <td colSpan={2}>
                        <span className="nav-chart__reason" data-testid="burn-reason">
                          {burn.reason}
                        </span>
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
            <KitFrame frame="divider" width={164} height={5} />
            <dl className="nav-chart__totals">
              <dt>Needed</dt>
              <dd data-testid="plan-needed">{view.needed}</dd>
              <dt>Available</dt>
              <dd className="nav-chart__available" data-testid="plan-available">
                {view.available}
              </dd>
              <dd className="nav-chart__basis" data-testid="plan-basis">
                from {view.availableBasis}
              </dd>
              <dt>Margin</dt>
              <dd
                className={view.marginIsShort ? 'nav-chart__short' : undefined}
                data-testid="plan-margin"
              >
                {view.margin}
              </dd>
            </dl>
            <p
              className={`nav-chart__success ${view.low ? 'nav-chart__success--low' : 'nav-chart__success--ok'}`}
              data-testid="plan-success"
            >
              <span className="nav-chart__success-label">Success</span>
              <KitFrame frame={view.low ? 'badge_warning' : 'badge_ok'} />
              <span className="nav-chart__success-value">{view.successChance}</span>
            </p>
            {view.warning && (
              <p className="nav-chart__warning" data-testid="plan-warning">
                {view.warning}
              </p>
            )}
          </>
        ) : (
          <p className="nav-chart__explain">Pick a landable Body on the chart to plan a Hop.</p>
        )}
      </div>
      {/* Announces each new plan; always in the page, so a change of text is what gets read out. */}
      <p className="sr-only" role="status" data-testid="plan-summary">
        {view?.summary ?? ''}
      </p>

      <div ref={actionsRef} className="nav-chart__actions">
        <KitButton
          width={76}
          onClick={
            target
              ? () => {
                  cancelPlan();
                  chartRef.current?.focus();
                }
              : requestClose
          }
          aria-keyshortcuts={target ? undefined : 'Escape'}
        >
          {target ? 'Cancel' : 'Close'}
        </KitButton>
        <KitButton
          width={80}
          variant="primary"
          disabled={!target}
          onClick={() => {
            // TODO(#31): flight playback consumes this; until it lands Launch only announces the Hop.
            if (target) EventBus.emit('hop-launch-requested', target.id);
          }}
        >
          Launch
        </KitButton>
      </div>
    </section>
  );
}
