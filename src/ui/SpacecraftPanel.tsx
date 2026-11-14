import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { EventBus } from '../game/EventBus.ts';
import {
  availableDeltaV,
  COMPONENTS,
  install,
  SLOT_COUNT,
  type Run,
  type Slot,
} from '../game/sim/index.ts';
import { chassisName, formatDeltaV, formatFuel, formatIsp } from './format.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import {
  componentLabel,
  describeRefusal,
  installTarget,
  massBar,
  panelRows,
  type PanelRow,
} from './spacecraftPanelView.ts';
import './SpacecraftPanel.css';

const PANEL = { x: 8, y: 52, width: 624, height: 284 } as const;
const TITLEBAR_HEIGHT = 14;
const SLOT_SIZE = 36;
const MASS_BAR_WIDTH = 220;
const SLOT_CODES = { engine: 'ENG', 'fuel-tank': 'TANK', drill: 'DRL' } as const;

/** What the last install attempt said; `undefined` before the first one. */
interface Outcome {
  readonly kind: 'installed' | 'refused';
  readonly text: string;
}

interface SpacecraftPanelProps {
  run: Run;
  /** Escape or Close: the parent gives focus back to the Spacecraft button. */
  onClose: () => void;
}

/**
 * The Spacecraft panel: the 4 Slots, the Mass bar and figures, and the catalogue, where each
 * Component can be installed by paying its Materials. Modal: it covers the Landed view, takes Tab,
 * and closes on Escape. Installing sends the request to the Landed scene, which owns the Run and
 * answers with the changed Run, so the Hop plan and the top bar follow at once.
 */
export function SpacecraftPanel({ run, onClose }: SpacecraftPanelProps) {
  const titleId = useId();
  const keysId = useId();
  const { spacecraft } = run;
  const rows = panelRows(run);

  const [selected, setSelected] = useState(() => Math.max(0, spacecraft.slots.indexOf(null)));
  const [aboutId, setAboutId] = useState<PanelRow['id']>(() => firstAffordable(rows));
  const [outcome, setOutcome] = useState<Outcome | undefined>(undefined);
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelRef = useRef<HTMLElement>(null);

  // The panel opens with focus on the selected Slot.
  useEffect(() => {
    slotRefs.current[selected]?.focus();
    // Only on opening: later selections move focus themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes from anywhere. preventDefault keeps it from also opening the Menu under the panel.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

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

  const selectSlot = (index: number): void => {
    setSelected(index);
    slotRefs.current[index]?.focus();
  };
  const onSlotKey = (event: KeyboardEvent<HTMLElement>): void => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    selectSlot((selected + step + SLOT_COUNT) % SLOT_COUNT);
  };

  const tryInstall = (row: PanelRow): void => {
    const target = installTarget(spacecraft.slots, selected);
    // With no empty Slot any index gives the same refusal; the sim names it.
    const result = install(run, target ?? 0, row.id);
    if (result.kind === 'refused') {
      setOutcome({ kind: 'refused', text: `Can't install. ${describeRefusal(result.reason)}` });
      return;
    }
    if (target === undefined) return;
    EventBus.emit('component-install-requested', target, row.id);
    setOutcome({
      kind: 'installed',
      text: `Installed ${componentLabel(row.id)} in Slot ${String(target + 1)}. ${String(result.run.materials)} Materials left.`,
    });
    setSelected(installTarget(result.run.spacecraft.slots, target) ?? target);
  };

  const target = installTarget(spacecraft.slots, selected);
  const bar = massBar(spacecraft);
  const heldBySelected = spacecraft.slots[selected] ?? null;
  const about = rows.find((row) => row.id === aboutId);

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
        <h2 className="spacecraft-panel__label">Slots</h2>
        <div
          className="spacecraft-panel__slots"
          role="radiogroup"
          aria-label="Slots"
          aria-describedby={keysId}
          onKeyDown={onSlotKey}
        >
          {spacecraft.slots.map((slot, index) => (
            <SlotButton
              key={index}
              index={index}
              slot={slot}
              selected={index === selected}
              buttonRef={(el) => {
                slotRefs.current[index] = el;
              }}
              onSelect={() => {
                setSelected(index);
              }}
            />
          ))}
        </div>
        <p id={keysId} className="sr-only">
          Left and Right arrow keys choose a Slot. Tab moves on to the Components. Escape closes.
        </p>
        <p className="spacecraft-panel__slot-caption" data-testid="slot-caption">
          {heldBySelected === null
            ? `Slot ${String(selected + 1)} is empty.`
            : `Slot ${String(selected + 1)}: ${componentLabel(heldBySelected)}.`}
        </p>

        <div
          className="spacecraft-panel__mass"
          role="meter"
          aria-label="Dry mass"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(bar.fraction * 100)}
          aria-valuetext={bar.label}
        >
          <p className="spacecraft-panel__mass-label" data-testid="mass-label">
            {bar.label}
          </p>
          <div className="spacecraft-panel__bar" style={{ width: MASS_BAR_WIDTH }}>
            <KitFrame frame="bar_frame" width={MASS_BAR_WIDTH} height={10} />
            <KitFrame
              frame="bar_fill_cy"
              width={Math.max(4, Math.round((MASS_BAR_WIDTH - 4) * bar.fraction))}
              height={6}
              className="spacecraft-panel__bar-fill"
            />
          </div>
        </div>

        <dl className="spacecraft-panel__figures">
          <dt>Fuel capacity</dt>
          <dd data-testid="fuel-capacity">{formatFuel(spacecraft.fuelCapacity)}</dd>
          <dt>Isp</dt>
          <dd data-testid="isp">
            {spacecraft.engineIsp > 0 ? formatIsp(spacecraft.engineIsp) : 'No Engine'}
          </dd>
          <dt>Δv available</dt>
          <dd data-testid="panel-delta-v">{formatDeltaV(availableDeltaV(spacecraft))}</dd>
        </dl>

        {/*
          The spot for the before-you-pay preview (#109): the Hop plan's figures with and without the
          highlighted Component. Until then it says what the highlighted Component is for.
        */}
        <div className="spacecraft-panel__preview" data-testid="install-preview">
          <h2 className="spacecraft-panel__label">About {about ? componentLabel(about.id) : ''}</h2>
          <p className="spacecraft-panel__about">{about?.explanation}</p>
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
                row.affordable
                  ? 'spacecraft-panel__row'
                  : 'spacecraft-panel__row spacecraft-panel__row--costly'
              }
              data-testid="component-row"
              onMouseEnter={() => {
                setAboutId(row.id);
              }}
            >
              <p className="spacecraft-panel__row-head">
                <span className="spacecraft-panel__row-name">
                  {row.name} {row.level}
                </span>
                <span className="spacecraft-panel__row-stats">
                  {row.mass} · {row.cost}
                </span>
                {!row.affordable && (
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
                {row.effect}
              </p>
              <KitButton
                width={64}
                className="spacecraft-panel__install"
                aria-label={`Install ${componentLabel(row.id)}, ${row.mass}, ${row.cost}`}
                aria-describedby={`${titleId}-effect-${row.id}`}
                onFocus={() => {
                  setAboutId(row.id);
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

interface SlotButtonProps {
  index: number;
  slot: Slot;
  selected: boolean;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onSelect: () => void;
}

/** One Slot in the kit's frames: empty, hover and selected. Its text says what it holds. */
function SlotButton({ index, slot, selected, buttonRef, onSelect }: SlotButtonProps) {
  const held = slot ?? undefined;
  const code =
    held === undefined
      ? '—'
      : `${SLOT_CODES[COMPONENTS[held].kind]}${String(COMPONENTS[held].level)}`;
  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`Slot ${String(index + 1)}, ${held === undefined ? 'empty' : componentLabel(held)}`}
      tabIndex={selected ? 0 : -1}
      className={selected ? 'slot-button slot-button--selected' : 'slot-button'}
      style={{ width: SLOT_SIZE, height: SLOT_SIZE }}
      onClick={onSelect}
    >
      <KitFrame frame="slot_empty" className="slot-button__face slot-button__face--empty" />
      <KitFrame frame="slot_hover" className="slot-button__face slot-button__face--hover" />
      <KitFrame frame="slot_selected" className="slot-button__face slot-button__face--selected" />
      <span className="slot-button__code">{code}</span>
      <span className="slot-button__number">{index + 1}</span>
    </button>
  );
}
