import { afterEach, expect, it } from 'vitest';
import {
  CHASSIS_IDS,
  firstDetectedBody,
  kilograms,
  listBodies,
  startRun,
  type Run,
} from '../game/sim/index.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { landing, SAVE_BY_REMOVING, saveByRefitting } from './landingFixtures.ts';
import { SHIP_PLACEMENT, SHIP_SWEEP } from '../game/scenes/landedView.ts';
import { LandedPanels } from './LandedPanels.tsx';

afterEach(cleanUp);

// Seed 7088 has the longest Moon name in 20,000 seeds: Quioxdrardriox Minor, a Moon of Riosxa.
// Re-pinned for #188 (was seed 4171's Thirthiothux Minor) and #247 (was seed 10540's Drioldrionlael
// Minor): the Isp rise moves seed 10540 to another Star System.
const SLACK = 6;

it('marks a Depleted Body on the Landed plate, on the kind row, inside an unchanged plate', async () => {
  const run = startRun(7088, 'scout');
  const body = listBodies(run.starSystem).find((b) => b.name === 'Quioxdrardriox Minor');
  if (!body) throw new Error('seed 7088 has no Quioxdrardriox Minor');
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
  // Depleted is the struck-through yield icon, its words in the accessible name (no amber word to fit).
  const mark = byTestId(host, 'landed-depleted');
  expect(mark.getAttribute('aria-label')).toBe('Depleted, yields nothing');
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
});

it('names the drawn Spacecraft’s Chassis and Components for a screen reader, and keeps it unseen', async () => {
  const run = startRun(123, 'lancer');
  const host = await renderUi(
    <LandedPanels
      run={run}
      chartOpen={false}
      spacecraftOpen={false}
      onOpenSpacecraft={() => undefined}
    />,
  );
  const alt = byTestId(host, 'spacecraft-alt');
  expect(alt.textContent).toBe('Lancer: Engine 1, Fuel Tank 1');
  expect(alt.getBoundingClientRect().width).toBeLessThanOrEqual(1);
});

it('does not mark a fresh Body on the Landed plate', async () => {
  // Stood on the first target: the Starting Moon gave up its yield at the start (#96).
  const start = startRun(123, 'scout');
  const run: Run = {
    ...start,
    status: { kind: 'landed', bodyId: firstDetectedBody(start.starSystem).id },
  };
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
  const { seed, path, fit } = SAVE_BY_REMOVING;
  const host = await landed(landing(seed, path, fit, 0, false).run);
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

it('the Landed plate shows the yield icon next to Icy or Rocky, struck through and named once Depleted, inside the plate', async () => {
  const run = startRun(123, 'scout');
  const body = listBodies(run.starSystem).find((b) => b.landable);
  if (!body?.landable) throw new Error('seed 123 has no landable Body');
  const resource = body.composition === 'icy' ? 'yields Fuel' : 'yields Materials';
  for (const [depleted, name] of [
    [[], resource],
    [[body.id], 'Depleted, yields nothing'],
  ] as const) {
    const host = await renderUi(
      <LandedPanels
        run={{ ...run, status: { kind: 'landed', bodyId: body.id }, depleted: [...depleted] }}
        chartOpen={false}
        spacecraftOpen={false}
        onOpenSpacecraft={() => undefined}
      />,
    );
    const icon = byTestId(
      byTestId(host, 'landed-kind'),
      depleted.length > 0 ? 'landed-depleted' : 'resource-icon',
    );
    expect(icon.getAttribute('role')).toBe('img');
    expect(icon.getAttribute('aria-label')).toBe(name);
    expect(icon.classList.contains('resource-icon--depleted')).toBe(depleted.length > 0);
    const plate = host.querySelector<HTMLElement>('.landed-plate')?.getBoundingClientRect();
    const box = icon.getBoundingClientRect();
    if (!plate) throw new Error('no plate');
    expect(box.top).toBeGreaterThanOrEqual(plate.top);
    expect(box.bottom).toBeLessThanOrEqual(plate.bottom);
    cleanUp();
  }
});

it.each(CHASSIS_IDS)(
  'shows the %s Fuel tank by the Spacecraft, matching the Fuel and clear of the panels',
  async (chassis) => {
    const start = startRun(123, chassis);
    const run: Run = {
      ...start,
      spacecraft: { ...start.spacecraft, fuelMass: kilograms(start.spacecraft.fuelCapacity / 4) },
    };
    const host = await renderUi(
      <LandedPanels
        run={run}
        chartOpen={false}
        spacecraftOpen={false}
        onOpenSpacecraft={() => undefined}
      />,
    );
    const gauge = byTestId(host, 'spacecraft-fuel-gauge');
    const fill = byTestId(host, 'spacecraft-fuel-gauge-fill');
    expect(gauge.getAttribute('aria-valuenow')).toBe(String(Math.round(run.spacecraft.fuelMass)));
    expect(fill.getBoundingClientRect().height / gauge.clientHeight).toBeCloseTo(0.25, 1);
    // The top bar's bar agrees with it.
    const bar = byTestId(host, 'fuel-bar-fill');
    expect(Number(bar.dataset['share'])).toBe(Number(fill.dataset['share']));
    // Beside the ship: standing on its base line, within a few pixels of its sweep, with the Fuel icon above.
    const box = gauge.getBoundingClientRect();
    expect(box.right).toBeLessThanOrEqual(SHIP_SWEEP.left);
    expect(SHIP_SWEEP.left - box.right).toBeLessThanOrEqual(10);
    expect(Math.abs(box.bottom - SHIP_PLACEMENT.baseY)).toBeLessThanOrEqual(1);
    const icon = byTestId(host, 'spacecraft-fuel-icon').getBoundingClientRect();
    expect(icon.bottom).toBeLessThanOrEqual(box.top);
    expect(icon.top).toBeGreaterThanOrEqual(40);
    for (const selector of ['.landed-spacecraft-button', '.landed-nav-button', '.landed-plate']) {
      const other = host.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
      if (!other) throw new Error(selector);
      const apart =
        box.right <= other.left ||
        other.right <= box.left ||
        box.bottom <= other.top ||
        other.bottom <= box.top;
      expect(apart, selector).toBe(true);
    }
  },
);
