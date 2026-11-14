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

export interface PullSnapshot {
  number: number;
  title: string;
  headRefName: string;
  body: string;
  labels: readonly string[];
  /** Combined CI state for the head commit. */
  checks: 'passing' | 'failing' | 'pending' | 'none';
}

export interface PipelineStatus {
  /** Specs published by the Planner that no Orchestrator has claimed yet. */
  newSpecs: IssueSnapshot[];
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
  /** Approved PRs whose CI is green: merge them. */
  mergeable: PullSnapshot[];
  needsTriage: IssueSnapshot[];
  assetRequests: IssueSnapshot[];
}

const has = (item: { labels: readonly string[] }, label: Label): boolean =>
  item.labels.includes(label);

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
      .filter((spec) => has(spec, Label.ReadyForAgent) && !has(spec, Label.InProgress))
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
    mergeable: pulls
      .filter((pull) => has(pull, Label.AgentApproved) && pull.checks === 'passing')
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
