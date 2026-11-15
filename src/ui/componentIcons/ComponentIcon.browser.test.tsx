import { afterEach, expect, it } from 'vitest';
import { cleanUp, renderUi } from '../browserTestKit.tsx';
import { ComponentIcon } from './ComponentIcon.tsx';
import { COMPONENT_ICON_KINDS, COMPONENT_ICON_NAMES } from './componentIconSet.ts';

afterEach(cleanUp);

it('draws every Component icon at 16x16 with its name as the accessible name', async () => {
  const host = await renderUi(
    <>
      {COMPONENT_ICON_KINDS.map((kind) => (
        <ComponentIcon key={kind} kind={kind} />
      ))}
    </>,
  );
  for (const kind of COMPONENT_ICON_KINDS) {
    const icon = host.querySelector<SVGElement | HTMLImageElement>(
      `[data-component-icon="${kind}"]`,
    );
    if (!icon) throw new Error(kind);
    // The final art is an <img> named by its alt; the stand-in is an <svg> named by its aria-label.
    expect(icon.getAttribute('alt') ?? icon.getAttribute('aria-label')).toBe(
      COMPONENT_ICON_NAMES[kind],
    );
    const box = icon.getBoundingClientRect();
    expect([box.width, box.height]).toEqual([16, 16]);
  }
});
