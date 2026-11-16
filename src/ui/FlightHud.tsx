import { useEffect } from 'react';
import { hasAsset, imageUrl } from '../game/assets/manifest.ts';
import { FAST_FORWARD, systemsLit, type FlightMoment } from '../game/scenes/flightPlayback.ts';
import type { JumpStage } from '../game/scenes/jumpPlayback.ts';
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
import { DeltaVBar } from './DeltaVBar.tsx';
import { Disclosure, DisclosurePanel, TellMeMoreToggle } from './Disclosure.tsx';
import { FuelGauge } from './FuelGauge.tsx';
import { HopReport } from './HopReport.tsx';
import { SystemsLights } from './SystemsLights.tsx';
import { JUMP_FLAVOUR_TEXT } from './jumpFlavour.ts';
import { missionGoals } from './missionTrackerView.ts';
import { TopBar } from './TopBar.tsx';
import './FlightHud.css';

const STRIP = { width: 300, height: 26 } as const;
const LOG = { width: 256, height: 56 } as const;
const ROUTE = { width: 156, height: 44 } as const;
/** The key that turns the fast-forward on and off. */
const FAST_FORWARD_KEY = 'f';
/** The button widens to make room for the rate while it is on: a cue that is not colour. */
const FAST_FORWARD_WIDTH = 32;
const FAST_FORWARD_WIDTH_ON = 52;

/**
 * What follows the playback once it is over: a failed Hop ended the Run (its report, then the
 * End-of-Run screen), or the Spacecraft reached the Heliopause and the Jump plays (no Score is
 * recorded: the Run goes on in the next Star System).
 */
export type FlightAfter =
  | {
      readonly kind: 'ended';
      /** The Run the failed Hop ended. */
      readonly run: Run;
      /** The Best Score after this Run's Score was recorded. */
      readonly recorded: RecordedScore;
      /** The failed Hop's report first, then the End-of-Run screen. */
      readonly step: 'report' | 'end';
    }
  | {
      readonly kind: 'jumping';
      /** The stage of the Jump moment on screen. */
      readonly stage: JumpStage;
    };

interface FlightHudProps {
  /** The Run at Launch. */
  before: Run;
  flight: HopFlight;
  /** Where the playback is; undefined until its first moment. */
  moment: FlightMoment | undefined;
  /** How the playback handed over once it was over; undefined while it plays. */
  after: FlightAfter | undefined;
  /** Continue from the failed Hop's report to the End-of-Run screen. */
  onContinue: () => void;
  /** New Run after a failure: asks for a Chassis, then a new Star System. */
  onNewRun: () => void;
  onLeave: () => void;
  /** The UTC day of the Daily Star System being played; `undefined` for any other Run. */
  dailyDay?: string | undefined;
  /** Whether the fast-forward is on: it stays on from Hop to Hop within a Run. */
  fast: boolean;
  /** The player turned the fast-forward on or off. */
  onFastChange: (fast: boolean) => void;
  /** The Run in its Cruise while the Cruise runs (#250): its Damage, Fuel and Materials. */
  live?: Run | undefined;
  /**
   * The Run as its Cruise ended, kept once the Cruise is over (#344): the Landing and the report still
   * show the Scrap and Materials it earned or spent.
   */
  cruised?: Run | undefined;
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
  after,
  onContinue,
  onNewRun,
  onLeave,
  dailyDay,
  fast,
  onFastChange,
  live,
  cruised,
}: FlightHudProps) {
  const view = describeFlight(before, flight, moment);
  const fuel = moment?.fuel ?? flight.fuelAtLaunch;
  const deltaV = availableDeltaV({ ...before.spacecraft, fuelMass: kilograms(fuel) });
  const current = view.phases.find((phase) => phase.state === 'current');
  const over = after !== undefined || moment?.ended === true;
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (over || event.key.toLowerCase() !== FAST_FORWARD_KEY || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      onFastChange(!fast);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [fast, over, onFastChange]);

  if (after?.kind === 'ended') {
    // The Run is over: the End-of-Run screen takes the place of the playback's panels.
    return (
      <>
        <TopBar
          systemNumber={starSystemNumber(before)}
          goals={missionGoals(before)}
          systemName={before.starSystem.name}
          fuel={fuel}
          fuelCapacity={before.spacecraft.fuelCapacity}
          deltaV={deltaV}
          materials={before.materials}
          dailyDay={dailyDay}
        />
        {after.step === 'end' ? (
          <EndOfRun
            run={after.run}
            recorded={after.recorded}
            onNewRun={onNewRun}
            onLeave={onLeave}
          />
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

  // The Escape lights as the Jump Drive fires; the bar stays up through the flash and the dark.
  const escaped = after?.kind === 'jumping' && after.stage !== 'charge';
  const topBar = (
    <TopBar
      systemNumber={starSystemNumber(before)}
      goals={missionGoals(before, escaped)}
      systemName={before.starSystem.name}
      fuel={fuel}
      fuelCapacity={before.spacecraft.fuelCapacity}
      deltaV={deltaV}
      materials={(live ?? cruised ?? before).materials}
      scrap={(live ?? cruised ?? before).scrap}
      dailyDay={dailyDay}
    />
  );

  if (after?.kind === 'jumping' && after.stage !== 'charge') {
    // The Jump Drive fires: the panels give way to the flash, then the flavour text over the black.
    return (
      <>
        {topBar}
        {after.stage === 'dark' && (
          <p className="jump-caption" role="status" data-testid="jump-caption">
            {JUMP_FLAVOUR_TEXT}
          </p>
        )}
      </>
    );
  }

  return (
    <>
      {topBar}

      {/* The shot on screen (`data-shot`) is for tests: the canvas shows it. */}
      <section
        className="phase-strip"
        aria-label="Hop progress"
        data-testid="phase-strip"
        data-shot={moment?.shot ?? 'takeoff'}
      >
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
        {hasAsset(view.route.toSprite) ? (
          <img
            className="route-inset__body route-inset__body--to"
            src={imageUrl(view.route.toSprite)}
            alt=""
          />
        ) : (
          <span className="route-inset__body route-inset__body--to route-inset__edge" />
        )}
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

      {moment?.cruise && (
        // The Fuel tank beside the big Spacecraft: Fuel reads the same in flight as on the ground.
        <div className="cruise-fuel">
          <FuelGauge
            shape="tank"
            fuel={moment.fuel}
            capacity={before.spacecraft.fuelCapacity}
            testId="cruise-fuel-gauge"
          />
          <KitFrame frame="res_fuel" className="cruise-fuel__icon" />
        </div>
      )}

      {moment?.cruise && (
        <SystemsLights
          slots={before.spacecraft.slots}
          lit={systemsLit(
            moment.cruise,
            before.spacecraft.slots.filter((slot) => slot !== null).length,
          )}
          run={live}
        />
      )}

      {!over && (
        <KitButton
          className="fast-forward"
          width={fast ? FAST_FORWARD_WIDTH_ON : FAST_FORWARD_WIDTH}
          aria-pressed={fast}
          aria-label={`Fast-forward (${FAST_FORWARD_KEY.toUpperCase()})`}
          title={`Fast-forward ${String(FAST_FORWARD)}× (${FAST_FORWARD_KEY.toUpperCase()})`}
          onClick={() => {
            onFastChange(!fast);
          }}
        >
          <KitFrame frame="icon_fast_forward" />
          {fast && <span className="fast-forward__rate">{String(FAST_FORWARD)}×</span>}
        </KitButton>
      )}

      <section className="flight-log" aria-label="Flight log" data-testid="flight-log">
        <KitFrame frame="panel_holo" width={LOG.width} height={LOG.height} />
        <Disclosure>
          <h2 className="flight-log__title">Flight log</h2>
          <p className="flight-log__value" data-testid="flight-delta-v">
            {view.deltaVLeft}
          </p>
          <DeltaVBar bar={view.bar} drained={view.drained} className="flight-log__bar" />
          <TellMeMoreToggle className="flight-log__more" />
          <DisclosurePanel className="flight-log__details">
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
          </DisclosurePanel>
        </Disclosure>
      </section>
    </>
  );
}
