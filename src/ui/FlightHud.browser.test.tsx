import { afterEach, expect, it } from 'vitest';
import { createRng } from '../game/lib/rng.ts';
import { flightPlayback, type FlightPlayback } from '../game/scenes/flightPlayback.ts';
import { flyHop, homePlanet, planHop, startRun } from '../game/sim/index.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { FlightHud } from './FlightHud.tsx';

afterEach(cleanUp);

/** The Hop to the Home Planet's Moon, and its playback, for seed 123's Scout. */
function moonHop() {
  const run = startRun(123, 'scout');
  const moon = homePlanet(run.starSystem).moons[0];
  if (!moon) throw new Error('no moon');
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
  for (const id of ['route-inset', 'flight-log', 'fuel-gauge', 'phase-strip']) {
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
  const home = homePlanet(run.starSystem);
  const moon = home.moons[0];
  if (!moon) throw new Error('no moon');
  const planets = run.starSystem.planets.map((planet) =>
    planet.id === home.id
      ? {
          ...planet,
          name: fromName,
          moons: planet.moons.map((m) => (m.id === moon.id ? { ...m, name: toName } : m)),
        }
      : planet,
  );
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
