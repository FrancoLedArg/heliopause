import { Scene } from 'phaser';
import { loadManifest } from '../assets/manifest.ts';
import { SceneKey } from './keys.ts';

export class Preloader extends Scene {
  constructor() {
    super(SceneKey.Preloader);
  }

  init(): void {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, 468, 32).setStrokeStyle(1, 0xffffff);
    const bar = this.add.rectangle(width / 2 - 230, height / 2, 4, 28, 0xffffff);
    this.load.on('progress', (progress: number) => {
      bar.width = 4 + 460 * progress;
    });
  }

  preload(): void {
    loadManifest(this.load);
  }

  create(): void {
    this.scene.start(SceneKey.Title);
  }
}
