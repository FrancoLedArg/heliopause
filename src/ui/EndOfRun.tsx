import { useEffect, useMemo, useRef } from 'react';
import { runEnd, score, type Run, type Score } from '../game/sim/index.ts';
import { describeEndOfRun } from './endOfRunView.ts';
import { trapTab } from './focusTrap.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import './EndOfRun.css';

const PANEL = { width: 392, height: 226 } as const;

/** What recording a finished Run's Score did to the Best Score (see `recordScore`). */
export interface RecordedScore {
  readonly best: Score;
  readonly isNewBest: boolean;
}

interface EndOfRunProps {
  /** The Run that ended. */
  run: Run;
  /** The Best Score after this Run's Score was recorded, once, when the Run ended. */
  recorded: RecordedScore;
  onNewRun: () => void;
  onLeave: () => void;
}

/**
 * The screen every Run ends on, whether it Fell Short, Crashed or was Stranded: the Score, how the
 * Run ended and why, the Best Score, and the way on (New Run, or back to the title). How it ended is
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
  const view = describeEndOfRun(end, finalScore, recorded.best, recorded.isNewBest);

  return (
    <section
      className={`end-of-run end-of-run--${end.kind}`}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="end-of-run-title"
      aria-describedby="end-of-run-why"
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
        <p className="end-of-run__summary">{view.summary}</p>
        <p id="end-of-run-why" className="end-of-run__why" data-testid="end-of-run-why">
          {view.reason}
        </p>
        <dl className="end-of-run__scores">
          <div className="end-of-run__score">
            <dt>Score</dt>
            <dd data-testid="end-of-run-score">{view.score}</dd>
          </div>
          <div className="end-of-run__score">
            <dt>Best Score</dt>
            <dd data-testid="end-of-run-best">
              {view.best}
              {view.newBest && <span className="end-of-run__new"> (new Best Score)</span>}
            </dd>
          </div>
        </dl>
        <p className="end-of-run__rule">{view.rule}</p>
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
