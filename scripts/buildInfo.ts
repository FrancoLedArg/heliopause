import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BuildInfo } from '../src/game/lib/buildLabel.ts';

const SHORT_HASH = /^[0-9a-f]{7}$/;

function readHash(gitCwd: string): string {
  try {
    const out = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: gitCwd,
      // Inherited GIT_DIR (set inside git hooks) would override `cwd` and pick the wrong repo.
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return SHORT_HASH.test(out) ? out : 'unknown';
  } catch {
    // No git binary, not a repo, or no commits yet: the build must not fail over a label.
    return 'unknown';
  }
}

/** Version from `package.json` in `packageRoot`, short commit hash from git run in `gitCwd`. */
export function readBuildInfo(gitCwd: string, packageRoot: string = gitCwd): BuildInfo {
  const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
    version: string;
  };
  return { version: pkg.version, hash: readHash(gitCwd) };
}
