import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { EventBus } from '../game/EventBus.ts';
import { imageUrl } from '../game/assets/manifest.ts';
import { COMPONENTS, install, remove, type Run } from '../game/sim/index.ts';
import { ComponentIcon } from './componentIcons/ComponentIcon.tsx';
import { Disclosure, DisclosurePanel, TellMeMoreToggle } from './Disclosure.tsx';
import { chassisName } from './format.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import { SpacecraftPicture } from './SpacecraftPicture.tsx';
import {
  componentLabel,
  describePreview,
  describeRefusal,
  describeRemoval,
  describeRemoveRefusal,
  installTarget,
  panelRows,
  statBars,
  type PanelRow,
  type StatBar,
} from './spacecraftPanelView.ts';
import './SpacecraftPanel.css';

const PANEL = { x: 8, y: 52, width: 624, height: 292 } as const;
const TITLEBAR_HEIGHT = 14;
const REMOVE_WIDTH = 56;
const INSTALL_WIDTH = 56;
/** Each stat's figure carries a test id the panel's tests and the e2e specs read. */
const STAT_TEST_IDS = {
  mass: 'dry-mass',
  fuel: 'fuel-capacity',
  'delta-v': 'panel-delta-v',
} as const;

/** What the last install or removal attempt said; `undefined` before the first one. */
interface Outcome {
  readonly kind: 'installed' | 'removed' | 'refused';
  readonly text: string;
}

interface SpacecraftPanelProps {
  run: Run;
  /** Escape or Close: the parent gives focus back to the Spacecraft button. */
  onClose: () => void;
}

/**
 * The Spacecraft panel: a picture of the Spacecraft with a callout per Slot, bars for its dry mass,
 * Fuel capacity and Δv, and the catalogue, where each Component can be installed by paying its
 * Materials and the one in the chosen Slot removed for half its cost back (after a yes or no). Before
 * the player pays or confirms, the bars show before and after: what the change would give, for the
 * catalogue entry they focus or hover and for the installed Component they choose. Modal: it covers the Landed view, takes Tab, and
 * closes on Escape (which first answers an open remove question with no). Installing and removing
 * send the request to the Landed scene, which owns the Run and answers with the changed Run, so the
 * Hop plan and the top bar follow at once.
 */
export function SpacecraftPanel({ run, onClose }: SpacecraftPanelProps) {
  const titleId = useId();
  const keysId = useId();
  const captionId = useId();
  const { spacecraft } = run;
  const rows = panelRows(run);
  const [selected, setSelected] = useState(() => Math.max(0, spacecraft.slots.indexOf(null)));
  const held = spacecraft.slots[selected] ?? null;

  const [focusedId, setFocusedId] = useState<PanelRow['id']>(() => firstAffordable(rows));
  // What the preview is about: the catalogue entry last focused or hovered, or the chosen Slot's Component.
  const [previewing, setPreviewing] = useState<'catalogue' | 'slot'>('catalogue');
  const [outcome, setOutcome] = useState<Outcome | undefined>(undefined);
  // The Slot whose removal is waiting for a yes or no; `undefined` when nothing is asked.
  const [confirming, setConfirming] = useState<number | undefined>(undefined);
  const removeRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const slotCount = spacecraft.slots.length;
  const panelRef = useRef<HTMLElement>(null);

  // The panel opens with focus on the selected Slot.
  useEffect(() => {
    slotRefs.current[selected]?.focus();
    // Only on opening: later selections move focus themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape answers an open remove question with no, wherever focus is, and otherwise closes the
  // panel. preventDefault keeps it from also opening the Menu under the panel.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      if (confirming === undefined) {
        onClose();
      } else {
        setConfirming(undefined);
        removeRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, confirming]);

  // Modal: Tab goes round the panel and never leaves it.
  const onPanelKey = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Tab') return;
    const stops = [
      ...(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []),
    ].filter((el) => el.tabIndex >= 0);
    const [first, last] = [stops[0], stops[stops.length - 1]];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // The question belongs to one Slot, so choosing another Slot drops it.
  const choose = (index: number): void => {
    setSelected(index);
    setConfirming(undefined);
    setPreviewing('slot');
  };
  const selectSlot = (index: number): void => {
    choose(index);
    slotRefs.current[index]?.focus();
  };
  const onSlotKey = (event: KeyboardEvent<HTMLElement>): void => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    selectSlot((selected + step + slotCount) % slotCount);
  };

  const tryInstall = (row: PanelRow): void => {
    const target = installTarget(spacecraft.slots, selected);
    if (target === undefined) {
      const full = describeRefusal({ kind: 'no-empty-slot' });
      setOutcome({ kind: 'refused', text: `Can't install. ${full}` });
      return;
    }
    const result = install(run, target, row.id);
    if (result.kind === 'refused') {
      setOutcome({ kind: 'refused', text: `Can't install. ${describeRefusal(result.reason)}` });
      return;
    }
    EventBus.emit('component-install-requested', target, row.id);
    setOutcome({
      kind: 'installed',
      text: `Installed ${componentLabel(row.id)} in Slot ${String(target + 1)}. ${String(result.run.materials)} Materials left.`,
    });
    setSelected(installTarget(result.run.spacecraft.slots, target) ?? target);
  };

  const askRemoval = (): void => {
    const result = remove(run, selected);
    if (result.kind === 'refused') {
      setConfirming(undefined);
      setOutcome({
        kind: 'refused',
        text: `Can't remove. ${describeRemoveRefusal(result.reason)}`,
      });
      return;
    }
    setOutcome(undefined);
    setPreviewing('slot');
    setConfirming(selected);
  };
  const confirmRemoval = (): void => {
    const result = remove(run, selected);
    if (result.kind === 'refused' || held === null) return;
    EventBus.emit('component-remove-requested', selected);
    setConfirming(undefined);
    setOutcome({
      kind: 'removed',
      text: `Removed ${componentLabel(held)} from Slot ${String(selected + 1)}. Refunded ${String(result.refund)} Materials.`,
    });
    removeRef.current?.focus();
  };
  const cancelRemoval = (): void => {
    setConfirming(undefined);
    removeRef.current?.focus();
  };

  // Asking moves the keyboard to Keep, the safe answer.
  useEffect(() => {
    if (confirming !== undefined) keepRef.current?.focus();
  }, [confirming]);

  const target = installTarget(spacecraft.slots, selected);
  const removal = held === null ? undefined : remove(run, selected);
  const pending = confirming === selected ? removal : undefined;
  // The chosen Slot's Component is previewed as removed (or why it cannot be); otherwise the
  // catalogue entry as installed.
  // An open remove question keeps its preview: focusing the catalogue does not switch it.
  const previewingRemoval =
    (previewing === 'slot' || confirming !== undefined) && removal !== undefined;
  // A catalogue entry that cannot be installed whatever the Materials previews only why not.
  const blocked = previewingRemoval
    ? undefined
    : rows.find((row) => row.id === focusedId)?.unavailable;
  const change =
    (previewingRemoval && removal.kind === 'refused') || blocked !== undefined
      ? undefined
      : previewingRemoval
        ? ({ kind: 'remove', slot: selected } as const)
        : ({
            kind: 'install',
            component: focusedId,
            ...(target === undefined ? {} : { slot: target }),
          } as const);
  const forecast = change && describePreview(spacecraft, change);
  const bars = statBars(spacecraft, forecast ? change : undefined);
  const noForecast =
    previewingRemoval && removal.kind === 'refused'
      ? describeRemoveRefusal(removal.reason)
      : (blocked ?? 'Every Slot is full: remove a Component first.');

  return (
    <section
      ref={panelRef}
      className="spacecraft-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onPanelKey}
      style={{ left: PANEL.x, top: PANEL.y, width: PANEL.width, height: PANEL.height }}
    >
      <KitFrame frame="panel_metal" width={PANEL.width} height={PANEL.height} />
      <div className="spacecraft-panel__titlebar" style={{ width: PANEL.width - 16 }}>
        <KitFrame frame="titlebar" width={PANEL.width - 16} height={TITLEBAR_HEIGHT} />
        <h1 id={titleId} className="spacecraft-panel__title">
          Spacecraft
        </h1>
        <p className="spacecraft-panel__chassis">{chassisName(spacecraft.chassisId)} Chassis</p>
      </div>

      <div className="spacecraft-panel__left">
        <SpacecraftPicture
          chassisId={spacecraft.chassisId}
          slots={spacecraft.slots}
          selected={selected}
          onSelect={choose}
          slotRef={(index, el) => {
            slotRefs.current[index] = el;
          }}
          onKeyDown={onSlotKey}
          describedBy={keysId}
        />
        <KitButton
          ref={removeRef}
          width={REMOVE_WIDTH}
          className="spacecraft-panel__remove"
          aria-describedby={captionId}
          onClick={askRemoval}
        >
          Remove
        </KitButton>
        <p id={keysId} className="sr-only">
          Left and Right arrow keys choose a Slot. Tab moves on to Remove and the Components. Escape
          closes.
        </p>
        <p id={captionId} className="sr-only" data-testid="slot-caption">
          {held === null
            ? `Slot ${String(selected + 1)} is empty.`
            : `Slot ${String(selected + 1)}: ${componentLabel(held)}.`}
        </p>

        {pending?.kind === 'removed' && held !== null && (
          <div
            className="spacecraft-panel__confirm"
            role="group"
            aria-label="Confirm removal"
            data-testid="remove-confirm"
          >
            <p role="alert" className="spacecraft-panel__confirm-text">
              {describeRemoval({
                slot: selected,
                held,
                refund: pending.refund,
                fuelLost: pending.fuelLost,
              })}
            </p>
            <div className="spacecraft-panel__confirm-buttons">
              <KitButton ref={keepRef} width={96} onClick={cancelRemoval}>
                Keep
              </KitButton>
              <KitButton
                variant="danger"
                width={96}
                aria-label="Confirm remove"
                onClick={confirmRemoval}
              >
                Remove
              </KitButton>
            </div>
          </div>
        )}

        <div className="spacecraft-panel__preview" data-testid="install-preview">
          {forecast && <h2 className="spacecraft-panel__label">{forecast.heading}</h2>}
          <div className="spacecraft-panel__stats">
            {bars.map((bar) => (
              <StatRow key={bar.kind} bar={bar} />
            ))}
          </div>
          <p
            className={
              forecast
                ? 'spacecraft-panel__note'
                : 'spacecraft-panel__note spacecraft-panel__note--long'
            }
            data-testid="preview-note"
          >
            {forecast ? forecast.note : noForecast}
          </p>
          {forecast && forecast.more.length > 0 && (
            // Keyed by the change, so each new preview starts with its lesson closed.
            <Disclosure key={forecast.heading}>
              <TellMeMoreToggle className="spacecraft-panel__more" />
              <DisclosurePanel className="spacecraft-panel__details">
                <div data-testid="preview-more">
                  {forecast.more.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </DisclosurePanel>
            </Disclosure>
          )}
        </div>
      </div>

      <div className="spacecraft-panel__right">
        <div className="spacecraft-panel__catalogue-head">
          <h2 className="spacecraft-panel__label">Components</h2>
          <p className="spacecraft-panel__target" data-testid="install-target">
            {target === undefined
              ? 'No empty Slot'
              : `Installs into Slot ${String(target + 1)} · ${String(run.materials)} Materials in stock`}
          </p>
        </div>
        <ul className="spacecraft-panel__catalogue" aria-label="Components">
          {rows.map((row) => (
            <li
              key={row.id}
              className={
                row.unavailable !== undefined
                  ? 'spacecraft-panel__row spacecraft-panel__row--unavailable'
                  : row.affordable
                    ? 'spacecraft-panel__row'
                    : 'spacecraft-panel__row spacecraft-panel__row--costly'
              }
              data-testid="component-row"
              onMouseEnter={() => {
                setFocusedId(row.id);
                setPreviewing('catalogue');
              }}
            >
              <ComponentIcon
                kind={COMPONENTS[row.id].kind}
                className="spacecraft-panel__row-icon"
              />
              <p className="spacecraft-panel__row-head">
                <span className="spacecraft-panel__row-name">{row.title}</span>
                <span className="spacecraft-panel__row-stats">{row.mass}</span>
                <span className="spacecraft-panel__row-cost">
                  <img
                    src={imageUrl('res_materials')}
                    alt=""
                    width={8}
                    height={8}
                    className="spacecraft-panel__row-cost-icon"
                  />
                  {row.costAmount}
                  <span className="sr-only"> Materials</span>
                </span>
                {!row.affordable && row.unavailable === undefined && (
                  <span className="spacecraft-panel__row-tag">
                    {`Need ${String(row.short)} more`}
                  </span>
                )}
              </p>
              <p
                id={`${titleId}-effect-${row.id}`}
                className="spacecraft-panel__row-effect"
                data-testid="component-effect"
              >
                {/* What stops it, whatever the Materials, takes the place of what it does. */}
                {row.unavailable ?? row.effect}
              </p>
              <KitButton
                width={INSTALL_WIDTH}
                className="spacecraft-panel__install"
                aria-label={`Install ${componentLabel(row.id)}, ${row.mass}, ${row.cost}`}
                aria-describedby={`${titleId}-effect-${row.id}`}
                onFocus={() => {
                  setFocusedId(row.id);
                  setPreviewing('catalogue');
                }}
                onClick={() => {
                  tryInstall(row);
                }}
              >
                Install
              </KitButton>
            </li>
          ))}
        </ul>
        <p
          className={
            outcome?.kind === 'refused'
              ? 'spacecraft-panel__status spacecraft-panel__status--refused'
              : 'spacecraft-panel__status'
          }
          role="status"
          data-testid="install-status"
        >
          {outcome?.text ?? ''}
        </p>
        <div className="spacecraft-panel__close">
          <KitButton variant="primary" width={96} aria-keyshortcuts="Escape" onClick={onClose}>
            Close
          </KitButton>
        </div>
      </div>
    </section>
  );
}

function firstAffordable(rows: readonly PanelRow[]): PanelRow['id'] {
  const first = rows.find((row) => row.affordable) ?? rows[0];
  if (!first) throw new Error('The catalogue is empty');
  return first.id;
}

/**
 * One stat as a bar with its figure. While a change is previewed, the bar shows before and after: the
 * figure now above, the figure after it below, the stretch between them marked as a gain or a loss,
 * and the change as a signed number. Its name says all of that in words.
 */
function StatRow({ bar }: { bar: StatBar }) {
  const { after } = bar;
  const percent = (share: number): string => `${String(Math.round(share * 1000) / 10)}%`;
  const classes = ['stat-bar', `stat-bar--${bar.kind}`, after ? 'stat-bar--preview' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={classes}
      data-testid={after ? 'preview-line' : 'stat-line'}
      data-stat={bar.kind}
    >
      <span className="stat-bar__label" aria-hidden="true">
        {bar.label}
      </span>
      <span className="stat-bar__figures" aria-hidden="true">
        <span data-testid={STAT_TEST_IDS[bar.kind]}>{bar.value}</span>
        {after && <span className="stat-bar__then">{` → ${after.value}`}</span>}
      </span>
      <span className="stat-bar__track" role="img" aria-label={bar.name}>
        <span className="stat-bar__now" style={{ width: percent(bar.share) }} />
        {after && (
          <>
            <span className="stat-bar__after" style={{ width: percent(after.share) }} />
            {after.trend !== 'same' && (
              <span
                className={`stat-bar__delta stat-bar__delta--${after.good ? 'good' : 'bad'}`}
                style={{
                  left: percent(Math.min(bar.share, after.share)),
                  width: percent(Math.abs(after.share - bar.share)),
                }}
              />
            )}
          </>
        )}
      </span>
      {after && (
        <span
          className={`stat-bar__change stat-bar__change--${after.trend === 'same' ? 'same' : after.good ? 'good' : 'bad'}`}
          aria-hidden="true"
        >
          {after.change}
        </span>
      )}
    </div>
  );
}
