import { Scene } from 'phaser';
import { SceneKey } from './keys.ts';

export class Boot extends Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    this.scene.start(SceneKey.Preloader);
  }
}
