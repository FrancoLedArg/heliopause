import { useEffect, useState } from 'react';
import { imageUrl } from '../game/assets/manifest.ts';
import { EventBus } from '../game/EventBus.ts';
import { FAST_FORWARD, type FlightMoment } from '../game/scenes/flightPlayback.ts';
import {
  availableDeltaV,
  kilograms,
  starSystemNumber,
  type HopFlight,
  type Run,
} from '../game/sim/index.ts';
import { describeFlight } from './flightHudView.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import { EndOfRun, type RecordedScore } from './EndOfRun.tsx';
import { HopReport } from './HopReport.tsx';
import { TopBar } from './TopBar.tsx';
import './FlightHud.css';

const STRIP = { width: 300, height: 26 } as const;
const LOG = { width: 300, height: 78 } as const;
const FUEL = { width: 256, height: 44 } as const;
const FUEL_BAR = { width: 190, height: 10, inset: 2 } as const;
const FILL_MIN_WIDTH = 2;
const ROUTE = { width: 156, height: 44 } as const;
/** The key that turns the fast-forward on and off. */
const FAST_FORWARD_KEY = 'f';
/** The button widens to make room for the rate while it is on: a cue that is not colour. */
const FAST_FORWARD_WIDTH = 32;
const FAST_FORWARD_WIDTH_ON = 52;

interface FlightHudProps {
  /** The Run at Launch. */
  before: Run;
  flight: HopFlight;
  /** Where the playback is; undefined until its first moment. */
  moment: FlightMoment | undefined;
  /** The Run the failed Hop ended, once its playback is over: the End-of-Run screen shows it. */
  ended: Run | undefined;
  /** The player has read the failed Hop's report and moved on to the End-of-Run screen. */
  reportDone: boolean;
  /** The Best Score after the ended Run's Score was recorded; present with `ended`. */
  recorded: RecordedScore | undefined;
  /** Continue from the failed Hop's report to the End-of-Run screen. */
  onContinue: () => void;
  /** New Run after a failure: asks for a Chassis, then a new Star System. */
  onNewRun: () => void;
  onLeave: () => void;
}

/**
 * The HUD over the Hop playback: the top bar with the Fuel draining, the phase strip (Takeoff →
 * Transfer → Landing), the Fuel bar and the flight log. Panels keep to the left and the top, clear of
 * the Spacecraft. The in-Run Menu is not offered here: the playback runs to its end.
 */
export function FlightHud({
  before,
  flight,
  moment,
  ended,
  reportDone,
  recorded,
  onContinue,
  onNewRun,
  onLeave,
}: FlightHudProps) {
  const view = describeFlight(before, flight, moment);
  const fuel = moment?.fuel ?? flight.fuelAtLaunch;
  const deltaV = availableDeltaV({ ...before.spacecraft, fuelMass: kilograms(fuel) });
  const current = view.phases.find((phase) => phase.state === 'current');
  const [fast, setFast] = useState(false);
  const over = ended !== undefined || moment?.ended === true;
  const setSpeed = (next: boolean): void => {
    setFast(next);
    EventBus.emit('hop-fast-forward-requested', next);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (over || event.key.toLowerCase() !== FAST_FORWARD_KEY || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      setSpeed(!fast);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [fast, over]);
  // Any Fuel left shows at least the fill's 2 px leading edge, the narrowest the kit frame draws.
  const fill =
    view.fuelShare > 0
      ? Math.max(FILL_MIN_WIDTH, Math.round((FUEL_BAR.width - 2 * FUEL_BAR.inset) * view.fuelShare))
      : 0;

  if (ended && recorded) {
    // The Run is over: the End-of-Run screen takes the place of the playback's panels.
    return (
      <>
        <TopBar
          systemNumber={starSystemNumber(before)}
          systemName={before.starSystem.name}
          fuel={fuel}
          deltaV={deltaV}
          materials={before.materials}
        />
        {reportDone ? (
          <EndOfRun run={ended} recorded={recorded} onNewRun={onNewRun} onLeave={onLeave} />
        ) : (
          <HopReport
            before={before}
            flight={flight}
            actions={[{ label: 'Continue', onClick: onContinue, primary: true }]}
            onEscape={onContinue}
          />
        )}
      </>
    );
  }

  return (
    <>
      <TopBar
        systemNumber={starSystemNumber(before)}
        systemName={before.starSystem.name}
        fuel={fuel}
        deltaV={deltaV}
        materials={before.materials}
      />

      <section className="phase-strip" aria-label="Hop progress" data-testid="phase-strip">
        <KitFrame frame="panel_holo" width={STRIP.width} height={STRIP.height} />
        <ol className="phase-strip__list">
          {view.phases.map((phase) => (
            <li
              key={phase.label}
              className={`phase-strip__phase phase-strip__phase--${phase.state}`}
              aria-current={phase.state === 'current' ? 'step' : undefined}
            >
              {phase.state === 'done' && <KitFrame frame="badge_ok" />}
              {phase.state === 'current' && (
                <span className="phase-strip__dot" aria-hidden="true">
                  ●
                </span>
              )}
              {phase.label}
              {phase.state === 'done' && <span className="sr-only"> (done)</span>}
            </li>
          ))}
        </ol>
        <p className="sr-only" role="status">
          {current ? `${current.label} under way` : ''}
        </p>
      </section>

      <section className="route-inset" aria-label="Route" data-testid="route-inset">
        <KitFrame frame="panel_holo" width={ROUTE.width} height={ROUTE.height} />
        <img
          className="route-inset__body route-inset__body--from"
          src={imageUrl(view.route.fromSprite)}
          alt=""
        />
        <img
          className="route-inset__body route-inset__body--to"
          src={imageUrl(view.route.toSprite)}
          alt=""
        />
        <div
          className="route-inset__track"
          role="progressbar"
          aria-label="Route progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(view.route.share * 100)}
          aria-valuetext={`${view.route.from} to ${view.route.to}, ${String(Math.round(view.route.share * 100))}% of the way`}
        >
          <span
            className="route-inset__done"
            style={{ width: `${String(Math.round(view.route.share * 96))}px` }}
          />
          <span
            className="route-inset__ship"
            style={{ left: `${String(Math.round(view.route.share * 96) - 2)}px` }}
          />
        </div>
        {/* Cut off with an ellipsis when long; the full name is in the text and the hover title. */}
        <p className="route-inset__name route-inset__name--from" title={view.route.from}>
          {view.route.from}
        </p>
        <p className="route-inset__name route-inset__name--to" title={view.route.to}>
          {view.route.to}
        </p>
      </section>

      {!over && (
        <KitButton
          className="fast-forward"
          width={fast ? FAST_FORWARD_WIDTH_ON : FAST_FORWARD_WIDTH}
          aria-pressed={fast}
          aria-label={`Fast-forward (${FAST_FORWARD_KEY.toUpperCase()})`}
          title={`Fast-forward ${String(FAST_FORWARD)}× (${FAST_FORWARD_KEY.toUpperCase()})`}
          onClick={() => {
            setSpeed(!fast);
          }}
        >
          <KitFrame frame="icon_fast_forward" />
          {fast && <span className="fast-forward__rate">{String(FAST_FORWARD)}×</span>}
        </KitButton>
      )}

      <section className="flight-log" aria-label="Flight log" data-testid="flight-log">
        <KitFrame frame="panel_holo" width={LOG.width} height={LOG.height} />
        <h2 className="flight-log__title">Flight log</h2>
        <table className="flight-log__table">
          <thead>
            <tr>
              <th scope="col">Burn</th>
              <th scope="col">Est. Δv</th>
              <th scope="col">Actual</th>
              <th scope="col">±</th>
            </tr>
          </thead>
          <tbody>
            {view.log.map((row) => (
              <tr key={row.label} className={`flight-log__row flight-log__row--${row.state}`}>
                <th scope="row">{row.label}</th>
                <td>{row.estimate}</td>
                <td>{row.actual}</td>
                <td>{row.change}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="fuel-gauge" aria-label="Fuel" data-testid="fuel-gauge">
        <KitFrame frame="panel_metal" width={FUEL.width} height={FUEL.height} />
        <KitFrame frame="res_fuel" className="fuel-gauge__icon" />
        <p className="fuel-gauge__label">Fuel</p>
        <p className="fuel-gauge__value" data-testid="flight-fuel">
          {view.fuel}
        </p>
        <div
          className="fuel-gauge__bar"
          role="meter"
          aria-label="Fuel left"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(view.fuelShare * 100)}
          aria-valuetext={view.fuel}
        >
          <KitFrame frame="bar_frame" width={FUEL_BAR.width} height={FUEL_BAR.height} />
          {fill > 0 && (
            <KitFrame
              frame="bar_fill_am"
              width={fill}
              height={FUEL_BAR.height - 2 * FUEL_BAR.inset}
              className="fuel-gauge__fill"
            />
          )}
        </div>
      </section>
    </>
  );
}
