import { useEffect, useState } from 'react';
import { EventBus } from '../game/EventBus.ts';
import { chooseRunSeed } from '../game/lib/runSeed.ts';
import type { Run, Seed } from '../game/sim/index.ts';
import { SceneKey } from '../game/scenes/keys.ts';
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

  useEffect(
    () =>
      EventBus.on('scene-ready', (key) => {
        setScene(key);
        if (key === SceneKey.Title) {
          setRunSeed(undefined);
          setRun(undefined);
        }
      }),
    [],
  );

  useEffect(() => EventBus.on('run-started', setRun), []);

  const startNewRun = (): void => {
    const seed = chooseRunSeed(window.location.search, Math.random);
    setRunSeed(seed);
    EventBus.emit('new-run-requested', seed);
  };

  return (
    <div className="game-ui" data-testid="game-ui" data-run-seed={runSeed}>
      {scene === SceneKey.Title && (
        <TitleMenu starting={runSeed !== undefined} onNewRun={startNewRun} />
      )}
      {scene === SceneKey.Landed && run !== undefined && <LandedPanels run={run} />}
      <p className="hud-tag ai-label">AI-generated art</p>
    </div>
  );
}
