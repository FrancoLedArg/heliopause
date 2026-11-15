import { createContext, use, useId, useState, type ReactNode } from 'react';
import { KitFrame } from './kit/KitFrame.tsx';
import './Disclosure.css';

/**
 * Show, don't tell: text that would crowd a panel waits behind a toggle. A `Disclosure` pairs one
 * toggle with one panel, wherever each sits in the layout; both start closed, and nothing is
 * remembered between openings. The toggle is a real `<button>`, so Enter and Space work, and it
 * says whether its panel is open in `aria-expanded`.
 */
interface DisclosureState {
  readonly open: boolean;
  readonly toggle: () => void;
  readonly panelId: string;
}

const DisclosureContext = createContext<DisclosureState | undefined>(undefined);

function useDisclosure(): DisclosureState {
  const state = use(DisclosureContext);
  if (!state) throw new Error('A Disclosure toggle or panel must sit inside a <Disclosure>');
  return state;
}

/** One toggle and its panel. Renders no element of its own, so each can sit where the layout needs. */
export function Disclosure({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggle = (): void => {
    setOpen((was) => !was);
  };
  return <DisclosureContext value={{ open, toggle, panelId }}>{children}</DisclosureContext>;
}

interface ToggleProps {
  className?: string | undefined;
  /** The accessible name, when the visible content is only an icon. */
  'aria-label'?: string | undefined;
  children: ReactNode;
}

/** The button that opens and closes the panel. */
export function DisclosureToggle({ className, children, ...aria }: ToggleProps) {
  const { open, toggle, panelId } = useDisclosure();
  return (
    <button
      type="button"
      className={className ? `disclosure-toggle ${className}` : 'disclosure-toggle'}
      aria-expanded={open}
      aria-controls={panelId}
      onClick={toggle}
      {...aria}
    >
      {children}
    </button>
  );
}

/** What the toggle opens: in the page while closed, but hidden from sight and from screen readers. */
export function DisclosurePanel({
  className,
  children,
}: {
  className?: string | undefined;
  children: ReactNode;
}) {
  const { open, panelId } = useDisclosure();
  return (
    <div
      id={panelId}
      className={className ? `disclosure-panel ${className}` : 'disclosure-panel'}
      hidden={!open}
    >
      {children}
    </div>
  );
}

/** The kit's "Tell me more" toggle: the info icon and the words. */
export function TellMeMoreToggle({ className }: { className?: string | undefined }) {
  return (
    <DisclosureToggle className={className}>
      <KitFrame frame="icon_info" className="disclosure-toggle__icon" />
      <span>Tell me more</span>
    </DisclosureToggle>
  );
}

/** The kit's "?" toggle for one-off help: the help icon, with `label` as its accessible name. */
export function HelpToggle({
  label,
  className,
}: {
  label: string;
  className?: string | undefined;
}) {
  return (
    <DisclosureToggle className={className} aria-label={label}>
      <KitFrame frame="icon_help" className="disclosure-toggle__icon" />
    </DisclosureToggle>
  );
}

/** "Tell me more" with its text right below it: the common case. */
export function TellMeMore({
  className,
  children,
}: {
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <Disclosure>
      <TellMeMoreToggle />
      <DisclosurePanel className={className}>{children}</DisclosurePanel>
    </Disclosure>
  );
}
