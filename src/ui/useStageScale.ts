import { useSyncExternalStore } from 'react';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/main.ts';

function subscribe(onResize: () => void): () => void {
  window.addEventListener('resize', onResize);
  return () => {
    window.removeEventListener('resize', onResize);
  };
}

/** How much the native 640×360 stage is scaled up to fit the browser window, keeping its aspect ratio. */
export function useStageScale(): number {
  return useSyncExternalStore(subscribe, () =>
    Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT),
  );
}
