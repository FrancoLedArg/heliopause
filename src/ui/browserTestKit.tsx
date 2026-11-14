import '@fontsource/silkscreen/400.css';
import '@fontsource/vt323/400.css';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import '../style.css';

let root: Root | undefined;
let host: HTMLElement | undefined;

/**
 * Renders `ui` at native scale inside the stage's UI layer, once the pixel fonts have loaded, so layout
 * measurements match what the player sees. Pair with `cleanUp` in `afterEach`.
 */
export async function renderUi(ui: ReactNode): Promise<HTMLElement> {
  host = document.createElement('div');
  host.className = 'stage__ui';
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(<div className="game-ui">{ui}</div>);
  });
  await document.fonts.load('14px VT323');
  await document.fonts.load('8px Silkscreen');
  await document.fonts.load('16px Silkscreen');
  await document.fonts.ready;
  return host;
}

/** The element for a `data-testid`, or a failure naming it. */
export function byTestId(within: HTMLElement, id: string): HTMLElement {
  const found = within.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!found) throw new Error(`no element with data-testid ${id}`);
  return found;
}

export function cleanUp(): void {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  root = host = undefined;
}
