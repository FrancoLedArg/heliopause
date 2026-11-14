import { useEffect, useState } from 'react';
import { EventBus } from '../game/EventBus.ts';
import { chooseRunSeed } from '../game/lib/runSeed.ts';
import type { Run, Seed } from '../game/sim/index.ts';
import { SceneKey } from '../game/scenes/keys.ts';
import type { ChartState } from '../game/scenes/navChartView.ts';
import { LandedPanels } from './LandedPanels.tsx';
import { NavChartPanel } from './NavChartPanel.tsx';
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

  // What the Nav Chart shows; `undefined` while it is closed.
  const [chart, setChart] = useState<ChartState | undefined>(undefined);
  useEffect(() => EventBus.on('nav-chart-state', setChart), []);

  // M opens the Nav Chart from the Landed view (the chart's own keys close it).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'm' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (scene !== SceneKey.Landed || chart !== undefined || event.repeat) return;
      event.preventDefault();
      EventBus.emit('nav-chart-open-requested');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [scene, chart]);

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
      {scene === SceneKey.Landed && run !== undefined && (
        <LandedPanels run={run} chartOpen={chart !== undefined} />
      )}
      {scene === SceneKey.Landed && run !== undefined && chart !== undefined && (
        <NavChartPanel run={run} state={chart} />
      )}
      <p className="hud-tag ai-label">AI-generated art</p>
    </div>
  );
}
