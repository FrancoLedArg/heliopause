import { AUTO, Game, Scale } from 'phaser';
import { Boot } from './scenes/Boot.ts';
import { Preloader } from './scenes/Preloader.ts';
import { Title } from './scenes/Title.ts';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export function startGame(parent: string | HTMLElement): Game {
  return new Game({
    type: AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent,
    backgroundColor: '#05060f',
    scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
    scene: [Boot, Preloader, Title],
  });
}
