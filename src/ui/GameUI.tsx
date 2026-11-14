import { useEffect, useState } from 'react';
import { EventBus } from '../game/EventBus.ts';
import { chooseUrlChassis } from '../game/lib/runChassis.ts';
import { chooseRunSeed } from '../game/lib/runSeed.ts';
import type { ChassisId, Run, Seed } from '../game/sim/index.ts';
import { SceneKey } from '../game/scenes/keys.ts';
import { ChassisPicker } from './ChassisPicker.tsx';
import { LandedPanels } from './LandedPanels.tsx';
import { TitleMenu } from './TitleMenu.tsx';

/**
 * The DOM layer over the canvas, in native 640×360 pixels. Shows the panels for whichever scene
 * Phaser reports on screen, plus the permanent AI-art watermark (ADR 0004).
 */
export function GameUI() {
  const [scene, setScene] = useState<SceneKey | undefined>(undefined);
  const [runSeed, setRunSeed] = useState<Seed | undefined>(undefined);
  const [run, setRun] = useState<Run | undefined>(undefined);
  const [picking, setPicking] = useState(false);

  useEffect(
    () =>
      EventBus.on('scene-ready', (key) => {
        setScene(key);
        if (key === SceneKey.Title) {
          setRunSeed(undefined);
          setRun(undefined);
          setPicking(false);
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

  return (
    <div className="game-ui" data-testid="game-ui" data-run-seed={runSeed}>
      {scene === SceneKey.Title && !picking && (
        <TitleMenu starting={runSeed !== undefined} onNewRun={startNewRun} />
      )}
      {scene === SceneKey.Title && picking && (
        <ChassisPicker
          launching={runSeed !== undefined}
          onLaunch={launch}
          onBack={() => {
            setPicking(false);
          }}
        />
      )}
      {scene === SceneKey.Landed && run !== undefined && <LandedPanels run={run} />}
      <p className="hud-tag ai-label">AI-generated art</p>
    </div>
  );
}
