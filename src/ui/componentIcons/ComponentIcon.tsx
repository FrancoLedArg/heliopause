import { hasAsset, imageUrl } from '../../game/assets/manifest.ts';
import {
  COMPONENT_ICON_NAMES,
  COMPONENT_ICON_SIZE,
  componentIconKey,
  componentIconPixels,
  type ComponentIconKind,
} from './componentIconSet.ts';

interface ComponentIconProps {
  kind: ComponentIconKind;
  /** Drawn size in native (640×360) pixels; 16 by default. */
  size?: number;
  className?: string;
}

/**
 * A Component's 16×16 icon: the final art when the manifest lists its key, otherwise the stand-in
 * drawn in code. The Component's name is the accessible name.
 */
export function ComponentIcon({ kind, size = COMPONENT_ICON_SIZE, className }: ComponentIconProps) {
  const key = componentIconKey(kind);
  const name = COMPONENT_ICON_NAMES[kind];
  const classes = ['component-icon', className ?? ''].filter(Boolean).join(' ');
  if (hasAsset(key)) {
    return (
      <img
        src={imageUrl(key)}
        alt={name}
        width={size}
        height={size}
        className={classes}
        data-component-icon={kind}
      />
    );
  }
  return (
    <svg
      role="img"
      aria-label={name}
      viewBox={`0 0 ${COMPONENT_ICON_SIZE} ${COMPONENT_ICON_SIZE}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={classes}
      data-component-icon={kind}
    >
      {componentIconPixels(kind).map((pixel) => (
        <rect
          key={`${pixel.x}-${pixel.y}`}
          x={pixel.x}
          y={pixel.y}
          width={1}
          height={1}
          fill={pixel.fill}
        />
      ))}
    </svg>
  );
}
