import { GAME_HEIGHT, GAME_WIDTH } from './game/main.ts';
import { PhaserGame } from './PhaserGame.tsx';
import { GameUI } from './ui/GameUI.tsx';
import { paletteCssVariables } from './ui/kit/palette.ts';
import { useStageScale } from './ui/useStageScale.ts';

const paletteVariables = paletteCssVariables();

/**
 * The stage: the Phaser canvas and the React UI over it share one 640×360 box, scaled up to fit
 * the window. Phaser scales its canvas into the box itself; the UI layer is scaled with a CSS
 * transform, so both use native-pixel coordinates.
 */
export function App() {
  const scale = useStageScale();
  return (
    <div id="app" style={paletteVariables}>
      <div className="stage" style={{ width: GAME_WIDTH * scale, height: GAME_HEIGHT * scale }}>
        <PhaserGame />
        <div className="stage__ui" style={{ transform: `scale(${scale})` }}>
          <GameUI />
        </div>
      </div>
    </div>
  );
}
