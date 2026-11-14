import { formatBuildLabel } from '../game/lib/buildLabel.ts';
import { TITLE_PANEL_HEIGHT as PANEL_HEIGHT } from '../game/lib/titleLayout.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';

const PANEL_WIDTH = 176;
const BUTTON_WIDTH = 144;

/** The title menu's buttons, so a screen can hand focus back to the one that opened it. */
export type TitleButton = 'new-run' | 'about' | 'credits';

interface TitleMenuProps {
  /** A New Run was chosen and the game is moving to it. */
  starting: boolean;
  onNewRun: () => void;
  onAbout: () => void;
  onCredits: () => void;
  /** Put keyboard focus on a button, e.g. when coming back from the screen it opened. */
  focus?: TitleButton | undefined;
}

/** Title screen panels: the logo, the New Run, About and Credits actions and the build label. */
export function TitleMenu({ starting, onNewRun, onAbout, onCredits, focus }: TitleMenuProps) {
  return (
    <section className="title-menu" aria-labelledby="title-logo">
      <h1 id="title-logo" className="title-menu__logo">
        Heliopause
      </h1>
      <p className="title-menu__tagline">Escape the Star System, one Hop at a time.</p>
      <div className="title-menu__panel" style={{ width: PANEL_WIDTH, height: PANEL_HEIGHT }}>
        <KitFrame frame="panel_metal" width={PANEL_WIDTH} height={PANEL_HEIGHT} />
        <KitButton
          variant="primary"
          width={BUTTON_WIDTH}
          className="title-menu__new-run"
          disabled={starting}
          autoFocus={focus === 'new-run'}
          onClick={onNewRun}
        >
          New Run
        </KitButton>
        <p className="title-menu__hint">Every Run is a new Star System.</p>
        <KitButton
          width={BUTTON_WIDTH}
          className="title-menu__about"
          disabled={starting}
          autoFocus={focus === 'about'}
          onClick={onAbout}
        >
          About
        </KitButton>
        <KitButton
          width={BUTTON_WIDTH}
          className="title-menu__credits"
          disabled={starting}
          autoFocus={focus === 'credits'}
          onClick={onCredits}
        >
          Credits
        </KitButton>
      </div>
      <p className="hud-tag title-menu__build">{formatBuildLabel(BUILD_INFO)}</p>
    </section>
  );
}
