import type { Loader } from 'phaser';
import manifestJson from './manifest.json';

/**
 * Assets live in public/assets/ and are listed in manifest.json.
 * Code refers to assets ONLY by key. Until an asset exists, draw a stand-in with
 * primitives and branch on `hasAsset` (see docs/agents/assets.md).
 */
export interface AssetEntry {
  key: string;
  /** Path relative to public/assets/. */
  file: string;
}

/** A texture atlas: one image plus the frame data (JSON hash) that names its regions. */
export interface AtlasEntry {
  key: string;
  /** Atlas image, relative to public/assets/. */
  image: string;
  /** Frame data, relative to public/assets/. */
  data: string;
}

export interface AssetManifest {
  images: readonly AssetEntry[];
  atlases: readonly AtlasEntry[];
  audio: readonly AssetEntry[];
}

export const manifest: AssetManifest = manifestJson;

/** Where public/assets/ is served, relative to the page (Vite `base: './'`). */
const ASSET_ROOT = 'assets';

export function loadManifest(load: Loader.LoaderPlugin, source: AssetManifest = manifest): void {
  load.setPath(ASSET_ROOT);
  for (const { key, file } of source.images) load.image(key, file);
  for (const { key, image, data } of source.atlases) load.atlas(key, image, data);
  for (const { key, file } of source.audio) load.audio(key, file);
}

export function hasAsset(key: string, source: AssetManifest = manifest): boolean {
  return [...source.images, ...source.atlases, ...source.audio].some((entry) => entry.key === key);
}

/** Page-relative URL of an atlas's image, for DOM drawing outside Phaser. Throws if the key is not listed. */
export function atlasImageUrl(key: string, source: AssetManifest = manifest): string {
  const entry = source.atlases.find((atlas) => atlas.key === key);
  if (!entry) throw new Error(`No atlas with key "${key}" in the asset manifest`);
  return `${ASSET_ROOT}/${entry.image}`;
}
