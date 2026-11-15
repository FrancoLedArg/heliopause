import { afterEach, expect, it } from 'vitest';
import { listBodies, startRun } from '../game/sim/index.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { LandedPanels } from './LandedPanels.tsx';

afterEach(cleanUp);

// Seed 4171 has the longest names in 20,000 seeds; Thirthiothux Minor is a Moon of Praespraethaen Prime.
const SLACK = 6;

it('marks a Depleted Body on the Landed plate, on the kind row, inside an unchanged plate', async () => {
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
  expect(mark.textContent).toBe(' · Depleted');
  const frame = plate.getBoundingClientRect();
  const box = mark.getBoundingClientRect();
  // The plate keeps its size and place (the Hop report ends above y 274), and the whole kind row,
  // longest case, ends inside it with room to spare.
  expect(frame.top).toBeGreaterThanOrEqual(274);
  expect(frame.height).toBeLessThanOrEqual(62);
  const kind = byTestId(host, 'landed-kind');
  const text = document.createRange();
  text.selectNodeContents(kind);
  expect(text.getBoundingClientRect().right).toBeLessThanOrEqual(frame.right - SLACK);
  expect(kind.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    detail.getBoundingClientRect().top + 1,
  );
  expect(box.right).toBeLessThanOrEqual(frame.right - SLACK);
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

it('the top bar says which Star System the Run is in, clear of the other items', async () => {
  const run = startRun(4171, 'scout');
  const host = await renderUi(
    <LandedPanels
      run={{ ...run, starSystemNumber: 12 }}
      chartOpen={false}
      spacecraftOpen={false}
      onOpenSpacecraft={() => undefined}
    />,
  );
  const label = byTestId(host, 'system-number');
  expect(label.textContent).toBe('System 12');
  const text = document.createRange();
  text.selectNodeContents(label);
  const box = text.getBoundingClientRect();
  const name = host.querySelector<HTMLElement>('.top-bar__system');
  const fuelIcon = host.querySelector<HTMLElement>('.top-bar__fuel-icon');
  if (!name || !fuelIcon) throw new Error('no top bar');
  // Above the System name, and with slack before the Fuel icon (and so before the Menu button).
  expect(box.bottom).toBeLessThanOrEqual(name.getBoundingClientRect().top + 1);
  expect(box.right).toBeLessThanOrEqual(fuelIcon.getBoundingClientRect().left - SLACK);
});
