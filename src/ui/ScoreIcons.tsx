// Stand-in icons for the End-of-Run Score, drawn in code in the kit palette until the kit has its own
// (see docs/agents/assets.md). Each is one picture for assistive technology: `name` carries the words
// and the number, the drawing is presentational.

interface ScoreIconProps {
  /** The accessible name, with its number: "2 Star Systems escaped". */
  name: string;
  className?: string;
  testId?: string;
}

/** A star with an orbit ring and a planet: a Star System escaped. */
export function StarSystemIcon({ name, className, testId }: ScoreIconProps) {
  return (
    <svg
      role="img"
      aria-label={name}
      className={className}
      data-testid={testId}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      shapeRendering="crispEdges"
    >
      <circle cx="10" cy="10" r="8.5" fill="none" stroke="var(--gm5)" strokeWidth="1" />
      <path d="M9 5h2v4h4v2h-4v4H9v-4H5V9h4z" fill="var(--am3)" />
      <rect x="15" y="2" width="3" height="3" fill="var(--cy3)" />
    </svg>
  );
}

/** A dotted arc ending in an arrowhead: one Hop flown. */
export function HopIcon({ name, className, testId }: ScoreIconProps) {
  return (
    <svg
      role="img"
      aria-label={name}
      className={className}
      data-testid={testId}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      shapeRendering="crispEdges"
    >
      <rect x="1" y="14" width="3" height="3" fill="var(--gm5)" />
      <path d="M5 12h1v1H5zM7 9h1v1H7zM10 7h1v1h-1zM13 6h1v1h-1z" fill="var(--cy3)" />
      <path d="M14 3l5 4-5 4V8h-2V6h2z" fill="var(--cy4)" />
    </svg>
  );
}
