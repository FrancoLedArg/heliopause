/**
 * The test-only Cruise speed (`?cruiseSpeed=`, see `src/game/lib/cruiseSpeed.ts`) for any flow that
 * flies a Hop: the Cruise (50 s for now) plays in about 2 s, and every other shot keeps its length. Add it
 * to the page URL: `/?seed=5&${FAST_CRUISE}`.
 */
export const FAST_CRUISE = 'cruiseSpeed=25';
