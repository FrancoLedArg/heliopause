import { useSyncExternalStore } from 'react';
import { atlasDataUrl } from '../game/assets/manifest.ts';

/** Where a frame sits in its atlas image (px). */
export interface AtlasFrame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

type Frames = ReadonlyMap<string, AtlasFrame>;

// Each atlas's frame data, fetched once on first use by its manifest key and shared by every reader.
const loaded = new Map<string, Frames>();
const loading = new Set<string>();
const listeners = new Set<() => void>();

/** Parses Phaser JSON-hash atlas data: `{ frames: { name: { frame: { x, y, w, h } } } }`. */
function parseFrames(data: unknown): Frames {
  const frames = new Map<string, AtlasFrame>();
  if (typeof data !== 'object' || data === null || !('frames' in data)) return frames;
  const entries: unknown = data.frames;
  if (typeof entries !== 'object' || entries === null) return frames;
  for (const [name, entry] of Object.entries(entries as Record<string, unknown>)) {
    const frame: unknown =
      typeof entry === 'object' && entry !== null && 'frame' in entry ? entry.frame : undefined;
    if (typeof frame !== 'object' || frame === null) continue;
    const { x, y, w, h } = frame as Record<string, unknown>;
    if (
      typeof x === 'number' &&
      typeof y === 'number' &&
      typeof w === 'number' &&
      typeof h === 'number'
    ) {
      frames.set(name, { x, y, w, h });
    }
  }
  return frames;
}

function startLoading(key: string): void {
  if (loading.has(key)) return;
  loading.add(key);
  fetch(atlasDataUrl(key))
    .then((response) => response.json())
    .then((data: unknown) => {
      loaded.set(key, parseFrames(data));
      for (const listener of listeners) listener();
    })
    .catch((error: unknown) => {
      console.error(`Atlas data for ${key} failed to load`, error);
    });
}

/** The frames of the atlas `key` once its data has loaded; `undefined` until then. */
export function useAtlasFrames(key: string): Frames | undefined {
  return useSyncExternalStore(
    (listener) => {
      startLoading(key);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => loaded.get(key),
  );
}
