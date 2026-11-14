#!/usr/bin/env bash
# PreToolUse hook entry point (see .claude/settings.json). Rules: scripts/hooks/guard.ts.
# Fails closed: Claude Code only blocks on exit 2, so anything other than a clean
# allow (0) or block (2) — node missing, a crash — is turned into a block.
if ! command -v node >/dev/null 2>&1; then
  echo "Bash guard: node not found on PATH, blocking to be safe." >&2
  exit 2
fi
node "$(dirname "$0")/guard-bash.ts"
code=$?
if [ "$code" -eq 0 ] || [ "$code" -eq 2 ]; then exit "$code"; fi
echo "Bash guard crashed (exit $code), blocking to be safe." >&2
exit 2
