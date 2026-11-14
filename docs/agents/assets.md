# Assets

The human makes every image, sprite, sound and font. Agents write code that _uses_ assets and never produce asset files themselves (Space Apps rules also require a visible watermark on AI-generated media, which we avoid entirely).

## How code uses assets

- Files live in `public/assets/`. Each is listed in `src/game/assets/manifest.json` with a `key` and a `file` path relative to `public/assets/`.
- Code refers to an asset **only by its key**. `loadManifest` loads everything in the manifest; `hasAsset(key)` says whether it exists yet.
- **Stand-in**: until the asset exists, draw a primitive (Phaser `Graphics`, shapes, text; CSS for React) at the asset's exact size, and branch on `hasAsset(key)`. Replacing the stand-in must need only a manifest entry, never a code change.

## Asset requests

When a ticket needs an asset the manifest does not list, the Builder opens one issue per asset (or one per coherent set, like a spritesheet):

```
gh issue create --label asset --label ready-for-human --title "Asset: <key>" --body-file <file>
```

The body states:

- **Key** and the file name expected in `public/assets/`
- **What it is for**: the scene/UI element and the ticket (`Needed by #<ticket>`)
- **Format and size**: e.g. PNG, 128×128, transparent background; spritesheet frame size and count; audio length and loop point
- **Style notes**: anything the spec or glossary says about look and feel

The ticket still ships with its stand-in; the asset request does not block the PR.

## Ingesting human assets

When the human drops files into `public/assets/` (or hands over a base asset pack), a `research`-style ticket catalogues them: add each to the manifest with a key in the glossary's vocabulary, close any asset requests they satisfy, and open follow-up tickets to replace the matching stand-ins' branches.
