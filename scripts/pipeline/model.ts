/**
 * Pure pipeline rules: which GitHub issues are actionable, and in what state.
 * No I/O here — cli.ts fetches from GitHub and feeds these functions.
 * Vocabulary: docs/agents/workflow.md.
 */

export const Label = {
  Spec: 'spec',
  ReadyForAgent: 'ready-for-agent',
  InProgress: 'in-progress',
  AgentApproved: 'agent-approved',
  NeedsTriage: 'needs-triage',
  ReadyForHuman: 'ready-for-human',
  Asset: 'asset',
  Research: 'research',
  OpusBuilder: 'builder:opus',
} as const;

export type Label = (typeof Label)[keyof typeof Label];

export interface IssueSnapshot {
  number: number;
  title: string;
  labels: readonly string[];
  /** Open issues blocking this one (GitHub native dependencies). */
  openBlockers: number;
  /** Parent spec number when this issue is a sub-issue. */
  parent: number | null;
}

export const MERGE_STATES = [
  'BEHIND',
  'BLOCKED',
  'CLEAN',
  'DIRTY',
  'DRAFT',
  'HAS_HOOKS',
  'UNKNOWN',
  'UNSTABLE',
] as const;

export type MergeState = (typeof MERGE_STATES)[number];

/** Narrow GitHub's `mergeStateStatus` string; anything unrecognised reads as UNKNOWN. */
export function parseMergeState(value: string | null | undefined): MergeState {
  return MERGE_STATES.find((state) => state === value) ?? 'UNKNOWN';
}

export interface PullSnapshot {
  number: number;
  title: string;
  headRefName: string;
  body: string;
  labels: readonly string[];
  /** Combined CI state for the head commit. */
  checks: 'passing' | 'failing' | 'pending' | 'none';
  /** GitHub `mergeStateStatus`: BEHIND means main moved on and the branch needs updating. */
  mergeState: MergeState;
}

/** An approved PR blocked by something a Builder must fix, with the reason why. */
export type NeedsAttention = PullSnapshot & { reason: string };

export interface PipelineStatus {
  /** Specs published by the Planner that no Orchestrator has claimed yet. */
  newSpecs: IssueSnapshot[];
  /** Specs published but waiting on open blockers (GitHub native dependencies). */
  blockedSpecs: IssueSnapshot[];
  /** Specs already claimed and being delivered. */
  activeSpecs: IssueSnapshot[];
  /** Tickets a Builder (or Researcher) can start right now. */
  readyTickets: IssueSnapshot[];
  /** Tickets waiting on open blockers. */
  blockedTickets: IssueSnapshot[];
  /** Tickets claimed by the Orchestrator, with their PR if one exists. */
  inProgressTickets: { ticket: IssueSnapshot; pull: PullSnapshot | null }[];
  /** Open PRs the Reviewer has not approved (new, or rejected and awaiting fixes). */
  awaitingReview: PullSnapshot[];
  /** Approved, green PRs behind main: `pipeline merge` updates their branch; they return as mergeable once CI passes. */
  behindMain: PullSnapshot[];
  /** Approved PRs whose CI is green and up to date: merge them. */
  mergeable: PullSnapshot[];
  /** Approved PRs that cannot merge as they stand (conflict with main, or CI failing): back to their Builder. */
  needsAttention: NeedsAttention[];
  needsTriage: IssueSnapshot[];
  assetRequests: IssueSnapshot[];
}

const has = (item: { labels: readonly string[] }, label: Label): boolean =>
  item.labels.includes(label);

const approvedAndGreen = (pull: PullSnapshot): boolean =>
  has(pull, Label.AgentApproved) && pull.checks === 'passing' && !isDirty(pull);

export const isDirty = (pull: PullSnapshot): boolean => pull.mergeState === 'DIRTY';

/** Why an approved PR is stuck, or null when it is not. */
export function attentionReason(pull: PullSnapshot): string | null {
  if (!has(pull, Label.AgentApproved)) return null;
  const reasons = [
    ...(isDirty(pull) ? ['conflicts with main'] : []),
    ...(pull.checks === 'failing' ? ['CI failing'] : []),
  ];
  return reasons.length ? reasons.join(', ') : null;
}

export const isBehind = (pull: PullSnapshot): boolean => pull.mergeState === 'BEHIND';

/** A PR as the Orchestrator sees it: no body, just the tickets it closes. */
export type LeanPull = Omit<PullSnapshot, 'body'> & { closes: number[] };

export type LeanStatus = Omit<
  PipelineStatus,
  'inProgressTickets' | 'awaitingReview' | 'behindMain' | 'mergeable' | 'needsAttention'
> & {
  inProgressTickets: { ticket: IssueSnapshot; pull: LeanPull | null }[];
  awaitingReview: LeanPull[];
  behindMain: LeanPull[];
  mergeable: LeanPull[];
  needsAttention: (LeanPull & { reason: string })[];
};

/** Ticket numbers a PR closes, from `Closes #N` / `Fixes #N` / `Resolves #N` in its body. */
export function closedIssueNumbers(body: string): number[] {
  const pattern = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
  return [...new Set([...body.matchAll(pattern)].map((match) => Number(match[1])))];
}

export function summarize(
  issues: readonly IssueSnapshot[],
  pulls: readonly PullSnapshot[],
): PipelineStatus {
  const pullFor = (ticket: number): PullSnapshot | null =>
    pulls.find((pull) => closedIssueNumbers(pull.body).includes(ticket)) ?? null;

  const specs = issues.filter((issue) => has(issue, Label.Spec));
  const tickets = issues.filter((issue) => !has(issue, Label.Spec));
  const byNumber = (a: IssueSnapshot, b: IssueSnapshot): number => a.number - b.number;

  const queued = tickets.filter(
    (ticket) => has(ticket, Label.ReadyForAgent) && !has(ticket, Label.InProgress),
  );

  return {
    newSpecs: specs
      .filter(
        (spec) =>
          has(spec, Label.ReadyForAgent) && !has(spec, Label.InProgress) && spec.openBlockers === 0,
      )
      .sort(byNumber),
    blockedSpecs: specs
      .filter(
        (spec) =>
          has(spec, Label.ReadyForAgent) && !has(spec, Label.InProgress) && spec.openBlockers > 0,
      )
      .sort(byNumber),
    activeSpecs: specs.filter((spec) => has(spec, Label.InProgress)).sort(byNumber),
    readyTickets: queued.filter((ticket) => ticket.openBlockers === 0).sort(byNumber),
    blockedTickets: queued.filter((ticket) => ticket.openBlockers > 0).sort(byNumber),
    inProgressTickets: tickets
      .filter((ticket) => has(ticket, Label.InProgress))
      .sort(byNumber)
      .map((ticket) => ({ ticket, pull: pullFor(ticket.number) })),
    awaitingReview: pulls
      .filter((pull) => !has(pull, Label.AgentApproved))
      .sort((a, b) => a.number - b.number),
    behindMain: pulls
      .filter((pull) => approvedAndGreen(pull) && isBehind(pull))
      .sort((a, b) => a.number - b.number),
    mergeable: pulls
      .filter((pull) => approvedAndGreen(pull) && pull.mergeState !== 'UNKNOWN' && !isBehind(pull))
      .sort((a, b) => a.number - b.number),
    needsAttention: pulls
      .flatMap((pull) => {
        const reason = attentionReason(pull);
        return reason ? [{ ...pull, reason }] : [];
      })
      .sort((a, b) => a.number - b.number),
    needsTriage: issues.filter((issue) => has(issue, Label.NeedsTriage)).sort(byNumber),
    assetRequests: issues.filter((issue) => has(issue, Label.Asset)).sort(byNumber),
  };
}

const ROLLUP_TO_CHECKS: Readonly<Record<string, PullSnapshot['checks']>> = {
  SUCCESS: 'passing',
  FAILURE: 'failing',
  ERROR: 'failing',
  PENDING: 'pending',
  EXPECTED: 'pending',
};

/** Map GitHub's statusCheckRollup state for a PR's head commit to the pipeline's view of CI. */
export function checksFromRollup(state: string | null | undefined): PullSnapshot['checks'] {
  return state ? (ROLLUP_TO_CHECKS[state] ?? 'none') : 'none';
}

const lean = ({ body, ...rest }: PullSnapshot): LeanPull => ({
  ...rest,
  closes: closedIssueNumbers(body),
});

/** Status for `--json`: PR bodies are dropped so each pass stays small. */
export function leanStatus(status: PipelineStatus): LeanStatus {
  return {
    ...status,
    inProgressTickets: status.inProgressTickets.map(({ ticket, pull }) => ({
      ticket,
      pull: pull && lean(pull),
    })),
    awaitingReview: status.awaitingReview.map(lean),
    behindMain: status.behindMain.map(lean),
    mergeable: status.mergeable.map(lean),
    needsAttention: status.needsAttention.map(({ reason, ...pull }) => ({
      ...lean(pull),
      reason,
    })),
  };
}

/**
 * Does a failed merge call mean "the PR fell behind main"? GitHub answers 405
 * "Required status check ... is expected" in the seconds before its merge state
 * catches up to a just-merged PR; the fix is the same update-branch as for BEHIND.
 * `output` is the failed call's stderr plus stdout (gh prints the status there).
 */
export function mergeFailureMeansBehind(output: string): boolean {
  const is405 = /HTTP 405|"status":\s*"?405"?/.test(output);
  return is405 && /Required status check .* is expected/.test(output);
}
