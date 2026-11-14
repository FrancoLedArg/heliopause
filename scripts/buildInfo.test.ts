import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { abbreviateCommit, readBuildInfo } from './buildInfo.ts';

describe('readBuildInfo', () => {
  it('reads the app version and a 7-char commit hash inside a git repo', () => {
    const info = readBuildInfo(process.cwd());
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(info.hash).toMatch(/^[0-9a-f]{7}$/);
  });

  it('falls back to unknown outside a git repo instead of failing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'heliopause-nogit-'));
    expect(readBuildInfo(dir, process.cwd()).hash).toBe('unknown');
  });
});

describe('abbreviateCommit', () => {
  it('keeps a 7-char hash', () => {
    expect(abbreviateCommit('a207078')).toBe('a207078');
  });

  it('truncates a longer abbreviated or full hash to 7 chars', () => {
    expect(abbreviateCommit('a2070781')).toBe('a207078');
    expect(abbreviateCommit('369472e5b1c0f9d8a7e6d5c4b3a291807f6e5d4c')).toBe('369472e');
  });

  it('rejects anything that is not a hex hash of at least 7 chars', () => {
    expect(abbreviateCommit('a20707')).toBeUndefined();
    expect(abbreviateCommit('not-a-hash')).toBeUndefined();
    expect(abbreviateCommit('')).toBeUndefined();
  });
});

describe('readBuildInfo commit fallback', () => {
  const noGit = () => mkdtempSync(join(tmpdir(), 'heliopause-nogit-'));

  it('uses the Vercel commit SHA when git metadata is missing', () => {
    const env = { VERCEL_GIT_COMMIT_SHA: '369472e5b1c0f9d8a7e6d5c4b3a291807f6e5d4c' };
    expect(readBuildInfo(noGit(), process.cwd(), env).hash).toBe('369472e');
  });

  it('is unknown when neither git nor the provider variable is available', () => {
    expect(readBuildInfo(noGit(), process.cwd(), {}).hash).toBe('unknown');
  });

  it('is unknown when the provider variable is malformed', () => {
    expect(readBuildInfo(noGit(), process.cwd(), { VERCEL_GIT_COMMIT_SHA: 'xyz' }).hash).toBe(
      'unknown',
    );
  });
});
