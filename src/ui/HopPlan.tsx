import { DayDial } from './DayDial.tsx';
import { DeltaVBar } from './DeltaVBar.tsx';
import { Disclosure, DisclosurePanel, TellMeMoreToggle } from './Disclosure.tsx';
import type { ArrivalView, HopPlanFuel, HopPlanView } from './hopPlanView.ts';
import { KitFrame } from './kit/KitFrame.tsx';
import './HopPlan.css';

const percent = (share: number): string => `${String(share * 100)}%`;

/**
 * The Hop plan, shown rather than told (#222): Success Chance first and big, then the Δv bar (the
 * Burns against the available Δv, the Margin as the gap), then the Fuel left after the Hop. The one
 * visible line is the warning, when there is one; each Burn's reason and the mass behind the Δv wait
 * behind "Tell me more". With no target, a reticle asks for one.
 * An Unsurveyed target gets a "?" badge beside Success Chance (#190), and the reach verdict is the
 * plan's one warning line: an icon whose shape says it, and a short word.
 */
export function HopPlan({ view }: { view: HopPlanView | undefined }) {
  return (
    <div className="nav-chart__plan hop-plan" data-testid="hop-plan">
      {view ? <Plan view={view} /> : <PickATarget />}
    </div>
  );
}

/** A "?" icon, named the target's Body has not been Surveyed, so the Landing estimate is cautious. */
function UnsurveyedBadge() {
  return (
    <span
      className="hop-plan__unsurveyed"
      role="img"
      aria-label="Unsurveyed"
      data-testid="plan-unsurveyed"
    >
      <KitFrame frame="icon_help" />
    </span>
  );
}

/** Flame, neutral dot or snowflake: how hot or cold the target is (#335). */
function BandGlyph({ band }: { band: ArrivalView['band'] }) {
  return (
    <svg className="hop-plan__band" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      {band === 'scorching' && (
        <path
          d="M6 1 C7 4 10 5 9 8 C8.5 10 7 11 6 11 C4.5 11 3 10 3 8 C3 6.5 4 6 4.5 4.5 C5 5 5.5 5 6 4 Z"
          fill="var(--am3)"
          stroke="var(--rd3)"
        />
      )}
      {band === 'mild' && <circle cx="6" cy="6" r="2.5" fill="var(--gr3)" />}
      {band === 'freezing' && (
        <path
          d="M6 1 V11 M1.5 3.5 L10.5 8.5 M1.5 8.5 L10.5 3.5"
          stroke="var(--cy0)"
          strokeWidth="1.4"
          fill="none"
        />
      )}
    </svg>
  );
}

/** The arrival chip: local time on arrival, the target's band, and a hazard mark on a Harsh Arrival. */
function ArrivalChip({ arrival }: { arrival: ArrivalView }) {
  return (
    <span
      className="hop-plan__arrival"
      role="img"
      aria-label={arrival.label}
      data-testid="plan-arrival"
      data-band={arrival.band}
    >
      <DayDial
        fraction={arrival.fraction}
        day={arrival.day}
        label={arrival.label}
        size={18}
        decorative
      />
      <BandGlyph band={arrival.band} />
      {arrival.harsh && (
        <span className="hop-plan__harsh" data-testid="plan-harsh">
          <KitFrame frame="badge_warning" />
        </span>
      )}
    </span>
  );
}

function PickATarget() {
  return (
    <p className="hop-plan__empty">
      <KitFrame frame="cursor_crosshair" />
      Pick a target
    </p>
  );
}

function Plan({ view }: { view: HopPlanView }) {
  return (
    <>
      <p
        className={`hop-plan__success ${view.low ? 'hop-plan__success--low' : 'hop-plan__success--ok'}`}
        data-testid="plan-success"
      >
        <span className="hop-plan__label">Success</span>
        {view.arrival && <ArrivalChip arrival={view.arrival} />}
        {view.unsurveyed && <UnsurveyedBadge />}
        <KitFrame frame={view.low ? 'badge_warning' : 'badge_ok'} />
        <span className="hop-plan__chance">{view.successChance}</span>
      </p>
      <p className="hop-plan__row">
        <span className="hop-plan__label">Δv</span>
        <span>
          <span data-testid="plan-needed">{view.neededFigure}</span>
          {' of '}
          <span className="hop-plan__available" data-testid="plan-available">
            {view.available}
          </span>
        </span>
      </p>
      <DeltaVBar bar={view.bar} unsureLanding={view.unsurveyed} />
      <p className="hop-plan__row">
        <span className="hop-plan__label">{view.marginIsShort ? 'Short' : 'Margin'}</span>
        <span
          className={view.marginIsShort ? 'hop-plan__margin--short' : 'hop-plan__margin--spare'}
          data-testid="plan-margin"
        >
          {view.margin}
        </span>
      </p>
      <FuelGauge fuel={view.fuel} />
      <p
        className={`hop-plan__warning hop-plan__warning--${view.reach.kind}`}
        role="img"
        aria-label={view.reach.label}
        data-testid="plan-warning"
      >
        <KitFrame frame={view.reach.frame} />
        <span aria-hidden="true">{view.reach.word}</span>
      </p>
      <Disclosure>
        <TellMeMoreToggle className="hop-plan__more" />
        <DisclosurePanel className="nav-chart__details hop-plan__details">
          <table className="hop-plan__burns">
            <tbody>
              {view.burns.map((burn) => (
                <tr key={burn.label}>
                  <th scope="row">{burn.label}</th>
                  <td>{burn.estimate}</td>
                  <td className="hop-plan__reason" data-testid="burn-reason">
                    {burn.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hop-plan__basis" data-testid="plan-basis">
            from {view.availableBasis}
          </p>
        </DisclosurePanel>
      </Disclosure>
    </>
  );
}

/** Fuel now as a gauge, with the chunk the Hop burns at its estimate set apart from what is left. */
function FuelGauge({ fuel }: { fuel: HopPlanFuel }) {
  return (
    <div className="hop-plan__fuel" role="img" aria-label={fuel.label} data-testid="plan-fuel">
      <span className="hop-plan__fuel-icon">
        <KitFrame frame="res_fuel" />
      </span>
      <span className="hop-plan__gauge">
        <span className="hop-plan__gauge-left" style={{ width: percent(fuel.afterShare) }} />
        <span
          className="hop-plan__gauge-burn"
          style={{
            left: percent(fuel.afterShare),
            width: percent(Math.max(0, fuel.nowShare - fuel.afterShare)),
          }}
        />
      </span>
      <span className="hop-plan__fuel-after" aria-hidden="true">
        {fuel.afterText}
      </span>
    </div>
  );
}
