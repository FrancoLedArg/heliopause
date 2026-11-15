import { describe, expect, it } from 'vitest';
import {
  checksFromRequired,
  cleanupSummary,
  closedIssueNumbers,
  closeSpecSteps,
  Label,
  mergeFailureMeansBehind,
  leanStatus,
  runStepsUntilFailure,
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
    subIssues: { total: 0, completed: 0 },
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

describe('cleanupSummary', () => {
  it('is silent when every cleanup step worked', () => {
    expect(cleanupSummary(60, [])).toBeNull();
  });

  it('names the merged PR and each failed step', () => {
    expect(cleanupSummary(60, ['close #51', 'relabel #52'])).toContain(
      'Merged PR #60; cleanup incomplete: close #51, relabel #52',
    );
  });
});

describe('summarize: specsToClose', () => {
  const done = { subIssues: { total: 3, completed: 3 } };

  it('reports an in-progress spec whose sub-issues are all closed', () => {
    const status = summarize([issue(12, [Label.Spec, Label.InProgress], done)], []);
    expect(status.specsToClose.map((spec) => spec.number)).toEqual([12]);
  });

  it('leaves a spec with an open sub-issue, no sub-issues, or no claim alone', () => {
    const status = summarize(
      [
        issue(1, [Label.Spec, Label.InProgress], { subIssues: { total: 3, completed: 2 } }),
        issue(2, [Label.Spec, Label.InProgress]),
        issue(3, [Label.Spec, Label.ReadyForAgent], done),
      ],
      [],
    );
    expect(status.specsToClose).toEqual([]);
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

describe('needs-attention handling', () => {
  const approved = [Label.AgentApproved];

  it('lists an approved DIRTY PR and an approved PR with failing CI only in needsAttention', () => {
    const status = summarize(
      [],
      [
        pull(1, '', { labels: approved, checks: 'passing', mergeState: 'DIRTY' }),
        pull(2, '', { labels: approved, checks: 'failing', mergeState: 'CLEAN' }),
        pull(3, '', { labels: approved, checks: 'passing', mergeState: 'CLEAN' }),
      ],
    );
    expect(status.needsAttention.map((p) => [p.number, p.reason])).toEqual([
      [1, 'conflicts with main'],
      [2, 'CI failing'],
    ]);
    expect(status.mergeable.map((p) => p.number)).toEqual([3]);
    expect(status.behindMain).toEqual([]);
    expect(status.awaitingReview).toEqual([]);
  });

  it('gives both reasons when a PR conflicts and fails CI', () => {
    const status = summarize(
      [],
      [pull(1, '', { labels: approved, checks: 'failing', mergeState: 'DIRTY' })],
    );
    expect(status.needsAttention[0]?.reason).toBe('conflicts with main, CI failing');
  });

  it('ignores unapproved PRs and keeps a failing BEHIND PR in needsAttention only', () => {
    const status = summarize(
      [],
      [
        pull(1, '', { checks: 'failing', mergeState: 'DIRTY' }),
        pull(2, '', { labels: approved, checks: 'failing', mergeState: 'BEHIND' }),
      ],
    );
    expect(status.needsAttention.map((p) => p.number)).toEqual([2]);
    expect(status.awaitingReview.map((p) => p.number)).toEqual([1]);
    expect(status.behindMain).toEqual([]);
  });

  it('leanStatus carries the bucket without bodies', () => {
    const status = summarize(
      [],
      [pull(1, 'Closes #5 secret', { labels: approved, mergeState: 'DIRTY', checks: 'passing' })],
    );
    const lean = leanStatus(status);
    expect(lean.needsAttention[0]).toMatchObject({
      number: 1,
      closes: [5],
      reason: 'conflicts with main',
    });
    expect(JSON.stringify(lean)).not.toContain('secret');
  });
});

describe('checksFromRequired', () => {
  const run = (name: string, conclusion: string | null, status = 'COMPLETED') => ({
    name,
    status,
    conclusion,
  });
  const context = (name: string, state: string) => ({ context: name, state });

  it('passes when the required check passes, whatever non-required checks say', () => {
    expect(
      checksFromRequired(['verify'], [run('verify', 'SUCCESS'), context('Vercel', 'FAILURE')]),
    ).toBe('passing');
  });

  it('is pending while the required check is still running', () => {
    expect(
      checksFromRequired(
        ['verify'],
        [run('verify', null, 'IN_PROGRESS'), context('Vercel', 'SUCCESS')],
      ),
    ).toBe('pending');
    expect(checksFromRequired(['verify'], [context('verify', 'PENDING')])).toBe('pending');
  });

  it('fails when the required check fails, even if every other check passes', () => {
    expect(
      checksFromRequired(['verify'], [run('verify', 'FAILURE'), context('Vercel', 'SUCCESS')]),
    ).toBe('failing');
    expect(checksFromRequired(['verify'], [run('verify', 'TIMED_OUT')])).toBe('failing');
    expect(checksFromRequired(['verify'], [context('verify', 'ERROR')])).toBe('failing');
  });

  it('is pending when the required check has not reported but other checks have', () => {
    expect(checksFromRequired(['verify'], [context('Vercel', 'FAILURE')])).toBe('pending');
  });

  it('is none when the head commit has no checks at all', () => {
    expect(checksFromRequired(['verify'], [])).toBe('none');
  });

  it('needs every required check to pass', () => {
    expect(
      checksFromRequired(['verify', 'e2e'], [run('verify', 'SUCCESS'), run('e2e', 'FAILURE')]),
    ).toBe('failing');
    expect(checksFromRequired(['verify', 'e2e'], [run('verify', 'SUCCESS')])).toBe('pending');
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

describe('closeSpecSteps', () => {
  it('comments, then closes, then relabels, so a failed close keeps in-progress', () => {
    const steps = closeSpecSteps(50, 3);
    expect(steps.map((step) => step.id)).toEqual(['comment', 'close', 'relabel']);
    expect(steps[2]?.args).toEqual([
      'issue',
      'edit',
      '50',
      '--remove-label',
      'ready-for-agent,in-progress',
    ]);
  });
});

describe('runStepsUntilFailure', () => {
  const steps = closeSpecSteps(50, 3);

  it('runs every step when all succeed', () => {
    const ran: string[] = [];
    const done = runStepsUntilFailure(steps, (step) => {
      ran.push(step.id);
      return true;
    });
    expect(ran).toEqual(['comment', 'close', 'relabel']);
    expect(done).toEqual(['comment', 'close', 'relabel']);
  });

  it('stops at a failed close: no relabel, and close is not reported done', () => {
    const ran: string[] = [];
    const done = runStepsUntilFailure(steps, (step) => {
      ran.push(step.id);
      return step.id !== 'close';
    });
    expect(ran).toEqual(['comment', 'close']);
    expect(done).toEqual(['comment']);
  });
});

describe('waiting for CI', () => {
  const approved = [Label.AgentApproved];

  it('lists an approved PR with pending checks only in waitingForCi, unless it conflicts', () => {
    const status = summarize(
      [],
      [
        pull(1, '', { labels: approved, checks: 'pending', mergeState: 'BEHIND' }),
        pull(2, '', { labels: approved, checks: 'pending', mergeState: 'CLEAN' }),
      ],
    );
    expect(status.waitingForCi.map((p) => p.number)).toEqual([1, 2]);
    expect(status.behindMain).toEqual([]);
    expect(status.mergeable).toEqual([]);
    expect(status.needsAttention).toEqual([]);
    expect(status.awaitingReview).toEqual([]);
  });

  it('sends a conflicting PR with pending CI only to needsAttention, never waitingForCi', () => {
    const status = summarize(
      [],
      [pull(3, '', { labels: approved, checks: 'pending', mergeState: 'DIRTY' })],
    );
    expect(status.waitingForCi).toEqual([]);
    expect(status.needsAttention.map((p) => [p.number, p.reason])).toEqual([
      [3, 'conflicts with main'],
    ]);
    expect(status.mergeable).toEqual([]);
    expect(status.behindMain).toEqual([]);
  });

  it('lists an approved PR whose merge state is UNKNOWN only in waitingForCi', () => {
    const status = summarize(
      [],
      [pull(1, '', { labels: approved, checks: 'passing', mergeState: 'UNKNOWN' })],
    );
    expect(status.waitingForCi.map((p) => p.number)).toEqual([1]);
    expect(status.mergeable).toEqual([]);
    expect(status.behindMain).toEqual([]);
    expect(status.needsAttention).toEqual([]);
  });

  it('keeps failing CI in needsAttention, not waitingForCi', () => {
    const status = summarize(
      [],
      [pull(1, '', { labels: approved, checks: 'failing', mergeState: 'UNKNOWN' })],
    );
    expect(status.waitingForCi).toEqual([]);
    expect(status.needsAttention.map((p) => [p.number, p.reason])).toEqual([[1, 'CI failing']]);
  });

  it('leaves unapproved, settled and green PRs out of waitingForCi', () => {
    const status = summarize(
      [],
      [
        pull(1, '', { checks: 'pending' }),
        pull(2, '', { labels: approved, checks: 'passing', mergeState: 'CLEAN' }),
        pull(3, '', { labels: approved, checks: 'none', mergeState: 'CLEAN' }),
      ],
    );
    expect(status.waitingForCi).toEqual([]);
  });

  it('leanStatus carries the bucket without bodies', () => {
    const status = summarize(
      [],
      [pull(1, 'Closes #5 secret', { labels: approved, checks: 'pending' })],
    );
    const lean = leanStatus(status);
    expect(lean.waitingForCi[0]).toMatchObject({ number: 1, closes: [5], checks: 'pending' });
    expect(JSON.stringify(lean)).not.toContain('secret');
  });
});
