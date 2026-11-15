/**
 * Science's icon: a primitive stand-in (a four-point spark) until its art lands (asset request from
 * #318). Presentational: the readout or the card beside it carries the words.
 */
export function ScienceIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className ? `science-icon ${className}` : 'science-icon'}
    >
      <path d="M8 0 L10 6 L16 8 L10 10 L8 16 L6 10 L0 8 L6 6 Z" fill="var(--wh3)" />
    </svg>
  );
}
