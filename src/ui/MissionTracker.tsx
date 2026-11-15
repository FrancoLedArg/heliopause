import { useEffect, useRef, useState } from 'react';
import { missionAnnouncement, type MissionGoal, type MissionGoalId } from './missionTrackerView.ts';

/** Each goal's glyph (14px grid), drawn with strokes so a lit one can fill and an unlit one stay hollow. */
const GLYPH: Record<MissionGoalId, string> = {
  // The Heliopause: the star's bubble, an arc with a dot inside.
  heliopause: 'M2 11 A6 6 0 1 1 12 11 M7 7 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0',
  // The Jump Drive: a bolt.
  'jump-drive': 'M7 1 L3 8 H7 L6 13 L11 5 H7 Z',
  // Escape: an arrow leaving.
  escape: 'M2 7 H11 M8 3 L12 7 L8 11',
};

interface MissionTrackerProps {
  goals: readonly MissionGoal[];
  className?: string;
}

/**
 * The mission tracker: three icons in a chain (Heliopause found, Jump Drive built, Escape), each lit
 * when done. Shown, not told: a lit goal is filled, bright and glowing, an unlit one a hollow dim
 * outline, so the state never rests on colour alone. The meaning is each icon's accessible name and
 * a tooltip on hover or focus; a polite live region says when a step lights up.
 */
export function MissionTracker({ goals, className = '' }: MissionTrackerProps) {
  const [said, setSaid] = useState('');
  const previous = useRef(goals);
  useEffect(() => {
    setSaid(missionAnnouncement(previous.current, goals));
    previous.current = goals;
  }, [goals]);
  return (
    <>
      <ol
        className={`mission-tracker ${className}`}
        aria-label="Mission"
        data-testid="mission-tracker"
      >
        {goals.map((g, i) => (
          <li key={g.id} className="mission-tracker__step">
            {i > 0 && (
              <span
                className={`mission-tracker__link${g.done ? ' mission-tracker__link--lit' : ''}`}
                aria-hidden="true"
              />
            )}
            <span
              role="img"
              tabIndex={0}
              aria-label={g.label}
              data-tip={g.label}
              data-testid={`goal-${g.id}`}
              data-done={g.done}
              className={`mission-tracker__goal mission-tracker__goal--${g.done ? 'lit' : 'dim'}`}
            >
              <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
                <path d={GLYPH[g.id]} />
              </svg>
            </span>
          </li>
        ))}
      </ol>
      <p className="sr-only" role="status" aria-live="polite" data-testid="mission-status">
        {said}
      </p>
    </>
  );
}
