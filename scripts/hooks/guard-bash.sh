#!/usr/bin/env bash
# PreToolUse guard for every Bash call made by any agent in this repo.
# Agents work on branches and land code through `pnpm pipeline merge`; this blocks
# the commands that would bypass that path or destroy work. Exit 2 = blocked.
set -euo pipefail

command=$(jq -r '.tool_input.command // ""')

block() {
  echo "Blocked by scripts/hooks/guard-bash.sh: $1. See docs/agents/workflow.md." >&2
  exit 2
}

# Normalise whitespace so patterns match regardless of spacing.
cmd=$(printf '%s' "$command" | tr -s '[:space:]' ' ')

[[ $cmd =~ git\ push.*(--force|\ -f(\ |$)|--force-with-lease|\ \+) ]] && block "force push"
[[ $cmd =~ git\ push.*(\ |:)(main|master)(\ |$) ]] && block "push to main (open a PR instead)"
[[ $cmd =~ git\ push.*--(all|mirror|delete) ]] && block "bulk or deleting push"
[[ $cmd =~ git\ reset\ .*--hard ]] && block "git reset --hard"
[[ $cmd =~ git\ clean\ .*-[a-zA-Z]*f ]] && block "git clean -f"
[[ $cmd =~ git\ branch\ .*-D ]] && block "git branch -D"
[[ $cmd =~ git\ checkout\ .*--\ \. ]] && block "discarding all changes"
[[ $cmd =~ --no-verify ]] && block "skipping hooks with --no-verify"
[[ $cmd =~ gh\ pr\ merge ]] && block "merging outside the pipeline (use pnpm pipeline merge)"
[[ $cmd =~ gh\ api.*/merge ]] && block "merging outside the pipeline (use pnpm pipeline merge)"
[[ $cmd =~ gh\ (repo\ delete|issue\ delete|release\ delete) ]] && block "deleting GitHub resources"
[[ $cmd =~ gh\ api.*-X\ ?DELETE ]] && block "DELETE via gh api"
[[ $cmd =~ rm\ .*-[a-zA-Z]*r[a-zA-Z]*f?.*\ (/|~|\$HOME|\.\.)(\ |$|/) ]] && block "recursive delete outside the repo"

exit 0
