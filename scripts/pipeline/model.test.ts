import { describe, expect, it } from 'vitest';
import {
  checksFromRollup,
  closedIssueNumbers,
  Label,
  summarize,
  type IssueSnapshot,
  type PullSnapshot,
} from './model.ts';

const issue = (number: number, labels: string[], extra: Partial<IssueSnapshot> = {}) =>
  ({
    number,
    title: `#${String(number)}`,
    labels,
    openBlockers: 0,
    parent: null,
    ...extra,
  }) satisfies IssueSnapshot;

const pull = (number: number, body: string, extra: Partial<PullSnapshot> = {}) =>
  ({
    number,
    title: `PR ${String(number)}`,
    headRefName: `agent/${String(number)}`,
    body,
    labels: [],
    checks: 'none',
    ...extra,
  }) satisfies PullSnapshot;

describe('closedIssueNumbers', () => {
  it('reads closing keywords in any case, deduplicated', () => {
    expect(closedIssueNumbers('Closes #12\nfixes #3, resolves #12')).toEqual([12, 3]);
  });

  it('ignores plain references', () => {
    expect(closedIssueNumbers('Part of #4, see #5')).toEqual([]);
  });
});

describe('summarize', () => {
  it('separates new specs from claimed specs', () => {
    const status = summarize(
      [
        issue(1, [Label.Spec, Label.ReadyForAgent]),
        issue(2, [Label.Spec, Label.ReadyForAgent, Label.InProgress]),
      ],
      [],
    );
    expect(status.newSpecs.map((i) => i.number)).toEqual([1]);
    expect(status.activeSpecs.map((i) => i.number)).toEqual([2]);
  });

  it('queues only unblocked, unclaimed tickets as ready, lowest number first', () => {
    const status = summarize(
      [
        issue(9, [Label.ReadyForAgent]),
        issue(5, [Label.ReadyForAgent]),
        issue(6, [Label.ReadyForAgent], { openBlockers: 1 }),
        issue(7, [Label.ReadyForAgent, Label.InProgress]),
        issue(8, [Label.NeedsTriage]),
      ],
      [],
    );
    expect(status.readyTickets.map((i) => i.number)).toEqual([5, 9]);
    expect(status.blockedTickets.map((i) => i.number)).toEqual([6]);
    expect(status.needsTriage.map((i) => i.number)).toEqual([8]);
  });

  it('pairs in-progress tickets with the PR that closes them', () => {
    const status = summarize(
      [issue(3, [Label.InProgress]), issue(4, [Label.InProgress])],
      [pull(10, 'Closes #3')],
    );
    expect(
      status.inProgressTickets.map(({ ticket, pull: p }) => [ticket.number, p?.number ?? null]),
    ).toEqual([
      [3, 10],
      [4, null],
    ]);
  });

  it('marks a PR mergeable only when approved and CI passes', () => {
    const status = summarize(
      [],
      [
        pull(1, '', { labels: [Label.AgentApproved], checks: 'passing' }),
        pull(2, '', { labels: [Label.AgentApproved], checks: 'pending' }),
        pull(3, '', { checks: 'passing' }),
      ],
    );
    expect(status.mergeable.map((p) => p.number)).toEqual([1]);
    expect(status.awaitingReview.map((p) => p.number)).toEqual([3]);
  });
});

describe('checksFromRollup', () => {
  it('maps rollup states', () => {
    expect(checksFromRollup('SUCCESS')).toBe('passing');
    expect(checksFromRollup('FAILURE')).toBe('failing');
    expect(checksFromRollup('ERROR')).toBe('failing');
    expect(checksFromRollup('PENDING')).toBe('pending');
    expect(checksFromRollup(null)).toBe('none');
  });
});
