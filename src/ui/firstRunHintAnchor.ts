import type { HintId } from '../game/lib/firstRunHints.ts';

/** Where a hint's arrow points: a DOM element, and which side of it the callout sits. */
export interface HintAnchor {
  readonly selector: string;
  readonly side: 'above' | 'below';
}

const NAV_CHART_BUTTON: HintAnchor = { selector: '.landed-nav-button button', side: 'above' };

/**
 * The one place that says what each hint points at. The Heliopause hint points at the Nav Chart
 * button until the big chart (#193) exposes the Heliopause's mark: then only this entry changes.
 */
export function anchorFor(id: HintId): HintAnchor {
  switch (id) {
    case 'first-landing':
    case 'heliopause-found':
      return NAV_CHART_BUTTON;
    case 'first-hop-plan':
      return { selector: '[data-testid="hop-launch"]', side: 'above' };
    case 'first-gathering':
      return { selector: '.top-bar', side: 'below' };
    case 'first-build':
      return { selector: '.landed-spacecraft-button button', side: 'above' };
  }
}
