import { describe, expect, it } from 'vitest';
import { dailySeed, utcDay } from './dailyStarSystem.ts';

const at = (iso: string) => (): number => Date.parse(iso);

describe('Daily Star System', () => {
  it('everyone gets the same Daily Star System seed on the same UTC day', () => {
    const morning = utcDay(at('2026-11-15T00:00:00Z'));
    const night = utcDay(at('2026-11-15T23:59:59Z'));
    expect(morning).toBe('2026-11-15');
    expect(dailySeed(morning)).toBe(dailySeed(night));
  });

  it('the Daily Star System changes at 00:00 UTC, not at local midnight', () => {
    // 21:00 on the 15th in Buenos Aires (UTC-3) is already midnight on the 16th in UTC.
    expect(utcDay(at('2026-11-15T20:59:59-03:00'))).toBe('2026-11-15');
    expect(utcDay(at('2026-11-15T21:00:00-03:00'))).toBe('2026-11-16');
    const justBefore = utcDay(at('2026-11-15T23:59:59.999Z'));
    const justAfter = utcDay(at('2026-11-16T00:00:00.000Z'));
    expect(justBefore).toBe('2026-11-15');
    expect(justAfter).toBe('2026-11-16');
    expect(dailySeed(justBefore)).not.toBe(dailySeed(justAfter));
  });

  it('no two days in a year share a Daily Star System seed', () => {
    const start = Date.parse('2026-01-01T00:00:00Z');
    const seeds = new Set<number>();
    for (let i = 0; i < 365; i += 1) seeds.add(dailySeed(utcDay(() => start + i * 86_400_000)));
    expect(seeds.size).toBe(365);
  });

  it('a seed is a whole number the sim can start a Run from', () => {
    expect(Number.isSafeInteger(dailySeed('2026-11-15'))).toBe(true);
  });
});
