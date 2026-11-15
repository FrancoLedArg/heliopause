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

/**
 * Loads the images and atlases the game needs to start. Audio is left out on purpose: the tracks are
 * several MB each and are fetched lazily once the title is up (see `audioUrls` and the music system).
 */
export function loadManifest(load: Loader.LoaderPlugin, source: AssetManifest = manifest): void {
  load.setPath(ASSET_ROOT);
  for (const { key, file } of source.images) load.image(key, file);
  for (const { key, image, data } of source.atlases) load.atlas(key, image, data);
}

/** The audio file (relative to public/assets/) a key plays; `undefined` when the key is not listed. */
export function audioFile(key: string, source: AssetManifest = manifest): string | undefined {
  return source.audio.find((entry) => entry.key === key)?.file;
}

/** Each distinct audio file once, in manifest order, with its page-relative URL. Many keys may share a file. */
export function audioFiles(
  source: AssetManifest = manifest,
): readonly { file: string; url: string }[] {
  const files = [...new Set(source.audio.map((entry) => entry.file))];
  return files.map((file) => ({ file, url: `${ASSET_ROOT}/${file}` }));
}

export function hasAsset(key: string, source: AssetManifest = manifest): boolean {
  return [...source.images, ...source.atlases, ...source.audio].some((entry) => entry.key === key);
}

/** Page-relative URL of a single image, for DOM drawing outside Phaser. Throws if the key is not listed. */
export function imageUrl(key: string, source: AssetManifest = manifest): string {
  const entry = source.images.find((image) => image.key === key);
  if (!entry) throw new Error(`No image with key "${key}" in the asset manifest`);
  return `${ASSET_ROOT}/${entry.file}`;
}

/** Page-relative URL of an atlas's image, for DOM drawing outside Phaser. Throws if the key is not listed. */
export function atlasImageUrl(key: string, source: AssetManifest = manifest): string {
  const entry = source.atlases.find((atlas) => atlas.key === key);
  if (!entry) throw new Error(`No atlas with key "${key}" in the asset manifest`);
  return `${ASSET_ROOT}/${entry.image}`;
}

/** Page-relative URL of an atlas's frame data, for DOM drawing outside Phaser. Throws if the key is not listed. */
export function atlasDataUrl(key: string, source: AssetManifest = manifest): string {
  const entry = source.atlases.find((atlas) => atlas.key === key);
  if (!entry) throw new Error(`No atlas with key "${key}" in the asset manifest`);
  return `${ASSET_ROOT}/${entry.data}`;
}
