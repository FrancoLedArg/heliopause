/** Seeds span the 32-bit range the seeded `Rng` uses. */
const SEED_RANGE = 2 ** 32;

/**
 * The seed a New Run starts from: the page URL's `?seed=<n>` when it holds a whole number in
 * [0, 2^32), so tests and bug reports can replay a Run exactly; otherwise a fresh random seed.
 * `random` returns a float in [0, 1), like `Math.random`.
 */
export function chooseRunSeed(search: string, random: () => number): number {
  const fromUrl = new URLSearchParams(search).get('seed');
  if (fromUrl !== null && /^\d+$/.test(fromUrl)) {
    const seed = Number(fromUrl);
    if (seed < SEED_RANGE) return seed;
  }
  return Math.floor(random() * SEED_RANGE);
}
