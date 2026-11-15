import { imageUrl } from '../game/assets/manifest.ts';
import { KitFrame } from './kit/KitFrame.tsx';
import { yieldIconName, type YieldResource } from './yieldIcon.ts';

/** Both kit icons are drawn 32 px square. */
const NATIVE_SIZE = 32;

interface ResourceIconProps {
  resource: YieldResource;
  /** The Body's yield is taken: dimmed and struck through, so it is not carried by colour alone. */
  depleted?: boolean;
  /** Drawn size in native (640×360) pixels; 16 by default, half the kit icon. */
  size?: number;
  /** Extra class names for the wrapper (layout only). */
  className?: string;
  /** The `data-testid` to carry; every icon has `resource-icon` by default. */
  testId?: string;
  /** The accessible name, when the icon stands for the resource itself rather than a Body's yield. */
  label?: string;
}

/**
 * The Fuel or Materials icon from the UI kit, in the colours of the top bar's readouts. Shared by every
 * screen that shows what something yields or holds. The two differ in shape, not just colour (a droplet
 * and a crystal), and the Depleted variant adds a strike. The words travel in the accessible name.
 */
export function ResourceIcon({
  resource,
  depleted = false,
  size = 16,
  className,
  testId = 'resource-icon',
  label,
}: ResourceIconProps) {
  const classes = ['resource-icon', depleted ? 'resource-icon--depleted' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  const scale = size / NATIVE_SIZE;
  return (
    <span
      role="img"
      aria-label={label ?? yieldIconName(resource, depleted)}
      className={classes}
      data-testid={testId}
      data-resource={resource}
      style={{ width: size, height: size }}
    >
      {resource === 'fuel' ? (
        <KitFrame frame="res_fuel" scale={scale} />
      ) : (
        <img
          src={imageUrl('res_materials')}
          alt=""
          width={size}
          height={size}
          className="resource-icon__image"
        />
      )}
    </span>
  );
}
