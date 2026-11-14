import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readBuildInfo } from './buildInfo.ts';

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
