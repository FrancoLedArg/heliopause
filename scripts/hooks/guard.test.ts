import { describe, expect, it } from 'vitest';
import { guard } from './guard.ts';
import { parseShell } from './shell.ts';

const context = {
  projectDir: '/work/heliopause',
  scratchDirs: ['/tmp', '/private/tmp', '/var/folders', '/var/folders/xy/T'],
  tmpDir: '/var/folders/xy/T',
};

/** A PR or review body posted the way agents usually do, via a quoted heredoc. */
const heredocBody = (body: string) => `gh pr comment 1 --body "$(cat <<'EOF'\n${body}\nEOF\n)"`;
const check = (script: string) => guard(script, context);

describe('parseShell', () => {
  it('splits on operators and removes quotes', () => {
    expect(parseShell(`cd x && git commit -m "a; b" | cat; echo 'c d'`)).toEqual([
      ['cd', 'x'],
      ['git', 'commit', '-m', 'a; b'],
      ['cat'],
      ['echo', 'c d'],
    ]);
  });

  it('joins line continuations', () => {
    expect(parseShell('git push \\\n  --force')).toEqual([['git', 'push', '--force']]);
  });

  it('skips heredoc bodies and redirections', () => {
    expect(parseShell("cat > f <<'EOF'\ngit push --force\nEOF\necho done 2>&1")).toEqual([
      ['cat'],
      ['echo', 'done'],
    ]);
  });

  it('parses command substitutions and bash -c strings as commands', () => {
    expect(parseShell('echo "$(git rev-parse HEAD)"')).toContainEqual(['git', 'rev-parse', 'HEAD']);
    expect(parseShell("bash -c 'git status'")).toContainEqual(['git', 'status']);
  });
});

describe('guard allows ordinary agent work', () => {
  it.each([
    'git push -u origin agent/12-thing',
    'git push -u origin chore/x && gh pr create --base main --title "t" --body "b"',
    'git push -u origin agent/1-main-menu',
    'git push origin feature/main',
    'git push origin HEAD:agent/3-fix',
    'pnpm pipeline merge 3',
    'git commit -m "fix: push to main is now blocked"',
    'git commit -m "docs: explain; git push --force is blocked"',
    'git commit -m "first paragraph\n\nrm -rf ../ is blocked now"',
    'gh pr create --body "never run gh pr merge or git push --force"',
    'gh pr comment 3 --body "Run && git clean -fd to reset"',
    'gh pr create --body "| git push origin main | x |"',
    'gh pr create --title t --body "$(cat <<\'EOF\'\n```\ngit reset --hard origin/main\n```\nEOF\n)"',
    'rm -rf node_modules dist',
    'rm -rf /tmp/x',
    'rm -rf /work/heliopause/.claude/worktrees/agent-1',
    'rm -rf "$CLAUDE_PROJECT_DIR/dist"',
    'rm -f ../single-file',
    'git branch -d old',
    'git checkout main',
    'git restore --staged .',
    'gh api repos/o/r/issues/3',
    'gh api repos/o/r/pulls/3/merge',
    'cd /tmp && ls',
    heredocBody("It's done; `gh label delete spec` is now blocked."),
    heredocBody('Findings:\n1) force push slips through\n2) fixed :)'),
    heredocBody("```\ngit reset --hard origin/main\n```\nand it's (mostly) fine"),
    'rm -rf "$TMPDIR/vitest-cache"',
    'rm -rf "${CLAUDE_PROJECT_DIR}/dist"',
    'if pnpm test; then echo ok; fi',
    'echo $((1 + 2))',
  ])('%s', (script) => {
    expect(check(script)).toBeNull();
  });
});

describe('guard blocks', () => {
  it.each([
    'git push origin main',
    'git push origin HEAD:main',
    'git push origin HEAD:refs/heads/main',
    'git push origin "main"',
    "git push origin 'master'",
    'cd repo && git push --force origin x',
    'git push -f',
    'git push -fu origin x',
    'git push -uf origin x',
    'git push --force-with-lease',
    'git push origin +agent/1',
    'git push origin --delete agent/1',
    'git push origin :agent/1',
    'git push -d origin agent/1',
    'git -C /x push --force origin y',
    'git -C /x push origin main',
    'git -C /x reset --hard',
    'git push \\\n  --force origin x',
    '(cd x && git reset --hard)',
    'timeout 60 git push --force',
    'time git push -f',
    'nohup git push --force &',
    'FOO=1 git push origin main',
    'bash -c "git push --force"',
    'echo $(git reset --hard)',
    'gh pr merge 3 --squash',
    'gh -R o/r pr merge 3',
    'gh pr close 3 --delete-branch',
    'gh api -X PUT repos/o/r/pulls/3/merge',
    'gh api repos/o/r/pulls/3/merge -f merge_method=squash',
    'gh api -X DELETE repos/o/r/git/refs/heads/x',
    'gh api --method=DELETE repos/o/r/labels/x',
    'gh api --method DELETE repos/o/r/labels/x',
    'gh api graphql -f query="mutation { mergePullRequest(input: {}) { clientMutationId } }"',
    'gh repo delete o/r',
    'gh issue delete 4',
    'gh label delete spec',
    'gh run delete 1',
    'git reset --hard HEAD~1',
    'git clean -fd',
    'git branch -D agent/1',
    'git branch --delete --force agent/1',
    'git checkout -- .',
    'git checkout .',
    'git restore .',
    'git commit --no-verify -m x',
    'git commit -nm x',
    'HUSKY=0 git commit -m x',
    'git -c core.hooksPath=/dev/null commit -m x',
    'rm -rf /',
    'rm -rf ~/projects',
    'rm -rf ../other',
    'rm -Rf ../x',
    'rm --recursive --force ../x',
    'rm -rf "$HOME/x"',
    'rm -rf /Users/someone/other',
    'rm -rf /work/heliopause',
    `${heredocBody("It's done")} && git push --force`,
    `${heredocBody('1) step')} && git reset --hard`,
    'if git push origin main; then echo ok; fi',
    'while ! git push --force; do sleep 1; done',
    'until git reset --hard HEAD; do :; done',
    'gh api -X=DELETE repos/o/r/labels/x',
    'gh api -XDELETE repos/o/r/labels/x',
    'gh api repos/o/r/merges -f base=main -f head=agent/1',
    'gh api -X PATCH repos/o/r/git/refs/heads/main -f sha=abc',
    'rm -rf "$CLAUDE_PROJECT_DIR"',
    'rm -rf "$CLAUDE_PROJECT_DIR/$SUBDIR"',
    'rm -rf "$TMPDIR"',
    'rm -rf "$SOMEWHERE/x"',
  ])('%s', (script) => {
    expect(check(script)).not.toBeNull();
  });
});
