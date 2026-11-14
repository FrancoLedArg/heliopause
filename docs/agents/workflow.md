# Delivery workflow

How work moves from a conversation with the human to merged code on `main`. Every agent in `.claude/agents/` follows this document; it is the single source of truth for roles, labels and lifecycle.

## Roles

| Role             | Runs as                                      | Model                                                | Owns                                                                    |
| ---------------- | -------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| **Human**        | —                                            | —                                                    | Product decisions, assets, approving nothing else                       |
| **Planner**      | `pnpm planner` (herdr tab, on demand)        | Opus                                                 | Grilling the human; `GLOSSARY.md`; ADRs; publishing **specs**           |
| **Orchestrator** | `pnpm orchestrator` (herdr tab, always open) | Opus                                                 | Turning specs into **tickets**; dispatching; merging; token budget      |
| **Researcher**   | subagent, own git worktree                   | Sonnet                                               | Answers from primary sources; `docs/research/*.md`                      |
| **Builder**      | subagent, own git worktree                   | Sonnet (Opus when assigned, Haiku for small tickets) | One ticket → one PR                                                     |
| **Reviewer**     | subagent, own git worktree                   | Opus                                                 | Verdict on one PR: standards, spec, and the change working in a browser |

The Planner owns the shared main checkout and may leave it on a `planner/*` branch with uncommitted edits. The Orchestrator never runs from it: `pnpm orchestrator` creates or refreshes its own worktree (`.claude/worktrees/orchestrator-main`, detached at `origin/main`) and starts there, so `pnpm pipeline` always runs the scripts on `main`.

The human makes **product** decisions (what the game is, how it feels, what ships). Agents make every **technical** decision and record the hard-to-reverse ones as ADRs in `docs/adr/`.

## Artifacts

- **Spec**: a GitHub issue labelled `spec`, written by the Planner from a grilling session using the `to-spec` template. One feature, from the player's perspective, with its seams and out-of-scope list. Publishing it is the hand-off; no further approval.
- **Ticket**: a GitHub sub-issue of a spec, written by the Orchestrator using the `to-tickets` issue template plus an agent brief (`.agents/skills/triage/AGENT-BRIEF.md`). A tracer-bullet vertical slice that fits one fresh context window, with native blocked-by edges.
- **Research ticket**: a ticket labelled `research`. A Researcher answers it in `docs/research/<topic>.md` and opens a PR.
- **Asset request**: an issue labelled `asset` + `ready-for-human`, opened by a Builder that needed art or audio. See `docs/agents/assets.md`.

## Labels

| Label             | Meaning                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| `spec`            | The issue is a spec (parent of tickets)                                   |
| `ready-for-agent` | Fully specified; the Orchestrator may pick it up                          |
| `in-progress`     | Claimed by the Orchestrator                                               |
| `research`        | Ticket answered by a Researcher instead of a Builder                      |
| `builder:opus`    | Ticket needs an Opus Builder (architecture, tricky logic, wide refactors) |
| `agent-approved`  | The Reviewer approved the PR                                              |
| `needs-triage`    | Escalated to the human; read the latest comment                           |
| `ready-for-human` | Work only the human can do (assets)                                       |
| `asset`           | Asset request                                                             |

## Lifecycle

```
Planner: grill → spec issue [spec, ready-for-agent]
Orchestrator: claim spec [in-progress]
  → research (Researchers), product questions to the human if research raised any
  → tickets as sub-issues [ready-for-agent (+ research | builder:opus)] with blocked-by edges
  → for each ready ticket (≤ 2 at once): claim → Builder → PR "Closes #N"
      → Reviewer → approve [agent-approved] | reject → Builder fixes (≤ 2 rounds) → escalate [needs-triage]
      → CI green + approved → `pnpm pipeline merge` (squash) → ticket closes
  → last ticket merged → spec closes
```

## Branches and PRs

- One branch per ticket: `agent/<ticket>-<slug>`, from `origin/main`. One PR per ticket, body starts with `Closes #<ticket>`.
- `main` is protected: changes land only through a PR with green CI, merged by `pnpm pipeline merge`. `scripts/hooks/guard-bash.sh` blocks force pushes, pushes to `main`, and merges outside the pipeline.
- Every commit carries the `Co-Authored-By` trailer for the model that wrote it (AI disclosure, see `AI-USAGE.md`).

## Escalation

The Orchestrator settles technical questions itself. It reaches the human only through:

1. **Product questions** in its herdr tab, batched once per spec after research.
2. `needs-triage` issues, when a ticket fails review twice or a spec cannot be delivered as written.
3. `asset` issues, opened by Builders.

## Commands

`pnpm pipeline status` shows what is actionable. The other `pnpm pipeline` subcommands (`claim`, `requeue`, `escalate`, `approve`, `reject`, `merge`) are the only way agents change pipeline state on GitHub; run without arguments for usage.
