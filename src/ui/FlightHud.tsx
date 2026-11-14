import type { FlightMoment } from '../game/scenes/flightPlayback.ts';
import { availableDeltaV, kilograms, type HopFlight, type Run } from '../game/sim/index.ts';
import { describeFlight } from './flightHudView.ts';
import { KitFrame } from './kit/KitFrame.tsx';
import { HopReport } from './HopReport.tsx';
import { TopBar } from './TopBar.tsx';
import './FlightHud.css';

const STRIP = { width: 300, height: 26 } as const;
const LOG = { width: 300, height: 78 } as const;
const FUEL = { width: 256, height: 44 } as const;
const FUEL_BAR = { width: 190, height: 10, inset: 2 } as const;
const FILL_MIN_WIDTH = 2;

interface FlightHudProps {
  /** The Run at Launch. */
  before: Run;
  flight: HopFlight;
  /** Where the playback is; undefined until its first moment. */
  moment: FlightMoment | undefined;
  /** The playback of a failed Hop is over: show what happened and the way out. */
  failed: boolean;
  /** New Run after a failure: asks for a Chassis, then a new Star System. */
  onNewRun: () => void;
  onLeave: () => void;
}

/**
 * The HUD over the Hop playback: the top bar with the Fuel draining, the phase strip (Takeoff →
 * Transfer → Landing), the Fuel bar and the flight log. Panels keep to the left and the top, clear of
 * the Spacecraft. The in-Run Menu is not offered here: the playback runs to its end.
 */
export function FlightHud({ before, flight, moment, failed, onNewRun, onLeave }: FlightHudProps) {
  const view = describeFlight(before, flight, moment);
  const fuel = moment?.fuel ?? flight.fuelAtLaunch;
  const deltaV = availableDeltaV({ ...before.spacecraft, fuelMass: kilograms(fuel) });
  const current = view.phases.find((phase) => phase.state === 'current');
  // Any Fuel left shows at least the fill's 2 px leading edge, the narrowest the kit frame draws.
  const fill =
    view.fuelShare > 0
      ? Math.max(FILL_MIN_WIDTH, Math.round((FUEL_BAR.width - 2 * FUEL_BAR.inset) * view.fuelShare))
      : 0;

  if (failed && flight.outcome.kind !== 'arrived') {
    // The Run is over: the report takes the place of the playback's panels.
    return (
      <>
        <TopBar systemName={before.starSystem.name} fuel={fuel} deltaV={deltaV} />
        <HopReport
          before={before}
          flight={flight}
          actions={[
            { label: 'Back to title', onClick: onLeave },
            { label: 'New Run', onClick: onNewRun, primary: true },
          ]}
        />
      </>
    );
  }

  return (
    <>
      <TopBar systemName={before.starSystem.name} fuel={fuel} deltaV={deltaV} />

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
