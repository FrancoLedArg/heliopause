import { useSyncExternalStore } from 'react';
import { atlasImageUrl } from '../../game/assets/manifest.ts';
import { KIT_ATLAS_KEY } from './kit.ts';

// One shared image for every kit frame drawn in the DOM, loaded on first use by its manifest key.
let atlas: HTMLImageElement | undefined;
let loading = false;
const listeners = new Set<() => void>();

function startLoading(): void {
  if (loading) return;
  loading = true;
  const image = new Image();
  image.onload = () => {
    atlas = image;
    for (const listener of listeners) listener();
  };
  image.onerror = () => {
    console.error(`UI kit atlas failed to load from ${image.src}`);
  };
  image.src = atlasImageUrl(KIT_ATLAS_KEY);
}

function subscribe(listener: () => void): () => void {
  startLoading();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The kit atlas image once it has loaded; `undefined` until then. */
export function useKitAtlas(): HTMLImageElement | undefined {
  return useSyncExternalStore(subscribe, () => atlas);
}
