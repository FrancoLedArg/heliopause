import type { CSSProperties } from 'react';
import { atlasImageUrl } from '../game/assets/manifest.ts';
import type { SpacecraftComposition } from '../game/scenes/spacecraftComposition.ts';
import { useAtlasFrames } from './useAtlasFrames.ts';

interface SpacecraftLayersProps {
  /** The drawn Spacecraft, from `composeSpacecraft`, so React draws it as the Landed view does. */
  composition: SpacecraftComposition;
  /** The Chassis's atlas key (`chassis_<id>`), which holds the Chassis art and every Component art. */
  atlasKey: string;
  /** Positions the frame; the layers sit inside it. */
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

/**
 * The composed Spacecraft in the DOM: one span per layer, cut from the atlas image, back to front,
 * in a box the size of its frame. Decorative: whoever places it gives the words.
 */
export function SpacecraftLayers({
  composition,
  atlasKey,
  className,
  style,
}: SpacecraftLayersProps) {
  const frames = useAtlasFrames(atlasKey);
  const { width, height, pivot } = composition.geometry;
  return (
    <span aria-hidden="true" className={className} style={{ ...style, width, height }}>
      {frames &&
        composition.layers.map(({ frame, rect }) => {
          const at = frames.get(frame);
          if (!at) return null;
          return (
            <span
              key={frame}
              className="spacecraft-layer"
              data-frame={frame}
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
