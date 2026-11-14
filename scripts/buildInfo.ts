import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BuildInfo } from '../src/game/lib/buildLabel.ts';

const HEX_HASH = /^[0-9a-f]{7,40}$/;
const HASH_LENGTH = 7;

/** Any abbreviated or full hex commit hash, shortened to 7 chars; undefined when not a hash. */
export function abbreviateCommit(raw: string): string | undefined {
  const hash = raw.trim().toLowerCase();
  return HEX_HASH.test(hash) ? hash.slice(0, HASH_LENGTH) : undefined;
}

function readGitHash(gitCwd: string): string | undefined {
  try {
    const out = execFileSync('git', ['rev-parse', `--short=${HASH_LENGTH}`, 'HEAD'], {
      cwd: gitCwd,
      // Inherited GIT_DIR (set inside git hooks) would override `cwd` and pick the wrong repo.
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return abbreviateCommit(out);
  } catch {
    // No git binary, not a repo, or no commits yet: the build must not fail over a label.
    return undefined;
  }
}

/** Git first; hosted builds (Vercel) often ship no `.git`, so fall back to the provider's env var. */
function readHash(gitCwd: string, env: NodeJS.ProcessEnv): string {
  const fromProvider = env['VERCEL_GIT_COMMIT_SHA'];
  return (
    readGitHash(gitCwd) ??
    (fromProvider === undefined ? undefined : abbreviateCommit(fromProvider)) ??
    'unknown'
  );
}

/** Version from `package.json` in `packageRoot`, short commit hash from git run in `gitCwd`. */
export function readBuildInfo(
  gitCwd: string,
  packageRoot: string = gitCwd,
  env: NodeJS.ProcessEnv = process.env,
): BuildInfo {
  const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
    version: string;
  };
  return { version: pkg.version, hash: readHash(gitCwd, env) };
}
