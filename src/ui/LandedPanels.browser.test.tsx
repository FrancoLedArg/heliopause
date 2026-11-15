import { afterEach, expect, it } from 'vitest';
import { listBodies, startRun, type Run } from '../game/sim/index.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { landing, SAVE_BY_REMOVING, saveByRefitting } from './landingFixtures.ts';
import { LandedPanels } from './LandedPanels.tsx';

afterEach(cleanUp);

// Seed 10540 has the longest Moon name in 20,000 seeds: Drioldrionlael Minor, a Moon of Tioraevel Rho.
// Re-pinned for #188 (was seed 4171's Thirthiothux Minor).
const SLACK = 6;

it('marks a Depleted Body on the Landed plate, on the kind row, inside an unchanged plate', async () => {
  const run = startRun(10540, 'scout');
  const body = listBodies(run.starSystem).find((b) => b.name === 'Drioldrionlael Minor');
  if (!body) throw new Error('seed 10540 has no Drioldrionlael Minor');
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

const landed = (run: Run) =>
  renderUi(
    <LandedPanels
      run={run}
      chartOpen={false}
      spacecraftOpen={false}
      onOpenSpacecraft={() => undefined}
    />,
  );

it('warns in words, on the Landed view, when no Hop is possible as built but removing a Component would save the Run', async () => {
  const { seed, body, fit } = SAVE_BY_REMOVING;
  const host = await landed(landing(seed, body, fit).run);
  const warning = byTestId(host, 'stranded-warning');
  // Text, not colour alone: a heading that says it, and what to do.
  expect(warning.getAttribute('role')).toBe('alert');
  expect(warning.querySelector('h2')?.textContent).toBe('No Hop possible');
  expect(byTestId(host, 'stranded-advice').textContent).toBe(
    'No Hop is possible as built. Remove Components to lighten the Spacecraft.',
  );
  // On the stage, clear of the top bar, the location plate and both buttons, and nothing clipped.
  const box = warning.getBoundingClientRect();
  const stage = host.getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(stage.left);
  expect(box.bottom).toBeLessThanOrEqual(stage.top + 360);
  for (const selector of [
    '.top-bar',
    '.landed-plate',
    '.landed-spacecraft-button',
    '.landed-nav-button',
  ]) {
    const other = host.querySelector(selector)?.getBoundingClientRect();
    if (!other) throw new Error(`no ${selector}`);
    const overlaps =
      box.left < other.right &&
      other.left < box.right &&
      box.top < other.bottom &&
      other.top < box.bottom;
    expect(overlaps, selector).toBe(false);
  }
  for (const line of warning.querySelectorAll<HTMLElement>('h2, p')) {
    expect(line.scrollWidth).toBeLessThanOrEqual(line.clientWidth);
    expect(line.getBoundingClientRect().bottom).toBeLessThanOrEqual(box.bottom - 4);
  }
});

it('the longer warning, when only a new Component would save the Run, fits its frame too', async () => {
  const host = await landed(saveByRefitting());
  const warning = byTestId(host, 'stranded-warning');
  const advice = byTestId(host, 'stranded-advice');
  expect(advice.textContent).toBe(
    'No Hop is possible as built. Change its Components: a different build could still make one.',
  );
  expect(advice.scrollWidth).toBeLessThanOrEqual(advice.clientWidth);
  expect(advice.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    warning.getBoundingClientRect().bottom - 4,
  );
});

it('shows no Stranded warning while a Hop is possible', async () => {
  const host = await landed(startRun(123, 'scout'));
  expect(host.querySelector('[data-testid="stranded-warning"]')).toBeNull();
});
