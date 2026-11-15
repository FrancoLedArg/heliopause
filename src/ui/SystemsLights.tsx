import { COMPONENTS, type Slot } from '../game/sim/index.ts';
import { ComponentIcon } from './componentIcons/ComponentIcon.tsx';
import { componentName } from './spacecraftPanelView.ts';

/** One light: the Component's icon above its lamp (native px). */
const LIGHT = { width: 16, height: 22 } as const;
const ICON_SIZE = 12;

interface SystemsLightsProps {
  /** The Spacecraft's Slots at Launch: one light per installed Component, in Slot order. */
  slots: readonly Slot[];
  /** How many lights are lit, from the first. */
  lit: number;
}

/**
 * The Cruise's systems check, shown, not told: a row of small lights beside the route inset, one per
 * installed Component under its icon (the same Component icon set as the Landed chips and the
 * Spacecraft panel). They light cyan one after another early in the Cruise, then
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
            {/* The light's own name says it all; the icon's name would only repeat it. */}
            <span className="systems-lights__icon" aria-hidden="true">
              <ComponentIcon kind={COMPONENTS[componentId].kind} size={ICON_SIZE} />
            </span>
            <span className="systems-lights__lamp" aria-hidden="true" />
          </li>
        );
      })}
    </ol>
  );
}
