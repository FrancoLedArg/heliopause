import { describe, expect, it } from 'vitest';
import { findBody, launchHop, startRun, type BodyId } from '../game/sim/index.ts';
import { commsAnnouncement } from './commsView.ts';

/** Seed 2026's Scout after its first Hop, to the one Body Comms Detected at the start. */
function firstLanding() {
  const run = startRun(2026, 'scout');
  const [, target] = run.knowledge.detected.filter((id) => findBody(run.starSystem, id)?.landable);
  const launched = launchHop(run, target ?? ('' as BodyId));
  if (launched.kind !== 'flown' || !launched.flight.reveal) throw new Error('Expected a landing');
  return { run: launched.run, reveal: launched.flight.reveal };
}

describe('the Comms announcement', () => {
  it('names the Body the landing Surveyed and how far away Comms Detected a new one', () => {
    const { run, reveal } = firstLanding();
    const surveyed = findBody(run.starSystem, reveal.surveyed ?? ('' as BodyId));
    expect(commsAnnouncement(run, reveal)).toMatch(
      new RegExp(
        `^${surveyed?.name ?? '?'} Surveyed\\. Comms Detected a new Body, [0-9.,]+ (AU|km) away\\.$`,
      ),
    );
  });

  it('says only what Comms found when the Body was already Surveyed', () => {
    const { run, reveal } = firstLanding();
    expect(commsAnnouncement(run, { ...reveal, surveyed: undefined })).toMatch(
      /^Comms Detected a new Body, [0-9.,]+ (AU|km) away\.$/,
    );
  });
});
