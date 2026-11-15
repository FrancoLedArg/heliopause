import type { KeyboardEvent } from 'react';

/**
 * Keeps keyboard focus inside `container`: Tab on its last button goes to its first, and Shift+Tab on
 * the first goes to the last. Call it from the dialog's `onKeyDown`.
 */
export function trapTab(event: KeyboardEvent, container: HTMLElement | null): void {
  if (event.key !== 'Tab') return;
  const found = container?.querySelectorAll('button') ?? [];
  const first = found[0];
  const last = found[found.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
