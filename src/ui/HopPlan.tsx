import { DeltaVBar } from './DeltaVBar.tsx';
import { Disclosure, DisclosurePanel, TellMeMoreToggle } from './Disclosure.tsx';
import type { HopPlanFuel, HopPlanView } from './hopPlanView.ts';
import { KitFrame } from './kit/KitFrame.tsx';
import './HopPlan.css';

const percent = (share: number): string => `${String(share * 100)}%`;

/**
 * The Hop plan, shown rather than told (#222): Success Chance first and big, then the Δv bar (the
 * Burns against the available Δv, the Margin as the gap), then the Fuel left after the Hop. The one
 * visible line is the warning, when there is one; each Burn's reason and the mass behind the Δv wait
 * behind "Tell me more". With no target, a reticle asks for one.
 *
 * #190 adds its Unsurveyed badge and reach verdict here: the badge beside Success Chance, the verdict
 * as the plan's one warning line.
 */
export function HopPlan({ view }: { view: HopPlanView | undefined }) {
  return (
    <div className="nav-chart__plan hop-plan" data-testid="hop-plan">
      {view ? <Plan view={view} /> : <PickATarget />}
    </div>
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
      <DeltaVBar bar={view.bar} />
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
      {view.warning && (
        <p className="hop-plan__warning" data-testid="plan-warning">
          {view.warning}
        </p>
      )}
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
