import { useEffect, useRef, useState } from 'react';
import { EventBus } from '../game/EventBus.ts';
import { chooseUrlChassis } from '../game/lib/runChassis.ts';
import { chooseRunSeed } from '../game/lib/runSeed.ts';
import type { FlightMoment } from '../game/scenes/flightPlayback.ts';
import type { ChassisId, HopFlight, Run, Seed } from '../game/sim/index.ts';
import { SceneKey } from '../game/scenes/keys.ts';
import type { ChartState } from '../game/scenes/navChartView.ts';
import { ChassisPicker } from './ChassisPicker.tsx';
import { FlightHud } from './FlightHud.tsx';
import { LandedPanels } from './LandedPanels.tsx';
import { AboutPanel, CreditsPanel } from './InfoPanels.tsx';
import { NavChartPanel } from './NavChartPanel.tsx';
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
  // Whether the in-Run Menu is open; while it is, it is the topmost overlay and takes every key.
  const [menuOpen, setMenuOpen] = useState(false);
  // The Hop being played back: the Run at Launch, the flight, where the playback is, and whether it failed.
  const [flight, setFlight] = useState<
    { before: Run; flight: HopFlight; moment?: FlightMoment; failed: boolean } | undefined
  >(undefined);

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
          setMenuOpen(false);
          setFlight(undefined);
          setFocus(leftRun.current ? 'new-run' : undefined);
          leftRun.current = false;
        }
      }),
    [],
  );

  useEffect(() => EventBus.on('run-started', setRun), []);

  useEffect(() => {
    const offs = [
      EventBus.on('hop-flight-started', (before, hop) => {
        setFlight({ before, flight: hop, failed: false });
      }),
      EventBus.on('hop-flight-moment', (moment) => {
        setFlight((now) => now && { ...now, moment });
      }),
      EventBus.on('hop-failed', () => {
        setFlight((now) => now && { ...now, failed: true });
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);

  const leaveRun = (): void => {
    leftRun.current = true;
    EventBus.emit('leave-run-requested');
  };

  // What the Nav Chart shows; `undefined` while it is closed.
  const [chart, setChart] = useState<ChartState | undefined>(undefined);
  useEffect(() => EventBus.on('nav-chart-state', setChart), []);

  // M opens the Nav Chart from the Landed view (the chart's own keys close it).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'm' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (scene !== SceneKey.Landed || chart !== undefined || menuOpen || event.repeat) return;
      event.preventDefault();
      EventBus.emit('nav-chart-open-requested');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [scene, chart, menuOpen]);

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
      {scene === SceneKey.Landed && run !== undefined && (
        <LandedPanels run={run} chartOpen={chart !== undefined} />
      )}
      {scene === SceneKey.Landed && run !== undefined && chart !== undefined && (
        <NavChartPanel run={run} state={chart} />
      )}
      {scene === SceneKey.Landed && run !== undefined && (
        <RunMenu open={menuOpen} onOpenChange={setMenuOpen} onLeave={leaveRun} />
      )}
      {scene === SceneKey.Flight && flight !== undefined && (
        <FlightHud
          before={flight.before}
          flight={flight.flight}
          moment={flight.moment}
          failed={flight.failed}
          onLeave={leaveRun}
        />
      )}
      <p className="hud-tag ai-label">AI-generated art</p>
    </div>
  );
}
