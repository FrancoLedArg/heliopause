import { useState } from 'react';
import { atlasImageUrl, hasAsset, imageUrl } from '../game/assets/manifest.ts';
import { frameGeometry, standingExtent } from '../game/scenes/chassisArt.ts';
import { availableDeltaV, CHASSIS_IDS, newSpacecraft, type ChassisId } from '../game/sim/index.ts';
import { chassisName, formatDeltaV, formatFuel, formatMass } from './format.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';

const CARD_WIDTH = 192;
const BUTTON_WIDTH = 96;
/** Under the card's name row: where the Spacecraft art starts (px from the card's top). */
const SPRITE_TOP = 24;
/** The gap between the art and the stats under it, and under the stats to the card's edge. */
const SPRITE_GAP = 6;
const STATS_HEIGHT = 50;
const CARD_PADDING = 8;
/** The card is as tall as its tallest Chassis art needs: art, then the three stat rows. */
const CARD_HEIGHT =
  SPRITE_TOP + standingExtent(CHASSIS_IDS).height + SPRITE_GAP + STATS_HEIGHT + CARD_PADDING;
/** Where the cards start, and the gaps below them to the note and below the note to the buttons (px). */
const CARDS_TOP = 52;
const NOTE_GAP = 6;
const NOTE_HEIGHT = 28;
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
            selected={id === chosen}
            onSelect={() => {
              setChosen(id);
            }}
          />
        ))}
      </div>
      <p className="chassis-picker__note" style={{ top: NOTE_TOP }}>
        A heavier craft gets less Δv from the same Fuel, since it must push its own mass along. A
        bigger tank or a better engine gives more.
      </p>
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
  selected: boolean;
  onSelect: () => void;
}

function ChassisCard({ id, selected, onSelect }: ChassisCardProps) {
  const spacecraft = newSpacecraft(id);
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
      <dl
        className="chassis-card__stats"
        style={{ top: SPRITE_TOP + standingExtent(CHASSIS_IDS).height + SPRITE_GAP }}
      >
        <dt>Dry mass</dt>
        <dd>{formatMass(spacecraft.dryMass)}</dd>
        <dt>Fuel capacity</dt>
        <dd className="chassis-card__fuel">{formatFuel(spacecraft.fuelCapacity)}</dd>
        <dt>Δv</dt>
        <dd className="chassis-card__dv">{formatDeltaV(availableDeltaV(spacecraft))}</dd>
      </dl>
    </label>
  );
}

/**
 * The Chassis's landed art, cropped from its atlas (the `landed` frame is the first cell, at the
 * origin), standing on the line the card's art box ends on; the generic Spacecraft stands in until
 * the Chassis art is in the manifest.
 */
function ChassisSprite({ id }: { id: ChassisId }) {
  const key = `chassis_${id}`;
  if (hasAsset(key)) {
    const { width, height } = frameGeometry(id, 'landed');
    return (
      <span
        aria-hidden="true"
        className="chassis-card__sprite"
        style={{
          width,
          height,
          left: (CARD_WIDTH - width) / 2,
          top: SPRITE_TOP + standingExtent(CHASSIS_IDS).height - height,
          backgroundImage: `url(${atlasImageUrl(key)})`,
        }}
      />
    );
  }
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
