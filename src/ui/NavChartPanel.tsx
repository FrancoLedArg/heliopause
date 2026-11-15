import { useEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent } from 'react';
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
  tooltipKindExtra,
  type ChartCommand,
  type ChartState,
  type Direction,
} from '../game/scenes/navChartView.ts';
import {
  carriesJumpDrive,
  currentBody,
  findBody,
  HELIOPAUSE,
  isDepleted,
  planHop,
  type Body,
  type HopTarget,
  type Run,
} from '../game/sim/index.ts';
import {
  bodyStatusLabel,
  bodyFullLabel,
  bodyTypeLabel,
  formatDistanceAu,
  formatGravity,
} from './format.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import { ResourceIcon } from './ResourceIcon.tsx';
import { yieldIcon, type YieldIcon } from './yieldIcon.ts';
import { DELTA_V_EXPLANATION, describeHopPlan } from './hopPlanView.ts';
import { Disclosure, DisclosurePanel, HelpToggle } from './Disclosure.tsx';
import { HopPlan } from './HopPlan.tsx';

const PANEL = { x: 8, y: 52, width: 432, height: 284 } as const;
const SIDE = { x: 444, y: 52, width: 188, height: 284 } as const;
const TITLEBAR_HEIGHT = 14;
/** The target name is 16 px Silkscreen, 9 to 13 px a character across 164 px; longer wraps. */
const LONG_TARGET_NAME = 12;

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
  /** A Daily Run: its Launch never takes the test-only Cruise leak. */
  daily?: boolean;
}

/**
 * The panel round the Nav Chart: frame, title, a label for each Body, a tooltip for the focused Body,
 * the Hop plan side panel (target, Success Chance, Δv bar, Fuel gauge, Cancel and Launch) and the keyboard. The chart itself is Phaser's,
 * behind this layer; this layer sends key presses to it as commands and shows what it reports back.
 */
export function NavChartPanel({ run, state, daily = false }: NavChartPanelProps) {
  const layout = useMemo(() => layoutChart(run), [run]);
  const here = currentBody(run);
  const bodyOf = (id: HopTarget): Body | undefined =>
    id === HELIOPAUSE ? undefined : findBody(run.starSystem, id);
  const focused = bodyOf(state.focusedId);
  if (!focused && state.focusedId !== HELIOPAUSE) {
    throw new Error(`Nav Chart is focused on unknown Body ${state.focusedId}`);
  }
  // The chosen target: a Body, or the Heliopause (`targetIsEdge`, with no Body).
  const target = state.selectedId === undefined ? undefined : bodyOf(state.selectedId);
  const targetIsEdge = state.selectedId === HELIOPAUSE;
  const hasTarget = target !== undefined || targetIsEdge;
  const status = targetStatus(run, state.focusedId);
  const inspect = focused ? inspectBody(run, focused) : inspectHeliopause(run);

  // Labels and tooltip take about a millisecond, and the panel only renders when the chart changes.
  const context = { hereId: here.id, targetId: state.selectedId, focusedId: state.focusedId };
  const labels = placeLabels(layout, context);
  const kindExtra = tooltipKindExtra(inspect.kind);
  const tipHeight = tooltipHeight(status.valid ? undefined : status.why, kindExtra);
  const tooltip = placeTooltip(layout, context, tipHeight, labels);

  const planned = state.selectedId === undefined ? undefined : planHop(run, state.selectedId);
  const view =
    planned?.kind === 'planned' && hasTarget ? describeHopPlan(run, planned.plan) : undefined;

  // A long target name wraps onto a second line, so the target block is taller and the plan moves down.
  const targetYield = target ? yieldIcon(run, target) : undefined;
  const longTarget = target !== undefined && target.name.length > LONG_TARGET_NAME;

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

  // The panel is modal: Tab goes round the chart, Cancel, Launch and the toggles and never leaves.
  // Launch is disabled until there is a target, so the loop ends on the last button that can take focus.
  const onPanelKey = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Tab') return;
    const first = chartRef.current;
    const last = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:enabled')].at(
      -1,
    );
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const optionId = (id: HopTarget): string => `nav-option-${id}`;
  const stateWords = (body: Body): string => {
    const words = [bodyFullLabel(run, body)];
    if (body.id === here.id) words.push('you are here');
    if (!body.landable) words.push('no surface');
    const icon = yieldIcon(run, body);
    if (icon) words.push(icon.name);
    if (body.id === target?.id) words.push('target');
    return words.join(', ');
  };
  const edgeStatus = targetStatus(run, HELIOPAUSE);
  const at = (box: { x: number; y: number }): CSSProperties => ({
    left: CHART.x + box.x,
    top: CHART.y + box.y,
  });

  return (
    <section
      className={longTarget ? 'nav-chart nav-chart--long-target' : 'nav-chart'}
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
        aria-activedescendant={optionId(state.focusedId)}
        aria-describedby="nav-chart-keys"
        onKeyDown={onChartKey}
        style={{ left: CHART.x, top: CHART.y, width: CHART.width, height: CHART.height }}
      >
        {layout.nodes.map(({ body }) => (
          <div
            key={body.id}
            id={optionId(body.id)}
            role="option"
            aria-selected={body.id === target?.id}
            aria-disabled={!targetStatus(run, body.id).valid}
            className="sr-only"
          >
            {body.name}, {stateWords(body)}
          </div>
        ))}
        <div
          id={optionId(HELIOPAUSE)}
          role="option"
          aria-selected={targetIsEdge}
          aria-disabled={!edgeStatus.valid}
          className="sr-only"
        >
          Heliopause, the edge of the Star System,{' '}
          {edgeStatus.valid ? 'can be the target' : edgeStatus.why}
          {targetIsEdge ? ', target' : ''}
        </div>
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
        className={
          kindExtra > 0
            ? 'nav-chart__tooltip nav-chart__tooltip--wrapped-kind'
            : 'nav-chart__tooltip'
        }
        data-testid="inspect"
        style={{ ...at(tooltip), width: TOOLTIP_SIZE.w, height: tipHeight }}
      >
        <KitFrame
          frame={status.valid ? 'tooltip' : 'tooltip_warn'}
          width={TOOLTIP_SIZE.w}
          height={tipHeight}
          className="nav-chart__tooltip-frame"
        />
        <h2 className="nav-chart__tip-name">{inspect.name}</h2>
        <p className="nav-chart__tip-kind">{inspect.kind}</p>
        <p className="nav-chart__tip-fact">{inspect.fact}</p>
        <p
          className={`nav-chart__badge ${inspect.badge.ok ? 'nav-chart__badge--ok' : 'nav-chart__badge--warn'}`}
          data-testid="landable"
        >
          {inspect.yield ? (
            <ResourceIcon
              resource={inspect.yield.resource}
              depleted={inspect.yield.depleted}
              className="resource-icon--inline"
            />
          ) : (
            <KitFrame frame={inspect.badge.frame} />
          )}
          {inspect.badge.text}
          {inspect.badge.note && (
            <span data-testid="tip-composition">{` · ${inspect.badge.note}`}</span>
          )}
        </p>
        {!status.valid && (
          <p className="nav-chart__tip-verdict" data-testid="verdict">
            {status.why}
          </p>
        )}
      </div>

      <p id="nav-chart-keys" className="sr-only">
        Arrow keys look at a Body; Page Up and Page Down step through them all, out to the
        Heliopause; Enter makes the focused Body the target; Escape closes.
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
        <div className="nav-chart__target-head">
          <p className="nav-chart__target-label">
            <span className="sr-only">Target</span>
            {view ? (
              <span
                className={`nav-chart__reach nav-chart__reach--${view.reach.kind}`}
                role="img"
                aria-label={view.reach.label}
                data-testid="target-reach"
              >
                <KitFrame frame={view.reach.frame} />
              </span>
            ) : (
              <span aria-hidden="true">Target</span>
            )}
          </p>
          {targetIsEdge && (
            <p className="nav-chart__badge nav-chart__badge--ok">
              <KitFrame frame="badge_ok" />
              <span data-testid="target-composition">No Landing</span>
            </p>
          )}
          {target && (
            <p
              className={`nav-chart__badge ${isDepleted(run, target.id) ? 'nav-chart__badge--warn' : 'nav-chart__badge--ok'}`}
            >
              {isDepleted(run, target.id) ? (
                <>
                  <TargetYield icon={targetYield} fallback="badge_warning" />
                  <span data-testid="target-composition">Depleted · no yield</span>
                </>
              ) : (
                <>
                  <TargetYield icon={targetYield} fallback="badge_ok" />
                  Landable
                  <span data-testid="target-composition">{` · ${bodyStatusLabel(run, target)}`}</span>
                </>
              )}
            </p>
          )}
        </div>
        <p className="nav-chart__target-name">
          {target ? target.name : targetIsEdge ? 'Heliopause' : 'None chosen'}
        </p>
        {targetIsEdge && (
          <p className="nav-chart__target-kind" data-testid="target-kind">
            <span data-testid="target-type">Star System edge</span>
            {' · '}
            <span className="nav-chart__target-gravity" data-testid="target-gravity">
              {formatDistanceAu(run.starSystem.heliopauseRadius)}
            </span>
          </p>
        )}
        {target && (
          <p className="nav-chart__target-kind" data-testid="target-kind">
            <span data-testid="target-type">{bodyTypeLabel(run, target)}</span>
            {' · '}
            <span className="nav-chart__target-gravity" data-testid="target-gravity">
              {formatGravity(target.surfaceGravity)}
            </span>
          </p>
        )}
        <KitFrame frame="divider" width={164} height={5} className="nav-chart__divider" />
      </div>

      {/* Announces each new plan; always in the page, so a change of text is what gets read out. */}
      <p className="sr-only" role="status" data-testid="plan-summary">
        {view?.summary ?? ''}
      </p>

      <div className="nav-chart__actions">
        <KitButton
          width={76}
          onClick={
            hasTarget
              ? () => {
                  cancelPlan();
                  chartRef.current?.focus();
                }
              : requestClose
          }
          aria-keyshortcuts={hasTarget ? undefined : 'Escape'}
        >
          {hasTarget ? 'Cancel' : 'Close'}
        </KitButton>
        <KitButton
          width={80}
          variant="primary"
          disabled={!hasTarget}
          onClick={() => {
            // The Landed scene flies the Hop and starts its playback, which closes this panel.
            if (state.selectedId !== undefined) {
              EventBus.emit('hop-launch-requested', state.selectedId, daily);
            }
          }}
        >
          Launch
        </KitButton>
      </div>

      {/* The plan and the Δv help come after Cancel and Launch in the page: Tab reaches the decision
          first, then "Tell me more" and the "?". The help waits behind the "?" in the chart's title
          bar, so nothing covers the map. */}
      <HopPlan view={view} />
      <Disclosure>
        <HelpToggle label="What is Δv?" className="nav-chart__help-toggle" />
        <DisclosurePanel className="nav-chart__help">
          <p data-testid="plan-explain">{DELTA_V_EXPLANATION}</p>
        </DisclosurePanel>
      </Disclosure>
    </section>
  );
}

/** The Hop plan target's yield icon in place of the badge's check mark; the kit badge if it has none. */
function TargetYield({
  icon,
  fallback,
}: {
  icon: YieldIcon | undefined;
  fallback: 'badge_ok' | 'badge_warning';
}) {
  return icon ? (
    <ResourceIcon
      resource={icon.resource}
      depleted={icon.depleted}
      className="resource-icon--inline"
    />
  ) : (
    <KitFrame frame={fallback} />
  );
}

/** What the tooltip says about the focused Body or the Heliopause. */
interface Inspected {
  readonly name: string;
  readonly kind: string;
  readonly fact: string;
  /** What the Body yields, if it can be landed on. */
  readonly yield: YieldIcon | undefined;
  /** A kit badge and its words (never colour alone): `ok` reads green, otherwise amber. */
  readonly badge: {
    readonly frame: 'badge_ok' | 'badge_warning' | 'badge_lock';
    readonly ok: boolean;
    readonly text: string;
    readonly note: string | undefined;
  };
}

function inspectBody(run: Run, body: Body): Inspected {
  const depleted = isDepleted(run, body.id);
  return {
    name: body.name,
    kind: bodyTypeLabel(run, body),
    fact: `${formatGravity(body.surfaceGravity)} · ${formatDistanceAu(body.distanceFromStar)}`,
    yield: yieldIcon(run, body),
    badge: {
      frame: !body.landable ? 'badge_lock' : depleted ? 'badge_warning' : 'badge_ok',
      ok: body.landable && !depleted,
      text: body.landable ? 'Landable' : 'No surface',
      note: bodyStatusLabel(run, body),
    },
  };
}

/** The Heliopause: the edge of the Star System, which only a Spacecraft with a Jump Drive may target. */
function inspectHeliopause(run: Run): Inspected {
  const ready = carriesJumpDrive(run.spacecraft);
  return {
    name: 'Heliopause',
    kind: 'Star System edge',
    fact: `${formatDistanceAu(run.starSystem.heliopauseRadius)} from the star`,
    yield: undefined,
    badge: {
      frame: ready ? 'badge_ok' : 'badge_lock',
      ok: ready,
      text: ready ? 'Jump Drive ready' : 'Needs a Jump Drive',
      note: undefined,
    },
  };
}
