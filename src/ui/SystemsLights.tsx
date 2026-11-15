import { COMPONENTS, type ComponentKind, type Slot } from '../game/sim/index.ts';
import { paletteCss } from './kit/palette.ts';
import { componentName } from './spacecraftPanelView.ts';

/** One light: the Component's mark above its lamp (native px). */
const LIGHT = { width: 16, height: 22 } as const;

/**
 * A Component kind's 12×12 mark, the stand-in until the Component icon set (#221) is on main: then
 * this becomes `<ComponentIcon kind={kind} />`, so a Component looks the same in the Landed chips,
 * the Spacecraft panel and the Cruise. Each kind has its own shape, never colour alone.
 */
function ComponentMark({ kind }: { kind: ComponentKind }) {
  const stroke = paletteCss('gm6');
  const fill = paletteCss('gm5');
  let shape;
  switch (kind) {
    case 'engine':
      // A nozzle bell.
      shape = <path d="M4 1h4v4l3 6H1l3-6z" fill={fill} />;
      break;
    case 'fuel-tank':
      // A capsule tank.
      shape = <rect x="3" y="1" width="6" height="10" rx="3" fill={fill} />;
      break;
    case 'drill':
      // A bit pointing down.
      shape = <path d="M2 1h8v3L6 11 2 4z" fill={fill} />;
      break;
    case 'jump-drive':
      // A ring round a core.
      shape = (
        <>
          <circle cx="6" cy="6" r="4.5" fill="none" stroke={stroke} strokeWidth="1.5" />
          <circle cx="6" cy="6" r="1.5" fill={fill} />
        </>
      );
      break;
  }
  return (
    <svg
      className="systems-lights__mark"
      viewBox="0 0 12 12"
      width={12}
      height={12}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {shape}
    </svg>
  );
}

interface SystemsLightsProps {
  /** The Spacecraft's Slots at Launch: one light per installed Component, in Slot order. */
  slots: readonly Slot[];
  /** How many lights are lit, from the first. */
  lit: number;
}

/**
 * The Cruise's systems check, shown, not told: a row of small lights beside the route inset, one per
 * installed Component under its mark. They light cyan one after another early in the Cruise, then
 * hold steady. A lit lamp is a filled, glowing dot and an unlit one a hollow ring, so the state never
 * rests on colour alone; the words are in each light's accessible name. Cruise events (#210) turn a
 * light red here when its Component is Damaged.
 */
export function SystemsLights({ slots, lit }: SystemsLightsProps) {
  const installed = slots.flatMap((componentId, slot) =>
    componentId === null ? [] : [{ componentId, slot }],
  );
  return (
    <ol
      className="systems-lights"
      aria-label="Systems check"
      data-testid="systems-lights"
      style={{ width: installed.length * LIGHT.width + 8 }}
    >
      {installed.map(({ componentId, slot }, i) => {
        const on = i < lit;
        return (
          <li
            key={slot}
            className={`systems-lights__light systems-lights__light--${on ? 'on' : 'off'}`}
            data-light={on ? 'on' : 'off'}
            role="img"
            aria-label={`${componentName(componentId)}: ${on ? 'working' : 'checking'}`}
            style={{ width: LIGHT.width, height: LIGHT.height }}
          >
            <ComponentMark kind={COMPONENTS[componentId].kind} />
            <span className="systems-lights__lamp" aria-hidden="true" />
          </li>
        );
      })}
    </ol>
  );
}
