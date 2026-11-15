// Stand-in icons for the End-of-Run Score, drawn in code in the kit palette until the kit has its own
// (see docs/agents/assets.md). Each is one picture for assistive technology: `name` carries the words
// and the number, the drawing is presentational.

interface ScoreIconProps {
  /** The accessible name, with its number: "2 Star Systems escaped". */
  name: string;
  /** Inside a group that already carries the words: hidden from assistive technology. */
  decorative?: boolean;
  className?: string;
  testId?: string;
}

/** A star with an orbit ring and a planet: a Star System escaped. */
export function StarSystemIcon({ name, className, testId, decorative }: ScoreIconProps) {
  return (
    <svg
      role="img"
      aria-label={name}
      aria-hidden={decorative ? true : undefined}
      className={className}
      data-testid={testId}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      shapeRendering="crispEdges"
    >
      <path d="M10 1h1v6h-1zM10 13h1v6h-1zM1 10h6v1H1zM13 10h6v1h-6z" fill="var(--am3)" />
      <path d="M10 5h1v2h2v1h-2v2h-2V8H7V7h2V5z" fill="var(--am3)" />
      <path d="M8 8h5v5H8z" fill="var(--am4)" />
      <path d="M4 4h2v2H4zM15 4h2v2h-2zM4 15h2v2H4zM15 15h2v2h-2z" fill="var(--gm5)" />
    </svg>
  );
}

/** A dotted arc ending in an arrowhead: one Hop flown. */
export function HopIcon({ name, className, testId, decorative }: ScoreIconProps) {
  return (
    <svg
      role="img"
      aria-label={name}
      aria-hidden={decorative ? true : undefined}
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
