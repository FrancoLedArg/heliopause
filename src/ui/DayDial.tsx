const VIEW = 30;
const RADIUS = 11;
const MID = VIEW / 2;

/** Where the marker sits on the dial for a fraction of the day: midnight at the bottom, noon at the top, sunrise on the right. */
function markerPosition(fraction: number): { x: number; y: number } {
  const angle = 2 * Math.PI * fraction;
  return { x: MID + RADIUS * Math.sin(angle), y: MID + RADIUS * Math.cos(angle) };
}

/**
 * A day/night dial (#192, #334, show don't tell): a small disc whose upper half is day and lower
 * half night, with a sun or a moon riding its rim. It only draws a fraction of the day; its
 * owner says what the fraction is of, in `label`, its accessible name.
 */
export function DayDial({
  fraction,
  day,
  label,
  size = VIEW,
  className,
  testId,
}: {
  fraction: number;
  /** Whether the marker is the sun (true) or the moon (false). */
  day: boolean;
  label: string;
  size?: number;
  className?: string;
  testId?: string;
}) {
  const { x, y } = markerPosition(fraction);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${String(VIEW)} ${String(VIEW)}`}
      role="img"
      aria-label={label}
      data-testid={testId}
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
          <circle cx={x} cy={y} r={4.5} fill="var(--wh3)" />
          <circle cx={x + 2.2} cy={y - 1.5} r={3.6} fill="var(--scr2)" />
        </>
      )}
    </svg>
  );
}
