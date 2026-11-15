import { afterEach, expect, it } from 'vitest';
import { createRng } from '../game/lib/rng.ts';
import { flyHop, homePlanet, planHop, startRun } from '../game/sim/index.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { FlightHud } from './FlightHud.tsx';

afterEach(cleanUp);

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
      ended={undefined}
      recorded={undefined}
      reportDone={false}
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
