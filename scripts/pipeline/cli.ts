/**
 * `pnpm pipeline <command>` — the deterministic half of the Orchestrator.
 * The Orchestrator decides *what* to do; this CLI performs GitHub state changes
 * the same way every time. Vocabulary and lifecycle: docs/agents/workflow.md.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  checksFromRollup,
  closedIssueNumbers,
  isBehind,
  Label,
  leanStatus,
  mergeFailureMeansBehind,
  parseMergeState,
  summarize,
  type IssueSnapshot,
  type PipelineStatus,
  type PullSnapshot,
} from './model.ts';

function gh(args: readonly string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

type GhAttempt = { ok: true } | { ok: false; output: string; error: unknown };

/** Like `gh`, but returns the failure's stderr and stdout instead of throwing. */
function ghTry(args: readonly string[]): GhAttempt {
  try {
    execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true };
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${stderr ?? ''}\n${stdout ?? ''}`, error };
  }
}

interface Repo {
  owner: string;
  name: string;
}

function currentRepo(): Repo {
  const repo = JSON.parse(gh(['repo', 'view', '--json', 'owner,name'])) as {
    owner: { login: string };
    name: string;
  };
  return { owner: repo.owner.login, name: repo.name };
}

interface LabelNodes {
  labels: { nodes: { name: string }[] };
}

interface SnapshotQuery {
  data: {
    repository: {
      issues: {
        nodes: (LabelNodes & {
          number: number;
          title: string;
          parent: { number: number } | null;
          issueDependenciesSummary: { blockedBy: number } | null;
        })[];
      };
      pullRequests: {
        nodes: (LabelNodes & {
          number: number;
          title: string;
          headRefName: string;
          body: string;
          mergeStateStatus: string;
          commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] };
        })[];
      };
    };
  };
}

const SNAPSHOT_QUERY = `
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, states: OPEN, orderBy: { field: CREATED_AT, direction: ASC }) {
      nodes {
        number title
        labels(first: 30) { nodes { name } }
        parent { number }
        issueDependenciesSummary { blockedBy }
      }
    }
    pullRequests(first: 50, states: OPEN) {
      nodes {
        number title headRefName body mergeStateStatus
        labels(first: 30) { nodes { name } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
  }
}`;

function snapshot(repo: Repo): { issues: IssueSnapshot[]; pulls: PullSnapshot[] } {
  const result = JSON.parse(
    gh([
      'api',
      'graphql',
      '-f',
      `query=${SNAPSHOT_QUERY}`,
      '-F',
      `owner=${repo.owner}`,
      '-F',
      `name=${repo.name}`,
    ]),
  ) as SnapshotQuery;
  const { issues, pullRequests } = result.data.repository;
  return {
    issues: issues.nodes.map((node) => ({
      number: node.number,
      title: node.title,
      labels: node.labels.nodes.map((label) => label.name),
      openBlockers: node.issueDependenciesSummary?.blockedBy ?? 0,
      parent: node.parent?.number ?? null,
    })),
    pulls: pullRequests.nodes.map((node) => ({
      number: node.number,
      title: node.title,
      headRefName: node.headRefName,
      body: node.body,
      mergeState: parseMergeState(node.mergeStateStatus),
      labels: node.labels.nodes.map((label) => label.name),
      checks: checksFromRollup(node.commits.nodes[0]?.commit.statusCheckRollup?.state),
    })),
  };
}

function formatStatus(status: PipelineStatus): string {
  const line = (issue: IssueSnapshot): string =>
    `  #${String(issue.number)} ${issue.title}${issue.parent ? ` (spec #${String(issue.parent)})` : ''}`;
  const section = (title: string, rows: string[]): string =>
    `${title} (${String(rows.length)})\n${rows.length ? rows.join('\n') : '  —'}`;
  return [
    section('New specs', status.newSpecs.map(line)),
    section('Active specs', status.activeSpecs.map(line)),
    section('Ready tickets', status.readyTickets.map(line)),
    section(
      'In progress',
      status.inProgressTickets.map(
        ({ ticket, pull }) =>
          `${line(ticket)} → ${pull ? `PR #${String(pull.number)} [checks: ${pull.checks}${isBehind(pull) ? ', behind main' : ''}${pull.labels.includes(Label.AgentApproved) ? ', approved' : ''}]` : 'no PR yet'}`,
      ),
    ),
    section(
      'Awaiting review',
      status.awaitingReview.map(
        (p) => `  PR #${String(p.number)} ${p.title} [checks: ${p.checks}]`,
      ),
    ),
    section(
      'Mergeable',
      status.mergeable.map((p) => `  PR #${String(p.number)} ${p.title}`),
    ),
    section(
      'Behind main (update)',
      status.behindMain.map((p) => `  PR #${String(p.number)} ${p.title}`),
    ),
    section('Blocked specs', status.blockedSpecs.map(line)),
    section('Blocked tickets', status.blockedTickets.map(line)),
    section('Needs triage (human)', status.needsTriage.map(line)),
    section('Asset requests (human)', status.assetRequests.map(line)),
  ].join('\n\n');
}

function comment(kind: 'issue' | 'pr', target: number, body: string): void {
  gh([kind, 'comment', String(target), '--body', body]);
}

function readBody(file: string | undefined, text: string | undefined): string {
  if (file) return readFileSync(file, 'utf8');
  if (text) return text;
  throw new Error('Provide --body-file <path> or --body <text>');
}

function requireNumber(value: string | undefined, what: string): number {
  const parsed = Number(value);
  if (!value || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a ${what} number, got "${value ?? ''}"`);
  }
  return parsed;
}

const commands: Record<string, (args: string[]) => void> = {
  /** What is actionable right now. `--json` for the Orchestrator, plain text for humans. */
  status(args) {
    const { values } = parseArgs({ args, options: { json: { type: 'boolean' } } });
    const { issues, pulls } = snapshot(currentRepo());
    const status = summarize(issues, pulls);
    console.log(values.json ? JSON.stringify(leanStatus(status), null, 2) : formatStatus(status));
  },

  /** Mark a spec or ticket as taken by the Orchestrator. */
  claim(args) {
    const issue = requireNumber(args[0], 'issue');
    gh(['issue', 'edit', String(issue), '--add-label', Label.InProgress]);
    comment('issue', issue, '🤖 Orchestrator claimed this.');
  },

  /** Put a claimed ticket back in the queue (e.g. after an interrupted run). */
  requeue(args) {
    const issue = requireNumber(args[0], 'issue');
    gh(['issue', 'edit', String(issue), '--remove-label', Label.InProgress]);
  },

  /** Hand a ticket or spec back to the human with an explanation. */
  escalate(args) {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: { 'body-file': { type: 'string' }, body: { type: 'string' } },
    });
    const issue = requireNumber(positionals[0], 'issue');
    comment('issue', issue, readBody(values['body-file'], values.body));
    gh([
      'issue',
      'edit',
      String(issue),
      '--remove-label',
      `${Label.InProgress},${Label.ReadyForAgent}`,
      '--add-label',
      Label.NeedsTriage,
    ]);
  },

  /** Record a Reviewer's approval on a PR. */
  approve(args) {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: { 'body-file': { type: 'string' }, body: { type: 'string' } },
    });
    const pr = requireNumber(positionals[0], 'PR');
    comment('pr', pr, readBody(values['body-file'], values.body));
    gh(['pr', 'edit', String(pr), '--add-label', Label.AgentApproved]);
  },

  /** Record a Reviewer's change request on a PR. */
  reject(args) {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: { 'body-file': { type: 'string' }, body: { type: 'string' } },
    });
    const pr = requireNumber(positionals[0], 'PR');
    comment('pr', pr, readBody(values['body-file'], values.body));
    gh(['pr', 'edit', String(pr), '--remove-label', Label.AgentApproved]);
  },

  /** Squash-merge an approved, green PR; close its spec when the last ticket lands. */
  merge(args) {
    const pr = requireNumber(args[0], 'PR');
    const repo = currentRepo();
    const { issues, pulls } = snapshot(repo);
    const pull = pulls.find((p) => p.number === pr);
    if (!pull) throw new Error(`PR #${String(pr)} is not open`);
    if (!pull.labels.includes(Label.AgentApproved)) {
      throw new Error(`PR #${String(pr)} lacks the ${Label.AgentApproved} label`);
    }
    if (pull.checks !== 'passing') {
      throw new Error(`PR #${String(pr)} CI is ${pull.checks}, not passing`);
    }

    const updateBranch = (): void => {
      gh([
        'api',
        '-X',
        'PUT',
        `repos/${repo.owner}/${repo.name}/pulls/${String(pr)}/update-branch`,
      ]);
      console.log(
        `PR #${String(pr)} was behind main: updated its branch. CI must pass again before it can merge; the next pass will merge it.`,
      );
    };

    if (isBehind(pull)) {
      updateBranch();
      return;
    }

    const merged = ghTry([
      'api',
      '-X',
      'PUT',
      `repos/${repo.owner}/${repo.name}/pulls/${String(pr)}/merge`,
      '-f',
      'merge_method=squash',
    ]);
    if (!merged.ok) {
      if (mergeFailureMeansBehind(merged.output)) {
        updateBranch();
        return;
      }
      process.stderr.write(merged.output);
      throw merged.error;
    }
    console.log(`Merged PR #${String(pr)}`);

    const doneLabels = `${Label.ReadyForAgent},${Label.InProgress}`;
    const tickets = closedIssueNumbers(pull.body);
    for (const ticket of tickets) {
      gh(['issue', 'edit', String(ticket), '--remove-label', doneLabels]);
    }

    const specs = new Set(
      issues
        .filter((issue) => tickets.includes(issue.number) && issue.parent !== null)
        .map((issue) => issue.parent),
    );
    for (const spec of specs) {
      if (spec === null) continue;
      const summary = JSON.parse(
        gh([
          'api',
          'graphql',
          '-f',
          'query=query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){issue(number:$n){subIssuesSummary{total completed}}}}',
          '-F',
          `owner=${repo.owner}`,
          '-F',
          `name=${repo.name}`,
          '-F',
          `n=${String(spec)}`,
        ]),
      ) as {
        data: { repository: { issue: { subIssuesSummary: { total: number; completed: number } } } };
      };
      const { total, completed } = summary.data.repository.issue.subIssuesSummary;
      console.log(`Spec #${String(spec)}: ${String(completed)}/${String(total)} tickets done`);
      if (total > 0 && completed === total) {
        comment('issue', spec, `🤖 All ${String(total)} tickets merged. Spec delivered.`);
        gh(['issue', 'edit', String(spec), '--remove-label', doneLabels]);
        gh(['issue', 'close', String(spec), '--reason', 'completed']);
        console.log(`Closed spec #${String(spec)}`);
      }
    }
  },
};

function main(): void {
  const [name, ...args] = process.argv.slice(2);
  const command = name ? commands[name] : undefined;
  if (!command) {
    console.error(`Usage: pnpm pipeline <${Object.keys(commands).join('|')}> [args]`);
    process.exit(2);
  }
  try {
    command(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
