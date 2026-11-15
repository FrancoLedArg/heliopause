# Heliopause

Space mission design game for NASA Space Apps 2026 (Vite + React + Phaser 4 + TypeScript). Agents write the code; the human makes product decisions and assets. Challenge brief: `docs/research/space-apps-challenge.md`.

- **Workflow** (roles, labels, lifecycle, escalation): `docs/agents/workflow.md`. Binding for every agent.
- **Code rules**: `CODING_STANDARDS.md`. **Assets**: `docs/agents/assets.md`.
- **Gate**: CI runs the full `pnpm verify` (typecheck, lint, format, unit, browser, build, e2e) on every PR, and nothing merges until it is green. Locally, run `pnpm verify --quick` (typecheck, lint, format, build, and only the unit tests affected by your changes; no browser or e2e suites) plus only the browser and e2e specs your change touches. The laptop is the bottleneck. Run `pnpm` with no args to see scripts.
- **Library APIs**: check Context7 before writing code against Phaser, React, Vite, Vitest or Playwright. Phaser is v4: load the matching Phaser 4 skill first.
- **AI disclosure**: keep `AI-USAGE.md` current when how AI is used changes.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for FrancoLedArg/heliopause, using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, plus the pipeline labels in `docs/agents/workflow.md`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` plus `docs/adr/`. See `docs/agents/domain.md`.
