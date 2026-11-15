import type { KeyboardEvent } from 'react';
import { hasAsset, imageUrl } from '../game/assets/manifest.ts';
import { COMPONENTS, type ChassisId, type ComponentId, type Slot } from '../game/sim/index.ts';
import { ComponentIcon } from './componentIcons/ComponentIcon.tsx';
import {
  CALLOUT,
  PICTURE,
  placeSpacecraft,
  slotCallouts,
  type CalloutPlace,
} from './slotCallouts.ts';
import { SpacecraftLayers } from './SpacecraftLayers.tsx';
import { componentLabel, describeSpacecraft } from './spacecraftPanelView.ts';

/** How far the line runs straight out of its callout before it turns to the Component art (px). */
const ELBOW = 6;

interface SpacecraftPictureProps {
  chassisId: ChassisId;
  slots: readonly Slot[];
  /** The chosen Slot (0-based): its callout is checked and its line lit. */
  selected: number;
  onSelect: (index: number) => void;
  /** Lets the panel move focus to a Slot's callout. */
  slotRef: (index: number, el: HTMLButtonElement | null) => void;
  onKeyDown?: ((event: KeyboardEvent<HTMLElement>) => void) | undefined;
  /** The id of the text that says how the keyboard moves between Slots. */
  describedBy?: string | undefined;
  /** Which Slots hold a Damaged Component (#250): their callouts show smoke. */
  damaged?: readonly boolean[] | undefined;
}

/**
 * The Spacecraft as the Landed view draws it, with a callout per Slot: a box holding the Component's
 * icon and level, or an empty outline, joined by a line to the Component art. The callouts are the
 * panel's Slot radio group. The drawing's words are its text alternative: the Chassis and its Components.
 */
export function SpacecraftPicture({
  chassisId,
  slots,
  selected,
  onSelect,
  slotRef,
  onKeyDown,
  describedBy,
  damaged,
}: SpacecraftPictureProps) {
  const placed = placeSpacecraft(chassisId, slots);
  const places = slotCallouts(chassisId, slots, placed);
  const atlasKey = `chassis_${chassisId}`;
  const { width, height } = placed.composition.geometry;
  return (
    <div
      className="spacecraft-figure"
      data-testid="spacecraft-figure"
      style={{ width: PICTURE.width, height: PICTURE.height }}
    >
      <span
        role="img"
        aria-label={describeSpacecraft({ chassisId, slots })}
        className="spacecraft-figure__art"
        data-testid="spacecraft-picture"
        style={{ left: placed.left, top: placed.top, width, height }}
      >
        {hasAsset(atlasKey) ? (
          <SpacecraftLayers
            composition={placed.composition}
            atlasKey={atlasKey}
            className="spacecraft-figure__layers"
          />
        ) : (
          <span
            aria-hidden="true"
            className="spacecraft-figure__stand-in"
            style={{ backgroundImage: `url(${imageUrl('spacecraft')})` }}
          />
        )}
      </span>
      <svg
        className="spacecraft-figure__lines"
        width={PICTURE.width}
        height={PICTURE.height}
        viewBox={`0 0 ${String(PICTURE.width)} ${String(PICTURE.height)}`}
        aria-hidden="true"
      >
        {places.map((place) => (
          <CalloutLine key={place.slot} place={place} lit={place.slot === selected} />
        ))}
      </svg>
      <div
        className="spacecraft-figure__slots"
        role="radiogroup"
        aria-label="Slots"
        aria-describedby={describedBy}
        onKeyDown={onKeyDown}
      >
        {places.map((place) => (
          <SlotCallout
            key={place.slot}
            place={place}
            held={slots[place.slot] ?? null}
            damaged={damaged?.[place.slot] === true}
            selected={place.slot === selected}
            buttonRef={(el) => {
              slotRef(place.slot, el);
            }}
            onSelect={() => {
              onSelect(place.slot);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** A line from a fitted Slot's callout to its Component art; nothing for an empty Slot. */
function CalloutLine({ place, lit }: { place: CalloutPlace; lit: boolean }) {
  const { anchor } = place;
  if (!anchor) return null;
  const y = place.y + CALLOUT.height / 2 + 0.5;
  const [edge, elbow] =
    place.side === 'left'
      ? [place.x + CALLOUT.width, place.x + CALLOUT.width + ELBOW]
      : [place.x, place.x - ELBOW];
  const className = lit ? 'callout-line callout-line--lit' : 'callout-line';
  return (
    <g className={className} data-testid="callout-line">
      <polyline
        points={`${String(edge)},${String(y)} ${String(elbow)},${String(y)} ${String(anchor.x + 0.5)},${String(anchor.y + 0.5)}`}
      />
      <rect x={anchor.x - 1} y={anchor.y - 1} width={3} height={3} />
    </g>
  );
}

/** What a callout shows: an empty outline, a fitted Component, or a Damaged one, with smoke (#250). */
export type CalloutState = 'empty' | 'fitted' | 'damaged';

interface SlotCalloutProps {
  place: CalloutPlace;
  held: ComponentId | null;
  damaged: boolean;
  selected: boolean;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onSelect: () => void;
}

/** One Slot's callout: its number, then the Component's icon and level. Its name says what it holds. */
function SlotCallout({ place, held, damaged, selected, buttonRef, onSelect }: SlotCalloutProps) {
  const state: CalloutState = held === null ? 'empty' : damaged ? 'damaged' : 'fitted';
  const component = held === null ? undefined : COMPONENTS[held];
  const number = String(place.slot + 1);
  const classes = [
    'slot-callout',
    `slot-callout--${state}`,
    `slot-callout--${place.side}`,
    selected ? 'slot-callout--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`Slot ${number}, ${held === null ? 'empty' : componentLabel(held)}${state === 'damaged' ? ', Damaged' : ''}`}
      tabIndex={selected ? 0 : -1}
      className={classes}
      data-state={state}
      style={{ left: place.x, top: place.y, width: CALLOUT.width, height: CALLOUT.height }}
      onClick={onSelect}
    >
      <span className="slot-callout__number" aria-hidden="true">
        {number}
      </span>
      {component && (
        // Keyed by the Component, so a new one pops in where the old one was.
        <span key={held} className="slot-callout__part" aria-hidden="true">
          <ComponentIcon kind={component.kind} className="slot-callout__icon" />
          {component.kind !== 'jump-drive' && component.kind !== 'instrument' && (
            <span className="slot-callout__level">{component.level}</span>
          )}
        </span>
      )}
      {state === 'damaged' && (
        <span className="slot-callout__smoke" aria-hidden="true" data-testid="callout-smoke" />
      )}
    </button>
  );
}
