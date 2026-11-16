import type { HintId } from '../game/lib/firstRunHints.ts';

/** Where a hint's arrow points: a DOM element, and which side of it the callout sits. */
export interface HintAnchor {
  readonly selector: string;
  /** Set when the arrow points at a spot on the stage (640x360 pixels) instead of a DOM element. */
  readonly point?: { readonly x: number; readonly y: number };
  readonly side: 'above' | 'below';
}

const NAV_CHART_BUTTON: HintAnchor = { selector: '.landed-nav-button button', side: 'above' };

/**
 * The one place that says what each hint points at. The Heliopause hint points at the
 * Heliopause's mark when the open chart has it on screen (`heliopauseSpot`, in stage pixels), and at the
 * Nav Chart button otherwise.
 */
export function anchorFor(id: HintId, heliopauseSpot?: { x: number; y: number }): HintAnchor {
  switch (id) {
    case 'heliopause-found':
      return heliopauseSpot
        ? { selector: '.game-ui', point: heliopauseSpot, side: 'below' }
        : NAV_CHART_BUTTON;
    case 'first-landing':
      return NAV_CHART_BUTTON;
    case 'first-hop-plan':
      return { selector: '[data-testid="hop-launch"]', side: 'above' };
    case 'first-gathering':
      return { selector: '.top-bar', side: 'below' };
    case 'first-science':
      return { selector: '[data-testid="science"]', side: 'below' };
    case 'first-build':
      return { selector: '.landed-spacecraft-button button', side: 'above' };
  }
}
