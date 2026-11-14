import { afterEach, expect, it } from 'vitest';
import { listBodies, startRun } from '../game/sim/index.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { LandedPanels } from './LandedPanels.tsx';

afterEach(cleanUp);

// Seed 4171 has the longest names in 20,000 seeds; Thirthiothux Minor is a Moon of Praespraethaen Prime.
const SLACK = 6;

it('marks a Depleted Body on the Landed plate, clear of the other lines and inside the frame', async () => {
  const run = startRun(4171, 'scout');
  const body = listBodies(run.starSystem).find((b) => b.name === 'Thirthiothux Minor');
  if (!body) throw new Error('seed 4171 has no Thirthiothux Minor');
  const host = await renderUi(
    <LandedPanels
      run={{ ...run, status: { kind: 'landed', bodyId: body.id }, depleted: [body.id] }}
      chartOpen={false}
      spacecraftOpen={false}
      onOpenSpacecraft={() => undefined}
    />,
  );
  const plate = host.querySelector<HTMLElement>('.landed-plate');
  const detail = host.querySelector<HTMLElement>('.landed-plate__detail');
  if (!plate || !detail) throw new Error('no plate');
  const mark = byTestId(host, 'landed-depleted');
  expect(mark.textContent).toBe('Depleted');
  const frame = plate.getBoundingClientRect();
  const box = mark.getBoundingClientRect();
  // Under the detail line, the plate grown to hold it, and the whole badge inside the frame.
  expect(box.top).toBeGreaterThanOrEqual(detail.getBoundingClientRect().bottom);
  expect(box.right).toBeLessThanOrEqual(frame.right - SLACK);
  expect(box.bottom).toBeLessThanOrEqual(frame.bottom - 3);
  // Still clear of the Nav Chart button and the credit tag below.
  expect(frame.right).toBeLessThanOrEqual(296);
  expect(frame.bottom).toBeLessThanOrEqual(336);
  expect(mark.scrollWidth).toBeLessThanOrEqual(mark.clientWidth);
});

it('does not mark a fresh Body on the Landed plate', async () => {
  const run = startRun(123, 'scout');
  const host = await renderUi(
    <LandedPanels
      run={run}
      chartOpen={false}
      spacecraftOpen={false}
      onOpenSpacecraft={() => undefined}
    />,
  );
  expect(host.querySelector('[data-testid="landed-depleted"]')).toBeNull();
});
