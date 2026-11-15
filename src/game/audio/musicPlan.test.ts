import { describe, expect, it } from 'vitest';
import { musicKeyFor, screenFor, type MusicState } from './musicPlan.ts';

const base: MusicState = {
  scene: 'Landed',
  chartOpen: false,
  jumping: false,
  ended: false,
  approach: false,
  cruiseEvent: false,
};

describe('screenFor', () => {
  it('maps each scene to its screen', () => {
    expect(screenFor({ ...base, scene: 'Title' })).toBe('title');
    expect(screenFor(base)).toBe('landed');
    expect(screenFor({ ...base, chartOpen: true })).toBe('navchart');
    expect(screenFor({ ...base, scene: 'Flight' })).toBe('cruise');
    expect(screenFor({ ...base, scene: 'Flight', jumping: true })).toBe('jump');
  });

  it('plays the End music once the Run is over, except on the title', () => {
    expect(screenFor({ ...base, ended: true })).toBe('end');
    expect(screenFor({ ...base, scene: 'Flight', ended: true })).toBe('end');
    expect(screenFor({ ...base, scene: 'Title', ended: true })).toBe('title');
  });

  it('is silent before any scene is up', () => {
    expect(screenFor({ ...base, scene: undefined })).toBeUndefined();
  });
});

describe('musicKeyFor', () => {
  it('uses the screen key', () => {
    expect(musicKeyFor(base)).toBe('music_landed');
    expect(musicKeyFor({ ...base, chartOpen: true })).toBe('music_navchart');
  });

  it('the Cruise event only plays during a Cruise', () => {
    expect(musicKeyFor({ ...base, scene: 'Flight', cruiseEvent: true })).toBe('music_cruise_event');
    expect(musicKeyFor({ ...base, cruiseEvent: true })).toBe('music_landed');
  });

  it('the Approach wins over everything but the title', () => {
    expect(musicKeyFor({ ...base, approach: true })).toBe('music_approach');
    expect(musicKeyFor({ ...base, scene: 'Flight', approach: true, cruiseEvent: true })).toBe(
      'music_approach',
    );
    expect(musicKeyFor({ ...base, scene: 'Title', approach: true })).toBe('music_title');
  });
});
