import { useLayoutEffect, useRef } from 'react';
import { startGame } from './game/main.ts';

export const GAME_CONTAINER_ID = 'game-container';

/** Mounts the Phaser game once and destroys it on unmount. React owns the DOM shell; Phaser owns the canvas. */
export function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);

  useLayoutEffect(() => {
    gameRef.current ??= startGame(GAME_CONTAINER_ID);
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div id={GAME_CONTAINER_ID} />;
}
