# Heliopause

A space mission design game for the [NASA Space Apps Challenge 2026 — Space Mission Design Game](https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/).

Built with Vite, React, Phaser 4 and TypeScript. Code is written by AI agents from human-designed specs; see [AI-USAGE.md](AI-USAGE.md).

## Play locally

```sh
pnpm install
pnpm dev        # http://localhost:8080
```

## How this repo is built

| Tab          | Command             | Purpose                                                      |
| ------------ | ------------------- | ------------------------------------------------------------ |
| Planner      | `pnpm planner`      | Design a feature with the human; publishes a spec issue      |
| Orchestrator | `pnpm orchestrator` | Always on: turns specs into tickets, builds, reviews, merges |

`pnpm pipeline status` shows the delivery queue. Details: [docs/agents/workflow.md](docs/agents/workflow.md).
