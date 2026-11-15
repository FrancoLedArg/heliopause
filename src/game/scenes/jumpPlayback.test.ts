import { describe, expect, it } from 'vitest';
import { jumpPlayback } from './jumpPlayback.ts';

/** The stage on screen at every 10 ms of the playback, runs of the same stage merged. */
function stages(playback: ReturnType<typeof jumpPlayback>): string[] {
  const seen: string[] = [];
  for (let ms = 0; ms <= playback.duration; ms += 10) {
    const { stage } = playback.at(ms);
    if (seen.at(-1) !== stage) seen.push(stage);
  }
  return seen;
}

describe('the Jump moment', () => {
  it('the Jump Drive charges, fires, then the screen goes dark for the flavour text', () => {
    expect(stages(jumpPlayback('full'))).toEqual(['charge', 'fire', 'dark']);
  });

  it('under reduced motion the Jump is only a fade with the flavour text', () => {
    const reduced = jumpPlayback('reduced');
    expect(stages(reduced)).toEqual(['dark']);
    expect(reduced.at(0).darkness).toBe(0);
  });

  it('the screen is fully dark well before the hand-off, so the text can be read', () => {
    for (const pace of ['full', 'reduced'] as const) {
      const playback = jumpPlayback(pace);
      const fullyDark = Array.from({ length: playback.duration + 1 }, (_, ms) => ms).find(
        (ms) => playback.at(ms).darkness === 1,
      );
      expect(fullyDark).toBeDefined();
      expect(playback.duration - (fullyDark ?? playback.duration)).toBeGreaterThanOrEqual(1500);
      expect(playback.at(playback.duration - 1).ended).toBe(false);
      expect(playback.at(playback.duration).ended).toBe(true);
    }
  });
});
