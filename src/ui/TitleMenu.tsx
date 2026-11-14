import { formatBuildLabel } from '../game/lib/buildLabel.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';

const PANEL_WIDTH = 176;
const PANEL_HEIGHT = 66;
const BUTTON_WIDTH = 144;

interface TitleMenuProps {
  /** A New Run was chosen and the game is moving to it. */
  starting: boolean;
  onNewRun: () => void;
  /** Put keyboard focus on New Run, e.g. when coming back from the Chassis picker. */
  focusNewRun?: boolean;
}

/** Title screen panels: the logo, the New Run action and the build label. */
export function TitleMenu({ starting, onNewRun, focusNewRun }: TitleMenuProps) {
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
          autoFocus={focusNewRun}
          onClick={onNewRun}
        >
          New Run
        </KitButton>
        <p className="title-menu__hint">Every Run is a new Star System.</p>
      </div>
      <p className="hud-tag title-menu__build">{formatBuildLabel(BUILD_INFO)}</p>
    </section>
  );
}
