import { describe, expect, it } from 'vitest';
import { formatDeltaV, formatDistanceAu, formatFuel, formatGravity } from './format.ts';

describe('numbers shown to the player', () => {
  it('shows gravity in m/s² to one decimal', () => {
    expect(formatGravity(3.7)).toBe('3.7 m/s²');
    expect(formatGravity(0.1134)).toBe('0.1 m/s²');
  });

  it('shows distance from the star in AU', () => {
    expect(formatDistanceAu(0.3912)).toBe('0.39 AU');
    expect(formatDistanceAu(30.2)).toBe('30.2 AU');
  });

  it('shows Fuel in tonnes', () => {
    expect(formatFuel(8000)).toBe('8.0 t');
    expect(formatFuel(12_340)).toBe('12.3 t');
  });

  it('shows Δv in m/s, switching to km/s when large, and a dash when unknown', () => {
    expect(formatDeltaV(5050)).toBe('5,050 m/s');
    expect(formatDeltaV(320.4)).toBe('320 m/s');
    expect(formatDeltaV(12_500)).toBe('12.5 km/s');
    expect(formatDeltaV(undefined)).toBe('—');
  });
});
