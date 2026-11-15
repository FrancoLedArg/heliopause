import { imageUrl } from '../game/assets/manifest.ts';

/**
 * Science's icon: the 16×16 pixel-art flask. Presentational: the readout or the card beside it carries
 * the words, so the image is hidden from assistive tech. Drawn crisp at any size.
 */
export function ScienceIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <img
      src={imageUrl('res_science')}
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      style={{ imageRendering: 'pixelated' }}
      className={className ? `science-icon ${className}` : 'science-icon'}
    />
  );
}
