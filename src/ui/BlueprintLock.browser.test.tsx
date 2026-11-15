import { afterEach, expect, it } from 'vitest';
import { materials, startRun } from '../game/sim/index.ts';
import { BlueprintUnlocked } from './BlueprintLock.tsx';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { SpacecraftPanel } from './SpacecraftPanel.tsx';

afterEach(cleanUp);

const rowOf = (host: HTMLElement, name: string): HTMLElement => {
  const found = [...host.querySelectorAll<HTMLElement>('[data-testid="component-row"]')].find((r) =>
    r.textContent.includes(name),
  );
  if (!found) throw new Error(`no row ${name}`);
  return found;
};

it('a locked blueprint row shows a lock, a Science bar and only the Science still needed, inside its row', async () => {
  const run = { ...startRun(2026, 'scout', 10), materials: materials(500) };
  const host = await renderUi(<SpacecraftPanel run={run} onClose={() => undefined} />);
  const lab = rowOf(host, 'Sample lab');
  const bar = byTestId(lab, 'blueprint-progress');
  expect(bar.querySelector('.lock-icon')).not.toBeNull();
  expect(bar.textContent).toBe('30');
  const fill = bar.querySelector<HTMLElement>('.blueprint-progress__fill');
  expect(fill?.style.width).toBe('25%');
  // The words are there for assistive technology, in the Install button's description.
  expect(byTestId(lab, 'component-effect').textContent).toContain('30 more Science');
  const rowBox = lab.getBoundingClientRect();
  const barBox = bar.getBoundingClientRect();
  expect(barBox.right).toBeLessThanOrEqual(rowBox.right);
  expect(barBox.bottom).toBeLessThanOrEqual(rowBox.bottom);
  // An unlocked Component shows its effect, not a bar.
  expect(rowOf(host, 'Camera').querySelector('[data-testid="blueprint-progress"]')).toBeNull();
});

it('the unlock moment shows an open lock and the blueprint, as a status', async () => {
  const host = await renderUi(
    <BlueprintUnlocked blueprints={['sample-lab']} onDone={() => undefined} />,
  );
  const moment = byTestId(host, 'blueprint-unlocked');
  expect(moment.getAttribute('role')).toBe('status');
  expect(moment.textContent).toBe('Sample lab unlocked');
  expect(moment.querySelector('.lock-icon')).not.toBeNull();
});
