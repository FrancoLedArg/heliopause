#!/usr/bin/env bash
# PreToolUse guard for every Bash call made by any agent in this repo.
# Agents work on branches and land code through `pnpm pipeline merge`; this blocks
# the commands that would bypass that path or destroy work. Exit 2 = blocked.
#
# Each sub-command (split on && || ; | and newlines) is checked on its own and
# matched from its start, so text inside another command's arguments — a PR body,
# `--base main` — never trips a rule.
set -euo pipefail

command=$(jq -r '.tool_input.command // ""')

block() {
  echo "Blocked by scripts/hooks/guard-bash.sh: $1. See docs/agents/workflow.md." >&2
  exit 2
}

check() {
  local seg=$1
  # Drop leading env assignments (FOO=bar cmd …).
  while [[ $seg =~ ^[A-Za-z_][A-Za-z0-9_]*=[^\ ]*\ (.*)$ ]]; do seg=${BASH_REMATCH[1]}; done

  case $seg in
    git\ push*)
      [[ $seg =~ (--force|--force-with-lease|\ -f(\ |$)|\ \+) ]] && block "force push"
      [[ $seg =~ (\ |:)(main|master)(\ |$) ]] && block "push to main (open a PR instead)"
      [[ $seg =~ --(all|mirror|delete) ]] && block "bulk or deleting push"
      ;;
    git\ reset*--hard*) block "git reset --hard" ;;
    git\ clean*) [[ $seg =~ \ -[a-zA-Z]*f ]] && block "git clean -f" ;;
    git\ branch*) [[ $seg =~ \ -D(\ |$) ]] && block "git branch -D" ;;
    git\ checkout*--\ .) block "discarding all changes" ;;
    gh\ pr\ merge*) block "merging outside the pipeline (use pnpm pipeline merge)" ;;
    gh\ repo\ delete* | gh\ issue\ delete* | gh\ release\ delete*) block "deleting GitHub resources" ;;
    gh\ api*)
      [[ $seg =~ /merge(\ |$|\") ]] && block "merging outside the pipeline (use pnpm pipeline merge)"
      [[ $seg =~ (-X\ ?|--method\ )DELETE ]] && block "DELETE via gh api"
      ;;
    rm\ *)
      [[ $seg =~ \ -[a-zA-Z]*r ]] && [[ $seg =~ \ (/|~|\$HOME|\.\.)(\ |$|/) ]] && block "recursive delete outside the repo"
      ;;
  esac
  [[ $seg =~ ^git\ .*--no-verify ]] && block "skipping hooks with --no-verify"
  return 0
}

# Split into sub-commands and normalise whitespace.
while IFS= read -r segment; do
  segment=$(printf '%s' "$segment" | tr -s '[:space:]' ' ' | sed -e 's/^ *//' -e 's/ *$//')
  [[ -n $segment ]] && check "$segment"
done < <(printf '%s\n' "$command" | sed -e 's/&&/\n/g' -e 's/||/\n/g' -e 's/;/\n/g' -e 's/|/\n/g')

exit 0
