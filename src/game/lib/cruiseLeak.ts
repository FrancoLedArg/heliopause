import { COMPONENTS, CRUISE_TUNING, type ScheduledEvent, type Spacecraft } from '../sim/index.ts';

/**
 * Test only (#210's schedule injection, like `?cruiseSpeed=`): from the page URL's
 * `?cruiseLeak=<tick>`, every Cruise gets one Fuel leak on the first Fuel Tank at that Cruise tick,
 * in place of the seed's schedule, so an e2e flow meets the same leak every time. `undefined` (the
 * seed's own schedule) when the URL names none, or a tick the Cruise does not have. It can only add
 * a leak: a Run can never be made easier with it.
 */
export function chooseCruiseLeak(
  search: string,
  spacecraft: Spacecraft,
): readonly ScheduledEvent[] | undefined {
  const fromUrl = new URLSearchParams(search).get('cruiseLeak');
  if (fromUrl === null || !/^\d+$/.test(fromUrl)) return undefined;
  const tick = Number(fromUrl);
  if (tick < 1 || tick >= CRUISE_TUNING.ticks) return undefined;
  const slot = spacecraft.slots.findIndex(
    (id) => id !== null && COMPONENTS[id].kind === 'fuel-tank',
  );
  return [{ kind: 'fuel-leak', tick, slot: slot < 0 ? null : slot }];
}
