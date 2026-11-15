/** The fastest the URL may play the Cruise: a 2-minute Cruise in half a second. */
const MAX_CRUISE_SPEED = 240;

/**
 * How many times faster than real time the Cruise plays, from the page URL's `?cruiseSpeed=<n>`.
 * Test-only: e2e flows fly real Hops without waiting the 2-minute Cruise, and every other shot keeps
 * its length. 1 (real time) when the URL names none or something that is not a whole number ≥ 1.
 */
export function chooseCruiseSpeed(search: string): number {
  const fromUrl = new URLSearchParams(search).get('cruiseSpeed');
  if (fromUrl === null || !/^\d+$/.test(fromUrl)) return 1;
  const speed = Number(fromUrl);
  return speed >= 1 ? Math.min(speed, MAX_CRUISE_SPEED) : 1;
}
