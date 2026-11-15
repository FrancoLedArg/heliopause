import { useEffect, useState } from 'react';
import { DayDial } from './DayDial.tsx';
import { EventBus } from '../game/EventBus.ts';
import { currentBody, localDayFraction, timeOfDayWords, type Run } from '../game/sim/index.ts';

const SIZE = 30;

/**
 * The local time on the Body the Spacecraft stands on, as a day/night dial (#192, show don't tell): a
 * small disc whose upper half is day and lower half night, with a sun or a moon riding its rim. The
 * time in words is its accessible name. The Landed scene keeps it moving; until it speaks, the
 * Run's own clock sets it.
 */
export function LocalTimeDial({ run }: { run: Run }) {
  const fromRun = localDayFraction(run.starSystem, currentBody(run), run.gameHours);
  const [live, setLive] = useState<{ of: Run; fraction: number } | undefined>(undefined);
  useEffect(
    () =>
      EventBus.on('local-time-changed', (fraction) => {
        setLive({ of: run, fraction });
      }),
    [run],
  );
  // A fresh Run (a Hop landed, a Jump) starts from its own clock again.
  const fraction = live?.of === run ? live.fraction : fromRun;
  // The sun by day, the moon by night: the same split as the words (night is before 0.15 and from 0.85).
  const day = timeOfDayWords(fraction) !== 'night';
  return (
    <DayDial
      className="local-time-dial"
      fraction={fraction}
      day={day}
      label={`Local time: ${timeOfDayWords(fraction)}`}
      size={SIZE}
      testId="local-time-dial"
    />
  );
}
