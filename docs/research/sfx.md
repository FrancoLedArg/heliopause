# Sound effects: sourcing (#263)

Plan (spec #262): Kenney.nl CC0 packs first, synthesis in code for anything missing.

## Kenney packs

Not used. `kenney.nl` answers a plain `curl` for its Sci-fi Sounds and Interface Sounds pages with HTTP 403, so no pack could be downloaded without working around the block. No Kenney file is in the repo, and the Credits do not claim one.

A human can still drop a CC0 Kenney pack in later: add the OGG under `public/assets/audio/sfx/`, list it in `src/game/assets/manifest.json`, and credit Kenney (CC0, https://kenney.nl) in Credits & References.

## Synthesised in code

Every effect is a recipe in `src/game/audio/sfxRecipes.ts` (tones and filtered noise), rendered with the Web Audio API by `bindSfx.ts`. No audio file ships, so there is nothing to license. Keys: `sfx_takeoff`, `sfx_landing`, `sfx_touchdown`, `sfx_gather`, `sfx_install`, `sfx_remove`, `sfx_jump`. The other spec keys (UI, Cruise, failure) have no recipe yet and play silence.

The recipes were written by an AI agent (see `AI-USAGE.md`).
