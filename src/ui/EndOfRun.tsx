import { useEffect, useMemo, useRef } from 'react';
import { runEnd, score, type Run, type Score } from '../game/sim/index.ts';
import { describeEndOfRun, type ScoreFigures } from './endOfRunView.ts';
import { Disclosure, DisclosurePanel, TellMeMoreToggle } from './Disclosure.tsx';
import { trapTab } from './focusTrap.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import { HopIcon, StarSystemIcon } from './ScoreIcons.tsx';
import './EndOfRun.css';

const PANEL = { width: 392, height: 226 } as const;

/** What recording a finished Run's Score did to the Best Score (see `recordScore`). */
export interface RecordedScore {
  readonly best: Score;
  readonly isNewBest: boolean;
  /**
   * The day (`YYYY-MM-DD`, UTC) of the Daily Star System the Run was played on, when it was a Daily
   * Run: `best` is then that day's Daily Best. `undefined` for any other Run.
   */
  readonly dailyDay?: string;
}

interface EndOfRunProps {
  /** The Run that ended. */
  run: Run;
  /** The Best Score after this Run's Score was recorded, once, when the Run ended. */
  recorded: RecordedScore;
  onNewRun: () => void;
  onLeave: () => void;
}

interface ScoreFigureProps {
  label: string;
  figures: ScoreFigures;
  /** The Score in words, for the group's accessible name. */
  summary: string;
  /** Said in words when this Run set the best; colour only backs it up. */
  marker?: string | undefined;
  testId: string;
}

/** A Score as two icons with their numbers: Star Systems escaped and Hops flown. */
function ScoreFigure({ label, figures, summary, marker, testId }: ScoreFigureProps) {
  return (
    <div
      role="group"
      className="end-of-run__score"
      aria-label={`${label}: ${summary}${marker ? ` (${marker})` : ''}`}
      data-testid={testId}
    >
      <span className="end-of-run__label" aria-hidden="true">
        {label}
      </span>
      <span className="end-of-run__figures">
        <span className="end-of-run__figure">
          <StarSystemIcon name={figures.starSystems.name} />
          <span aria-hidden="true">{figures.starSystems.count}</span>
        </span>
        <span className="end-of-run__figure">
          <HopIcon name={figures.hops.name} />
          <span aria-hidden="true">{figures.hops.count}</span>
        </span>
      </span>
      {marker && (
        <span className="end-of-run__new" aria-hidden="true">
          {marker}
        </span>
      )}
    </div>
  );
}

/**
 * The screen every Run ends on, whether it Fell Short, Crashed or was Stranded: the Score and the
 * Best Score as icons with their numbers, how the Run ended in one line (the whole why and the Score
 * rule wait behind "Tell me more"), and the way on (New Run, or back to the title). How it ended is
 * always text; colour only backs it up. New Run takes focus, and Tab stays inside the screen.
 */
export function EndOfRun({ run, recorded, onNewRun, onLeave }: EndOfRunProps) {
  const end = runEnd(run);
  const buttons = useRef<HTMLDivElement>(null);
  const finalScore = useMemo(() => score(run), [run]);
  useEffect(() => {
    buttons.current?.querySelector<HTMLButtonElement>('button[data-primary]')?.focus();
  }, []);
  if (!end) throw new Error('The End-of-Run screen needs a Run that has ended');
  const view = describeEndOfRun(
    end,
    finalScore,
    recorded.best,
    recorded.isNewBest,
    recorded.dailyDay !== undefined,
  );

  return (
    <section
      className={`end-of-run end-of-run--${end.kind}`}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="end-of-run-title"
      aria-describedby="end-of-run-summary"
      data-testid="end-of-run"
      style={{ width: PANEL.width, height: PANEL.height }}
      onKeyDown={(event) => {
        trapTab(event, buttons.current);
      }}
    >
      <KitFrame frame="panel_metal" width={PANEL.width} height={PANEL.height} />
      <div className="end-of-run__body">
        <p className="end-of-run__badge">
          <KitFrame frame="badge_alert" />
          Run over
        </p>
        <h2 id="end-of-run-title" className="end-of-run__title">
          {view.title}
        </h2>
        <p id="end-of-run-summary" className="end-of-run__summary">
          {view.summary}
        </p>
        <div className="end-of-run__scores">
          <ScoreFigure
            label="Score"
            figures={view.scoreFigures}
            summary={view.score}
            testId="end-of-run-score"
          />
          <ScoreFigure
            label={view.bestLabel}
            figures={view.bestFigures}
            summary={view.best}
            marker={view.newBest ? view.newBestMarker : undefined}
            testId="end-of-run-best"
          />
        </div>
        <Disclosure>
          <TellMeMoreToggle className="end-of-run__more" />
          <DisclosurePanel className="end-of-run__details">
            <p id="end-of-run-why" className="end-of-run__why" data-testid="end-of-run-why">
              {view.reason}
            </p>
            <p className="end-of-run__rule">{view.rule}</p>
          </DisclosurePanel>
        </Disclosure>
        <div ref={buttons} className="end-of-run__actions">
          <KitButton width={100} onClick={onLeave}>
            Back to title
          </KitButton>
          <KitButton variant="primary" width={110} data-primary="" onClick={onNewRun}>
            New Run
          </KitButton>
        </div>
      </div>
    </section>
  );
}
