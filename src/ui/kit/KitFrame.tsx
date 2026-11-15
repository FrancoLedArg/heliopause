import { useLayoutEffect, useRef } from 'react';
import { kitFrameSize, sliceKitFrame, type KitFrameName } from './kit.ts';
import { useKitAtlas } from './useKitAtlas.ts';

interface KitFrameProps {
  frame: KitFrameName;
  /** Size in native (640×360) pixels; defaults to the frame's own size. Sliced frames stretch. */
  width?: number;
  height?: number;
  /** Shows the frame this many times its drawn size (an icon at half size: 0.5). Pixels stay square. */
  scale?: number;
  className?: string;
}

/**
 * Draws one UI kit frame (panel, button face, title bar, divider, icon) at any size its slices
 * allow, pixel for pixel from the kit atlas. Decorative: hidden from assistive technology.
 */
export function KitFrame({ frame, width, height, scale = 1, className }: KitFrameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const atlas = useKitAtlas();
  const natural = kitFrameSize(frame);
  const w = width ?? natural.w;
  const h = height ?? natural.h;

  useLayoutEffect(() => {
    const context = canvasRef.current?.getContext('2d');
    if (!atlas || !context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, w, h);
    for (const { source, dest } of sliceKitFrame(frame, w, h)) {
      context.drawImage(
        atlas,
        source.x,
        source.y,
        source.w,
        source.h,
        dest.x,
        dest.y,
        dest.w,
        dest.h,
      );
    }
  }, [atlas, frame, w, h]);

  return (
    <canvas
      ref={canvasRef}
      width={w}
      height={h}
      aria-hidden="true"
      className={className ? `kit-frame ${className}` : 'kit-frame'}
      style={{ width: w * scale, height: h * scale }}
    />
  );
}
