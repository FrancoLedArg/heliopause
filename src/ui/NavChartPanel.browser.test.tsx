import { afterEach, expect, it } from 'vitest';
import {
  HELIOPAUSE,
  homePlanet,
  install,
  kilograms,
  listBodies,
  materials,
  startRun,
  type BodyId,
  type Run,
} from '../game/sim/index.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { NavChartPanel } from './NavChartPanel.tsx';

afterEach(cleanUp);

/** Renders the panel at native scale with focus on one Body, once the pixel fonts have loaded. */
async function showFocused(seed: number, focusedId: string): Promise<HTMLElement> {
  const run = startRun(seed, 'scout');
  const host = await renderUi(
    <NavChartPanel run={run} state={{ focusedId: focusedId as BodyId, selectedId: undefined }} />,
  );
  return byTestId(host, 'inspect');
}

// Seed 2024's Milos is the one the review saw overflow; seed 533's has the longest reason in 3000 seeds.
it.each([
  [2024, 'planet-4', 'Milos'],
  [12, 'planet-5', 'Xiolvonzae Minor'],
  [533, 'planet-5', 'Priosprysmur Minor'],
  [2024, 'planet-3', 'Zymir'],
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
// zero with its stronger warning) must keep every line, reason and note inside the plan area, above
// the buttons, and the explanation under the chart must fit its box and the frame.
it.each(['scout', 'hauler'] as const)(
  'keeps the whole Hop plan above Cancel and Launch, and the Δv explanation inside the frame (%s, seed 123 Thakyxy)',
  async (chassis) => {
    const run = startRun(123, chassis);
    const far = listBodies(run.starSystem).find((b) => b.name === 'Thakyxy');
    if (!far) throw new Error('seed 123 has no Thakyxy');
    const host = await renderUi(
      <NavChartPanel run={run} state={{ focusedId: far.id, selectedId: far.id }} />,
    );
    const plan = host.querySelector<HTMLElement>('[data-testid="hop-plan"]');
    const warning = host.querySelector<HTMLElement>('[data-testid="plan-warning"]');
    const explain = host.querySelector<HTMLElement>('[data-testid="plan-explain"]');
    const frame = host.querySelector<HTMLElement>('.nav-chart__panel');
    const buttons = host.querySelector<HTMLElement>('.nav-chart__actions');
    if (!plan || !warning || !explain || !frame || !buttons) throw new Error('missing plan parts');
    const buttonsTop = buttons.getBoundingClientRect().top;
    expect(warning.getBoundingClientRect().bottom).toBeLessThanOrEqual(buttonsTop);
    // Everything in the plan, down to its last line, sits inside the plan area and above the buttons.
    expect(plan.scrollHeight).toBeLessThanOrEqual(plan.clientHeight);
    expect(plan.lastElementChild?.getBoundingClientRect().bottom ?? 0).toBeLessThanOrEqual(
      buttonsTop,
    );
    // One line of 11 px, and not cut off.
    expect(warning.getBoundingClientRect().height).toBeLessThanOrEqual(12);
    expect(warning.scrollWidth).toBeLessThanOrEqual(warning.clientWidth);
    for (const reason of host.querySelectorAll<HTMLElement>('[data-testid="burn-reason"]')) {
      expect(reason.scrollWidth).toBeLessThanOrEqual(reason.clientWidth);
    }
    // The explanation under the chart is not cut off by its box or the panel frame.
    expect(explain.scrollHeight).toBeLessThanOrEqual(explain.clientHeight);
    expect(explain.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      frame.getBoundingClientRect().bottom,
    );
  },
);

// The longest name the generator makes: three syllables of onset, vowel and coda (15 letters) plus an
// epithet. A Moon of such a planet has the longest target subtitle, and the numbers must fit beside it.
it('shows the whole target subtitle for a Moon of the longest-named planet, inside the frame', async () => {
  const run = startRun(123, 'scout');
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

// The tallest the side panel gets: a 21-character target name (two lines, so the plan moves down) with
// the strongest warning (a Margin below zero, here from almost no Fuel). Baselines differ by platform,
// so the last line keeps real room inside the plan and the plan stays clear of the buttons.
it('keeps the tallest plan, with a 21-character target and a Margin warning, clear of its box and the buttons', async () => {
  const base = startRun(123, 'scout');
  const home = homePlanet(base.starSystem);
  const moon = home.moons[0];
  if (!moon) throw new Error('no moon');
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
  if (!targetName || !buttons || !plan.lastElementChild) throw new Error('missing plan parts');
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
  expect(plan.lastElementChild.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    plan.getBoundingClientRect().bottom - 6,
  );
  expect(plan.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    buttons.getBoundingClientRect().top,
  );
});

// Seed 4171 has the longest names in 20,000 seeds: Thirthiothux Minor (18 characters), a Moon of
// Praespraethaen Prime (20).
// Every line a name or subtitle appears on must show it whole, inside its frame, with slack for the
// fonts CI draws, which are a little wider than the ones on a dev machine.
const SLACK = 6;
const [LONG_SEED, LONG_NAME, LONG_PARENT] = [4171, 'Thirthiothux Minor', 'Praespraethaen Prime'];

/** Where the drawn text of a block ends, not the block's own box (which fills its container). */
function textRight(el: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect().right;
}

function longBody() {
  const run = startRun(LONG_SEED, 'scout');
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
  const run = startRun(123, 'scout');
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
  const base = startRun(123, 'scout');
  const home = homePlanet(base.starSystem);
  const moon = home.moons[0];
  if (!moon) throw new Error('no moon');
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
  const note = byTestId(host, 'plan-yield');
  expect(note.textContent).toBe('Depleted: this Hop will yield nothing.');
  const plan = byTestId(host, 'hop-plan');
  const buttons = host.querySelector<HTMLElement>('.nav-chart__actions');
  if (!buttons) throw new Error('no buttons');
  // The note leads the text under the chart, which still fits its box and the frame with all of the
  // Δv explanation after it; the plan beside it keeps the room it had.
  const explain = byTestId(host, 'plan-explain');
  const frame = host.querySelector<HTMLElement>('.nav-chart__panel');
  if (!frame) throw new Error('no frame');
  expect(explain.scrollHeight).toBeLessThanOrEqual(explain.clientHeight);
  expect(explain.textContent).toContain('Δv is how much');
  expect(explain.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    frame.getBoundingClientRect().bottom,
  );
  const text = document.createRange();
  text.selectNodeContents(explain);
  expect(text.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    explain.getBoundingClientRect().bottom,
  );
  expect(text.getBoundingClientRect().right).toBeLessThanOrEqual(
    explain.getBoundingClientRect().right,
  );
  expect(plan.lastElementChild?.getBoundingClientRect().bottom ?? 0).toBeLessThanOrEqual(
    plan.getBoundingClientRect().bottom - SLACK,
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

it('says nothing about yield in a plan to a Body that is not Depleted', async () => {
  const run = startRun(123, 'scout');
  const moon = homePlanet(run.starSystem).moons[0];
  if (!moon) throw new Error('no moon');
  const host = await renderUi(
    <NavChartPanel run={run} state={{ focusedId: moon.id, selectedId: moon.id }} />,
  );
  expect(host.querySelector('[data-testid="plan-yield"]')).toBeNull();
});

it('names Depleted in the screen-reader entry for the Body', async () => {
  const run = startRun(123, 'scout');
  const home = homePlanet(run.starSystem);
  const moon = home.moons[0];
  if (!moon) throw new Error('no moon');
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
  const result = install({ ...startRun(1, 'lancer'), materials: materials(100) }, 2, 'jump-drive');
  if (result.kind !== 'installed') throw new Error('Expected an install');
  return result.run;
}

it('says on the chart why the focused Heliopause cannot be the target without a Jump Drive', async () => {
  const host = await renderUi(
    <NavChartPanel
      run={startRun(1, 'lancer')}
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
  const rows = [...host.querySelectorAll('.nav-chart__burns tbody th')].map((th) => th.textContent);
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

// Show, don't tell (#219): the Body's card and the Hop plan's target carry the yield icon, with its words.
it('every yield icon on the card and the Hop plan target has its accessible name, and a Gas Giant has none', async () => {
  const run = startRun(123, 'scout');
  const bodies = listBodies(run.starSystem);
  const landable = bodies.find((b) => b.landable && b.id !== run.starSystem.homePlanetId);
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
  const run = startRun(4171, 'scout');
  const body = listBodies(run.starSystem).find((b) => b.name === 'Thirthiothux Minor');
  if (!body) throw new Error('seed 4171 has no Thirthiothux Minor');
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
