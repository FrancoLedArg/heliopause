import { describe, expect, it } from 'vitest';
import { Sfx } from './sfx.ts';
import { MusicSettingsStore } from './musicSettings.ts';

function setup(keys: string[] = ['sfx_gather', 'sfx_install']) {
  const played: { key: string; volume: number }[] = [];
  const settings = new MusicSettingsStore(null, 'test');
  const sfx = new Sfx({ settings, has: (key) => keys.includes(key) });
  const player = { play: (key: string, volume: number) => played.push({ key, volume }) };
  sfx.attach(player);
  return { sfx, played, settings, player };
}

describe('Sfx', () => {
  it('plays the key at the set volume', () => {
    const { sfx, played, settings } = setup();
    settings.set({ volume: 0.5 });
    sfx.play('sfx_gather');
    expect(played).toEqual([{ key: 'sfx_gather', volume: 0.5 }]);
  });

  it('is silent while muted or at zero volume, and plays again once unmuted', () => {
    const { sfx, played, settings } = setup();
    settings.set({ muted: true });
    sfx.play('sfx_gather');
    settings.set({ muted: false, volume: 0 });
    sfx.play('sfx_gather');
    expect(played).toEqual([]);
    settings.set({ volume: 1 });
    sfx.play('sfx_gather');
    expect(played).toHaveLength(1);
  });

  it('is silent for a key it has no sound for, and with no player', () => {
    const { sfx, played } = setup();
    sfx.play('sfx_nope');
    expect(played).toEqual([]);
    sfx.detach();
    sfx.play('sfx_gather');
    expect(played).toEqual([]);
  });

  it('a destroyed game does not detach a newer game player', () => {
    const { sfx, played, player } = setup();
    const newer = { play: (key: string, volume: number) => played.push({ key, volume }) };
    sfx.attach(newer);
    sfx.detach(player);
    sfx.play('sfx_gather');
    expect(played).toHaveLength(1);
    sfx.detach(newer);
    sfx.play('sfx_gather');
    expect(played).toHaveLength(1);
  });
});
