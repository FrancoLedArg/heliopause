import type { ButtonHTMLAttributes } from 'react';
import { KitFrame } from './KitFrame.tsx';

/** Default for secondary actions, primary (amber) for the main action on a screen, danger (red) for destructive ones. */
export type KitButtonVariant = 'default' | 'primary' | 'danger';

const KIT_BUTTON_HEIGHT = 24;
const FACES = ['normal', 'hover', 'pressed', 'disabled'] as const;

interface KitButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: KitButtonVariant;
  /** Width in native pixels; the kit button stretches from its 96px default. */
  width?: number;
}

/**
 * A real `<button>` dressed in the kit's button frames. CSS picks the face for hover, keyboard
 * focus, press and disabled (see `.kit-button` in style.css), so state never lives in JS.
 */
export function KitButton({
  variant = 'default',
  width = 96,
  className,
  children,
  type = 'button',
  ...buttonProps
}: KitButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      className={className ? `kit-button ${className}` : 'kit-button'}
      style={{ width, height: KIT_BUTTON_HEIGHT }}
    >
      {FACES.map((face) => (
        <KitFrame
          key={face}
          frame={`btn_${variant}_${face}`}
          width={width}
          height={KIT_BUTTON_HEIGHT}
          className={`kit-button__face kit-button__face--${face}`}
        />
      ))}
      <span className="kit-button__label">{children}</span>
    </button>
  );
}
