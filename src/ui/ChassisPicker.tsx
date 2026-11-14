import { useState } from 'react';
import { atlasImageUrl, hasAsset, imageUrl } from '../game/assets/manifest.ts';
import {
  availableDeltaV,
  CHASSIS_IDS,
  newSpacecraft,
  type ChassisId,
  type Spacecraft,
} from '../game/sim/index.ts';
import { formatDeltaV, formatFuel, formatMass } from './format.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';

const CARD_WIDTH = 192;
const CARD_HEIGHT = 172;
const SPRITE_WIDTH = 96;
const SPRITE_HEIGHT = 64;
const BUTTON_WIDTH = 96;

const NAMES: Record<ChassisId, string> = { scout: 'Scout', hauler: 'Hauler', lancer: 'Lancer' };

interface ChassisPickerProps {
  /** The Chassis chosen: the Run starts with a full Spacecraft on it. */
  onLaunch: (chassisId: ChassisId) => void;
  /** Back to the title menu. */
  onBack: () => void;
  /** A launch is under way: the choice is made. */
  launching: boolean;
}

/**
 * Chassis picker, shown after New Run: the three Chassis side by side with their starting masses and
 * Δv, so the player sees what each trades off before choosing. A radio group, so the arrow keys move
 * the choice and Tab moves on to Launch.
 */
export function ChassisPicker({ onLaunch, onBack, launching }: ChassisPickerProps) {
  const [chosen, setChosen] = useState<ChassisId>(CHASSIS_IDS[0]);

  return (
    <section className="chassis-picker" aria-labelledby="chassis-picker-title">
      <h1 id="chassis-picker-title" className="chassis-picker__title">
        Choose a Chassis
      </h1>
      <div
        className="chassis-picker__cards"
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
      <p className="chassis-picker__note">
        A heavier craft gets less Δv from the same Fuel: its own mass has to be pushed along too.
      </p>
      <div className="chassis-picker__actions">
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
  const spacecraft: Spacecraft = newSpacecraft(id);
  const name = NAMES[id];
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
      {selected && <span className="chassis-card__tag">Selected</span>}
      <ChassisSprite id={id} name={name} />
      <dl className="chassis-card__stats">
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
 * The Chassis's landed art, cropped from its atlas (the `landed` frame is the first 96×64 cell); the
 * generic Spacecraft stands in until the Chassis art is in the manifest.
 */
function ChassisSprite({ id, name }: { id: ChassisId; name: string }) {
  const key = `chassis_${id}`;
  if (hasAsset(key)) {
    return (
      <span
        role="img"
        aria-label={`${name} Chassis`}
        className="chassis-card__sprite"
        style={{
          width: SPRITE_WIDTH,
          height: SPRITE_HEIGHT,
          backgroundImage: `url(${atlasImageUrl(key)})`,
        }}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={`${name} Chassis`}
      className="chassis-card__sprite chassis-card__sprite--stand-in"
      style={{
        width: SPRITE_WIDTH,
        height: SPRITE_HEIGHT,
        backgroundImage: `url(${imageUrl('spacecraft')})`,
      }}
    />
  );
}
