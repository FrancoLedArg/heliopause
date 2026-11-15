import { AUTO, Core, Game, Scale } from 'phaser';
import { paletteCss } from '../ui/kit/palette.ts';
import { bindMusic } from './audio/bindMusic.ts';
import { bindSfx } from './audio/bindSfx.ts';
import { EventBus } from './EventBus.ts';
import { Boot } from './scenes/Boot.ts';
import { Flight } from './scenes/Flight.ts';
import { Landed, type LandedData } from './scenes/Landed.ts';
import { SceneKey } from './scenes/keys.ts';
import { startRun } from './sim/index.ts';
import { NavChart } from './scenes/NavChart.ts';
import { Preloader } from './scenes/Preloader.ts';
import { Title } from './scenes/Title.ts';

/** Native resolution of the pixel art (UI kit and sprites); the canvas is scaled up from it. */
export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;

export function startGame(parent: string | HTMLElement): Game {
  const game = new Game({
    type: AUTO,
    parent,
    backgroundColor: paletteCss('void'),
    // Nearest-neighbour scaling, no smoothing, whole-pixel positions.
    pixelArt: true,
    scale: {
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      mode: Scale.FIT,
      autoCenter: Scale.CENTER_BOTH,
      // The React stage sizes the parent; Phaser must not change it.
      expandParent: false,
    },
    scene: [Boot, Preloader, Title, Landed, NavChart, Flight],
  });
  startNewRuns(game);
  bindMusic(game);
  bindSfx(game);
  return game;
}

/**
 * A New Run can be asked for from any scene (the Title, or the report of a failed Hop), so the game
 * itself answers it: whatever is on screen is stopped and the Run starts on its Home Planet.
 */
function startNewRuns(game: Game): void {
  const off = EventBus.on('new-run-requested', (seed, chassisId) => {
    const data: LandedData = { run: startRun(seed, chassisId) };
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.scene.key);
    game.scene.start(SceneKey.Landed, data);
  });
  game.events.once(Core.Events.DESTROY, off);
}
