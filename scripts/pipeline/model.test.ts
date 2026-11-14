import { describe, expect, it } from 'vitest';
import {
  checksFromRollup,
  closedIssueNumbers,
  Label,
  mergeFailureMeansBehind,
  leanStatus,
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
    mergeState: 'CLEAN',
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

  it('keeps a spec with open blockers out of newSpecs', () => {
    const status = summarize(
      [
        issue(1, [Label.Spec, Label.ReadyForAgent]),
        issue(2, [Label.Spec, Label.ReadyForAgent], { openBlockers: 1 }),
      ],
      [],
    );
    expect(status.newSpecs.map((i) => i.number)).toEqual([1]);
    expect(status.blockedSpecs.map((i) => i.number)).toEqual([2]);
  });
});

describe('behind-main handling', () => {
  it('does not list an approved, green PR as mergeable while it is behind main', () => {
    const status = summarize(
      [],
      [
        pull(1, '', { labels: [Label.AgentApproved], checks: 'passing', mergeState: 'BEHIND' }),
        pull(2, '', { labels: [Label.AgentApproved], checks: 'passing', mergeState: 'CLEAN' }),
      ],
    );
    expect(status.mergeable.map((p) => p.number)).toEqual([2]);
    expect(status.behindMain.map((p) => p.number)).toEqual([1]);
  });

  it('holds back an approved, green PR whose merge state is still UNKNOWN', () => {
    const status = summarize(
      [],
      [pull(1, '', { labels: [Label.AgentApproved], checks: 'passing', mergeState: 'UNKNOWN' })],
    );
    expect(status.mergeable).toEqual([]);
    expect(status.behindMain).toEqual([]);
  });

  it('leanStatus drops PR bodies but keeps closed ticket numbers and merge state', () => {
    const status = summarize(
      [issue(3, [Label.InProgress])],
      [pull(10, 'Closes #3 secret body text', { mergeState: 'BEHIND' })],
    );
    const json = JSON.stringify(leanStatus(status));
    expect(json).not.toContain('"body"');
    expect(json).not.toContain('secret body text');
    const lean = leanStatus(status);
    expect(lean.awaitingReview[0]).toMatchObject({ number: 10, closes: [3], mergeState: 'BEHIND' });
    expect(lean.inProgressTickets[0]?.pull).toMatchObject({ number: 10, closes: [3] });
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

describe('mergeFailureMeansBehind', () => {
  it('treats the expected-required-check 405 as behind main', () => {
    expect(
      mergeFailureMeansBehind('gh: Required status check "verify" is expected. (HTTP 405)'),
    ).toBe(true);
    expect(
      mergeFailureMeansBehind(
        '{"message":"Required status check \\"verify\\" is expected.","status":"405"}',
      ),
    ).toBe(true);
  });

  it('does not treat other 405s as behind main', () => {
    expect(mergeFailureMeansBehind('gh: Pull Request is not mergeable (HTTP 405)')).toBe(false);
    expect(mergeFailureMeansBehind('gh: Base branch was modified (HTTP 405)')).toBe(false);
  });

  it('does not treat the check message under other statuses as behind main', () => {
    expect(mergeFailureMeansBehind('Required status check "verify" is expected. (HTTP 422)')).toBe(
      false,
    );
    expect(mergeFailureMeansBehind('gh: Not Found (HTTP 404)')).toBe(false);
    expect(mergeFailureMeansBehind('')).toBe(false);
  });
});
