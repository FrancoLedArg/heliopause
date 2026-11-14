/**
 * Rules for the Bash guard. Agents land code only through `pnpm pipeline merge`; these
 * rules stop the commands that would bypass that path or destroy work by accident.
 * It is a seatbelt for well-meaning agents, not a security boundary: `node`, `pnpm`
 * and other allowed interpreters can still run anything.
 */
import path from 'node:path';
import { parseShell } from './shell.ts';

export interface GuardContext {
  /** Repository (or worktree) root; recursive deletes are allowed inside it. */
  projectDir: string;
  /** Working directory of the command (hook payload `cwd`); relative `rm` operands resolve here. */
  cwd: string;
  /** Extra directories where recursive deletes are allowed: /tmp, /private/tmp and $TMPDIR. */
  scratchDirs: readonly string[];
  /** Value of $TMPDIR, so `rm -r "$TMPDIR/x"` resolves to a real path. */
  tmpDir: string;
}

const WRAPPERS: Record<string, { flagsWithArg: string; positionalArgs: number }> = {
  time: { flagsWithArg: '', positionalArgs: 0 },
  timeout: { flagsWithArg: 'sk', positionalArgs: 1 },
  nice: { flagsWithArg: 'n', positionalArgs: 0 },
  nohup: { flagsWithArg: '', positionalArgs: 0 },
  stdbuf: { flagsWithArg: 'ioe', positionalArgs: 0 },
  command: { flagsWithArg: '', positionalArgs: 0 },
  builtin: { flagsWithArg: '', positionalArgs: 0 },
  exec: { flagsWithArg: 'a', positionalArgs: 0 },
  xargs: { flagsWithArg: 'IiLlnPsdEa', positionalArgs: 0 },
  env: { flagsWithArg: 'uCS', positionalArgs: 0 },
  sudo: { flagsWithArg: 'ugCDhprtT', positionalArgs: 0 },
};

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Strip env assignments and wrapper commands; returns the real command and its env. */
function unwrap(words: readonly string[]): { words: string[]; env: Map<string, string> } {
  const env = new Map<string, string>();
  let rest = [...words];
  for (;;) {
    while (rest[0] !== undefined && ASSIGNMENT.test(rest[0])) {
      const [name = '', ...value] = rest[0].split('=');
      env.set(name, value.join('='));
      rest = rest.slice(1);
    }
    const head = rest[0];
    const wrapper = head === undefined ? undefined : WRAPPERS[path.basename(head)];
    if (!wrapper) return { words: rest, env };
    let i = 1;
    while (rest[i]?.startsWith('-')) {
      const flag = rest[i] ?? '';
      i++;
      if (flag === '--') break;
      const letter = flag.replace(/^-+/, '').charAt(0);
      if (!flag.startsWith('--') && flag.length === 2 && wrapper.flagsWithArg.includes(letter)) i++;
    }
    rest = rest.slice(i + wrapper.positionalArgs);
  }
}

/** Short-flag cluster like `-fu` → its letters; long flags and positionals → ''. */
const shortFlags = (word: string): string => (/^-[a-zA-Z]+$/.test(word) ? word.slice(1) : '');

const GIT_GLOBAL_WITH_ARG = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--exec-path',
  '--config-env',
]);

function checkGit(args: readonly string[], env: ReadonlyMap<string, string>): string | null {
  let i = 0;
  const configs: string[] = [];
  while (args[i]?.startsWith('-')) {
    const flag = args[i] ?? '';
    if (GIT_GLOBAL_WITH_ARG.has(flag)) {
      if (flag === '-c') configs.push(args[i + 1] ?? '');
      i += 2;
    } else {
      i++;
    }
  }
  if (configs.some((config) => config.toLowerCase().startsWith('core.hookspath'))) {
    return 'overriding git hooks (core.hooksPath)';
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (sub === undefined) return null;

  if (rest.includes('--no-verify')) return 'skipping hooks with --no-verify';
  if (env.get('HUSKY') === '0') return 'skipping hooks with HUSKY=0';

  switch (sub) {
    case 'push': {
      const positionals: string[] = [];
      for (let j = 0; j < rest.length; j++) {
        const arg = rest[j] ?? '';
        if (/^--force(?:-with-lease|-if-includes)?(?:=|$)/.test(arg)) return 'force push';
        if (arg === '--delete' || arg === '--mirror' || arg === '--all' || arg === '--prune') {
          return `git push ${arg}`;
        }
        const letters = shortFlags(arg);
        if (letters.includes('f')) return 'force push';
        if (letters.includes('d')) return 'deleting a remote branch';
        if (
          arg === '-o' ||
          arg === '--push-option' ||
          arg === '--repo' ||
          arg === '--receive-pack' ||
          arg === '--exec'
        ) {
          j++;
        } else if (!arg.startsWith('-')) {
          positionals.push(arg);
        }
      }
      for (const refspec of positionals.slice(1)) {
        if (refspec.startsWith('+')) return 'force push';
        if (refspec.startsWith(':')) return 'deleting a remote branch';
        const destination = (refspec.split(':').pop() ?? '').replace(/^refs\/heads\//, '');
        if (destination === 'main' || destination === 'master')
          return 'push to main (open a PR instead)';
      }
      return null;
    }
    case 'commit':
      return rest.some((arg) => shortFlags(arg).includes('n'))
        ? 'skipping hooks with commit -n'
        : null;
    case 'reset':
      return rest.includes('--hard') ? 'git reset --hard' : null;
    case 'clean':
      return rest.some((arg) => arg === '--force' || shortFlags(arg).includes('f'))
        ? 'git clean -f'
        : null;
    case 'branch':
      return rest.some((arg) => shortFlags(arg).includes('D')) ||
        (rest.some((arg) => arg === '--delete' || shortFlags(arg).includes('d')) &&
          rest.some((arg) => arg === '--force' || shortFlags(arg).includes('f')))
        ? 'force-deleting a branch'
        : null;
    case 'checkout':
      if (rest.some((arg) => arg === '-f' || arg === '--force')) return 'git checkout --force';
      return rest.includes('.') ? 'discarding all changes' : null;
    case 'restore': {
      const staged = rest.includes('--staged') || rest.includes('-S');
      const worktree = rest.includes('--worktree') || rest.includes('-W');
      return rest.includes('.') && (!staged || worktree) ? 'discarding all changes' : null;
    }
    case 'stash':
      return rest[0] === 'clear' ? 'git stash clear' : null;
    default:
      return null;
  }
}

const GRAPHQL_DESTRUCTIVE =
  /\b(?:mergePullRequest|enablePullRequestAutoMerge|deleteRef|deleteIssue|deleteRepository|deleteBranchProtectionRule)\b/;

/** `gh api` flags whose value is a request field or body (the request then writes). */
const FIELD_FLAGS = new Set(['-f', '-F', '--field', '--raw-field', '--input']);
/** Other `gh api` flags that consume the next word; it is never the endpoint. */
const FLAGS_WITH_VALUE = new Set([
  '-H',
  '--header',
  '-q',
  '--jq',
  '-t',
  '--template',
  '-p',
  '--preview',
  '--hostname',
  '--cache',
]);

function checkGh(args: readonly string[]): string | null {
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '-R' || arg === '--repo') i++;
    else if (!arg.startsWith('--repo=')) rest.push(arg);
  }
  const [noun, verb] = rest;
  if (rest.includes('--delete-branch')) return 'deleting a branch from gh';
  if (noun === 'pr' && verb === 'merge')
    return 'merging outside the pipeline (use pnpm pipeline merge)';
  if (verb?.startsWith('delete')) return `gh ${noun ?? ''} ${verb}`;
  if (noun !== 'api') return null;

  let method = '';
  let hasFields = false;
  const positionals: string[] = [];
  for (let i = 1; i < rest.length; i++) {
    const arg = rest[i] ?? '';
    if (arg === '-X' || arg === '--method') method = rest[++i] ?? '';
    else if (arg.startsWith('--method=')) method = arg.slice('--method='.length);
    else if (/^-X./.test(arg)) method = arg.slice(2).replace(/^=/, '');
    else if (FIELD_FLAGS.has(arg)) {
      hasFields = true;
      i++;
    } else if (/^--(?:field|raw-field|input)=/.test(arg) || /^-[fF]./.test(arg)) hasFields = true;
    else if (FLAGS_WITH_VALUE.has(arg)) i++;
    else if (!arg.startsWith('-')) positionals.push(arg);
  }
  method = method.toUpperCase();
  if (method === 'DELETE') return 'DELETE via gh api';
  const endpoint = (positionals[0] ?? '').replace(/[?#].*$/, '');
  const writes = hasFields || (method !== '' && method !== 'GET');
  if (writes && /pulls\/\d+\/merge\/?$/.test(endpoint)) {
    return 'merging outside the pipeline (use pnpm pipeline merge)';
  }
  if (writes && /\/merges\/?$/.test(endpoint)) return 'merging branches through the API';
  if (writes && /git\/refs\/heads\/(?:main|master)\/?$/.test(endpoint)) {
    return 'moving main through the API';
  }
  if (args.some((arg) => GRAPHQL_DESTRUCTIVE.test(arg))) return 'destructive GraphQL mutation';
  return null;
}

/** A glob segment that matches every entry of its directory: `*`, `**`, `.*`, `?*`, `.[!.]*`. */
const MATCH_ALL_SEGMENT = /^(?:\.|\*|\?|\[[^\]]*\])+$/;
const GLOB_CHARS = /[*?[]/;
const isMatchAll = (segment: string): boolean =>
  GLOB_CHARS.test(segment) && MATCH_ALL_SEGMENT.test(segment);

/**
 * `cwd` is where relative operands resolve; null after a `cd` to a place the guard
 * cannot resolve (`~`, `$HOME`, an unknown variable), which blocks relative deletes.
 */
function checkRm(
  args: readonly string[],
  context: GuardContext,
  cwd: string | null,
): string | null {
  let recursive = false;
  const operands: string[] = [];
  let options = true;
  for (const arg of args) {
    if (options && arg === '--') options = false;
    else if (options && arg === '--recursive') recursive = true;
    else if (options && /^-[a-zA-Z]+$/.test(arg)) recursive ||= /[rR]/.test(arg);
    else if (!(options && arg.startsWith('--'))) operands.push(arg);
  }
  if (!recursive) return null;

  const roots = [context.projectDir, ...context.scratchDirs].map((dir) => path.resolve(dir));
  type KnownVar = 'CLAUDE_PROJECT_DIR' | 'TMPDIR';
  const known: Record<KnownVar, string> = {
    CLAUDE_PROJECT_DIR: context.projectDir,
    TMPDIR: context.tmpDir,
  };
  for (const operand of operands) {
    const outside = `recursive delete outside the repo (${operand})`;
    if (operand.startsWith('~')) return outside;
    if (operand.split('/').includes('..')) return outside;
    const resolved = operand.replace(
      /\$\{?(CLAUDE_PROJECT_DIR|TMPDIR)\}?(?![A-Za-z0-9_])/g,
      (_, name: KnownVar) => known[name],
    );
    if (resolved.includes('$')) {
      return `recursive delete of an unresolved path (${operand}); use a literal path`;
    }
    if (cwd === null && !path.isAbsolute(resolved)) {
      return `recursive delete after a cd to an unresolved directory (${operand})`;
    }
    // A glob whose segments all match every entry (`*`, `**/*`, `?*`, `.[!.]*`) empties the
    // directory before its first glob segment, so judge that directory. Any other pattern
    // (`dist*`) matches entries inside it and resolves as a child.
    const segments = resolved.split('/');
    const firstGlob = segments.findIndex((segment) => GLOB_CHARS.test(segment));
    const matchAll = firstGlob !== -1 && segments.slice(firstGlob).every(isMatchAll);
    const base = matchAll
      ? segments.slice(0, firstGlob).join('/') || (resolved.startsWith('/') ? '/' : '.')
      : resolved;
    const target = path.resolve(cwd ?? '/', base);
    // Strictly inside a root, and never a root itself (e.g. all of $TMPDIR or the project).
    const inside =
      !roots.includes(target) && roots.some((root) => target.startsWith(root + path.sep));
    if (!inside) return outside;
  }
  return null;
}

/** Directory after `cd args`, or null when it cannot be resolved (`~`, `$HOME`, `-`, unknown vars). */
function nextCwd(
  cwd: string | null,
  args: readonly string[],
  context: GuardContext,
): string | null {
  const target = args.find((arg) => arg !== '--' && !/^-[LPe@]+$/.test(arg));
  if (target === undefined || target === '-' || target.startsWith('~')) return null;
  const resolved = target.replace(
    /\$\{?(CLAUDE_PROJECT_DIR|TMPDIR)\}?(?![A-Za-z0-9_])/g,
    (_, name: string) => (name === 'TMPDIR' ? context.tmpDir : context.projectDir),
  );
  if (/[$*?[]/.test(resolved)) return null;
  return cwd === null && !path.isAbsolute(resolved) ? null : path.resolve(cwd ?? '/', resolved);
}

/** Why `script` is blocked, or null when it may run. */
export function guard(script: string, context: GuardContext): string | null {
  // Follows `cd` within the command line so later `rm` operands resolve against it.
  let cwd: string | null = context.cwd;
  for (const command of parseShell(script)) {
    const { words, env } = unwrap(command);
    const [head, ...args] = words;
    if (head === undefined) continue;
    const name = path.basename(head);
    if (name === 'cd') cwd = nextCwd(cwd, args, context);
    const reason =
      name === 'git'
        ? checkGit(args, env)
        : name === 'gh'
          ? checkGh(args)
          : name === 'rm'
            ? checkRm(args, context, cwd)
            : null;
    if (reason) return reason;
  }
  return null;
}
