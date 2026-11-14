import { describe, expect, it } from 'vitest';
import { formatBuildLabel } from './buildLabel.ts';

describe('formatBuildLabel', () => {
  it('shows the version and short commit hash', () => {
    expect(formatBuildLabel({ version: '0.0.0', hash: 'a207078' })).toBe('v0.0.0 · a207078');
  });

  it('shows unknown when the commit hash is unknown', () => {
    expect(formatBuildLabel({ version: '1.2.3', hash: 'unknown' })).toBe('v1.2.3 · unknown');
  });
});
