# AI usage disclosure

Space Apps 2026 requires every submission to describe how AI ("Super Intelligence", SI) was used, and to acknowledge SI-generated code and data in text and metadata. This file is that acknowledgement and is kept current by the agents.

## Idea and design

The game's concept, design direction and every product decision come from the human team. AI acted as an interviewer: it asked questions, stress-tested the human's ideas, researched facts, and wrote the agreed decisions down as specs (`spec`-labelled GitHub issues) and glossary entries. AI did not originate the game idea.

## Code

Nearly all source code is written by AI agents (Anthropic Claude via Claude Code), working from human-approved specs:

- **Orchestrator / Planner / Reviewer:** Claude Opus. **Builders / Researchers:** Claude Sonnet (Opus for complex tickets).
- Every AI-authored commit carries a `Co-Authored-By: Claude …` trailer naming the model, so `git log` is the per-commit record.
- Every change was reviewed by an AI Reviewer agent and verified by automated tests and CI before merging.

## Data

Real-world mission data (launch vehicles, orbits, subsystem figures) is gathered by AI Researcher agents from primary sources (NASA and other agency/provider publications), recorded with citations in `docs/research/`, and referenced by a `source` field in the game's data modules.

## Art, audio and media

All images, sprites, audio and fonts are made by the human team. AI does not generate media for this project, so no SI watermarks are required. Any exception will be listed here with its watermark.

## NASA branding

No NASA logos, insignia, flags or mission identifiers are used.
