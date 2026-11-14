import { useCallback, useEffect, useRef, useState } from 'react';
import { KitButton } from './kit/KitButton.tsx';
import { KitFrame } from './kit/KitFrame.tsx';

const PANEL_WIDTH = 176;
const PANEL_HEIGHT = 112;
const BUTTON_WIDTH = 144;
const HALF_BUTTON_WIDTH = 68;

type Step = 'menu' | 'confirm';

interface RunMenuProps {
  /** Whether the Menu is open; owned by the parent so it can route keys around an open Menu. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The player confirmed leaving the Run. */
  onLeave: () => void;
}

/**
 * The in-Run Menu: a Menu button in the top bar and Esc open a panel over the dimmed scene with
 * Resume and Back to title (which asks first, since a Run can't be resumed). While it is open it
 * traps Tab focus and, on close, gives focus back to where it was.
 *
 * Esc closes the topmost overlay first: an open Menu takes Esc before anything under it, and when
 * the Menu is closed, Esc opens it only if no other handler (the Nav Chart) consumed the key with
 * `preventDefault()`.
 */
export function RunMenu({ open, onOpenChange, onLeave }: RunMenuProps) {
  const [step, setStep] = useState<Step>('menu');
  const returnFocus = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const openMenu = useCallback((): void => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setStep('menu');
    onOpenChange(true);
  }, [onOpenChange]);
  const resume = useCallback((): void => {
    onOpenChange(false);
    returnFocus.current?.focus();
    returnFocus.current = null;
  }, [onOpenChange]);

  // Closed: Esc opens the Menu, unless another handler used the key to close its own overlay.
  useEffect(() => {
    if (open) return undefined;
    let pending: number | undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.repeat || event.defaultPrevented) return;
      // Wait for every other keydown handler, whatever order they were added in.
      pending = window.setTimeout(() => {
        if (!event.defaultPrevented) openMenu();
      }, 0);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(pending);
    };
  }, [open, openMenu]);

  // Open: this panel is topmost. Capture Esc before overlays beneath it, and keep Tab inside.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (step === 'confirm') setStep('menu');
        else resume();
      } else if (event.key === 'Tab') {
        const buttons = [...(panel.current?.querySelectorAll('button') ?? [])];
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!first || !last) return;
        const active = document.activeElement;
        if (!panel.current?.contains(active)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, step, resume]);

  // Each step puts focus on its safe default: Resume, or Stay.
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [open, step]);

  return (
    <>
      <KitButton width={56} className="run-menu__button" onClick={openMenu}>
        Menu
      </KitButton>
      {open && (
        <div className="run-menu__scrim">
          <div
            ref={panel}
            className="run-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="run-menu-title"
            style={{ width: PANEL_WIDTH, height: PANEL_HEIGHT }}
          >
            <KitFrame frame="panel_metal" width={PANEL_WIDTH} height={PANEL_HEIGHT} />
            {step === 'menu' ? (
              <>
                <h2 id="run-menu-title" className="run-menu__title">
                  Menu
                </h2>
                <div className="run-menu__actions">
                  <KitButton variant="primary" width={BUTTON_WIDTH} data-autofocus onClick={resume}>
                    Resume
                  </KitButton>
                  <KitButton
                    width={BUTTON_WIDTH}
                    onClick={() => {
                      setStep('confirm');
                    }}
                  >
                    Back to title
                  </KitButton>
                </div>
              </>
            ) : (
              <>
                <h2 id="run-menu-title" className="run-menu__title">
                  Leave this Run? It can&apos;t be resumed.
                </h2>
                <div className="run-menu__actions run-menu__actions--row">
                  <KitButton variant="danger" width={HALF_BUTTON_WIDTH} onClick={onLeave}>
                    Leave
                  </KitButton>
                  <KitButton
                    variant="primary"
                    width={HALF_BUTTON_WIDTH}
                    data-autofocus
                    onClick={() => {
                      setStep('menu');
                    }}
                  >
                    Stay
                  </KitButton>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
