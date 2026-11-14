import { AUTO, Game, Scale } from 'phaser';
import { paletteCss } from '../ui/kit/palette.ts';
import { Boot } from './scenes/Boot.ts';
import { Landed } from './scenes/Landed.ts';
import { NavChart } from './scenes/NavChart.ts';
import { Preloader } from './scenes/Preloader.ts';
import { Title } from './scenes/Title.ts';

/** Native resolution of the pixel art (UI kit and sprites); the canvas is scaled up from it. */
export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;

export function startGame(parent: string | HTMLElement): Game {
  return new Game({
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
    scene: [Boot, Preloader, Title, Landed, NavChart],
  });
}
