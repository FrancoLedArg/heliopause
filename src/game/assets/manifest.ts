import type { Loader } from 'phaser';
import manifestJson from './manifest.json';

/**
 * Human-made assets live in public/assets/ and are listed in manifest.json.
 * Code refers to assets ONLY by key. Until an asset exists, draw a stand-in with
 * primitives and branch on `hasAsset` (see docs/agents/assets.md).
 */
export interface AssetEntry {
  key: string;
  /** Path relative to public/assets/. */
  file: string;
}

export interface AssetManifest {
  images: readonly AssetEntry[];
  audio: readonly AssetEntry[];
}

export const manifest: AssetManifest = manifestJson;

export function loadManifest(load: Loader.LoaderPlugin, source: AssetManifest = manifest): void {
  load.setPath('assets');
  for (const { key, file } of source.images) load.image(key, file);
  for (const { key, file } of source.audio) load.audio(key, file);
}

export function hasAsset(key: string, source: AssetManifest = manifest): boolean {
  return [...source.images, ...source.audio].some((entry) => entry.key === key);
}
