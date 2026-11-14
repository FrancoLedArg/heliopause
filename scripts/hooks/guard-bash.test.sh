#!/usr/bin/env bash
# Table test for guard-bash.sh: `bash scripts/hooks/guard-bash.test.sh`
set -uo pipefail
hook="$(dirname "$0")/guard-bash.sh"
fail=0

expect() {
  local want=$1 cmd=$2 got
  jq -n --arg c "$cmd" '{tool_input: {command: $c}}' | "$hook" >/dev/null 2>&1
  got=$?
  if [[ $got != "$want" ]]; then
    echo "FAIL (want $want, got $got): $cmd"
    fail=1
  fi
}

# Allowed (0)
expect 0 'git push -u origin agent/12-thing'
expect 0 'git push -u origin chore/x && gh pr create --base main --title "t" --body "b"'
expect 0 'pnpm pipeline merge 3'
expect 0 'git commit -m "fix: push to main is now blocked"'
expect 0 'gh pr create --body "never run gh pr merge or git push --force"'
expect 0 'rm -rf node_modules dist'
expect 0 'git branch -d old'
expect 0 'git checkout main'
expect 0 'gh api repos/o/r/issues/3'
expect 0 'cd /tmp && ls'

# Blocked (2)
expect 2 'git push origin main'
expect 2 'git push origin HEAD:main'
expect 2 'cd repo && git push --force origin x'
expect 2 'git push -f'
expect 2 'git push --force-with-lease'
expect 2 'git push origin --delete agent/1'
expect 2 'gh pr merge 3 --squash'
expect 2 'gh api -X PUT repos/o/r/pulls/3/merge'
expect 2 'gh api -X DELETE repos/o/r/git/refs/heads/x'
expect 2 'gh repo delete o/r'
expect 2 'gh issue delete 4'
expect 2 'git reset --hard HEAD~1'
expect 2 'git clean -fd'
expect 2 'git branch -D agent/1'
expect 2 'git checkout -- .'
expect 2 'git commit --no-verify -m x'
expect 2 'rm -rf /'
expect 2 'rm -rf ~/projects'
expect 2 'rm -rf ../other'
expect 2 'FOO=1 git push origin main'

[[ $fail == 0 ]] && echo "guard-bash: all cases pass"
exit $fail
