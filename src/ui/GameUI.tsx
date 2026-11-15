import { useEffect, useRef, useState } from 'react';
import { EventBus } from '../game/EventBus.ts';
import { chooseUrlChassis } from '../game/lib/runChassis.ts';
import { chooseRunSeed } from '../game/lib/runSeed.ts';
import type { FlightMoment } from '../game/scenes/flightPlayback.ts';
import { readBestScore, recordScore } from '../game/lib/bestScore.ts';
import {
  availableDeltaV,
  score,
  starSystemNumber,
  type ChassisId,
  type HopFlight,
  type Run,
  type Score,
  type Seed,
} from '../game/sim/index.ts';
import { SceneKey } from '../game/scenes/keys.ts';
import type { ChartState } from '../game/scenes/navChartView.ts';
import { ChassisPicker } from './ChassisPicker.tsx';
import { EndOfRun, type RecordedScore } from './EndOfRun.tsx';
import { FlightHud, type FlightAfter } from './FlightHud.tsx';
import { HopReport } from './HopReport.tsx';
import { LandedPanels } from './LandedPanels.tsx';
import { AboutPanel, CreditsPanel } from './InfoPanels.tsx';
import { NavChartPanel } from './NavChartPanel.tsx';
import { SpacecraftPanel } from './SpacecraftPanel.tsx';
import { RunMenu } from './RunMenu.tsx';
import { TitleMenu, type TitleButton } from './TitleMenu.tsx';
import { TopBar } from './TopBar.tsx';

/**
 * The DOM layer over the canvas, in native 640×360 pixels. Shows the panels for whichever scene
 * Phaser reports on screen, plus the permanent AI-art watermark (ADR 0004).
 */
export function GameUI() {
  const [scene, setScene] = useState<SceneKey | undefined>(undefined);
  const [runSeed, setRunSeed] = useState<Seed | undefined>(undefined);
  const [run, setRun] = useState<Run | undefined>(undefined);
  // The Best Score on this device, read each time the title comes up.
  const [bestScore, setBestScore] = useState<Score | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const [info, setInfo] = useState<'about' | 'credits' | undefined>(undefined);
  // The title button to focus when the menu comes back from the screen it opened.
  const [focus, setFocus] = useState<TitleButton | undefined>(undefined);
  // Whether the in-Run Menu is open; while it is, it is the topmost overlay and takes every key.
  const [menuOpen, setMenuOpen] = useState(false);
  // The Hop being played back: the Run at Launch, the flight, where the playback is, and whether it failed.
  const [flight, setFlight] = useState<
    | {
        before: Run;
        flight: HopFlight;
        moment?: FlightMoment;
        /** What follows the playback once it is over. */
        after?: FlightAfter;
      }
    | undefined
  >(undefined);

  // The Run ended as Stranded on the Body the Landed view shows, and its Score as recorded.
  const [stranded, setStranded] = useState<{ run: Run; recorded: RecordedScore } | undefined>(
    undefined,
  );

  // The report of the Hop that just Arrived, shown beside the Landed view of its target until dismissed.
  const [arrival, setArrival] = useState<{ before: Run; flight: HopFlight } | undefined>(undefined);
  // A New Run has been launched and the scene is about to change: the choice is made.
  const [launching, setLaunching] = useState(false);
  // Whether the Spacecraft panel is open over the Landed view.
  const [spacecraftOpen, setSpacecraftOpen] = useState(false);
  // Counts requests for focus on the Landed view's Nav Chart button; 0 when none is pending.
  const [navFocus, setNavFocus] = useState(0);
  // The next Landed view follows a New Run launched from a failure's report.
  const afterFailure = useRef(false);
  // The next Landed view follows the Jump, on the next Star System's Home Planet.
  const afterJump = useRef(false);
  // The panels fade in with the Landed view as it comes up out of the Jump's black.
  const [fadingIn, setFadingIn] = useState(false);

  // Set when the player leaves a Run, so the title they land on takes focus like after the picker's Back.
  const leftRun = useRef(false);

  useEffect(
    () =>
      EventBus.on('scene-ready', (key) => {
        setScene(key);
        if (key === SceneKey.Landed || key === SceneKey.Title) {
          setPicking(false);
          setLaunching(false);
        }
        if (key === SceneKey.Title) {
          setBestScore(readBestScore());
          setRunSeed(undefined);
          setRun(undefined);
          setInfo(undefined);
          setMenuOpen(false);
          setFlight(undefined);
          setNavFocus(0);
          setSpacecraftOpen(false);
          setStranded(undefined);
          setFocus(leftRun.current ? 'new-run' : undefined);
          leftRun.current = false;
        }
      }),
    [],
  );

  useEffect(
    () =>
      EventBus.on('run-started', (started) => {
        setRun(started);
        setArrival(undefined);
        setFlight(undefined);
        setStranded(undefined);
        setFadingIn(afterJump.current);
        // After a New Run from a failure, or the Jump, the way on is the Nav Chart.
        if (afterFailure.current || afterJump.current) {
          afterFailure.current = false;
          afterJump.current = false;
          setNavFocus((n) => n + 1);
        }
      }),
    [],
  );
  // A Component was installed: the same Run with a new loadout. Nothing else about the view changes.
  useEffect(
    () =>
      EventBus.on('run-updated', (updated) => {
        setRun(updated);
      }),
    [],
  );
  useEffect(
    () =>
      EventBus.on('run-stranded', (ended) => {
        // The Run is over: its Score is recorded here, once, as for a failed Hop.
        setStranded({ run: ended, recorded: recordScore(score(ended)) });
        // Stranded on arrival after a Jump: the end comes up out of the Jump's black too.
        setFadingIn(afterJump.current);
        afterJump.current = false;
        setSpacecraftOpen(false);
        setArrival(undefined);
        setFlight(undefined);
      }),
    [],
  );
  useEffect(
    () =>
      EventBus.on('hop-arrived', (before, hop) => {
        setArrival({ before, flight: hop });
      }),
    [],
  );

  useEffect(() => {
    const offs = [
      EventBus.on('hop-flight-started', (before, hop) => {
        setFlight({ before, flight: hop });
      }),
      EventBus.on('hop-flight-moment', (moment) => {
        setFlight((now) => now && { ...now, moment });
      }),
      EventBus.on('hop-failed', (_failed, ended) => {
        // The Run is over: its Score is recorded here, once, whatever the end screen does after.
        const recorded = recordScore(score(ended));
        setFlight(
          (now) =>
            now && { ...now, after: { kind: 'ended', run: ended, recorded, step: 'report' } },
        );
      }),
      EventBus.on('jump-stage', (stage) => {
        // No Score: the Run is not over, it goes on in the next Star System.
        afterJump.current = true;
        setFlight((now) => now && { ...now, after: { kind: 'jumping', stage } });
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
  useEffect(
    () =>
      EventBus.on('nav-chart-state', (state) => {
        setChart(state);
        // Opening the Nav Chart means the player is done with the report.
        if (state !== undefined) setArrival(undefined);
      }),
    [],
  );

  // M opens the Nav Chart from the Landed view (the chart's own keys close it).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'm' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (scene !== SceneKey.Landed || chart !== undefined || menuOpen || arrival !== undefined)
        return;
      if (spacecraftOpen || stranded !== undefined) return;
      if (event.repeat) return;
      event.preventDefault();
      EventBus.emit('nav-chart-open-requested');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [scene, chart, menuOpen, arrival, spacecraftOpen, stranded]);

  const launch = (chassisId: ChassisId): void => {
    // After a Run that was played, a New Run is a different Star System even from a seeded URL.
    const afterRun = scene === SceneKey.Flight || stranded !== undefined;
    const seed = chooseRunSeed(window.location.search, Math.random, afterRun ? runSeed : undefined);
    setRunSeed(seed);
    setLaunching(true);
    afterFailure.current = afterRun;
    // The address bar follows the Run being played, so a reload or a shared link replays this Star System.
    syncUrl(seed, chassisId);
    EventBus.emit('new-run-requested', seed, chassisId);
  };

  // A `?chassis=` in the URL makes the choice for the player, so tests and bug reports skip the picker.
  const startNewRun = (): void => {
    const fromUrl = chooseUrlChassis(window.location.search);
    if (fromUrl === undefined) setPicking(true);
    else launch(fromUrl);
  };

  // Back to the Landed view of the new Body: focus goes to the button that opens the Nav Chart.
  const dismissArrival = (): void => {
    setArrival(undefined);
    setNavFocus((n) => n + 1);
  };

  // Like the Nav Chart, the panel replaces the report: the player is done with it.
  const openSpacecraft = (): void => {
    setArrival(undefined);
    setSpacecraftOpen(true);
  };

  const closeInfo = (): void => {
    setFocus(info);
    setInfo(undefined);
  };

  return (
    <div
      className={fadingIn ? 'game-ui game-ui--after-jump' : 'game-ui'}
      data-testid="game-ui"
      data-run-seed={runSeed}
      onAnimationEnd={() => {
        setFadingIn(false);
      }}
    >
      {scene === SceneKey.Title && !picking && info === undefined && (
        <TitleMenu
          starting={launching}
          onNewRun={startNewRun}
          onAbout={() => {
            setInfo('about');
          }}
          onCredits={() => {
            setInfo('credits');
          }}
          best={bestScore}
          focus={focus}
        />
      )}
      {scene === SceneKey.Title && info === 'about' && <AboutPanel onBack={closeInfo} />}
      {scene === SceneKey.Title && info === 'credits' && <CreditsPanel onBack={closeInfo} />}
      {(scene === SceneKey.Title ||
        (scene === SceneKey.Flight && flight?.after?.kind === 'ended') ||
        (scene === SceneKey.Landed && stranded !== undefined)) &&
        picking && (
          <ChassisPicker
            launching={launching}
            initial={flight?.before.spacecraft.chassisId ?? stranded?.run.spacecraft.chassisId}
            onLaunch={launch}
            onBack={() => {
              setPicking(false);
              setFocus('new-run');
            }}
          />
        )}
      {scene === SceneKey.Landed && stranded !== undefined && !picking && (
        <>
          <TopBar
            systemNumber={starSystemNumber(stranded.run)}
            systemName={stranded.run.starSystem.name}
            fuel={stranded.run.spacecraft.fuelMass}
            deltaV={availableDeltaV(stranded.run.spacecraft)}
            materials={stranded.run.materials}
          />
          <EndOfRun
            run={stranded.run}
            recorded={stranded.recorded}
            onNewRun={startNewRun}
            onLeave={leaveRun}
          />
        </>
      )}
      {scene === SceneKey.Landed && run !== undefined && stranded === undefined && (
        <LandedPanels
          run={run}
          chartOpen={chart !== undefined}
          spacecraftOpen={spacecraftOpen}
          onOpenSpacecraft={openSpacecraft}
          focusRequest={navFocus}
        />
      )}
      {scene === SceneKey.Landed &&
        run !== undefined &&
        stranded === undefined &&
        arrival !== undefined && (
          <HopReport
            before={arrival.before}
            flight={arrival.flight}
            actions={[{ label: 'Continue', onClick: dismissArrival, primary: true }]}
            onEscape={dismissArrival}
          />
        )}
      {scene === SceneKey.Landed &&
        run !== undefined &&
        stranded === undefined &&
        chart !== undefined && <NavChartPanel run={run} state={chart} />}
      {scene === SceneKey.Landed &&
        run !== undefined &&
        stranded === undefined &&
        spacecraftOpen && (
          <SpacecraftPanel
            run={run}
            onClose={() => {
              setSpacecraftOpen(false);
            }}
          />
        )}
      {scene === SceneKey.Landed && run !== undefined && stranded === undefined && (
        <RunMenu open={menuOpen} onOpenChange={setMenuOpen} onLeave={leaveRun} />
      )}
      {scene === SceneKey.Flight && flight !== undefined && !picking && (
        <FlightHud
          before={flight.before}
          flight={flight.flight}
          moment={flight.moment}
          after={flight.after}
          onContinue={() => {
            // From the failed Hop's report on to the End-of-Run screen.
            setFlight((now) =>
              now?.after?.kind === 'ended' ? { ...now, after: { ...now.after, step: 'end' } } : now,
            );
          }}
          onNewRun={startNewRun}
          onLeave={leaveRun}
        />
      )}
      <p className="hud-tag ai-label">AI-generated art</p>
    </div>
  );
}

/** Puts the seed and Chassis of the Run just launched in the page URL, other parameters kept. */
function syncUrl(seed: Seed, chassisId: ChassisId): void {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('seed')) url.searchParams.set('seed', String(seed));
    if (url.searchParams.has('chassis')) url.searchParams.set('chassis', chassisId);
    window.history.replaceState(null, '', url);
  } catch {
    // A page that cannot rewrite its own URL still plays.
  }
}
