import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { planLaunch, WORKTREE_RELATIVE_PATH } from './orchestratorLaunch';

function run(command: readonly string[], cwd: string): number {
  const [bin, ...args] = command;
  const result = spawnSync(bin ?? '', args, { cwd, stdio: 'inherit' });
  return result.status ?? 1;
}

function capture(command: readonly string[], cwd: string): string {
  const [bin, ...args] = command;
  const result = spawnSync(bin ?? '', args, { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// The shared checkout is the parent of the common .git dir, even when run from a worktree.
const commonDir = capture(
  ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'],
  process.cwd(),
);
if (!commonDir) fail('pnpm orchestrator must run inside the heliopause repository');
const sharedRoot = path.dirname(commonDir);
const worktree = path.join(sharedRoot, WORKTREE_RELATIVE_PATH);

if (run(['git', 'fetch', 'origin'], sharedRoot) !== 0) fail('git fetch origin failed');

const worktreeExists = existsSync(path.join(worktree, '.git'));
const before = worktreeExists ? capture(['git', 'rev-parse', 'HEAD'], worktree) : '';
const target = capture(['git', 'rev-parse', 'origin/main'], sharedRoot);
const lockfileChanged =
  worktreeExists &&
  before !== target &&
  capture(['git', 'diff', '--name-only', before, target, '--', 'pnpm-lock.yaml'], sharedRoot) !==
    '';

const plan = planLaunch({
  worktreeExists,
  nodeModulesPresent: existsSync(path.join(worktree, 'node_modules')),
  lockfileChanged,
});

const sync = plan.sync.command.map((part) => (part === '<worktree>' ? worktree : part));
if (run(sync, worktreeExists ? worktree : sharedRoot) !== 0) fail(`${sync.join(' ')} failed`);
if (plan.install && run(['pnpm', 'install', '--frozen-lockfile'], worktree) !== 0) {
  fail('pnpm install failed');
}

console.log(`Orchestrator worktree: ${worktree} @ ${target.slice(0, 7)}`);
process.exit(run(plan.launch, worktree));
