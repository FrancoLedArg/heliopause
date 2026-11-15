import type { CSSProperties } from 'react';
import type { Burn } from '../game/sim/index.ts';
import type { BarSpan, DeltaVBarView } from './deltaVBarView.ts';
import './DeltaVBar.css';

const percent = (share: number): string => `${String(share * 100)}%`;
const at = ({ start, width }: BarSpan): CSSProperties => ({
  left: percent(start),
  width: percent(width),
});

/** Pixel arrows for each Burn: up off the Body, across, and down onto the target. */
const GLYPH: Record<Burn, { readonly w: number; readonly h: number; readonly d: string }> = {
  takeoff: { w: 5, h: 7, d: 'M2 0h1v1h1v1h1v1h-2v4h-1v-4h-2v-1h1v-1h1z' },
  transfer: { w: 7, h: 5, d: 'M0 2h4v-2h1v1h1v1h1v1h-1v1h-1v1h-1v-2h-4z' },
  landing: { w: 5, h: 7, d: 'M2 0h1v4h2v1h-1v1h-1v1h-1v-1h-1v-1h-1v-1h2z' },
};

/**
 * The Δv bar: each Burn a segment, end to end, against the available Δv, with the Margin as the gap at
 * the end (spare, or short where the Burns run past what the Fuel gives). A flown Burn shows its actual
 * cost, with a tick where its estimate ended. One image to a screen reader, named with every value.
 * Takes the width of its container.
 */
export function DeltaVBar({ bar, className }: { bar: DeltaVBarView; className?: string }) {
  return (
    <div
      className={className ? `dv-bar ${className}` : 'dv-bar'}
      role="img"
      aria-label={bar.label}
      data-testid="dv-bar"
    >
      {bar.segments.map((segment) => (
        <span
          key={segment.burn}
          className={`dv-bar__segment dv-bar__segment--${segment.burn}`}
          style={at(segment)}
          data-burn={segment.burn}
        >
          <BurnGlyph burn={segment.burn} />
        </span>
      ))}
      {bar.gap.width > 0 && (
        <span
          className={`dv-bar__gap dv-bar__gap--${bar.short ? 'short' : 'spare'}`}
          style={at(bar.gap)}
          data-gap
        />
      )}
      {bar.short && <span className="dv-bar__limit" style={{ left: percent(bar.availableAt) }} />}
      {bar.segments.map(
        (segment) =>
          segment.estimateTick !== undefined && (
            <span
              key={`tick-${segment.burn}`}
              className="dv-bar__tick"
              style={{ left: percent(segment.estimateTick) }}
            />
          ),
      )}
    </div>
  );
}

function BurnGlyph({ burn }: { burn: Burn }) {
  const { w, h, d } = GLYPH[burn];
  return (
    <svg
      className="dv-bar__glyph"
      viewBox={`0 0 ${String(w)} ${String(h)}`}
      width={w}
      height={h}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
