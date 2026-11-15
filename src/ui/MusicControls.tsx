import { useSyncExternalStore, type CSSProperties } from 'react';
import { music } from '../game/audio/music.ts';
import { KitFrame } from './kit/KitFrame.tsx';

const SLIDER_WIDTH = 44;
const KNOB_WIDTH = 8;
const STEP = 0.05;

/**
 * Mute and volume for the music, in kit styling. Icon and slider only: the meaning lives in the
 * accessible names. Both are real controls, so Tab reaches them and the arrow keys move the slider.
 */
export function MusicControls({ className }: { className?: string }) {
  const { muted, volume } = useSyncExternalStore(music.settings.subscribe, music.settings.get);
  const knobLeft = Math.round((SLIDER_WIDTH - KNOB_WIDTH) * volume);
  return (
    <div className={className ? `music-controls ${className}` : 'music-controls'}>
      <button
        type="button"
        className="music-controls__mute"
        aria-label="Mute music"
        aria-pressed={muted}
        data-testid="music-mute"
        onClick={() => {
          music.settings.set({ muted: !muted });
        }}
      >
        <KitFrame frame="btn_icon_normal" className="music-controls__face" />
        <KitFrame
          frame="btn_icon_hover"
          className="music-controls__face music-controls__face--hover"
        />
        <KitFrame
          frame="btn_icon_pressed"
          className="music-controls__face music-controls__face--pressed"
        />
        <KitFrame
          frame={muted ? 'icon_sound_off' : 'icon_sound_on'}
          className="music-controls__icon"
        />
      </button>
      <div
        className="music-controls__slider"
        style={{ width: SLIDER_WIDTH, '--knob-left': `${knobLeft}px` } as CSSProperties}
      >
        <KitFrame frame="slider_track" width={SLIDER_WIDTH} className="music-controls__track" />
        <KitFrame frame="slider_knob_normal" className="music-controls__knob" />
        <input
          type="range"
          className="music-controls__input"
          aria-label="Music volume"
          min={0}
          max={1}
          step={STEP}
          value={volume}
          data-testid="music-volume"
          onChange={(event) => {
            music.settings.set({ volume: event.currentTarget.valueAsNumber, muted: false });
          }}
        />
      </div>
    </div>
  );
}
