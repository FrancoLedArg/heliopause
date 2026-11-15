import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { sfx } from '../game/audio/sfx.ts';
import type { MusicSettingsStore } from '../game/audio/musicSettings.ts';
import { music } from '../game/audio/music.ts';
import { KitFrame } from './kit/KitFrame.tsx';

const SLIDER_WIDTH = 44;
const KNOB_WIDTH = 8;
const STEP = 0.05;
const POPOVER = { width: 84, height: 60 } as const;

/** A kit icon button face: normal, hover and pressed frames under the icon, chosen by CSS. */
function IconFaces({ icon }: { icon: 'icon_sound_on' | 'icon_sound_off' | 'icon_launch' }) {
  return (
    <>
      <KitFrame frame="btn_icon_normal" className="music-controls__face" />
      <KitFrame
        frame="btn_icon_hover"
        className="music-controls__face music-controls__face--hover"
      />
      <KitFrame
        frame="btn_icon_pressed"
        className="music-controls__face music-controls__face--pressed"
      />
      <KitFrame frame={icon} className="music-controls__icon" />
    </>
  );
}

interface VolumeRowProps {
  store: MusicSettingsStore;
  /** For the accessible names: "Mute music", "Music volume". */
  label: string;
  testId: string;
  on: 'icon_sound_on' | 'icon_launch';
  off: 'icon_sound_off';
  className?: string;
}

/** One mute toggle and one volume slider over a settings store. */
function VolumeRow({ store, label, testId, on, off, className }: VolumeRowProps) {
  const { muted, volume } = useSyncExternalStore(store.subscribe, store.get);
  const icon = muted ? off : on;
  const knobLeft = Math.round((SLIDER_WIDTH - KNOB_WIDTH) * volume);
  const name = label.charAt(0).toUpperCase() + label.slice(1);
  return (
    <div className={className ? `music-controls__row ${className}` : 'music-controls__row'}>
      <button
        type="button"
        className="music-controls__button music-controls__mute"
        aria-label={`Mute ${label}`}
        aria-pressed={muted}
        data-testid={`${testId}-mute`}
        onClick={() => {
          store.set({ muted: !muted });
        }}
      >
        <IconFaces icon={icon} />
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
          aria-label={`${name} volume`}
          min={0}
          max={1}
          step={STEP}
          value={volume}
          data-testid={`${testId}-volume`}
          onChange={(event) => {
            store.set({ volume: event.currentTarget.valueAsNumber, muted: false });
          }}
        />
      </div>
    </div>
  );
}

/**
 * The music controls, in kit styling: one speaker icon, whose shape shows whether the music is muted.
 * It opens a small popover with a mute toggle and a volume slider for the music and for the sound effects (the only places the
 * settings change). The popover closes on Escape, on a click outside it, and then leaves the Tab order.
 */
export function MusicControls({ className }: { className?: string }) {
  const { muted } = useSyncExternalStore(music.settings.subscribe, music.settings.get);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const icon = muted ? 'icon_sound_off' : 'icon_sound_on';

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      // Escape closes only the popover, not the screen or menu behind it.
      event.stopPropagation();
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    const onPointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open]);

  return (
    <div ref={root} className={className ? `music-controls ${className}` : 'music-controls'}>
      <button
        ref={trigger}
        type="button"
        className="music-controls__button"
        aria-label="Music"
        aria-haspopup="true"
        aria-expanded={open}
        data-testid="music-button"
        onClick={() => {
          setOpen(!open);
        }}
      >
        <IconFaces icon={icon} />
      </button>
      {open && (
        <div
          className="music-controls__popover"
          role="group"
          aria-label="Music"
          style={{ width: POPOVER.width, height: POPOVER.height }}
        >
          <KitFrame frame="panel_holo" width={POPOVER.width} height={POPOVER.height} />
          <VolumeRow
            store={music.settings}
            label="music"
            testId="music"
            on="icon_sound_on"
            off="icon_sound_off"
          />
          <VolumeRow
            store={sfx.settings}
            label="effects"
            testId="sfx"
            on="icon_launch"
            off="icon_sound_off"
            className="music-controls__row--sfx"
          />
        </div>
      )}
    </div>
  );
}
