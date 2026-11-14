import { useEffect, useRef } from 'react';
import type { HopFlight, Run } from '../game/sim/index.ts';
import { describeReport } from './hopReportView.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import './HopReport.css';

const PANEL = { width: 356, height: 226 } as const;

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
 * The Hop report, set beside the scene of what happened: the outcome in words, each Burn's estimate
 * against its actual Δv, the Margin left and the simulation's why. Outcome is always text; colour only
 * backs it up. Focus goes to the primary action when the report opens.
 */
export function HopReport({ before, flight, actions, onEscape }: HopReportProps) {
  const view = describeReport(before, flight);
  const failed = flight.outcome.kind !== 'arrived';
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
        if (event.key !== 'Tab') return;
        // Focus stays inside the report: Tab and Shift+Tab cycle through its buttons.
        const found = buttons.current?.querySelectorAll('button') ?? [];
        const first = found[0];
        const last = found[found.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <KitFrame frame="panel_metal" width={PANEL.width} height={PANEL.height} />
      <div className="hop-report__body">
        <p className="hop-report__badge">
          <KitFrame frame={failed ? 'badge_alert' : 'badge_ok'} />
          {failed ? 'Run over' : 'Hop report'}
        </p>
        <h2 id="hop-report-title" className="hop-report__title">
          {view.title}
        </h2>
        <p className="hop-report__headline">{view.headline}</p>
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
        {view.collected !== undefined && (
          <p className="hop-report__collected" data-testid="hop-report-collected">
            {view.collected}
          </p>
        )}
        {view.note !== undefined && <p className="hop-report__note">{view.note}</p>}
        <p id="hop-report-why" className="hop-report__why">
          {view.why}
        </p>
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
