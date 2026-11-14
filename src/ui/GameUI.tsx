import { useEffect, useState } from 'react';
import { EventBus } from '../game/EventBus.ts';
import { chooseUrlChassis } from '../game/lib/runChassis.ts';
import { chooseRunSeed } from '../game/lib/runSeed.ts';
import type { ChassisId, Run, Seed } from '../game/sim/index.ts';
import { SceneKey } from '../game/scenes/keys.ts';
import type { ChartState } from '../game/scenes/navChartView.ts';
import { ChassisPicker } from './ChassisPicker.tsx';
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
  const [picking, setPicking] = useState(false);
  const [cameBack, setCameBack] = useState(false);

  useEffect(
    () =>
      EventBus.on('scene-ready', (key) => {
        setScene(key);
        if (key === SceneKey.Title) {
          setRunSeed(undefined);
          setRun(undefined);
          setPicking(false);
          setCameBack(false);
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
        <TitleMenu starting={runSeed !== undefined} onNewRun={startNewRun} focusNewRun={cameBack} />
      )}
      {scene === SceneKey.Title && picking && (
        <ChassisPicker
          launching={runSeed !== undefined}
          onLaunch={launch}
          onBack={() => {
            setPicking(false);
            setCameBack(true);
          }}
        />
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
