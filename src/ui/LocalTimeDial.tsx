import { useEffect, useState } from 'react';
import { EventBus } from '../game/EventBus.ts';
import { currentBody, localDayFraction, timeOfDayWords, type Run } from '../game/sim/index.ts';

const SIZE = 30;
const RADIUS = 11;
const MID = SIZE / 2;

/** Where the marker sits on the dial for a fraction of the day: midnight at the bottom, noon at the top, sunrise on the right. */
function markerPosition(fraction: number): { x: number; y: number } {
  const angle = 2 * Math.PI * fraction;
  return { x: MID + RADIUS * Math.sin(angle), y: MID + RADIUS * Math.cos(angle) };
}

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
  const { x, y } = markerPosition(fraction);
  const day = fraction > 0.25 && fraction < 0.75;
  return (
    <svg
      className="local-time-dial"
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      role="img"
      aria-label={`Local time: ${timeOfDayWords(fraction)}`}
      data-testid="local-time-dial"
      data-fraction={fraction.toFixed(3)}
    >
      <circle cx={MID} cy={MID} r={RADIUS} fill="var(--scr2)" stroke="var(--gm3)" />
      <path
        d={`M ${String(MID - RADIUS)} ${String(MID)} A ${String(RADIUS)} ${String(RADIUS)} 0 0 1 ${String(MID + RADIUS)} ${String(MID)} Z`}
        fill="var(--cy0)"
        opacity="0.55"
      />
      <line x1={MID - RADIUS} y1={MID} x2={MID + RADIUS} y2={MID} stroke="var(--gm3)" />
      {day ? (
        <circle cx={x} cy={y} r={3.5} fill="var(--am3)" stroke="var(--am1)" />
      ) : (
        <>
          <circle cx={x} cy={y} r={3.5} fill="var(--wh2)" />
          <circle cx={x + 1.8} cy={y - 1.2} r={3} fill="var(--scr2)" />
        </>
      )}
    </svg>
  );
}
