import {
  COMPONENTS,
  CRUISE_TUNING,
  type ComponentKind,
  type CruiseEventKind,
  type ScheduledEvent,
  type Spacecraft,
} from '../sim/index.ts';

/**
 * Test only (#210's schedule injection, like `?cruiseSpeed=`): from the page URL's
 * `?cruiseLeak=<tick>`, every Cruise gets one Fuel leak on the first Fuel Tank at that Cruise tick,
 * and from `?cruiseFire=<tick>` one Engine fire on the first Engine (#251), in place of the seed's
 * schedule, so an e2e flow meets the same events every time. `?cruiseLeak=none` gives every Cruise
 * no events, for flows pinned on a seed's Burns that test something else (the Node side flies them
 * with `schedule: []`). `undefined` (the seed's own schedule) when the URL names neither, or only
 * ticks the Cruise does not have.
 */
export function chooseCruiseLeak(
  search: string,
  spacecraft: Spacecraft,
  daily = false,
): readonly ScheduledEvent[] | undefined {
  // A Daily Run is the same Star System for everyone: the URL never changes its Cruises, as it
  // never changes its seed.
  if (daily) return undefined;
  const params = new URLSearchParams(search);
  if (params.get('cruiseLeak') === 'none') return [];
  const events = [
    injected(params.get('cruiseLeak'), 'fuel-leak', 'fuel-tank', CRUISE_TUNING.ticks - 1),
    // An Engine fire needs its whole 30 s to burn inside the Cruise.
    injected(
      params.get('cruiseFire'),
      'engine-fire',
      'engine',
      CRUISE_TUNING.ticks - CRUISE_TUNING.fireTicks,
    ),
  ].flatMap((event) => (event ? [event] : []));
  if (events.length === 0) return undefined;
  return events.map(({ kind, tick, target }) => {
    const slot = spacecraft.slots.findIndex((id) => id !== null && COMPONENTS[id].kind === target);
    return { kind, tick, slot: slot < 0 ? null : slot };
  });
}

/** One injected event from its URL value, or `undefined` for no tick from 1 to `latest`. */
function injected(
  fromUrl: string | null,
  kind: CruiseEventKind,
  target: ComponentKind,
  latest: number,
): { kind: CruiseEventKind; tick: number; target: ComponentKind } | undefined {
  if (fromUrl === null || !/^\d+$/.test(fromUrl)) return undefined;
  const tick = Number(fromUrl);
  return tick >= 1 && tick <= latest ? { kind, tick, target } : undefined;
}
