/** A stable 32-bit seed from a string (FNV-1a): gives each named thing its own stream of a Run's seeded randomness. */
export function stringSeed(text: string): number {
  let h = 0x811c9dc5;
  for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 0x01000193);
  return h >>> 0;
}
