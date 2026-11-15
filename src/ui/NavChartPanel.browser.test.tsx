import { afterEach, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import {
  HELIOPAUSE,
  firstDetectedBody,
  install,
  kilograms,
  listBodies,
  materials,
  planHop,
  startRun,
  type Body,
  type BodyId,
  type Planet,
  type HopTarget,
  type Run,
} from '../game/sim/index.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { NavChartPanel } from './NavChartPanel.tsx';
import { expectTextBudget } from './textBudget.ts';

afterEach(cleanUp);

/**
 * A New Run stood on its innermost planet, knowing every Body: the panel's layout is tested on a full
 * chart, from where Runs opened before the Starting Moon (#96).
 */
function newRun(seed: number, chassis: 'scout' | 'hauler' | 'lancer'): Run {
  const run = startRun(seed, chassis);
  const ids = listBodies(run.starSystem).map((body) => body.id);
  const inner = run.starSystem.planets[0];
  if (!inner) throw new Error('A Star System has planets');
  return {
    ...run,
    status: { kind: 'landed', bodyId: inner.id },
    knowledge: { detected: ids, surveyed: ids, heliopauseFound: true },
  };
}

/** The Hop plan's "Tell me more" toggle. */
const tellMeMore = (host: HTMLElement): HTMLElement =>
  host.querySelector<HTMLElement>('[data-testid="hop-plan"] button') ??
  (() => {
    throw new Error('no Tell me more in the Hop plan');
  })();

/** The chart header's "?" toggle for the Δv help. */
const helpToggle = (host: HTMLElement): HTMLElement =>
  host.querySelector<HTMLElement>('button[aria-label="What is Δv?"]') ??
  (() => {
    throw new Error('no ? toggle on the chart');
  })();

/** Where the lowest part of `box` that is shown ends. */
const lowestShown = (box: HTMLElement): number =>
  Math.max(
    ...[...box.children]
      .filter((el) => el.checkVisibility())
      .map((el) => el.getBoundingClientRect().bottom),
  );

/** Focuses `el` and presses a key on it, as a keyboard player would. */
async function press(el: HTMLElement, key: string): Promise<void> {
  el.focus();
  await userEvent.keyboard(key);
}

/** Renders the panel at native scale with focus on one Body, once the pixel fonts have loaded. */
async function showFocused(seed: number, focusedId: string): Promise<HTMLElement> {
  const run = newRun(seed, 'scout');
  const host = await renderUi(
    <NavChartPanel run={run} state={{ focusedId: focusedId as BodyId, selectedId: undefined }} />,
  );
  return byTestId(host, 'inspect');
}

// Seed 2024's Gas Giants were the ones the review saw overflow; seed 1008's Quaessaxthaex Prime has
// the longest reason in 3000 seeds. Re-pinned for #188: the same seeds' Gas Giants under the new
// generation, and seed 1008 for seed 533's Priosprysmur Minor.
it.each([
  [2024, 'planet-4', 'Cele'],
  [12, 'planet-5', 'Dryxquur-9'],
  [1008, 'planet-3', 'Quaessaxthaex Prime'],
  [2024, 'planet-5', 'Hicyn'],
])('fits the reason inside the tooltip frame (seed %i, %s)', async (seed, id, name) => {
  const tooltip = await showFocused(seed, id);
  const verdict = tooltip.querySelector<HTMLElement>('[data-testid="verdict"]');
  if (!verdict) throw new Error('no verdict');
  expect(verdict.textContent).toContain(name);
  const frame = tooltip.getBoundingClientRect();
  const text = verdict.getBoundingClientRect();
  // The frame's border is 2 px; the text keeps inside it, on every side.
  expect(text.bottom).toBeLessThanOrEqual(frame.bottom - 3);
  expect(text.right).toBeLessThanOrEqual(frame.right - 3);
  expect(verdict.scrollWidth).toBeLessThanOrEqual(verdict.clientWidth);
});

// The Hop plan is the densest block on the panel. Its longest states (a low chance, and a Margin below
// zero with its stronger warning) must keep every gauge and line inside the plan area, above the
// buttons, with its details open as well as closed, and the Δv help under the chart must fit the frame.
// Re-pinned for #189: from seed 123's innermost planet a half-fuelled Spacecraft is short of Rexsio
// (was Sircer, from the Home Planet).
it.each(['scout', 'hauler'] as const)(
  'keeps the whole Hop plan above Cancel and Launch, open or closed, and the Δv help inside the frame (%s, seed 123 Rexsio, half the Fuel)',
  async (chassis) => {
    const full = newRun(123, chassis);
    const fuelMass = kilograms(full.spacecraft.fuelMass / 2);
    const run = { ...full, spacecraft: { ...full.spacecraft, fuelMass } };
    const far = listBodies(run.starSystem).find((b) => b.name === 'Rexsio');
    if (!far) throw new Error('seed 123 has no Rexsio');
    const host = await renderUi(
      <NavChartPanel run={run} state={{ focusedId: far.id, selectedId: far.id }} />,
    );
    const plan = byTestId(host, 'hop-plan');
    const warning = byTestId(host, 'plan-warning');
    const frame = host.querySelector<HTMLElement>('.nav-chart__panel');
    const buttons = host.querySelector<HTMLElement>('.nav-chart__actions');
    if (!frame || !buttons) throw new Error('missing plan parts');
    const buttonsTop = buttons.getBoundingClientRect().top;
    const inPlan = (el: Element): void => {
      const [box, area] = [el.getBoundingClientRect(), plan.getBoundingClientRect()];
      expect(box.top).toBeGreaterThanOrEqual(area.top);
      expect(box.bottom).toBeLessThanOrEqual(Math.min(area.bottom, buttonsTop));
      expect(box.left).toBeGreaterThanOrEqual(area.left);
      expect(box.right).toBeLessThanOrEqual(area.right);
    };
    expect(plan.scrollHeight).toBeLessThanOrEqual(plan.clientHeight);
    for (const part of plan.children) if (part.checkVisibility()) inPlan(part);
    // One line of 11 px, and not cut off.
    expect(warning.getBoundingClientRect().height).toBeLessThanOrEqual(12);
    expect(warning.scrollWidth).toBeLessThanOrEqual(warning.clientWidth);

    // Opened, the details cover the plan and every reason shows whole, inside it.
    await press(tellMeMore(host), '{Enter}');
    const reasons = host.querySelectorAll<HTMLElement>('[data-testid="burn-reason"]');
    expect(reasons).toHaveLength(3);
    for (const reason of reasons) {
      expect(reason.checkVisibility()).toBe(true);
      expect(reason.scrollWidth).toBeLessThanOrEqual(reason.clientWidth);
      inPlan(reason);
    }
    inPlan(byTestId(host, 'plan-basis'));
    expect(plan.scrollHeight).toBeLessThanOrEqual(plan.clientHeight);

    // The Δv help under the chart is not cut off by its box or the panel frame.
    await press(helpToggle(host), '{Enter}');
    const explain = byTestId(host, 'plan-explain');
    const box = explain.parentElement;
    if (!box) throw new Error('no help box');
    expect(explain.checkVisibility()).toBe(true);
    expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight);
    expect(explain.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      box.getBoundingClientRect().bottom,
    );
    expect(box.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      frame.getBoundingClientRect().bottom,
    );
  },
);

// The longest name the generator makes: three syllables of onset, vowel and coda (15 letters) plus an
// epithet. A Moon of such a planet has the longest target subtitle, and the numbers must fit beside it.
it('shows the whole target subtitle for a Moon of the longest-named planet, inside the frame', async () => {
  const run = newRun(123, 'scout');
  const longName = 'Thaeprioquaeprix Prime';
  const planets = run.starSystem.planets.map((planet) =>
    planet.moons.length > 0 ? { ...planet, name: longName } : planet,
  );
  const longRun = { ...run, starSystem: { ...run.starSystem, planets } };
  const moon = listBodies(longRun.starSystem).find((b) => b.kind === 'moon');
  if (!moon) throw new Error('no moon');
  const host = await renderUi(
    <NavChartPanel run={longRun} state={{ focusedId: moon.id, selectedId: moon.id }} />,
  );
  const target = host.querySelector<HTMLElement>('[data-testid="target"]');
  const kind = host.querySelector<HTMLElement>('[data-testid="target-kind"]');
  const gravity = host.querySelector<HTMLElement>('[data-testid="target-gravity"]');
  const divider = host.querySelector<HTMLElement>('.nav-chart__divider');
  if (!target || !kind || !gravity || !divider) throw new Error('missing target parts');
  expect(kind.textContent).toContain(longName);
  expect(gravity.textContent).toContain('m/s²');
  // The subtitle wraps onto at most two lines of 11 px, none cut off, and ends a few pixels above the
  // divider with the gravity inside the target block (slack for font differences).
  expect(kind.getBoundingClientRect().height).toBeLessThanOrEqual(22);
  for (const el of [kind, gravity]) {
    expect(el.scrollWidth).toBeLessThanOrEqual(el.clientWidth);
    expect(el.getBoundingClientRect().right).toBeLessThanOrEqual(
      target.getBoundingClientRect().right,
    );
    expect(el.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      divider.getBoundingClientRect().top - 2,
    );
  }
});

/**
 * A Run's opening as the chart shows it: the first Body Comms Detected and the planet it orbits (on
 * seed 123 a sibling Moon of the Starting Moon, round a Gas Giant).
 */
function opening(run: Run): { home: Planet; moon: Body } {
  const moon = firstDetectedBody(run.starSystem);
  const home = run.starSystem.planets.find((planet) => planet.moons.some((m) => m.id === moon.id));
  if (!home) throw new Error('The first Detected Body is a Moon on this seed');
  return { home, moon };
}

// The tallest the side panel gets: a 21-character target name (two lines, so the plan moves down) with
// the strongest warning (a Margin below zero, here from almost no Fuel). Baselines differ by platform,
// so the last line keeps real room inside the plan and the plan stays clear of the buttons.
it('keeps the tallest plan, with a 21-character target and a Margin warning, clear of its box and the buttons', async () => {
  const base = newRun(123, 'scout');
  const { home, moon } = opening(base);
  const name = 'Quaexquaexquaex Minor';
  const planets = base.starSystem.planets.map((planet) =>
    planet.id === home.id
      ? { ...planet, moons: planet.moons.map((m) => (m.id === moon.id ? { ...m, name } : m)) }
      : planet,
  );
  const run = {
    ...base,
    starSystem: { ...base.starSystem, planets },
    spacecraft: { ...base.spacecraft, fuelMass: kilograms(1) },
  };
  const host = await renderUi(
    <NavChartPanel run={run} state={{ focusedId: moon.id, selectedId: moon.id }} />,
  );
  expect(byTestId(host, 'plan-warning').textContent).not.toBe('');
  const targetName = host.querySelector<HTMLElement>('.nav-chart__target-name');
  const plan = byTestId(host, 'hop-plan');
  const buttons = host.querySelector<HTMLElement>('.nav-chart__actions');
  if (!targetName || !buttons) throw new Error('missing plan parts');
  expect(targetName.textContent.toLowerCase()).toBe(name.toLowerCase());
  // The head row carries the badge and the composition ("Landable · Icy") beside the label.
  const head = byTestId(host, 'target');
  const words = byTestId(host, 'target-composition');
  expect(words.textContent).toMatch(/Icy|Rocky/);
  // The badge is flush right by design: it must stay inside the block, clear of the label, on one row.
  const label = head.querySelector<HTMLElement>('.nav-chart__target-label');
  const badge = words.closest<HTMLElement>('.nav-chart__badge');
  if (!label || !badge) throw new Error('missing head parts');
  expect(words.getBoundingClientRect().right).toBeLessThanOrEqual(
    head.getBoundingClientRect().right,
  );
  expect(badge.scrollWidth).toBeLessThanOrEqual(badge.clientWidth);
  expect(label.getBoundingClientRect().right + 6).toBeLessThanOrEqual(
    badge.getBoundingClientRect().left,
  );
  expect(badge.getBoundingClientRect().height).toBeLessThanOrEqual(12);
  expect(plan.scrollHeight).toBeLessThanOrEqual(plan.clientHeight);
  expect(lowestShown(plan)).toBeLessThanOrEqual(plan.getBoundingClientRect().bottom - 6);
  expect(plan.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    buttons.getBoundingClientRect().top,
  );
});

// Seed 10540 has the longest Moon name in 20,000 seeds: Drioldrionlael Minor (20 characters), a Moon
// of Tioraevel Rho. Re-pinned for #188 (was seed 4171's Thirthiothux Minor).
// Every line a name or subtitle appears on must show it whole, inside its frame, with slack for the
// fonts CI draws, which are a little wider than the ones on a dev machine.
const SLACK = 6;
const [LONG_SEED, LONG_NAME, LONG_PARENT] = [10540, 'Drioldrionlael Minor', 'Tioraevel Rho'];

/** Where the drawn text of a block ends, not the block's own box (which fills its container). */
function textRight(el: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect().right;
}

function longBody() {
  const run = newRun(LONG_SEED, 'scout');
  const body = listBodies(run.starSystem).find((b) => b.name === LONG_NAME);
  if (!body) throw new Error(`seed ${String(LONG_SEED)} has no ${LONG_NAME}`);
  return { run, body };
}

it('shows the whole name and subtitle of the longest-named Body in the tooltip, inside its frame', async () => {
  const { run, body } = longBody();
  const host = await renderUi(
    <NavChartPanel run={run} state={{ focusedId: body.id, selectedId: undefined }} />,
  );
  const frame = byTestId(host, 'inspect').getBoundingClientRect();
  const name = host.querySelector<HTMLElement>('.nav-chart__tip-name');
  const kind = host.querySelector<HTMLElement>('.nav-chart__tip-kind');
  if (!name || !kind) throw new Error('missing tooltip lines');
  expect(name.textContent.toLowerCase()).toBe(LONG_NAME.toLowerCase());
  expect(kind.textContent).toContain(LONG_PARENT);
  for (const line of [name, kind]) {
    expect(line.scrollWidth).toBeLessThanOrEqual(line.clientWidth);
    expect(textRight(line)).toBeLessThanOrEqual(frame.right - SLACK);
  }
  // Nothing sits on top of the line below it, and the whole block stays inside the frame.
  const fact = host.querySelector<HTMLElement>('.nav-chart__tip-fact');
  if (!fact) throw new Error('missing fact line');
  expect(kind.getBoundingClientRect().bottom).toBeLessThanOrEqual(fact.getBoundingClientRect().top);
  // The badge, with its "Icy" or "Rocky", sits under the wrapped type line and inside the frame.
  const badge = byTestId(host, 'landable');
  const words = byTestId(host, 'tip-composition');
  expect(words.textContent).toMatch(/Icy|Rocky/);
  expect(badge.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    kind.getBoundingClientRect().bottom,
  );
  expect(badge.scrollWidth).toBeLessThanOrEqual(badge.clientWidth);
  expect(textRight(words)).toBeLessThanOrEqual(frame.right - SLACK);
  expect(badge.getBoundingClientRect().bottom).toBeLessThanOrEqual(frame.bottom - 3);
});

it('shows the whole name and subtitle of the longest-named Body in the Hop plan, above the divider', async () => {
  const { run, body } = longBody();
  const host = await renderUi(
    <NavChartPanel run={run} state={{ focusedId: body.id, selectedId: body.id }} />,
  );
  const target = byTestId(host, 'target');
  const name = host.querySelector<HTMLElement>('.nav-chart__target-name');
  const kind = byTestId(host, 'target-kind');
  const divider = host.querySelector<HTMLElement>('.nav-chart__divider');
  if (!name || !divider) throw new Error('missing target parts');
  expect(name.textContent.toLowerCase()).toBe(LONG_NAME.toLowerCase());
  expect(kind.textContent).toContain(LONG_PARENT);
  const box = target.getBoundingClientRect();
  for (const line of [name, kind]) {
    expect(line.scrollWidth).toBeLessThanOrEqual(line.clientWidth);
    expect(textRight(line)).toBeLessThanOrEqual(box.right - SLACK);
    expect(line.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      divider.getBoundingClientRect().top - 2,
    );
  }
  // The plan below still starts under the divider and ends above the buttons, with its content inside.
  const plan = byTestId(host, 'hop-plan');
  const buttons = host.querySelector<HTMLElement>('.nav-chart__actions');
  if (!buttons) throw new Error('no buttons');
  expect(plan.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    divider.getBoundingClientRect().bottom,
  );
  expect(plan.scrollHeight).toBeLessThanOrEqual(plan.clientHeight);
  expect(plan.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    buttons.getBoundingClientRect().top,
  );
});

// Icy or Rocky is its own short item, so the worst-case name can never push it out of view.
it('shows the composition in the tooltip and the target head for the longest-named planet, inside their frames', async () => {
  const run = newRun(123, 'scout');
  const longName = 'Thaeprioquaeprix Prime';
  const planets = run.starSystem.planets.map((planet) =>
    planet.moons.length > 0 ? { ...planet, name: longName } : planet,
  );
  const longRun = { ...run, starSystem: { ...run.starSystem, planets } };
  const moon = listBodies(longRun.starSystem).find((b) => b.kind === 'moon');
  if (!moon) throw new Error('no moon');
  const host = await renderUi(
    <NavChartPanel run={longRun} state={{ focusedId: moon.id, selectedId: moon.id }} />,
  );
  const tooltip = host.querySelector<HTMLElement>('[data-testid="inspect"]');
  const tipBadge = host.querySelector<HTMLElement>('[data-testid="landable"]');
  const target = host.querySelector<HTMLElement>('[data-testid="target"]');
  const targetBadge = target?.querySelector<HTMLElement>('.nav-chart__badge');
  const tipWords = host.querySelector<HTMLElement>('[data-testid="tip-composition"]');
  const targetWords = host.querySelector<HTMLElement>('[data-testid="target-composition"]');
  if (!tooltip || !tipBadge || !target || !targetBadge || !tipWords || !targetWords) {
    throw new Error('missing composition parts');
  }
  expect(tipWords.textContent).toMatch(/Icy|Rocky/);
  expect(targetWords.textContent).toMatch(/Icy|Rocky/);
  expect(tipBadge.scrollWidth).toBeLessThanOrEqual(tipBadge.clientWidth);
  expect(tipWords.getBoundingClientRect().right).toBeLessThanOrEqual(
    tooltip.getBoundingClientRect().right,
  );
  expect(targetWords.getBoundingClientRect().right).toBeLessThanOrEqual(
    target.getBoundingClientRect().right,
  );
  // The head holds the label and the badge on one 12 px row.
  expect(targetBadge.getBoundingClientRect().height).toBeLessThanOrEqual(12);
  expect(targetBadge.scrollWidth).toBeLessThanOrEqual(targetBadge.clientWidth);
});

// Depleted takes the place of Icy or Rocky in the badge, and a Hop plan to it says it yields nothing.
// The same worst cases as above, with the Body Depleted, keep the same room.
it('shows Depleted in the tooltip of the longest-named Body, inside its frame', async () => {
  const { run, body } = longBody();
  const host = await renderUi(
    <NavChartPanel
      run={{ ...run, depleted: [body.id] }}
      state={{ focusedId: body.id, selectedId: undefined }}
    />,
  );
  const frame = byTestId(host, 'inspect').getBoundingClientRect();
  const badge = byTestId(host, 'landable');
  const words = byTestId(host, 'tip-composition');
  expect(words.textContent).toContain('Depleted');
  expect(words.textContent).not.toMatch(/Icy|Rocky/);
  // The same amber warning style as the plan head and the plate, not the green Landable one.
  expect(badge.className).toContain('nav-chart__badge--warn');
  expect(badge.className).not.toContain('nav-chart__badge--ok');
  expect(badge.scrollWidth).toBeLessThanOrEqual(badge.clientWidth);
  expect(textRight(words)).toBeLessThanOrEqual(frame.right - SLACK);
  expect(badge.getBoundingClientRect().bottom).toBeLessThanOrEqual(frame.bottom - 3);
});

it('keeps the tallest plan, 21-character target, Margin warning and Depleted, clear of its box and the buttons', async () => {
  const base = newRun(123, 'scout');
  const { home, moon } = opening(base);
  const name = 'Quaexquaexquaex Minor';
  const planets = base.starSystem.planets.map((planet) =>
    planet.id === home.id
      ? { ...planet, moons: planet.moons.map((m) => (m.id === moon.id ? { ...m, name } : m)) }
      : planet,
  );
  const run = {
    ...base,
    starSystem: { ...base.starSystem, planets },
    spacecraft: { ...base.spacecraft, fuelMass: kilograms(1) },
    depleted: [moon.id],
  };
  const host = await renderUi(
    <NavChartPanel run={run} state={{ focusedId: moon.id, selectedId: moon.id }} />,
  );
  expect(byTestId(host, 'plan-warning').textContent).not.toBe('');
  // The live summary still says the Hop will yield nothing; the head badge shows it.
  expect(byTestId(host, 'plan-summary').textContent).toContain('will yield nothing');
  const plan = byTestId(host, 'hop-plan');
  const buttons = host.querySelector<HTMLElement>('.nav-chart__actions');
  if (!buttons) throw new Error('no buttons');
  expect(plan.lastElementChild?.getBoundingClientRect().bottom ?? 0).toBeLessThanOrEqual(
    plan.getBoundingClientRect().bottom,
  );
  expect(plan.scrollHeight).toBeLessThanOrEqual(plan.clientHeight);
  expect(plan.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    buttons.getBoundingClientRect().top,
  );
  // The head badge reads "Depleted · no yield" on one row beside the label, inside the block.
  const head = byTestId(host, 'target');
  const words = byTestId(host, 'target-composition');
  expect(words.textContent).toBe('Depleted · no yield');
  const label = head.querySelector<HTMLElement>('.nav-chart__target-label');
  const badge = words.closest<HTMLElement>('.nav-chart__badge');
  if (!label || !badge) throw new Error('missing head parts');
  expect(words.getBoundingClientRect().right).toBeLessThanOrEqual(
    head.getBoundingClientRect().right,
  );
  expect(badge.scrollWidth).toBeLessThanOrEqual(badge.clientWidth);
  expect(badge.getBoundingClientRect().height).toBeLessThanOrEqual(12);
  expect(label.getBoundingClientRect().right + 6).toBeLessThanOrEqual(
    badge.getBoundingClientRect().left,
  );
});

it('names Depleted in the screen-reader entry for the Body', async () => {
  const run = newRun(123, 'scout');
  const { home, moon } = opening(run);
  const host = await renderUi(
    <NavChartPanel
      run={{ ...run, depleted: [moon.id] }}
      state={{ focusedId: moon.id, selectedId: undefined }}
    />,
  );
  const option = host.querySelector<HTMLElement>(`#nav-option-${moon.id}`);
  expect(option?.textContent).toContain('Depleted, yields nothing');
  const other = host.querySelector<HTMLElement>(`#nav-option-${home.id}`);
  expect(other?.textContent).not.toContain('Depleted');
});

/** A lancer on seed 1 with a Jump Drive installed: the Heliopause is within its reach. */
function withJumpDrive(): Run {
  const result = install({ ...newRun(1, 'lancer'), materials: materials(100) }, 2, 'jump-drive');
  if (result.kind !== 'installed') throw new Error('Expected an install');
  return result.run;
}

it('says on the chart why the focused Heliopause cannot be the target without a Jump Drive', async () => {
  const host = await renderUi(
    <NavChartPanel
      run={newRun(1, 'lancer')}
      state={{ focusedId: HELIOPAUSE, selectedId: undefined }}
    />,
  );
  const tooltip = byTestId(host, 'inspect');
  expect(tooltip.querySelector('h2')?.textContent).toBe('Heliopause');
  const verdict = byTestId(tooltip, 'verdict');
  expect(verdict.textContent).toMatch(/Jump Drive/);
  // The reason fits inside the tooltip frame.
  const frame = tooltip.getBoundingClientRect();
  expect(verdict.getBoundingClientRect().bottom).toBeLessThanOrEqual(frame.bottom - 3);
  expect(verdict.scrollWidth).toBeLessThanOrEqual(verdict.clientWidth);
  // The listbox has an entry for it, unavailable, that a screen reader reads with the reason.
  const option = host.querySelector<HTMLElement>(`#nav-option-${HELIOPAUSE}`);
  expect(option?.getAttribute('aria-disabled')).toBe('true');
  expect(option?.textContent).toMatch(/Heliopause.*Jump Drive/);
  const chart = host.querySelector<HTMLElement>('[role="listbox"]');
  expect(chart?.getAttribute('aria-activedescendant')).toBe(`nav-option-${HELIOPAUSE}`);
  expect(host.querySelector('[data-testid="hop-plan"]')?.textContent).not.toMatch(/Takeoff/);
});

it('plans a Hop to the targeted Heliopause with a Jump Drive: Takeoff and Transfer, no Landing', async () => {
  const host = await renderUi(
    <NavChartPanel
      run={withJumpDrive()}
      state={{ focusedId: HELIOPAUSE, selectedId: HELIOPAUSE }}
    />,
  );
  expect(byTestId(host, 'target').textContent).toContain('Heliopause');
  expect(byTestId(host, 'inspect').querySelector('[data-testid="verdict"]')).toBeNull();
  // The bar has a segment for each Burn, and its name reads them; the details list them too.
  const bar = byTestId(host, 'dv-bar');
  expect(bar.querySelectorAll('[data-burn]')).toHaveLength(2);
  expect(bar.getAttribute('aria-label')).toMatch(/Takeoff .*Transfer /);
  expect(bar.getAttribute('aria-label')).not.toMatch(/Landing/);
  const rows = [...host.querySelectorAll('.nav-chart__details th')].map((th) => th.textContent);
  expect(rows).toEqual(['Takeoff', 'Transfer']);
  expect(byTestId(host, 'plan-summary').textContent).toMatch(/^Hop plan for the Heliopause/);
  expect(
    host.querySelector<HTMLButtonElement>('.nav-chart__actions button:last-of-type')?.disabled,
  ).toBe(false);
  // Everything in the plan sits inside its area, above the buttons, and the target block fits its frame.
  const plan = byTestId(host, 'hop-plan');
  expect(plan.scrollHeight).toBeLessThanOrEqual(plan.clientHeight);
  for (const reason of host.querySelectorAll<HTMLElement>('[data-testid="burn-reason"]')) {
    expect(reason.scrollWidth).toBeLessThanOrEqual(reason.clientWidth);
  }
  const kind = byTestId(host, 'target-kind');
  expect(kind.scrollWidth).toBeLessThanOrEqual(kind.clientWidth);
  const option = host.querySelector<HTMLElement>(`#nav-option-${HELIOPAUSE}`);
  expect(option?.getAttribute('aria-disabled')).toBe('false');
  expect(option?.getAttribute('aria-selected')).toBe('true');
});

// Show, don't tell (#222): Success Chance first, then the Δv bar, then the Fuel after the Hop.
it('leads the Hop plan with Success Chance, then the Δv bar, then the Fuel gauge, each named in words', async () => {
  const run = newRun(123, 'scout');
  const moon = run.starSystem.planets[0]?.moons[0];
  if (!moon) throw new Error('no moon');
  const host = await renderUi(
    <NavChartPanel run={run} state={{ focusedId: moon.id, selectedId: moon.id }} />,
  );
  const top = (id: string): number => byTestId(host, id).getBoundingClientRect().top;
  expect(top('plan-success')).toBeLessThan(top('dv-bar'));
  expect(top('dv-bar')).toBeLessThan(top('plan-fuel'));
  // Seed 123's innermost planet to its Moon: 5.4 of 22.1 km/s, and the bar's segments, gap and words
  // agree (re-pinned for #189; was the Home Planet's Moon).
  const bar = byTestId(host, 'dv-bar');
  expect(bar.getAttribute('role')).toBe('img');
  expect(bar.getAttribute('aria-label')).toBe(
    'Δv: Takeoff 3.8 km/s, Transfer 1.3 km/s, Landing 0.24 km/s. Needs 5.4 of 22.1 km/s, Margin +16.7 km/s.',
  );
  expect(byTestId(host, 'plan-needed').textContent).toBe('5.4');
  expect(byTestId(host, 'plan-available').textContent).toBe('22.1 km/s');
  expect(byTestId(host, 'plan-margin').textContent).toBe('+16.7 km/s');
  const fuel = byTestId(host, 'plan-fuel');
  expect(fuel.getAttribute('role')).toBe('img');
  expect(fuel.getAttribute('aria-label')).toMatch(/^Fuel: 21\.0 t now, \d+\.\d t after the Hop\.$/);
  // The bar's segments sit end to end, in Burn order, and the Margin fills the rest of the bar.
  const [takeoff, transfer, landing] = [...bar.querySelectorAll<HTMLElement>('[data-burn]')].map(
    (el) => el.getBoundingClientRect(),
  );
  const gap = bar.querySelector<HTMLElement>('[data-gap]')?.getBoundingClientRect();
  if (!takeoff || !transfer || !landing || !gap) throw new Error('missing bar parts');
  expect(transfer.left).toBeCloseTo(takeoff.right, 0);
  expect(landing.left).toBeCloseTo(transfer.right, 0);
  expect(gap.left).toBeCloseTo(landing.right, 0);
  // Up to the bar's 1 px frame.
  expect(bar.getBoundingClientRect().right - gap.right).toBeGreaterThanOrEqual(0);
  expect(bar.getBoundingClientRect().right - gap.right).toBeLessThanOrEqual(1);
});

it('opens the Hop plan details by keyboard: each Burn with its reason, and the mass behind the Δv', async () => {
  const run = newRun(123, 'scout');
  const moon = run.starSystem.planets[0]?.moons[0];
  if (!moon) throw new Error('no moon');
  const host = await renderUi(
    <NavChartPanel run={run} state={{ focusedId: moon.id, selectedId: moon.id }} />,
  );
  const toggle = tellMeMore(host);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(byTestId(host, 'plan-basis').checkVisibility()).toBe(false);
  await press(toggle, '{Enter}');
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  const reasons = [...host.querySelectorAll<HTMLElement>('[data-testid="burn-reason"]')];
  expect(reasons.map((r) => r.checkVisibility())).toEqual([true, true, true]);
  expect(reasons[1]?.textContent).toBe("stay in one planet's pull");
  expect(byTestId(host, 'plan-basis').textContent).toBe('from 4.0 t craft + 21.0 t Fuel');
  await press(toggle, ' ');
  expect(byTestId(host, 'plan-basis').checkVisibility()).toBe(false);
});

it('the text-budget helper passes on the Hop plan, in every state, and on the chart under it', async () => {
  const scout = newRun(123, 'scout');
  const full = newRun(123, 'hauler');
  // Half-fuelled, the hauler is short of Rexsio (see the fit test above).
  const hauler = {
    ...full,
    spacecraft: { ...full.spacecraft, fuelMass: kilograms(full.spacecraft.fuelMass / 2) },
  };
  const sircer = listBodies(scout.starSystem).find((b) => b.name === 'Rexsio');
  // The landable Body with the lowest Success Chance from the innermost planet.
  const far = listBodies(scout.starSystem)
    .flatMap((body) => {
      const result = planHop(scout, body.id);
      return result.kind === 'planned' ? [{ body, chance: result.plan.successChance }] : [];
    })
    .sort((a, b) => a.chance - b.chance)[0]?.body;
  const moon = scout.starSystem.planets[0]?.moons[0];
  if (!far || !moon || !sircer) throw new Error('seed 123 setup');
  const states: [Run, HopTarget | undefined][] = [
    [scout, undefined],
    [scout, moon.id],
    [scout, far.id],
    [hauler, sircer.id],
    [{ ...scout, depleted: [moon.id] }, moon.id],
    [withJumpDrive(), HELIOPAUSE],
  ];
  for (const [run, selectedId] of states) {
    const host = await renderUi(
      <NavChartPanel run={run} state={{ focusedId: selectedId ?? moon.id, selectedId }} />,
    );
    expectTextBudget([byTestId(host, 'target'), byTestId(host, 'hop-plan')]);
    // Nothing is written under the chart until the player asks with "?".
    expect(byTestId(host, 'plan-explain').checkVisibility()).toBe(false);
    cleanUp();
  }
});

it('opens the Δv help under the chart with the "?" in its header, by keyboard', async () => {
  const run = newRun(123, 'scout');
  const host = await renderUi(
    <NavChartPanel
      run={run}
      state={{ focusedId: run.starSystem.planets[0]?.id ?? HELIOPAUSE, selectedId: undefined }}
    />,
  );
  const toggle = helpToggle(host);
  const titlebar = host.querySelector<HTMLElement>('.nav-chart__titlebar');
  if (!titlebar) throw new Error('no titlebar');
  // The "?" sits in the chart's title bar.
  const [t, bar] = [toggle.getBoundingClientRect(), titlebar.getBoundingClientRect()];
  expect(t.left).toBeGreaterThanOrEqual(bar.left);
  expect(t.right).toBeLessThanOrEqual(bar.right);
  expect(t.top).toBeLessThanOrEqual(bar.bottom);
  expect(t.bottom).toBeGreaterThanOrEqual(bar.top);
  expect(byTestId(host, 'plan-explain').checkVisibility()).toBe(false);
  await press(toggle, '{Enter}');
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(byTestId(host, 'plan-explain').textContent).toContain(
    'Δv is how much your speed can change',
  );
  expect(byTestId(host, 'plan-explain').checkVisibility()).toBe(true);
  expectTextBudget(byTestId(host, 'plan-explain'));
});

// Show, don't tell (#219): the Body's card and the Hop plan's target carry the yield icon, with its words.
it('every yield icon on the card and the Hop plan target has its accessible name, and a Gas Giant has none', async () => {
  const run = newRun(123, 'scout');
  const bodies = listBodies(run.starSystem);
  const landable = bodies.find((b) => b.landable && b.id !== run.starSystem.planets[0]?.id);
  const gas = bodies.find((b) => b.kind === 'gas-giant');
  if (!landable?.landable || !gas)
    throw new Error('seed 123 needs a landable Body and a Gas Giant');
  const names = (host: HTMLElement): (string | null)[] =>
    [...host.querySelectorAll('[data-testid="resource-icon"]')].map((el) =>
      el.getAttribute('aria-label'),
    );

  const expected = landable.composition === 'icy' ? 'yields Fuel' : 'yields Materials';
  const withTarget = await renderUi(
    <NavChartPanel run={run} state={{ focusedId: landable.id, selectedId: landable.id }} />,
  );
  // One on the card (tooltip), one on the target.
  expect(names(withTarget)).toEqual([expected, expected]);
  expect(byTestId(byTestId(withTarget, 'inspect'), 'resource-icon').getAttribute('role')).toBe(
    'img',
  );
  expect(names(byTestId(withTarget, 'target'))).toEqual([expected]);
  cleanUp();

  const depleted = await renderUi(
    <NavChartPanel
      run={{ ...run, depleted: [landable.id] }}
      state={{ focusedId: landable.id, selectedId: landable.id }}
    />,
  );
  expect(names(depleted)).toEqual(['Depleted, yields nothing', 'Depleted, yields nothing']);
  cleanUp();

  const giant = await renderUi(
    <NavChartPanel run={run} state={{ focusedId: gas.id, selectedId: undefined }} />,
  );
  expect(names(giant)).toEqual([]);
});

it('the yield icon fits inside the card and the target block', async () => {
  // The landable Body with the longest name, so the fit holds whatever the generator draws.
  const run = newRun(4171, 'scout');
  const body = listBodies(run.starSystem)
    .filter((b) => b.landable && b.id !== run.starSystem.planets[0]?.id)
    .reduce<ReturnType<typeof listBodies>[number] | undefined>(
      (longest, b) => (longest && longest.name.length >= b.name.length ? longest : b),
      undefined,
    );
  if (!body) throw new Error('seed 4171 has no landable Body');
  const host = await renderUi(
    <NavChartPanel run={run} state={{ focusedId: body.id, selectedId: body.id }} />,
  );
  const within = (inner: HTMLElement, outer: HTMLElement): void => {
    const [i, o] = [inner.getBoundingClientRect(), outer.getBoundingClientRect()];
    expect(i.left).toBeGreaterThanOrEqual(o.left);
    expect(i.right).toBeLessThanOrEqual(o.right);
    expect(i.bottom).toBeLessThanOrEqual(o.bottom);
  };
  within(byTestId(byTestId(host, 'inspect'), 'resource-icon'), byTestId(host, 'inspect'));
  within(byTestId(byTestId(host, 'target'), 'resource-icon'), byTestId(host, 'target'));
});

/** A New Run's first Hop target, with that target Surveyed or not. */
function surveyedRun(surveyed: boolean): { run: Run; target: Body } {
  const base = newRun(123, 'scout');
  const here = base.status.kind === 'landed' ? base.status.bodyId : '';
  const target = listBodies(base.starSystem).find((b) => b.landable && b.id !== here);
  if (!target) throw new Error('no target');
  const knowledge = {
    ...base.knowledge,
    surveyed: surveyed
      ? base.knowledge.surveyed
      : base.knowledge.surveyed.filter((id) => id !== target.id),
  };
  return { run: { ...base, knowledge }, target };
}

it('flags an Unsurveyed target with a badge and shows the reach verdict, both with accessible names (#190)', async () => {
  const { run, target } = surveyedRun(false);
  const host = await renderUi(
    <NavChartPanel run={run} state={{ focusedId: target.id, selectedId: target.id }} />,
  );
  expect(byTestId(host, 'plan-unsurveyed').getAttribute('aria-label')).toBe('Unsurveyed');
  expect(byTestId(host, 'plan-warning').getAttribute('aria-label')).toMatch(/^Reach: /);
  expect(byTestId(host, 'target-reach').getAttribute('aria-label')).toMatch(/^Reach: /);
  expectTextBudget(byTestId(host, 'hop-plan'));
});

it('shows no Unsurveyed badge for a Surveyed target (#190)', async () => {
  const { run, target } = surveyedRun(true);
  const host = await renderUi(
    <NavChartPanel run={run} state={{ focusedId: target.id, selectedId: target.id }} />,
  );
  expect(host.querySelector('[data-testid="plan-unsurveyed"]')).toBeNull();
  expect(byTestId(host, 'target-reach').getAttribute('aria-label')).toMatch(/^Reach: /);
});

it('fits the badge and the verdict inside the plan at 640x360 (#190)', async () => {
  const { run, target } = surveyedRun(false);
  const host = await renderUi(
    <NavChartPanel run={run} state={{ focusedId: target.id, selectedId: target.id }} />,
  );
  const plan = byTestId(host, 'hop-plan').getBoundingClientRect();
  const frame = host.querySelector<HTMLElement>('.nav-chart__panel')?.getBoundingClientRect();
  for (const id of ['plan-unsurveyed', 'plan-warning', 'plan-success']) {
    const box = byTestId(host, id).getBoundingClientRect();
    expect(box.right).toBeLessThanOrEqual(plan.right);
    expect(box.left).toBeGreaterThanOrEqual(plan.left);
    expect(box.bottom).toBeLessThanOrEqual(frame?.bottom ?? plan.bottom);
  }
  const reach = byTestId(host, 'target-reach').getBoundingClientRect();
  const card = byTestId(host, 'target').getBoundingClientRect();
  expect(reach.right).toBeLessThanOrEqual(card.right);
  expect(reach.left).toBeGreaterThanOrEqual(card.left);
});
