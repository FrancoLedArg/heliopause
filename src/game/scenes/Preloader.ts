import { Scene } from 'phaser';
import { paletteNumber } from '../../ui/kit/palette.ts';
import { loadManifest } from '../assets/manifest.ts';
import { SceneKey } from './keys.ts';

const BAR_WIDTH = 200;
const BAR_HEIGHT = 8;

export class Preloader extends Scene {
  constructor() {
    super(SceneKey.Preloader);
  }

  init(): void {
    const { width, height } = this.scale;
    const left = Math.round((width - BAR_WIDTH) / 2);
    const top = Math.round((height - BAR_HEIGHT) / 2);
    this.add
      .rectangle(left, top, BAR_WIDTH, BAR_HEIGHT)
      .setOrigin(0)
      .setStrokeStyle(1, paletteNumber('gm4'));
    const bar = this.add
      .rectangle(left + 2, top + 2, 0, BAR_HEIGHT - 4, paletteNumber('cy3'))
      .setOrigin(0);
    this.load.on('progress', (progress: number) => {
      bar.width = Math.round((BAR_WIDTH - 4) * progress);
    });
  }

  preload(): void {
    loadManifest(this.load);
  }

  create(): void {
    this.scene.start(SceneKey.Title);
  }
}
