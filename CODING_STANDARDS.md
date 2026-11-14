# Coding standards

Binding for every Builder and every review. Tooling enforces the mechanical rules (`pnpm verify`: strict `tsc`, ESLint `strictTypeChecked`, Prettier, Vitest, Playwright); this file holds what tooling cannot check.

## Architecture

- **Simulation is pure TypeScript.** Mission rules, resource budgets, scoring and anything a player's decision feeds into live in plain modules with no Phaser or React imports, tested in Node. Phaser renders and takes input; React owns menus, forms and panels around the canvas. A rule that can be tested without a canvas is.
- **Deep modules.** Small interfaces hiding real work (see the `codebase-design` skill). Prefer one module with a clear seam over many thin pass-through files.
- **One boundary between React and Phaser:** the typed `EventBus` (`GameEvents`). Add the event type before emitting it. Neither side reaches into the other's objects.
- **Data with provenance.** Every real-world number (launch vehicle capacity, orbit altitude, instrument power draw) lives in a typed data module with a `source` field citing the `docs/research/` file or URL it came from. Gameplay tuning values are marked as such.
- **Determinism.** Randomness goes through the seeded `Rng` so a mission replays identically from its seed.

## TypeScript

- Model domain concepts as types named in `GLOSSARY.md` vocabulary; give a primitive standing in for a concept its own type (e.g. `Kilograms`, `Watts`) when mixing them up would be a bug.
- Discriminated unions over boolean flags and optional-field soup; exhaustive `switch` on them.
- No `any`, no non-null `!`, no `as` casts outside test fixtures and parsing boundaries (parse unknown data once, at the edge).
- Errors: throw for programmer errors; return a result type for expected failures a player can cause (e.g. a design that exceeds the launch vehicle's capacity).

## Tests

- Test behaviour at the spec's seams through public interfaces, following the `tdd` skill. Names read as rules of the game: `rejects a payload heavier than the vehicle's capacity to the chosen orbit`.
- `*.test.ts`: Node unit tests. `*.browser.test.ts(x)`: needs a real DOM/canvas. `tests/e2e/`: player flows against the production build.
- Every user-visible flow gets at least one e2e path. Bug fixes start with a failing test.

## UI and game feel

- Use the `frontend-design` and `web-design-guidelines` skills for React UI; `vercel-react-best-practices` and `vercel-composition-patterns` for component structure.
- Accessible by default: keyboard operable, visible focus, text contrast ≥ 4.5:1, no information carried by colour alone.
- Explain _why_: whenever the game judges a player's decision, show the reason in plain language (challenge requirement).
- Art and audio follow `docs/agents/assets.md`.

## Commits and PRs

- Conventional Commits. Small, logical commits. One ticket per PR; the body starts with `Closes #<ticket>`.
- No NASA logos, insignia, flags or mission patches anywhere in the repo (Space Apps rule).
