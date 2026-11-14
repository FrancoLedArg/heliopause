#!/usr/bin/env bash
# PreToolUse hook entry point (see .claude/settings.json). Rules: scripts/hooks/guard.ts.
exec node "$(dirname "$0")/guard-bash.ts"
