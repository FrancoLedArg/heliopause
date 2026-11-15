/**
 * The test-only Cruise speed (`?cruiseSpeed=`, see `src/game/lib/cruiseSpeed.ts`) for any flow that
 * flies a Hop: the 2-minute Cruise plays in about 2 s, and every other shot keeps its length. Add it
 * to the page URL: `/?seed=5&${FAST_CRUISE}`.
 */
export const FAST_CRUISE = 'cruiseSpeed=60';

/**
 * Test only (`?cruiseLeak=none`, see `src/game/lib/cruiseLeak.ts`): every Cruise has no events, for
 * flows pinned on a seed's Burns that test something else. Fly the Node side with `schedule: []`.
 */
export const NO_CRUISE_EVENTS = 'cruiseLeak=none';
