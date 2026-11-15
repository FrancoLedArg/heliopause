import { useEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { EventBus } from '../game/EventBus.ts';
import {
  edgeMarkers,
  MAP_AREA,
  PLAN_MAP_AREA,
  placeCard,
  placeMapLabels,
  toScreen,
  ZOOM,
} from '../game/scenes/navChartMap.ts';
import {
  layoutChart,
  targetStatus,
  TOOLTIP_SIZE,
  tooltipHeight,
  tooltipKindExtra,
  type ChartCommand,
  type ChartState,
  type Direction,
  type Rect,
} from '../game/scenes/navChartView.ts';
import {
  bodyKnowledge,
  carriesJumpDrive,
  currentBody,
  astronomicalUnits,
  distanceBetween,
  findBody,
  HELIOPAUSE,
  isDepleted,
  isInHopRange,
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
import { DELTA_V_EXPLANATION, describeHopPlan, type HopPlanView } from './hopPlanView.ts';
import { Disclosure, DisclosurePanel, HelpToggle } from './Disclosure.tsx';
import { HopPlan } from './HopPlan.tsx';

/** The Hop plan's side panel, on the right of the map once a target is chosen. */
const SIDE = { x: 444, y: 52, width: 188, height: 284 } as const;
const TITLEBAR_HEIGHT = 14;
/** The target name is 16 px Silkscreen, 9 to 13 px a character across 164 px; longer wraps. */
const LONG_TARGET_NAME = 12;
/** The card's "Plan Hop" row under its lines. */
const CARD_BUTTON_ROW = 28;
/** Screen pixels one press of a pan key moves the map. */
const PAN_STEP = 48;
/** Below this zoom only the names that matter (you, the target, the card's Body) are written. */
const ALL_NAMES_ZOOM = 0.8;

const ARROWS: Partial<Record<string, Direction>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/** WASD look that way over the map: the map itself moves the other way. */
const PAN_KEYS: Partial<Record<string, readonly [number, number]>> = {
  a: [PAN_STEP, 0],
  d: [-PAN_STEP, 0],
  w: [0, PAN_STEP],
  s: [0, -PAN_STEP],
};

/** The command a key press on the chart means, if any. */
function commandForKey(key: string): ChartCommand | undefined {
  const direction = ARROWS[key];
  if (direction) return { kind: 'move', direction };
  const pan = PAN_KEYS[key.toLowerCase()];
  if (pan) return { kind: 'pan', dx: pan[0], dy: pan[1] };
  if (key === 'PageDown') return { kind: 'step', delta: 1 };
  if (key === 'PageUp') return { kind: 'step', delta: -1 };
  if (key === 'Enter' || key === ' ') return { kind: 'select' };
  if (key === '+' || key === '=') return { kind: 'zoom', factor: ZOOM.step };
  if (key === '-' || key === '_') return { kind: 'zoom', factor: 1 / ZOOM.step };
  if (key === 'Home' || key.toLowerCase() === 'c') return { kind: 'recentre' };
  return undefined;
}

const send = (command: ChartCommand): void => {
  EventBus.emit('nav-chart-command', command);
};

const requestClose = (): void => {
  EventBus.emit('nav-chart-close-requested');
};

interface NavChartPanelProps {
  run: Run;
  state: ChartState;
  /** A Daily Run: its Launch never takes the test-only Cruise leak. */
  daily?: boolean;
}

/**
 * The full-screen Nav Chart's React layer (#193), over Phaser's map: the Bodies' names, a "?" over each
 * Unsurveyed one, markers at the edge for known Bodies off screen, the card of the Body the player
 * picked, then the Hop plan once they choose "Plan Hop", the chart's bar (re-centre, zoom, legend,
 * close) and the keyboard. It opens with nothing but the map: no card until the player asks.
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
  const showPlan = state.selectedId !== undefined && !state.card;
  // With the Hop plan open, its panel covers the right of the map: names and markers stay left of it.
  const area = showPlan ? PLAN_MAP_AREA : MAP_AREA;

  const planned = state.selectedId === undefined ? undefined : planHop(run, state.selectedId);
  const view = planned?.kind === 'planned' ? describeHopPlan(run, planned.plan) : undefined;

  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chartRef.current?.focus();
  }, []);

  // Escape closes the card if one is open, else the chart; M, the key that opened it, closes it.
  const cardOpen = state.card;
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      const isM =
        event.key.toLowerCase() === 'm' && !event.ctrlKey && !event.metaKey && !event.altKey;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (cardOpen) send({ kind: 'dismiss' });
        else requestClose();
      } else if (isM && !event.repeat) {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [cardOpen]);

  const onChartKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const command = commandForKey(event.key);
    if (!command) return;
    event.preventDefault();
    if (!event.repeat || command.kind !== 'select') send(command);
  };

  // The chart is modal: Tab goes round the map, the card or the plan and the chart's bar, and never
  // leaves. The edge markers are for the mouse; the keys reach every Body already.
  const onPanelKey = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Tab') return;
    const first = chartRef.current;
    const last = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        'button:enabled:not([tabindex="-1"])',
      ),
    ].at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const nameOf = (id: HopTarget): string => bodyOf(id)?.name ?? 'Heliopause';
  const optionId = (id: HopTarget): string => `nav-option-${id}`;
  const stateWords = (body: Body): string => {
    const surveyed = bodyKnowledge(run, body.id) === 'surveyed';
    const words = surveyed ? [bodyFullLabel(run, body)] : ['Unsurveyed'];
    if (body.id === here.id) words.push('you are here');
    if (surveyed && !body.landable) words.push('no surface');
    const icon = surveyed ? yieldIcon(run, body) : undefined;
    if (icon) words.push(icon.name);
    if (!isInHopRange(run, body.id)) words.push('out of Hop range');
    if (body.id === target?.id) words.push('target');
    return words.join(', ');
  };
  const edgeStatus = targetStatus(run, HELIOPAUSE);

  // The names on the map: where you are and the target first, so they get their first choice of spot.
  const named = new Set<HopTarget>([here.id]);
  if (state.selectedId !== undefined) named.add(state.selectedId);
  if (state.card) named.add(state.focusedId);
  // The Heliopause is the way out: once found, it is always named.
  if (layout.heliopause) named.add(HELIOPAUSE);
  if (state.view.zoom >= ALL_NAMES_ZOOM) {
    for (const node of layout.nodes) named.add(node.body.id);
  }
  const noteOf = (id: HopTarget): string =>
    id === here.id ? ' · you' : id === state.selectedId ? ' · target' : '';
  // A Body off screen has its marker at the edge instead; a name half off the side slides back on.
  const labels = placeMapLabels(
    state.view,
    layout,
    [...named].map((id) => ({ id, text: `${nameOf(id)}${noteOf(id)}` })),
  )
    .filter(
      ({ box }) =>
        box.y >= area.y &&
        box.y + box.h <= area.y + area.h &&
        box.x + box.w > area.x &&
        box.x < area.x + area.w,
    )
    .map((label) => ({
      ...label,
      box: {
        ...label.box,
        x: Math.min(Math.max(label.box.x, area.x + 2), area.x + area.w - label.box.w - 2),
      },
    }));
  const labelKind = (id: HopTarget): string =>
    id === here.id
      ? 'here'
      : id === state.selectedId
        ? 'target'
        : id === HELIOPAUSE
          ? 'heliopause'
          : state.card && id === state.focusedId
            ? 'focused'
            : 'planet';

  const unsurveyed = layout.nodes.flatMap((node) => {
    if (bodyKnowledge(run, node.body.id) === 'surveyed') return [];
    const at = toScreen(state.view, node);
    // Off screen, its edge marker stands in for it.
    const onScreen =
      at.y - 14 >= area.y &&
      at.y <= area.y + area.h &&
      at.x >= area.x &&
      at.x + 12 <= area.x + area.w;
    return onScreen ? [{ id: node.body.id, at }] : [];
  });

  return (
    <section
      className={
        target !== undefined && target.name.length > LONG_TARGET_NAME
          ? 'nav-chart nav-chart--long-target'
          : 'nav-chart'
      }
      role="dialog"
      aria-modal="true"
      aria-label="Nav Chart"
      onKeyDown={onPanelKey}
    >
      <div
        ref={chartRef}
        className="nav-chart__chart"
        role="listbox"
        tabIndex={0}
        aria-label="Bodies in the Star System"
        aria-activedescendant={optionId(state.focusedId)}
        aria-describedby="nav-chart-keys"
        onKeyDown={onChartKey}
        style={{ left: MAP_AREA.x, top: MAP_AREA.y, width: MAP_AREA.w, height: MAP_AREA.h }}
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
        {/* The Heliopause is an option only once it is found. */}
        {layout.heliopause && (
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
        )}
      </div>

      {labels.map(({ id, box }) => (
        <p
          key={id}
          className={`nav-chart__label nav-chart__label--${labelKind(id)}`}
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          aria-hidden="true"
        >
          {nameOf(id)}
          {noteOf(id)}
        </p>
      ))}

      {unsurveyed.map(({ id, at }) => (
        <span
          key={id}
          className="nav-chart__unsurveyed"
          role="img"
          aria-label={`${nameOf(id)}: Unsurveyed${isInHopRange(run, id) ? '' : ', out of Hop range'}`}
          data-testid="unsurveyed-mark"
          style={{ left: Math.round(at.x + 4), top: Math.round(at.y - 13) }}
        >
          ?
        </span>
      ))}

      {edgeMarkers(state.view, layout, area).map((marker) => (
        <button
          key={marker.id}
          type="button"
          tabIndex={-1}
          className={`nav-chart__marker${marker.id === here.id ? ' nav-chart__marker--here' : ''}${marker.id === state.selectedId ? ' nav-chart__marker--target' : ''}`}
          aria-label={`${nameOf(marker.id)}, off screen`}
          data-testid="edge-marker"
          style={{ left: marker.x - 6, top: marker.y - 6 }}
          onClick={() => {
            send({ kind: 'click', id: marker.id });
          }}
        >
          <span
            className="nav-chart__marker-arrow"
            style={{ transform: `rotate(${String(marker.angle)}rad)` }}
          />
        </button>
      ))}

      <p id="nav-chart-keys" className="sr-only">
        Arrow keys and Page Up or Down open the next Body&apos;s card; Enter plans the Hop there; W,
        A, S and D move the map; plus and minus zoom; C re-centres; Escape closes the card, then the
        chart.
      </p>

      {state.card && (
        <BodyCard
          run={run}
          state={state}
          layout={layout}
          focused={focused}
          keptNames={labels
            .filter(({ id }) => id === here.id || id === state.selectedId || id === state.focusedId)
            .map(({ box }) => box)}
          onPlan={() => {
            send({ kind: 'plan' });
            chartRef.current?.focus();
          }}
        />
      )}

      {showPlan && (
        <PlanPanel
          run={run}
          target={target}
          targetIsEdge={targetIsEdge}
          view={view}
          onCancel={() => {
            send({ kind: 'clear' });
            chartRef.current?.focus();
          }}
          onLaunch={() => {
            // The Landed scene flies the Hop and starts its playback, which closes this panel.
            if (state.selectedId !== undefined) {
              EventBus.emit('hop-launch-requested', state.selectedId, daily);
            }
          }}
        />
      )}
      {/* Announces each new plan; always in the page, so a change of text is what gets read out. */}
      <p className="sr-only" role="status" data-testid="plan-summary">
        {view?.summary ?? ''}
      </p>

      <div className="nav-chart__bar">
        {/* The top bar already names the Star System; the chart's own name is for screen readers. */}
        <h1 className="sr-only">Nav Chart</h1>
        <div className="nav-chart__bar-buttons">
          <KitButton
            width={24}
            aria-label="Zoom out"
            aria-keyshortcuts="-"
            onClick={() => {
              send({ kind: 'zoom', factor: 1 / ZOOM.step });
            }}
          >
            <KitFrame frame="icon_minus" />
          </KitButton>
          <KitButton
            width={24}
            aria-label="Zoom in"
            aria-keyshortcuts="+"
            onClick={() => {
              send({ kind: 'zoom', factor: ZOOM.step });
            }}
          >
            <KitFrame frame="icon_plus" />
          </KitButton>
          <KitButton
            width={24}
            aria-label="Re-centre on the Spacecraft"
            aria-keyshortcuts="C"
            data-testid="recentre"
            onClick={() => {
              send({ kind: 'recentre' });
            }}
          >
            <KitFrame frame="icon_home" />
          </KitButton>
          <Disclosure>
            <HelpToggle label="Chart legend" className="nav-chart__legend-toggle" />
            <DisclosurePanel className="nav-chart__legend">
              <ul>
                <li>
                  <span className="nav-chart__legend-blip" aria-hidden="true" />
                  Detected
                </li>
                <li>
                  <span className="nav-chart__legend-sprite" aria-hidden="true" />
                  Surveyed
                </li>
              </ul>
            </DisclosurePanel>
          </Disclosure>
          <KitButton width={56} onClick={requestClose} aria-keyshortcuts="M">
            Close
          </KitButton>
        </div>
      </div>
    </section>
  );
}

/**
 * The picked Body's card, beside it and never over it, where the Spacecraft is, or the target: its name,
 * what the player knows of it, how far it is, whether the Fuel reaches it, and "Plan Hop". An
 * Unsurveyed Body shows a "?" for its type, gravity and resources: only its place is known.
 */
function BodyCard({
  run,
  state,
  layout,
  focused,
  keptNames,
  onPlan,
}: {
  run: Run;
  state: ChartState;
  layout: ReturnType<typeof layoutChart>;
  focused: Body | undefined;
  /** The names the card keeps off: where you are, the target and its own Body. */
  keptNames: readonly Rect[];
  onPlan: () => void;
}) {
  const status = targetStatus(run, state.focusedId);
  const inspect = focused ? inspectBody(run, focused) : inspectHeliopause(run);
  const planned = status.valid ? planHop(run, state.focusedId) : undefined;
  const reach: HopPlanView['reach'] | undefined =
    planned?.kind === 'planned' ? describeHopPlan(run, planned.plan).reach : undefined;
  const kindExtra = tooltipKindExtra(inspect.kind);
  const lines = tooltipHeight(status.valid ? (reach?.word ?? '') : status.why, kindExtra);
  const height = lines + (status.valid ? CARD_BUTTON_ROW : 0);
  const box = placeCard(
    state.view,
    layout,
    { card: state.focusedId, here: currentBody(run).id, target: state.selectedId },
    { w: TOOLTIP_SIZE.w, h: height },
    keptNames,
  );
  const style: CSSProperties = { left: box.x, top: box.y, width: box.w, height: box.h };
  return (
    <div
      className={
        kindExtra > 0
          ? 'nav-chart__tooltip nav-chart__card nav-chart__tooltip--wrapped-kind'
          : 'nav-chart__tooltip nav-chart__card'
      }
      data-testid="inspect"
      style={style}
    >
      <KitFrame
        frame={status.valid ? 'tooltip' : 'tooltip_warn'}
        width={box.w}
        height={box.h}
        className="nav-chart__tooltip-frame"
      />
      <h2 className="nav-chart__tip-name">{inspect.name}</h2>
      <p className="nav-chart__tip-kind">{inspect.kind}</p>
      <p className="nav-chart__tip-fact" data-testid="card-distance">
        {inspect.fact}
      </p>
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
      {status.valid ? (
        reach && (
          <p
            className={`nav-chart__tip-verdict nav-chart__tip-reach nav-chart__reach--${reach.kind}`}
            role="img"
            aria-label={reach.label}
            data-testid="card-reach"
          >
            <KitFrame frame={reach.frame} />
            <span aria-hidden="true">{reach.word}</span>
          </p>
        )
      ) : (
        <p className="nav-chart__tip-verdict" data-testid="verdict">
          {status.why}
        </p>
      )}
      {status.valid && (
        <KitButton width={80} variant="primary" className="nav-chart__plan-hop" onClick={onPlan}>
          Plan Hop
        </KitButton>
      )}
    </div>
  );

  /** What the card says about a Body: an Unsurveyed one keeps its type, gravity and resources hidden. */
  function inspectBody(r: Run, body: Body): Inspected {
    const away = formatDistanceAu(
      astronomicalUnits(distanceBetween(r.starSystem, currentBody(r), body)),
    );
    if (bodyKnowledge(r, body.id) !== 'surveyed') {
      return {
        name: body.name,
        kind: 'Unsurveyed',
        fact: `${away} away`,
        yield: undefined,
        badge: { frame: 'badge_info', ok: true, text: '? Unknown', note: undefined },
      };
    }
    const depleted = isDepleted(r, body.id);
    return {
      name: body.name,
      kind: bodyTypeLabel(r, body),
      fact: `${formatGravity(body.surfaceGravity)} · ${away} away`,
      yield: yieldIcon(r, body),
      badge: {
        frame: !body.landable ? 'badge_lock' : depleted ? 'badge_warning' : 'badge_ok',
        ok: body.landable && !depleted,
        text: body.landable ? 'Landable' : 'No surface',
        note: bodyStatusLabel(r, body),
      },
    };
  }
}

/** The Hop plan, on the right of the map once a target is chosen: target, plan, Cancel and Launch. */
function PlanPanel({
  run,
  target,
  targetIsEdge,
  view,
  onCancel,
  onLaunch,
}: {
  run: Run;
  target: Body | undefined;
  targetIsEdge: boolean;
  view: HopPlanView | undefined;
  onCancel: () => void;
  onLaunch: () => void;
}) {
  const targetYield = target ? yieldIcon(run, target) : undefined;
  const surveyed = target !== undefined && bodyKnowledge(run, target.id) === 'surveyed';
  return (
    <>
      <div className="nav-chart__side" style={{ left: SIDE.x, top: SIDE.y }}>
        <KitFrame frame="panel_metal" width={SIDE.width} height={SIDE.height} />
      </div>
      <div
        className="nav-chart__titlebar"
        style={{ left: SIDE.x + 8, top: SIDE.y + 8, width: SIDE.width - 16 }}
      >
        <KitFrame frame="titlebar" width={SIDE.width - 16} height={TITLEBAR_HEIGHT} />
        <h2 className="nav-chart__title nav-chart__plan-title">Hop plan</h2>
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
          {target && !surveyed && (
            <p className="nav-chart__badge nav-chart__badge--ok">
              <KitFrame frame="badge_info" />
              <span data-testid="target-composition">Unsurveyed</span>
            </p>
          )}
          {target && surveyed && (
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
                  <span data-testid="target-composition">{` · ${bodyStatusLabel(run, target) ?? ''}`}</span>
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
        {target && surveyed && (
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

      <div className="nav-chart__actions">
        <KitButton width={76} onClick={onCancel}>
          Cancel
        </KitButton>
        <KitButton width={80} variant="primary" data-testid="hop-launch" onClick={onLaunch}>
          Launch
        </KitButton>
      </div>

      {/* The plan and the Δv help come after Cancel and Launch in the page: Tab reaches the decision
          first, then "Tell me more" and the "?" in the plan's title bar. */}
      <HopPlan view={view} />
      <Disclosure>
        <HelpToggle label="What is Δv?" className="nav-chart__help-toggle" />
        <DisclosurePanel className="nav-chart__help">
          <p data-testid="plan-explain">{DELTA_V_EXPLANATION}</p>
        </DisclosurePanel>
      </Disclosure>
    </>
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

/** What the card says about the picked Body or the Heliopause. */
interface Inspected {
  readonly name: string;
  readonly kind: string;
  readonly fact: string;
  /** What the Body yields, if it can be landed on and is Surveyed. */
  readonly yield: YieldIcon | undefined;
  /** A kit badge and its words (never colour alone): `ok` reads green, otherwise amber. */
  readonly badge: {
    readonly frame: 'badge_ok' | 'badge_warning' | 'badge_lock' | 'badge_info';
    readonly ok: boolean;
    readonly text: string;
    readonly note: string | undefined;
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
