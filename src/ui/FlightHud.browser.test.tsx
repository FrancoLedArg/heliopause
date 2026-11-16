import { afterEach, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createRng } from '../game/lib/rng.ts';
import { flightPlayback, type FlightPlayback } from '../game/scenes/flightPlayback.ts';
import { EventBus } from '../game/EventBus.ts';
import {
  advanceCruise,
  beginHop,
  firstDetectedBody,
  flyHop,
  planHop,
  startRepair,
  startRun,
  type Run,
} from '../game/sim/index.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { FlightHud } from './FlightHud.tsx';
import { expectTextBudget } from './textBudget.ts';

afterEach(cleanUp);

/** The Hop to the first Body Comms Detected, and its playback, for seed 123's Scout (#189). */
function moonHop() {
  const run = startRun(123, 'scout');
  const moon = firstDetectedBody(run.starSystem);
  const planned = planHop(run, moon.id);
  if (planned.kind !== 'planned') throw new Error('no plan');
  const { flight } = flyHop(run, planned.plan, createRng(1));
  return { run, flight, playback: flightPlayback(run.spacecraft, flight, 'full') };
}

async function hudAt(ms: (playback: FlightPlayback) => number): Promise<HTMLElement> {
  const { run, flight, playback } = moonHop();
  return renderUi(
    <FlightHud
      before={run}
      flight={flight}
      moment={playback.at(ms(playback))}
      after={undefined}
      onContinue={() => undefined}
      onNewRun={() => undefined}
      onLeave={() => undefined}
      fast={false}
      onFastChange={() => undefined}
    />,
  );
}

const cruiseStart = (playback: FlightPlayback): number => playback.cruise?.start ?? NaN;

it('names the shot on screen in a data attribute, for tests', async () => {
  const host = await hudAt(() => 100);
  expect(byTestId(host, 'phase-strip').getAttribute('data-shot')).toBe('takeoff');
  cleanUp();
  const later = await hudAt((playback) => cruiseStart(playback) + 5000);
  expect(byTestId(later, 'phase-strip').getAttribute('data-shot')).toBe('cruise');
});

it('shows the systems check in the Cruise: one light per installed Component, lit in turn, with no text', async () => {
  const { run } = moonHop();
  const installed = run.spacecraft.slots.filter((slot) => slot !== null);
  expect(installed.length).toBeGreaterThan(1);
  // Not before the Cruise.
  const takeoff = await hudAt(() => 100);
  expect(takeoff.querySelector('[data-testid="systems-lights"]')).toBeNull();
  cleanUp();

  // Early in the Cruise only the first lights are on; a little later every one holds steady.
  const early = await hudAt((playback) => cruiseStart(playback) + 1300);
  const lights = byTestId(early, 'systems-lights');
  const items = [...lights.querySelectorAll('[data-light]')];
  expect(items).toHaveLength(installed.length);
  expect(items.map((item) => item.getAttribute('data-light'))).toEqual(
    installed.map((_, i) => (i === 0 ? 'on' : 'off')),
  );
  // Shown, not told: no visible text, the meaning is in each light's accessible name.
  expect(lights.textContent.trim()).toBe('');
  expect(items.every((item) => (item.getAttribute('aria-label') ?? '').length > 0)).toBe(true);
  cleanUp();

  const steady = await hudAt((playback) => cruiseStart(playback) + 20_000);
  const all = [...byTestId(steady, 'systems-lights').querySelectorAll('[data-light]')];
  expect(all.map((item) => item.getAttribute('data-light'))).toEqual(installed.map(() => 'on'));
  // It sits beside the route inset, clear of every other panel.
  const box = byTestId(steady, 'systems-lights').getBoundingClientRect();
  const inset = byTestId(steady, 'route-inset').getBoundingClientRect();
  expect(Math.abs(box.top - inset.top)).toBeLessThan(inset.height);
  for (const id of ['route-inset', 'flight-log', 'phase-strip']) {
    const other = byTestId(steady, id).getBoundingClientRect();
    const apart =
      box.right <= other.left ||
      other.right <= box.left ||
      box.bottom <= other.top ||
      other.bottom <= box.top;
    expect(apart, id).toBe(true);
  }
});

// The route inset is 70 px wide for each name, so the longest names (up to 21 characters with an epithet) are cut off with
// an ellipsis. The full name must still be there for the pointer (title) and for assistive technology.
it('gives the clipped route names of the longest-named Bodies their full name', async () => {
  const run = startRun(123, 'scout');
  const [fromName, toName] = ['Praespraethaen Prime', 'Thirthiothux Minor'];
  // From the Starting Moon to the first Body Comms Detected, both renamed.
  const from = run.starSystem.startingMoonId;
  const moon = firstDetectedBody(run.starSystem);
  const rename = <B extends { readonly id: string; readonly name: string }>(body: B): B =>
    body.id === from
      ? { ...body, name: fromName }
      : body.id === moon.id
        ? { ...body, name: toName }
        : body;
  const planets = run.starSystem.planets.map((planet) => ({
    ...rename(planet),
    moons: planet.moons.map(rename),
  }));
  const named = { ...run, starSystem: { ...run.starSystem, planets } };
  const planned = planHop(named, moon.id);
  if (planned.kind !== 'planned') throw new Error('no plan');
  const { flight } = flyHop(named, planned.plan, createRng(1));
  const host = await renderUi(
    <FlightHud
      before={named}
      flight={flight}
      moment={undefined}
      after={undefined}
      onContinue={() => undefined}
      onNewRun={() => undefined}
      onLeave={() => undefined}
      fast={false}
      onFastChange={() => undefined}
    />,
  );
  const inset = byTestId(host, 'route-inset');
  const names = [...inset.querySelectorAll<HTMLElement>('.route-inset__name')];
  expect(names.map((n) => n.textContent)).toEqual([fromName, toName]);
  expect(names.map((n) => n.title)).toEqual([fromName, toName]);
  // The title only helps if the pointer reaches the name: the stage's UI layer ignores the pointer.
  for (const name of names) {
    expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
    const box = name.getBoundingClientRect();
    expect(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)).toBe(
      name,
    );
  }
  // The progress bar's accessible name already carries both in full.
  expect(inset.querySelector('[role="progressbar"]')?.getAttribute('aria-valuetext')).toContain(
    `${fromName} to ${toName}`,
  );
});

it('shows a Fuel tank in the Cruise that drains through the boost, and none in the Takeoff', async () => {
  const takeoff = await hudAt(() => 100);
  expect(takeoff.querySelector('[data-testid="cruise-fuel-gauge"]')).toBeNull();
  cleanUp();
  const share = (host: HTMLElement): number =>
    Number(byTestId(host, 'cruise-fuel-gauge-fill').getAttribute('data-share'));
  const start = await hudAt((playback) => cruiseStart(playback) + 1);
  const full = share(start);
  expect(byTestId(start, 'cruise-fuel-gauge').getAttribute('role')).toBe('meter');
  cleanUp();
  const later = await hudAt((playback) => cruiseStart(playback) + 30_000);
  expect(share(later)).toBeLessThan(full);
  expect(share(later)).toBeGreaterThan(0);
});

const drainedAt = (host: HTMLElement): number =>
  Number(byTestId(host, 'dv-bar').getAttribute('data-drained') ?? 0);

it('drains the Δv bar in step with the Burns, and ticks each Burn once it is flown', async () => {
  const takeoff = await hudAt(() => 100);
  const atLaunch = drainedAt(takeoff);
  expect(takeoff.querySelectorAll('.dv-bar__tick')).toHaveLength(0);
  cleanUp();
  const cruise = await hudAt((playback) => cruiseStart(playback) + 1);
  // Takeoff is flown: its estimate tick is on the bar, and the bar has drained by its cost.
  expect(cruise.querySelectorAll('.dv-bar__tick')).toHaveLength(1);
  const afterTakeoff = drainedAt(cruise);
  expect(afterTakeoff).toBeGreaterThan(atLaunch);
  cleanUp();
  const deep = await hudAt((playback) => cruiseStart(playback) + 30_000);
  const midway = drainedAt(deep);
  expect(midway).toBeGreaterThan(afterTakeoff);
  cleanUp();
  const last = await hudAt((playback) => playback.duration);
  expect(last.querySelectorAll('.dv-bar__tick')).toHaveLength(3);
  expect(drainedAt(last)).toBeGreaterThan(midway);
  expect(byTestId(last, 'dv-bar').getAttribute('aria-label')).toContain('km/s');
});

it('keeps the exact table behind "Tell me more"', async () => {
  const host = await hudAt((playback) => cruiseStart(playback) + 1);
  const log = byTestId(host, 'flight-log');
  const toggle = [...log.querySelectorAll('button')].find((b) => b.textContent === 'Tell me more');
  if (!toggle) throw new Error('no Tell me more');
  const table = log.querySelector('table');
  expect(table?.checkVisibility()).toBe(false);
  toggle.focus();
  await userEvent.keyboard('{Enter}');
  expect(table?.checkVisibility()).toBe(true);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  const takeoff = [...log.querySelectorAll('tbody tr')].find((r) =>
    r.textContent.startsWith('Takeoff'),
  );
  expect(takeoff?.textContent).toMatch(/km\/s.*%/);
});

it('holds the text budget in every panel, with the table closed', async () => {
  const host = await hudAt((playback) => cruiseStart(playback) + 1300);
  for (const id of ['flight-log', 'phase-strip', 'route-inset', 'systems-lights']) {
    expectTextBudget(byTestId(host, id));
  }
});

it('fits the 640x360 stage with no panel over another, the table open or not', async () => {
  const host = await hudAt((playback) => cruiseStart(playback) + 1300);
  const log = byTestId(host, 'flight-log');
  const toggle = [...log.querySelectorAll('button')].find((b) => b.textContent === 'Tell me more');
  const ids = ['flight-log', 'phase-strip', 'route-inset', 'systems-lights'];
  const check = (): void => {
    const boxes = ids.map((id) => [id, byTestId(host, id).getBoundingClientRect()] as const);
    const extra = host.querySelector('.cruise-fuel')?.getBoundingClientRect();
    const all = extra ? [...boxes, ['cruise-fuel', extra] as const] : boxes;
    const origin = host.getBoundingClientRect();
    for (const [id, box] of all) {
      expect(box.left, id).toBeGreaterThanOrEqual(origin.left);
      expect(box.top, id).toBeGreaterThanOrEqual(origin.top);
      expect(box.right, id).toBeLessThanOrEqual(origin.left + 640);
      expect(box.bottom, id).toBeLessThanOrEqual(origin.top + 360);
    }
    for (const [i, [idA, a]] of all.entries()) {
      for (const [idB, b] of all.slice(i + 1)) {
        const apart =
          a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        expect(apart, `${idA} / ${idB}`).toBe(true);
      }
    }
  };
  check();
  toggle?.focus();
  await userEvent.keyboard('{Enter}');
  const table = log.querySelector('.flight-log__details')?.getBoundingClientRect();
  expect(table?.top).toBeGreaterThanOrEqual(host.getBoundingClientRect().top);
  // The open table rises from the panel, clear of the phase strip at the top.
  expect(table?.bottom).toBeLessThanOrEqual(log.getBoundingClientRect().top);
});

it('a Damaged Component lights red, says so in its name, and Enter starts its Repair, then Rushes it (#250)', async () => {
  const run = startRun(123, 'scout');
  const moon = firstDetectedBody(run.starSystem);
  const begun = beginHop(run, moon.id, { schedule: [{ kind: 'fuel-leak', tick: 100, slot: 1 }] });
  if (begun.kind !== 'cruising') throw new Error('Expected a Cruise');
  const struck = advanceCruise(begun.run, 100);
  if (struck.kind !== 'cruising') throw new Error('Expected to be cruising');
  const untouched = advanceCruise(begun.run, 1_200);
  if (untouched.kind !== 'flown') throw new Error('Expected a flight');
  const playback = flightPlayback(run.spacecraft, untouched.flight, 'full');
  const asked: string[] = [];
  const offs = [
    EventBus.on('repair-requested', (slot) => asked.push(`repair ${String(slot)}`)),
    EventBus.on('rush-requested', (slot) => asked.push(`rush ${String(slot)}`)),
  ];
  const hud = (live: Run) => (
    <FlightHud
      before={run}
      flight={untouched.flight}
      moment={playback.at(cruiseStart(playback) + 20_000)}
      after={undefined}
      onContinue={() => undefined}
      onNewRun={() => undefined}
      onLeave={() => undefined}
      fast={false}
      onFastChange={() => undefined}
      live={live}
    />
  );
  const host = await renderUi(hud(struck.run));
  const lights = byTestId(host, 'systems-lights');
  // Shown, not told: still no visible text, the words are in the light's name.
  expect(lights.textContent.trim()).toBe('');
  const light = lights.querySelector<HTMLButtonElement>('button[data-light="damaged"]');
  if (!light) throw new Error('Expected a red light');
  expect(light.getAttribute('aria-label')).toBe('Fuel Tank 1: Damaged, leaking Fuel. Repair, 30 s');
  light.focus();
  await userEvent.keyboard('{Enter}');
  expect(asked).toEqual(['repair 1']);
  cleanUp();

  const started = startRepair(struck.run, 1);
  if (started.kind !== 'repairing') throw new Error('Expected a Repair');
  const again = await renderUi(hud(started.run));
  const ring = again.querySelector<HTMLButtonElement>('button[data-light="repairing"]');
  if (!ring) throw new Error('Expected the Repair ring');
  expect(ring.getAttribute('aria-label')).toMatch(/Rush for 6 Materials$/);
  ring.focus();
  await userEvent.keyboard('{Enter}');
  expect(asked).toEqual(['repair 1', 'rush 1']);
  for (const off of offs) off();
});

// #344: past the Cruise (the Landing, the report), the bar keeps the Scrap the Debris field gave.
it('keeps the Scrap the Cruise earned on the top bar once the Cruise is over', async () => {
  const { run, flight, playback } = moonHop();
  expect(run.scrap).toBe(0);
  const host = await renderUi(
    <FlightHud
      before={run}
      flight={flight}
      moment={playback.at(playback.duration - 100)}
      after={undefined}
      onContinue={() => undefined}
      onNewRun={() => undefined}
      onLeave={() => undefined}
      fast={false}
      onFastChange={() => undefined}
      live={undefined}
      cruised={{ ...run, scrap: 3 }}
    />,
  );
  expect(byTestId(host, 'scrap').getAttribute('aria-label')).toBe('Scrap 3');
});
