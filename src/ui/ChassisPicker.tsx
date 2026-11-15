import { useState } from 'react';
import { hasAsset, imageUrl } from '../game/assets/manifest.ts';
import { standingExtent } from '../game/scenes/chassisArt.ts';
import { composeSpacecraft } from '../game/scenes/spacecraftComposition.ts';
import { CHASSIS_IDS, newSpacecraft, type ChassisId } from '../game/sim/index.ts';
import { chassisName } from './format.ts';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';
import { SpacecraftLayers } from './SpacecraftLayers.tsx';

const CARD_WIDTH = 192;
const BUTTON_WIDTH = 96;
/** Under the card's name row: where the Spacecraft art starts (px from the card's top). */
const SPRITE_TOP = 24;
/** Under the art to the card's edge. */
const CARD_PADDING = 12;
/** The art box: as tall as the tallest Chassis art; every ship stands on its bottom line (px). */
const ART_BOX_HEIGHT = standingExtent(CHASSIS_IDS).height;
/** The card is as tall as its tallest Chassis art needs: the name, then the art. */
const CARD_HEIGHT = SPRITE_TOP + ART_BOX_HEIGHT + CARD_PADDING;
/** Where the cards start, and the gap below them to the buttons (px). */
const CARDS_TOP = 52;
const ACTIONS_GAP = 16;
const ACTIONS_TOP = CARDS_TOP + CARD_HEIGHT + ACTIONS_GAP;
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
 * Chassis picker, shown after New Run: the three Chassis side by side, each its name and its look.
 * A Chassis is cosmetic (#298, ADR 0006): every one flies the same, so the choice is only how the
 * Spacecraft looks. A radio group, so the arrow keys move the choice and Tab moves on to Launch.
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

/** The new Spacecraft of this Chassis, composed as the Landed view draws it. */
function ComposedSprite({ id, atlasKey }: { id: ChassisId; atlasKey: string }) {
  const composition = composeSpacecraft(id, newSpacecraft(id).slots, 'landed');
  const { width, height } = composition.geometry;
  return (
    <SpacecraftLayers
      composition={composition}
      atlasKey={atlasKey}
      className="chassis-card__sprite"
      style={{ left: (CARD_WIDTH - width) / 2, top: SPRITE_TOP + ART_BOX_HEIGHT - height }}
    />
  );
}
