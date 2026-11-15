import { formatBuildLabel } from '../game/lib/buildLabel.ts';
import { TITLE_PANEL_HEIGHT as PANEL_HEIGHT } from '../game/lib/titleLayout.ts';
import type { Score } from '../game/sim/index.ts';
import { formatScore } from './endOfRunView.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import { MusicControls } from './MusicControls.tsx';

const PANEL_WIDTH = 192;
const BUTTON_WIDTH = 160;

/** The title menu's buttons, so a screen can hand focus back to the one that opened it. */
export type TitleButton = 'new-run' | 'daily' | 'how-to-play' | 'about' | 'credits';

interface TitleMenuProps {
  /** A New Run was chosen and the game is moving to it. */
  starting: boolean;
  onNewRun: () => void;
  /** Start today's Daily Star System. */
  onDaily: () => void;
  onHowToPlay: () => void;
  onAbout: () => void;
  onCredits: () => void;
  /** The Best Score remembered on this device; `undefined` before any Run has ended. */
  best?: Score | undefined;
  /** Today's UTC date, `YYYY-MM-DD`, the day the Daily line speaks about. */
  today: string;
  /** The Daily Best for today; `undefined` is "not played yet". */
  dailyBest?: Score | undefined;
  /** Put keyboard focus on a button, e.g. when coming back from the screen it opened. */
  focus?: TitleButton | undefined;
}

/** Title screen panels: the logo, the New Run, Daily, How to play, About and Credits actions and the build label. */
export function TitleMenu({
  starting,
  onNewRun,
  onDaily,
  onHowToPlay,
  onAbout,
  onCredits,
  best,
  today,
  dailyBest,
  focus,
}: TitleMenuProps) {
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
        <KitButton
          width={BUTTON_WIDTH}
          className="title-menu__daily"
          disabled={starting}
          autoFocus={focus === 'daily'}
          onClick={onDaily}
        >
          Daily Star System
        </KitButton>
        <KitButton
          width={BUTTON_WIDTH}
          className="title-menu__how-to-play"
          disabled={starting}
          autoFocus={focus === 'how-to-play'}
          onClick={onHowToPlay}
        >
          How to play
        </KitButton>
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
          Credits &amp; References
        </KitButton>
      </div>
      <p className="title-menu__best" data-testid="title-best-score">
        Best Score: {best === undefined ? 'none yet' : formatScore(best)}
      </p>
      <p className="title-menu__daily-best" data-testid="title-daily-best">
        Daily Star System {today} UTC:{' '}
        {dailyBest === undefined ? 'not played yet' : formatScore(dailyBest)}
      </p>
      <MusicControls className="music-controls--title" />
      <p className="hud-tag title-menu__build">{formatBuildLabel(BUILD_INFO)}</p>
    </section>
  );
}
