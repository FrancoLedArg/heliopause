import { Core, Sound, type Game } from 'phaser';
import { EventBus } from '../EventBus.ts';
import type { Shot } from '../scenes/flightPlayback.ts';
import { sfx as defaultSfx, type Sfx, type SfxPlayer } from './sfx.ts';
import { RECIPES } from './sfxRecipes.ts';

/** Renders a recipe on the game's audio context. While the context is locked (no gesture yet) nothing plays. */
function synthPlayer(context: AudioContext, destination: AudioNode): SfxPlayer {
  let noise: AudioBuffer | undefined;
  const noiseBuffer = (): AudioBuffer => {
    if (!noise) {
      noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return noise;
  };
  return {
    play(key, volume) {
      const layers = Object.hasOwn(RECIPES, key) ? RECIPES[key] : undefined;
      if (!layers || context.state !== 'running') return;
      const now = context.currentTime;
      const master = context.createGain();
      master.gain.value = volume;
      master.connect(destination);
      for (const layer of layers) {
        const at = now + layer.start;
        const end = at + layer.dur;
        const attack = layer.attack ?? 0.01;
        const envelope = context.createGain();
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.linearRampToValueAtTime(layer.gain, at + attack);
        envelope.gain.exponentialRampToValueAtTime(0.0001, end);
        if (layer.kind === 'tone') {
          const osc = context.createOscillator();
          osc.type = layer.wave ?? 'sine';
          osc.frequency.setValueAtTime(layer.from, at);
          osc.frequency.exponentialRampToValueAtTime(layer.to, end);
          osc.connect(envelope);
          osc.start(at);
          osc.stop(end + 0.05);
        } else {
          const source = context.createBufferSource();
          source.buffer = noiseBuffer();
          source.loop = true;
          const filter = context.createBiquadFilter();
          filter.type = layer.filter ?? 'lowpass';
          filter.frequency.setValueAtTime(layer.from, at);
          filter.frequency.exponentialRampToValueAtTime(layer.to, end);
          source.connect(filter);
          filter.connect(envelope);
          source.start(at);
          source.stop(end + 0.05);
        }
        envelope.connect(master);
      }
    },
  };
}

/**
 * Plays a sound for each core-loop event on the EventBus: the Flight scene's shots, the gathering
 * moment, an install or removal and the Jump. Returns the undo.
 */
export function wireSfx(target: Sfx): () => void {
  let shot: Shot | undefined;
  let touchedDown = false;
  const offs = [
    EventBus.on('hop-flight-started', () => {
      shot = undefined;
      touchedDown = false;
    }),
    EventBus.on('hop-flight-moment', (moment) => {
      if (moment.shot !== shot) {
        shot = moment.shot;
        if (shot === 'takeoff') target.play('sfx_takeoff');
        if (shot === 'landing') target.play('sfx_landing');
      }
      if (moment.shot === 'landing' && moment.ended && !touchedDown) {
        touchedDown = true;
        target.play('sfx_touchdown');
      }
    }),
    EventBus.on('gathering-started', () => {
      target.play('sfx_gather');
    }),
    EventBus.on('component-install-requested', () => {
      target.play('sfx_install');
    }),
    EventBus.on('component-remove-requested', () => {
      target.play('sfx_remove');
    }),
    EventBus.on('jump-stage', (stage) => {
      if (stage === 'charge') target.play('sfx_jump');
    }),
  ];
  return () => {
    for (const off of offs) off();
  };
}

/**
 * Connects the sound effects to a running game. Undone when the game is destroyed, which detaches
 * only this game's player, never a newer game's.
 */
export function bindSfx(game: Game, target: Sfx = defaultSfx): void {
  const manager = game.sound;
  if (!(manager instanceof Sound.WebAudioSoundManager)) return;
  const player = synthPlayer(manager.context, manager.destination);
  target.attach(player);
  const unwire = wireSfx(target);
  game.events.once(Core.Events.DESTROY, () => {
    unwire();
    target.detach(player);
  });
}
