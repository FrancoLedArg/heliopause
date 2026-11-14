# The Orchestrator is a Claude Code agent session, not a script

Delivery runs as a long-lived `claude --agent orchestrator` session in a terminal tab, which dispatches Builder, Reviewer and Researcher subagents, instead of a TypeScript program driving headless `claude -p` or the Agent SDK. The human wanted to watch it and talk to it ("why did #9 fail?", product questions after research), and the orchestration judgement (slicing specs, choosing models, reading verdicts) is model work anyway. The parts that must never drift — claiming, labelling, merging, closing specs — live in the deterministic `pnpm pipeline` CLI so the agent decides _what_ and the script decides _how_.

## Consequences

- Polling relies on `/loop` inside an interactive session: if the tab closes, delivery stops until it is relaunched (state lives on GitHub, so a fresh session recovers via `pnpm pipeline status`).
- Moving to GitHub Actions later means reusing `.claude/agents/*.md` and the pipeline CLI from `claude-code-action`, not rewriting them.
