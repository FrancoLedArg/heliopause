import { afterEach, expect, it } from 'vitest';
import {
  DISCOVERIES,
  kilograms,
  listBodies,
  materials,
  metersPerSecond,
  startRun,
  type BodyId,
} from '../game/sim/index.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { DiscoveryCard } from './DiscoveryCard.tsx';
import { DiscoveryPips } from './NavChartPanel.tsx';
import { TopBar } from './TopBar.tsx';

afterEach(cleanUp);

const run = startRun(7, 'scout');
const bodyId = (listBodies(run.starSystem)[0]?.id ?? '') as BodyId;

it('shows the name, the surprise and the Science, with the rest behind a closed Tell me more', async () => {
  const host = await renderUi(
    <DiscoveryCard
      reveal={{ kind: 'new', discoveryId: 'river-delta', bodyId, science: 10 }}
      starSystem={run.starSystem}
      waiting={0}
      onContinue={() => undefined}
    />,
  );
  const card = byTestId(host, 'discovery-card');
  expect(card.textContent).toContain(DISCOVERIES['river-delta'].name);
  expect(card.textContent).toContain(DISCOVERIES['river-delta'].fact);
  expect(byTestId(host, 'discovery-card-science').getAttribute('aria-label')).toBe('10 Science');

  const toggle = card.querySelector<HTMLButtonElement>('button[aria-expanded]');
  if (!toggle) throw new Error('no Tell me more');
  const panel = host.querySelector<HTMLElement>(
    `#${CSS.escape(toggle.getAttribute('aria-controls') ?? '')}`,
  );
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(panel?.hidden).toBe(true);
  toggle.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(panel?.hidden).toBe(false);
  expect(panel?.textContent).toContain(DISCOVERIES['river-delta'].place);

  const link = panel?.querySelector('a');
  expect(link?.getAttribute('href')).toBe(DISCOVERIES['river-delta'].source);
  expect(link?.getAttribute('target')).toBe('_blank');
  expect(link?.getAttribute('rel')).toContain('noopener');
});

it('says a repeat was already found here, for no Science', async () => {
  const host = await renderUi(
    <DiscoveryCard
      reveal={{ kind: 'already-found-here', discoveryId: 'river-delta', bodyId }}
      starSystem={run.starSystem}
      waiting={1}
      onContinue={() => undefined}
    />,
  );
  expect(byTestId(host, 'discovery-card-science').getAttribute('aria-label')).toBe(
    'Already found in this Star System: no Science',
  );
  expect(byTestId(host, 'discovery-card').textContent).toContain('Next');
});

it('shows a Surveyed Body’s Discoveries as pips, N of M found in the accessible name', async () => {
  const host = await renderUi(<DiscoveryPips found={1} hidden={2} />);
  const pips = byTestId(host, 'discovery-pips');
  expect(pips.getAttribute('aria-label')).toBe('Discoveries: 1 of 2 found');
  expect(pips.querySelectorAll('.nav-chart__pip')).toHaveLength(2);
  expect(pips.querySelectorAll('.nav-chart__pip--found')).toHaveLength(1);
});

it('shows the Run’s Science in the resource bar', async () => {
  const host = await renderUi(
    <TopBar
      systemNumber={1}
      systemName="Quydril"
      fuel={kilograms(1234)}
      fuelCapacity={kilograms(5000)}
      deltaV={metersPerSecond(9876)}
      materials={materials(100)}
      science={35}
    />,
  );
  const science = byTestId(host, 'science');
  expect(science.getAttribute('aria-label')).toBe('Science 35');
  expect(science.textContent).toBe('35');
});
