import { useEffect, useRef } from 'react';
import type { HopFlight, Run } from '../game/sim/index.ts';
import { DeltaVBar } from './DeltaVBar.tsx';
import { Disclosure, DisclosurePanel, TellMeMoreToggle } from './Disclosure.tsx';
import { trapTab } from './focusTrap.ts';
import { describeReport } from './hopReportView.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import { ComponentIcon } from './componentIcons/ComponentIcon.tsx';
import { ResourceIcon } from './ResourceIcon.tsx';
import './HopReport.css';

const PANEL = { width: 392, height: 226 } as const;

export interface ReportAction {
  readonly label: string;
  readonly onClick: () => void;
  /** The main action: the amber button, and the one that takes focus. */
  readonly primary?: boolean;
}

interface HopReportProps {
  /** The Run at Launch. */
  before: Run;
  flight: HopFlight;
  /** What the player can do next; the primary one takes focus. */
  actions: readonly ReportAction[];
  /** Escape does this when given (an Arrived report can be dismissed; a failure has no way back). */
  onEscape?: () => void;
}

/**
 * The Hop report, set beside the scene of what happened: the outcome as the title, the Δv bar (each
 * Burn's estimate against its actual), an icon row of what landing gathered and one line saying why.
 * The Burn table, the Margin, the whole explanation and the real-missions fact wait behind "Tell me
 * more". Outcome is always text; colour only backs it up. Focus goes to the primary action when the report opens.
 */
export function HopReport({ before, flight, actions, onEscape }: HopReportProps) {
  const view = describeReport(before, flight);
  // Only a Hop that ran out of Fuel or Δv ends the Run; one that reached the Heliopause did not fail.
  const failed = flight.outcome.kind === 'fell-short' || flight.outcome.kind === 'crashed';
  const body = useRef<HTMLDivElement>(null);
  const buttons = useRef<HTMLDivElement>(null);
  useEffect(() => {
    buttons.current?.querySelector<HTMLButtonElement>('button[data-primary]')?.focus();
  }, []);

  return (
    <section
      className={`hop-report hop-report--${flight.outcome.kind}`}
      role={failed ? 'alertdialog' : 'dialog'}
      aria-labelledby="hop-report-title"
      aria-describedby="hop-report-why"
      data-testid="hop-report"
      style={{ width: PANEL.width, height: PANEL.height }}
      aria-modal="true"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && onEscape) {
          event.stopPropagation();
          onEscape();
          return;
        }
        // Focus stays inside the report: Tab and Shift+Tab cycle through its buttons.
        trapTab(event, body.current);
      }}
    >
      <KitFrame frame="panel_metal" width={PANEL.width} height={PANEL.height} />
      <div ref={body} className="hop-report__body">
        <p className="hop-report__badge">
          <KitFrame frame={failed ? 'badge_alert' : 'badge_ok'} />
          {failed ? 'Run over' : 'Hop report'}
        </p>
        <h2 id="hop-report-title" className="hop-report__title">
          {view.title}
        </h2>
        <DeltaVBar bar={view.bar} className="hop-report__bar" />
        {(view.gains.length > 0 || view.cruise.length > 0) && (
          <ul className="hop-report__gains" aria-label="At a glance" data-testid="hop-report-gains">
            {view.gains.map((gain) => (
              <li key={gain.resource} className="hop-report__gain">
                {/* One picture for assistive technology: the words are its name, the parts are presentational. */}
                <span
                  role="img"
                  aria-label={gain.name}
                  className={`hop-report__gain-figure hop-report__gain-figure--${gain.resource}`}
                  data-testid="hop-report-gain"
                >
                  <ResourceIcon resource={gain.resource} testId="hop-report-gain-icon" />
                  <span className="hop-report__gain-amount">{gain.amount}</span>
                  {gain.drill !== undefined && (
                    <span className="hop-report__gain-drill">{gain.drill}</span>
                  )}
                  {gain.leftBehind !== undefined && (
                    <span className="hop-report__gain-spill" data-testid="hop-report-spill">
                      <ResourceIcon
                        resource={gain.resource}
                        size={12}
                        testId="hop-report-spill-icon"
                      />
                      {gain.leftBehind}
                    </span>
                  )}
                </span>
              </li>
            ))}
            {/* What the Cruise did (#250): each event's part, a tick once Repaired, and the Fuel lost. */}
            {view.cruise.map((mark, i) => (
              <li key={`cruise-${String(i)}`} className="hop-report__gain">
                <span
                  role="img"
                  aria-label={mark.name}
                  className={`hop-report__gain-figure hop-report__cruise hop-report__cruise--${mark.kind}`}
                  data-testid="hop-report-cruise"
                >
                  {mark.kind === 'event' ? (
                    <>
                      <ComponentIcon kind={mark.component} size={16} />
                      <KitFrame frame={mark.repaired ? 'badge_ok' : 'badge_alert'} />
                    </>
                  ) : (
                    <>
                      <ResourceIcon resource="fuel" />
                      <span className="hop-report__gain-amount">{mark.amount}</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p id="hop-report-why" className="hop-report__why">
          {view.why}
        </p>
        <Disclosure>
          <TellMeMoreToggle className="hop-report__more" />
          <DisclosurePanel className="hop-report__details">
            <table className="hop-report__table">
              <thead>
                <tr>
                  <th scope="col">Burn</th>
                  <th scope="col">Est. Δv</th>
                  <th scope="col">Actual</th>
                  <th scope="col">±</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td>{row.estimate}</td>
                    <td>{row.actual}</td>
                    <td>{row.change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hop-report__margin" data-testid="hop-report-margin">
              {view.margin}
            </p>
            {view.outcomeLine !== undefined && (
              <p className="hop-report__outcome">{view.outcomeLine}</p>
            )}
            {view.fact !== undefined && (
              <p className="hop-report__fact" data-testid="hop-report-fact">
                {view.fact}
              </p>
            )}
          </DisclosurePanel>
        </Disclosure>
        <div ref={buttons} className="hop-report__actions">
          {actions.map((action) => (
            <KitButton
              key={action.label}
              variant={action.primary ? 'primary' : 'default'}
              width={action.primary ? 110 : 100}
              data-primary={action.primary ? '' : undefined}
              onClick={action.onClick}
            >
              {action.label}
            </KitButton>
          ))}
        </div>
      </div>
    </section>
  );
}
