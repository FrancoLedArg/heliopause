import { useEffect, useMemo, useRef, useState } from 'react';
import { readBestScore, recordScore } from '../game/lib/bestScore.ts';
import { isBetterScore, runEnd, score, type Run } from '../game/sim/index.ts';
import { describeEndOfRun } from './endOfRunView.ts';
import { trapTab } from './focusTrap.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import './EndOfRun.css';

const PANEL = { width: 392, height: 226 } as const;

interface EndOfRunProps {
  /** The Run that ended. */
  run: Run;
  onNewRun: () => void;
  onLeave: () => void;
}

/**
 * The screen every Run ends on, whether it Fell Short, Crashed or was Stranded: the Score, how the
 * Run ended and why, the Best Score, and the way on (New Run, or back to the title). How it ended is
 * always text; colour only backs it up. New Run takes focus, and Tab stays inside the screen.
 */
export function EndOfRun({ run, onNewRun, onLeave }: EndOfRunProps) {
  const end = runEnd(run);
  const buttons = useRef<HTMLDivElement>(null);
  const finalScore = useMemo(() => score(run), [run]);
  // Read once when the screen opens: what was the Best Score before this Run?
  const [previous] = useState(() => readBestScore());
  const newBest = previous === undefined || isBetterScore(finalScore, previous);
  const best = newBest ? finalScore : previous;
  useEffect(() => {
    recordScore(finalScore);
    buttons.current?.querySelector<HTMLButtonElement>('button[data-primary]')?.focus();
  }, [finalScore]);
  if (!end) throw new Error('The End-of-Run screen needs a Run that has ended');
  const view = describeEndOfRun(end, finalScore, best, newBest);

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
