import { describe, expect, it } from 'vitest';
import { planLaunch, WORKTREE_RELATIVE_PATH } from './orchestratorLaunch';

const base = { worktreeExists: true, nodeModulesPresent: true, lockfileChanged: false };

describe('planLaunch', () => {
  it('creates a detached worktree at origin/main when none exists, then installs', () => {
    const plan = planLaunch({ ...base, worktreeExists: false, nodeModulesPresent: false });
    expect(plan.sync).toEqual({
      command: ['git', 'worktree', 'add', '--detach', '<worktree>', 'origin/main'],
    });
    expect(plan.install).toBe(true);
  });

  it('refreshes an existing worktree with a detached checkout of origin/main', () => {
    const plan = planLaunch(base);
    expect(plan.sync).toEqual({ command: ['git', 'checkout', '--detach', 'origin/main'] });
  });

  it('skips the install when dependencies are present and the lockfile did not change', () => {
    expect(planLaunch(base).install).toBe(false);
  });

  it('installs when the lockfile changed', () => {
    expect(planLaunch({ ...base, lockfileChanged: true }).install).toBe(true);
  });

  it('installs when node_modules is missing from an existing worktree', () => {
    expect(planLaunch({ ...base, nodeModulesPresent: false }).install).toBe(true);
  });

  it('always launches the orchestrator agent in dontAsk mode', () => {
    expect(planLaunch(base).launch).toEqual([
      'claude',
      '--agent',
      'orchestrator',
      '--permission-mode',
      'dontAsk',
    ]);
  });

  it('keeps the worktree under .claude/worktrees', () => {
    expect(WORKTREE_RELATIVE_PATH).toBe('.claude/worktrees/orchestrator-main');
  });
});
