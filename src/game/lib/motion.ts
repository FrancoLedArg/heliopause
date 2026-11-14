/** True when the player asked their system for less motion. Read once per scene; tests stub `matchMedia`. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
