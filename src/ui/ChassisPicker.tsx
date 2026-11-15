import { useMemo, useState } from 'react';
import { atlasImageUrl, hasAsset, imageUrl } from '../game/assets/manifest.ts';
import { frameGeometry, standingExtent } from '../game/scenes/chassisArt.ts';
import { composeSpacecraft } from '../game/scenes/spacecraftComposition.ts';
import { CHASSIS_IDS, newSpacecraft, type ChassisId } from '../game/sim/index.ts';
import { chassisBars, type ChassisBar } from './chassisPickView.ts';
import { Disclosure, DisclosurePanel, TellMeMoreToggle } from './Disclosure.tsx';
import { chassisName } from './format.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import { useAtlasFrames } from './useAtlasFrames.ts';

const CARD_WIDTH = 192;
const BUTTON_WIDTH = 96;
/** Under the card's name row: where the Spacecraft art starts (px from the card's top). */
const SPRITE_TOP = 24;
/** The gap between the art and the stats under it, and under the stats to the card's edge. */
const SPRITE_GAP = 6;
/** A row under the art for the Chassis' Slot outlines (#231 fills it). */
const SLOT_ROW_HEIGHT = 12;
const STATS_HEIGHT = 50;
const CARD_PADDING = 8;
/** The art box: as tall as the tallest Chassis art; every ship stands on its bottom line (px). */
const ART_BOX_HEIGHT = standingExtent(CHASSIS_IDS).height;
/** The card is as tall as its tallest Chassis art needs: art, then the three stat rows. */
const CARD_HEIGHT =
  SPRITE_TOP +
  ART_BOX_HEIGHT +
  SPRITE_GAP +
  SLOT_ROW_HEIGHT +
  SPRITE_GAP +
  STATS_HEIGHT +
  CARD_PADDING;
/** Where the cards start, and the gaps below them to the note and below the note to the buttons (px). */
const CARDS_TOP = 52;
const NOTE_GAP = 6;
const NOTE_HEIGHT = 30;
const ACTIONS_GAP = 6;
const NOTE_TOP = CARDS_TOP + CARD_HEIGHT + NOTE_GAP;
const ACTIONS_TOP = NOTE_TOP + NOTE_HEIGHT + ACTIONS_GAP;
/** The stand-in Spacecraft image (until the Chassis art is in the manifest) fits this box. */
const STAND_IN_SIZE = { width: 96, height: 64 };

interface ChassisPickerProps {
  /** The Chassis chosen: the Run starts with a full Spacecraft on it. */
  onLaunch: (chassisId: ChassisId) => void;
  /** Back to the title menu. */
  onBack: () => void;
  /** A launch is under way: the choice is made. */
  launching: boolean;
  /** The Chassis chosen to begin with; the first one by default. */
  initial?: ChassisId | undefined;
}

/**
 * Chassis picker, shown after New Run: the three Chassis side by side with their starting masses and
 * Δv, so the player sees what each trades off before choosing. A radio group, so the arrow keys move
 * the choice and Tab moves on to Launch.
 */
export function ChassisPicker({ onLaunch, onBack, launching, initial }: ChassisPickerProps) {
  const bars = useMemo(() => chassisBars(CHASSIS_IDS), []);
  const [chosen, setChosen] = useState<ChassisId>(initial ?? CHASSIS_IDS[0]);

  return (
    <section className="chassis-picker" aria-labelledby="chassis-picker-title">
      <h1 id="chassis-picker-title" className="chassis-picker__title">
        Choose a Chassis
      </h1>
      <div
        className="chassis-picker__cards"
        style={{ top: CARDS_TOP }}
        role="radiogroup"
        aria-labelledby="chassis-picker-title"
      >
        {CHASSIS_IDS.map((id) => (
          <ChassisCard
            key={id}
            id={id}
            bars={bars.get(id) ?? []}
            selected={id === chosen}
            onSelect={() => {
              setChosen(id);
            }}
          />
        ))}
      </div>
      <Disclosure>
        <div className="chassis-picker__note" style={{ top: NOTE_TOP }}>
          <p>More mass, less Δv from the same Fuel.</p> <TellMeMoreToggle />
          <DisclosurePanel className="chassis-picker__more">
            <p>
              A heavier craft must push its own mass along. A bigger tank or a better engine gives
              more.
            </p>
          </DisclosurePanel>
        </div>
      </Disclosure>
      <div className="chassis-picker__actions" style={{ top: ACTIONS_TOP }}>
        <KitButton width={BUTTON_WIDTH} disabled={launching} onClick={onBack}>
          Back
        </KitButton>
        <KitButton
          variant="primary"
          width={BUTTON_WIDTH}
          disabled={launching}
          onClick={() => {
            onLaunch(chosen);
          }}
        >
          Launch
        </KitButton>
      </div>
    </section>
  );
}

interface ChassisCardProps {
  id: ChassisId;
  bars: readonly ChassisBar[];
  selected: boolean;
  onSelect: () => void;
}

function ChassisCard({ id, bars, selected, onSelect }: ChassisCardProps) {
  const name = chassisName(id);
  return (
    <label
      className={selected ? 'chassis-card chassis-card--selected' : 'chassis-card'}
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
    >
      <input
        type="radio"
        name="chassis"
        value={id}
        checked={selected}
        onChange={onSelect}
        autoFocus={selected}
        className="chassis-card__input"
      />
      <KitFrame frame="panel_metal" width={CARD_WIDTH} height={CARD_HEIGHT} />
      <span className="chassis-card__name">{name}</span>
      {selected && (
        <span className="chassis-card__tag" aria-hidden="true">
          Selected
        </span>
      )}
      <ChassisSprite id={id} />
      <ul
        className="chassis-card__bars"
        style={{ top: SPRITE_TOP + ART_BOX_HEIGHT + SPRITE_GAP + SLOT_ROW_HEIGHT + SPRITE_GAP }}
      >
        {bars.map((bar) => (
          <li key={bar.kind} className={`chassis-bar chassis-bar--${bar.kind}`}>
            <span className="chassis-bar__label">{bar.shortLabel}</span>
            <span
              className="chassis-bar__track"
              role="img"
              aria-label={bar.ariaLabel}
              data-testid={`bar-${bar.kind}`}
            >
              <span
                className="chassis-bar__fill"
                style={{ width: `${String(bar.share * 100)}%` }}
              />
            </span>
            <span className="chassis-bar__value" aria-hidden="true">
              {bar.value}
            </span>
          </li>
        ))}
      </ul>
    </label>
  );
}

/**
 * The new Spacecraft of this Chassis, standing on the line the card's art box ends on: composed
 * from its atlas, Chassis art and starting Component art, as the Landed view draws it. The generic
 * Spacecraft stands in until the Chassis art is in the manifest.
 */
function ChassisSprite({ id }: { id: ChassisId }) {
  const key = `chassis_${id}`;
  if (hasAsset(key)) return <ComposedSprite id={id} atlasKey={key} />;
  return (
    <span
      aria-hidden="true"
      className="chassis-card__sprite chassis-card__sprite--stand-in"
      style={{
        ...STAND_IN_SIZE,
        left: (CARD_WIDTH - STAND_IN_SIZE.width) / 2,
        top: SPRITE_TOP,
        backgroundImage: `url(${imageUrl('spacecraft')})`,
      }}
    />
  );
}

/** The composed Spacecraft in the DOM: one span per layer, cut from the atlas image, back to front. */
function ComposedSprite({ id, atlasKey }: { id: ChassisId; atlasKey: string }) {
  const frames = useAtlasFrames(atlasKey);
  const { width, height, pivot } = frameGeometry(id, 'landed');
  const { layers } = composeSpacecraft(id, newSpacecraft(id).slots, 'landed');
  return (
    <span
      aria-hidden="true"
      className="chassis-card__sprite"
      style={{
        width,
        height,
        left: (CARD_WIDTH - width) / 2,
        top: SPRITE_TOP + ART_BOX_HEIGHT - height,
      }}
    >
      {frames &&
        layers.map(({ frame, rect }) => {
          const at = frames.get(frame);
          if (!at) return null;
          return (
            <span
              key={frame}
              className="chassis-card__layer"
              style={{
                left: pivot.x + rect.x,
                top: pivot.y + rect.y,
                width: rect.width,
                height: rect.height,
                backgroundImage: `url(${atlasImageUrl(atlasKey)})`,
                backgroundPosition: `${String(-at.x)}px ${String(-at.y)}px`,
              }}
            />
          );
        })}
    </span>
  );
}
