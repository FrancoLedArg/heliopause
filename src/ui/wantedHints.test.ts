import { describe, expect, it } from 'vitest';
import { materials, startRun, type Run } from '../game/sim/index.ts';
import { wantedHints, type HintMoment } from './wantedHints.ts';

const fresh = startRun(123, 'scout');
const broke: Run = { ...fresh, materials: materials(0) };
const found: Run = { ...broke, knowledge: { ...broke.knowledge, heliopauseFound: true } };

const moment = (changes: Partial<HintMoment>): HintMoment => ({
  quiet: true,
  run: broke,
  chartOpen: false,
  targetChosen: false,
  spacecraftOpen: false,
  reportOpen: false,
  gatheredPending: false,
  ...changes,
});

describe('which First-Run hints apply', () => {
  it('offers only the landing hint on a quiet first landing', () => {
    expect(wantedHints(moment({}))).toEqual(['first-landing']);
  });

  it('offers nothing while the view is not quiet, such as during a Hop', () => {
    expect(wantedHints(moment({ quiet: false }))).toEqual([]);
  });

  it('offers the Hop plan hint only once a target is chosen on the open chart', () => {
    expect(wantedHints(moment({ chartOpen: true }))).toEqual([]);
    expect(wantedHints(moment({ chartOpen: true, targetChosen: true }))).toEqual([
      'first-hop-plan',
    ]);
  });

  it('offers the build hint when a Component is affordable', () => {
    expect(wantedHints(moment({ run: fresh }))).toContain('first-build');
    expect(wantedHints(moment({ run: broke }))).not.toContain('first-build');
  });

  it('offers the Heliopause hint only once the Heliopause is found', () => {
    expect(wantedHints(moment({}))).not.toContain('heliopause-found');
    expect(wantedHints(moment({ run: found }))).toContain('heliopause-found');
  });

  it('offers the Heliopause hint on the open chart until a target is chosen (#313)', () => {
    expect(wantedHints(moment({ run: found, chartOpen: true }))).toEqual(['heliopause-found']);
    expect(wantedHints(moment({ run: found, chartOpen: true, targetChosen: true }))).toEqual([
      'first-hop-plan',
    ]);
  });

  it('offers the gathering hint while it is pending, even under the Hop report', () => {
    expect(wantedHints(moment({ gatheredPending: true, reportOpen: true }))).toEqual([
      'first-gathering',
    ]);
  });
});
