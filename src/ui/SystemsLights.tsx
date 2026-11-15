import { useRef, type CSSProperties } from 'react';
import { EventBus } from '../game/EventBus.ts';
import { COMPONENTS, type Run, type Slot } from '../game/sim/index.ts';
import { ComponentIcon } from './componentIcons/ComponentIcon.tsx';
import { repairAction, repairName, repairState } from './repairView.ts';
import { componentName } from './spacecraftPanelView.ts';

/** One light: the Component's icon above its lamp (native px). */
const LIGHT = { width: 16, height: 22 } as const;
const ICON_SIZE = 12;

interface SystemsLightsProps {
  /** The Spacecraft's Slots at Launch: one light per installed Component, in Slot order. */
  slots: readonly Slot[];
  /** How many lights are lit, from the first. */
  lit: number;
  /** The Run in its Cruise, for its Damage (#250); `undefined` when there is no live Cruise. */
  run?: Run | undefined;
}

/**
 * The Cruise's systems check, shown, not told: a row of small lights beside the route inset, one per
 * installed Component under its icon (the same Component icon set as the Landed chips and the
 * Spacecraft panel). They light cyan one after another early in the Cruise, then hold steady. A lit
 * lamp is a filled, glowing dot and an unlit one a hollow ring, so the state never rests on colour
 * alone; the words are in each light's accessible name. A Damaged Component's light turns red and
 * becomes a button (#250): Enter starts its Repair, and a ring fills round the lamp as it runs;
 * Enter again Rushes it. Its name says the Repair time or the Rush price.
 */
export function SystemsLights({ slots, lit, run }: SystemsLightsProps) {
  const installed = slots.flatMap((componentId, slot) =>
    componentId === null ? [] : [{ componentId, slot }],
  );
  // A Rush makes the light whole again and takes its button away: focus stays on the row.
  const list = useRef<HTMLOListElement>(null);
  return (
    <ol
      ref={list}
      tabIndex={-1}
      className="systems-lights"
      aria-label="Systems check"
      data-testid="systems-lights"
      style={{ width: installed.length * LIGHT.width + 8 }}
    >
      {installed.map(({ componentId, slot }, i) => {
        const state = run ? repairState(run, slot) : ({ kind: 'sound' } as const);
        const face = (
          <>
            {/* The light's own name says it all; the icon's name would only repeat it. */}
            <span className="systems-lights__icon" aria-hidden="true">
              <ComponentIcon kind={COMPONENTS[componentId].kind} size={ICON_SIZE} />
            </span>
            <span className="systems-lights__lamp" aria-hidden="true" />
          </>
        );
        if (state.kind === 'damaged') {
          const action = repairAction(state);
          const repairing = state.progress !== null;
          return (
            <li key={slot} style={{ width: LIGHT.width, height: LIGHT.height }}>
              <button
                type="button"
                className={`systems-lights__light systems-lights__light--damaged${repairing ? ' systems-lights__light--repairing' : ''}`}
                data-light={repairing ? 'repairing' : 'damaged'}
                aria-label={repairName(componentId, state)}
                aria-disabled={action === undefined}
                style={
                  {
                    width: LIGHT.width,
                    height: LIGHT.height,
                    '--repair': `${String(Math.round((state.progress ?? 0) * 360))}deg`,
                  } as CSSProperties
                }
                onClick={() => {
                  if (!action) return;
                  EventBus.emit(`${action}-requested`, slot);
                  if (action === 'rush') list.current?.focus();
                }}
              >
                {face}
              </button>
            </li>
          );
        }
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
            {face}
          </li>
        );
      })}
    </ol>
  );
}
