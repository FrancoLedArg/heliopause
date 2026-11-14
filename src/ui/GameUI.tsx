import { useEffect, useRef, useState } from 'react';
import { EventBus } from '../game/EventBus.ts';
import { chooseUrlChassis } from '../game/lib/runChassis.ts';
import { chooseRunSeed } from '../game/lib/runSeed.ts';
import type { ChassisId, Run, Seed } from '../game/sim/index.ts';
import { SceneKey } from '../game/scenes/keys.ts';
import { ChassisPicker } from './ChassisPicker.tsx';
import { LandedPanels } from './LandedPanels.tsx';
import { AboutPanel, CreditsPanel } from './InfoPanels.tsx';
import { RunMenu } from './RunMenu.tsx';
import { TitleMenu, type TitleButton } from './TitleMenu.tsx';

/**
 * The DOM layer over the canvas, in native 640×360 pixels. Shows the panels for whichever scene
 * Phaser reports on screen, plus the permanent AI-art watermark (ADR 0004).
 */
export function GameUI() {
  const [scene, setScene] = useState<SceneKey | undefined>(undefined);
  const [runSeed, setRunSeed] = useState<Seed | undefined>(undefined);
  const [run, setRun] = useState<Run | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const [info, setInfo] = useState<'about' | 'credits' | undefined>(undefined);
  // The title button to focus when the menu comes back from the screen it opened.
  const [focus, setFocus] = useState<TitleButton | undefined>(undefined);
  // Set when the player leaves a Run, so the title they land on takes focus like after the picker's Back.
  const leftRun = useRef(false);

  useEffect(
    () =>
      EventBus.on('scene-ready', (key) => {
        setScene(key);
        if (key === SceneKey.Title) {
          setRunSeed(undefined);
          setRun(undefined);
          setPicking(false);
          setInfo(undefined);
          setFocus(leftRun.current ? 'new-run' : undefined);
          leftRun.current = false;
        }
      }),
    [],
  );

  useEffect(() => EventBus.on('run-started', setRun), []);

  const launch = (chassisId: ChassisId): void => {
    const seed = chooseRunSeed(window.location.search, Math.random);
    setRunSeed(seed);
    EventBus.emit('new-run-requested', seed, chassisId);
  };

  // A `?chassis=` in the URL makes the choice for the player, so tests and bug reports skip the picker.
  const startNewRun = (): void => {
    const fromUrl = chooseUrlChassis(window.location.search);
    if (fromUrl === undefined) setPicking(true);
    else launch(fromUrl);
  };

  const closeInfo = (): void => {
    setFocus(info);
    setInfo(undefined);
  };

  return (
    <div className="game-ui" data-testid="game-ui" data-run-seed={runSeed}>
      {scene === SceneKey.Title && !picking && info === undefined && (
        <TitleMenu
          starting={runSeed !== undefined}
          onNewRun={startNewRun}
          onAbout={() => {
            setInfo('about');
          }}
          onCredits={() => {
            setInfo('credits');
          }}
          focus={focus}
        />
      )}
      {scene === SceneKey.Title && info === 'about' && <AboutPanel onBack={closeInfo} />}
      {scene === SceneKey.Title && info === 'credits' && <CreditsPanel onBack={closeInfo} />}
      {scene === SceneKey.Title && picking && (
        <ChassisPicker
          launching={runSeed !== undefined}
          onLaunch={launch}
          onBack={() => {
            setPicking(false);
            setFocus('new-run');
          }}
        />
      )}
      {scene === SceneKey.Landed && run !== undefined && <LandedPanels run={run} />}
      {scene === SceneKey.Landed && run !== undefined && (
        <RunMenu
          onLeave={() => {
            leftRun.current = true;
            EventBus.emit('leave-run-requested');
          }}
        />
      )}
      <p className="hud-tag ai-label">AI-generated art</p>
    </div>
  );
}
