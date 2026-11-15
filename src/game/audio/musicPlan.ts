import type { SceneKey } from '../scenes/keys.ts';

/** Everything that decides which track plays. Pure, so the director and the tests agree. */
export interface MusicState {
  /** The scene on screen; `undefined` before the first one is up. */
  scene: SceneKey | undefined;
  chartOpen: boolean;
  /** The Jump moment is playing. */
  jumping: boolean;
  /** The Run is over (Fell Short, Crashed or Stranded). */
  ended: boolean;
  /** Set by the Approach shot and the Stranded warning. */
  approach: boolean;
  /** Set while a Component is Damaged during a Cruise. */
  cruiseEvent: boolean;
}

export type MusicScreen = 'title' | 'landed' | 'navchart' | 'cruise' | 'jump' | 'end';

export function screenFor(state: MusicState): MusicScreen | undefined {
  const { scene } = state;
  if (scene === undefined) return undefined;
  if (scene === 'Title') return 'title';
  if (state.ended) return 'end';
  if (scene === 'Flight') return state.jumping ? 'jump' : 'cruise';
  return state.chartOpen || scene === 'NavChart' ? 'navchart' : 'landed';
}

/** The manifest key of the track that should play now; `undefined` is silence. */
export function musicKeyFor(state: MusicState): string | undefined {
  const screen = screenFor(state);
  if (screen === undefined) return undefined;
  if (screen !== 'title' && state.approach) return 'music_approach';
  if (screen === 'cruise' && state.cruiseEvent) return 'music_cruise_event';
  return `music_${screen}`;
}
