import { expect, it } from 'vitest';
import { kilograms } from '../game/sim/index.ts';
import { fuelFillShare } from './fuelFill.ts';

it('reads the share of the tank that is full', () => {
  expect(fuelFillShare(kilograms(2000), kilograms(8000))).toBe(0.25);
  expect(fuelFillShare(kilograms(8000), kilograms(8000))).toBe(1);
});

it('stays within 0 to 1, and reads empty with no capacity', () => {
  expect(fuelFillShare(kilograms(9000), kilograms(8000))).toBe(1);
  expect(fuelFillShare(kilograms(-5), kilograms(8000))).toBe(0);
  expect(fuelFillShare(kilograms(10), kilograms(0))).toBe(0);
});
