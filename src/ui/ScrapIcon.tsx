import { paletteCss } from './kit/palette.ts';
import { SCRAP_PIXELS_SIZE, scrapPixels } from './scrapPixels.ts';

const PIXELS = scrapPixels();

/**
 * Scrap's icon (#344): a torn, riveted metal plate, drawn crisp at any size. Presentational: the
 * readout or the price beside it carries the words, so the image is hidden from assistive tech.
 */
export function ScrapIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${String(SCRAP_PIXELS_SIZE)} ${String(SCRAP_PIXELS_SIZE)}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      data-testid="scrap-icon"
      className={className ? `scrap-icon ${className}` : 'scrap-icon'}
    >
      {PIXELS.map(({ x, y, color }) => (
        <rect
          key={`${String(x)}-${String(y)}`}
          x={x}
          y={y}
          width={1}
          height={1}
          fill={paletteCss(color)}
        />
      ))}
    </svg>
  );
}
