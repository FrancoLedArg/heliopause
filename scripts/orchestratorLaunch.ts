/** Where the Orchestrator's dedicated worktree lives, relative to the shared checkout. */
export const WORKTREE_RELATIVE_PATH = '.claude/worktrees/orchestrator-main';

export interface LaunchState {
  worktreeExists: boolean;
  nodeModulesPresent: boolean;
  /** pnpm-lock.yaml differs between the worktree's old HEAD and origin/main. */
  lockfileChanged: boolean;
}

export interface LaunchPlan {
  /**
   * Git command that creates or refreshes the worktree. `<worktree>` stands for the
   * worktree path; creation runs from the shared checkout, the refresh inside the worktree.
   */
  sync: { command: readonly string[] };
  install: boolean;
  launch: readonly string[];
}

/** Decides what `pnpm orchestrator` does, without doing it. */
export function planLaunch(state: LaunchState): LaunchPlan {
  const sync = state.worktreeExists
    ? { command: ['git', 'checkout', '--detach', 'origin/main'] }
    : { command: ['git', 'worktree', 'add', '--detach', '<worktree>', 'origin/main'] };
  return {
    sync,
    install: !state.worktreeExists || !state.nodeModulesPresent || state.lockfileChanged,
    launch: ['claude', '--agent', 'orchestrator', '--permission-mode', 'dontAsk'],
  };
}
