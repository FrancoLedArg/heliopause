import { KitFrame } from './kit/KitFrame.tsx';

const PLATE_WIDTH = 200;
const PLATE_HEIGHT = 54;

interface LandedPlaceholderProps {
  seed: number;
}

/** Stand-in location plate for the Landed view until the Star System names the Body. */
export function LandedPlaceholder({ seed }: LandedPlaceholderProps) {
  return (
    <section
      className="landed-plate"
      aria-labelledby="landed-title"
      style={{ width: PLATE_WIDTH, height: PLATE_HEIGHT }}
    >
      <KitFrame frame="panel_holo" width={PLATE_WIDTH} height={PLATE_HEIGHT} />
      <h1 id="landed-title" className="landed-plate__title">
        Landed
      </h1>
      <p className="landed-plate__kind">Placeholder surface</p>
      <p className="landed-plate__detail">Run seed {seed}</p>
    </section>
  );
}
