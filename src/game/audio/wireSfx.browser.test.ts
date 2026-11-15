import { afterEach, describe, expect, it } from 'vitest';
import { EventBus } from '../EventBus.ts';
import type { FlightMoment } from '../scenes/flightPlayback.ts';
import { wireSfx } from './bindSfx.ts';
import { Sfx } from './sfx.ts';
import { MusicSettingsStore } from './musicSettings.ts';

const moment = (shot: FlightMoment['shot'], ended = false): FlightMoment =>
  ({ shot, ended }) as FlightMoment;

function setup() {
  const played: string[] = [];
  const sfx = new Sfx({ settings: new MusicSettingsStore(null, 't'), has: () => true });
  sfx.attach({ play: (key) => played.push(key) });
  return { played, off: wireSfx(sfx) };
}

let undo: (() => void) | undefined;
afterEach(() => {
  undo?.();
});

describe('wireSfx', () => {
  it('plays the Takeoff and Landing once per shot and the touchdown when the Hop ends', () => {
    const { played, off } = setup();
    undo = off;
    EventBus.emit('hop-flight-moment', moment('takeoff'));
    EventBus.emit('hop-flight-moment', moment('takeoff'));
    EventBus.emit('hop-flight-moment', moment('cruise'));
    EventBus.emit('hop-flight-moment', moment('landing'));
    EventBus.emit('hop-flight-moment', moment('landing', true));
    EventBus.emit('hop-flight-moment', moment('landing', true));
    expect(played).toEqual(['sfx_takeoff', 'sfx_landing', 'sfx_touchdown']);
  });

  it('plays gathering, install, remove and the Jump charge', () => {
    const { played, off } = setup();
    undo = off;
    EventBus.emit('gathering-started', {} as never);
    EventBus.emit('component-install-requested', 0, 'tank' as never);
    EventBus.emit('component-remove-requested', 0);
    EventBus.emit('jump-stage', 'charge');
    EventBus.emit('jump-stage', 'fire');
    expect(played).toEqual(['sfx_gather', 'sfx_install', 'sfx_remove', 'sfx_jump']);
  });

  it('stops listening once undone', () => {
    const { played, off } = setup();
    off();
    EventBus.emit('gathering-started', {} as never);
    expect(played).toEqual([]);
  });
});
