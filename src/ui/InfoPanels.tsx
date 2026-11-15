import { useEffect, type ReactNode } from 'react';
import { ABOUT, CREDITS, HOW_TO_PLAY, type ContentLink, type CreditEntry } from './aboutContent.ts';
import { KitButton } from './kit/KitButton.tsx';
import { ResourceIcon } from './ResourceIcon.tsx';
import { KitFrame } from './kit/KitFrame.tsx';

const PLATE_LEFT = 24;
const PLATE_TOP = 8;
const PLATE_WIDTH = 592;
const PLATE_HEIGHT = 296;
const BACK_WIDTH = 96;

interface InfoPanelProps {
  /** Back to the title menu. */
  onBack: () => void;
}

/** A link that opens in a new tab (another site, or the notices file) and never hands the opener over. */
function ExternalLink({ link }: { link: ContentLink }) {
  return (
    <a
      className="info-link"
      href={link.url}
      aria-label={link.accessibleName}
      target="_blank"
      rel="noopener noreferrer"
    >
      {link.label}
    </a>
  );
}

interface InfoShellProps extends InfoPanelProps {
  id: string;
  backLabel: string;
  title: string;
  children: ReactNode;
}

/**
 * Full-screen title-level panel: a kit plate with a scrolling body and a Back action under it. Esc
 * also goes back. The caller restores focus to the button that opened it.
 */
function InfoShell({ id, title, backLabel, onBack, children }: InfoShellProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onBack]);

  return (
    <section className="info-panel" aria-labelledby={`${id}-title`}>
      <div
        className="info-panel__plate"
        style={{ left: PLATE_LEFT, top: PLATE_TOP, width: PLATE_WIDTH, height: PLATE_HEIGHT }}
      >
        <KitFrame frame="panel_metal" width={PLATE_WIDTH} height={PLATE_HEIGHT} />
        <h1 id={`${id}-title`} className="info-panel__title">
          {title}
        </h1>
        <div className="info-panel__body" tabIndex={0}>
          {children}
        </div>
      </div>
      <div className="info-panel__actions">
        <KitButton width={BACK_WIDTH} autoFocus onClick={onBack}>
          {backLabel}
        </KitButton>
      </div>
    </section>
  );
}

/** What the game is, who made it, how AI was used and which NASA resources it draws on. */
export function AboutPanel({ onBack }: InfoPanelProps) {
  return (
    <InfoShell id="about" title={ABOUT.heading} backLabel={ABOUT.back} onBack={onBack}>
      {ABOUT.summary.map((sentence) => (
        <p key={sentence}>{sentence}</p>
      ))}
      <p>
        <ExternalLink link={ABOUT.challenge} />
      </p>
      <h2>{ABOUT.team.heading}</h2>
      <ul>
        {ABOUT.team.members.map((member) => (
          <li key={member.name}>
            {member.name}: {member.role}
          </li>
        ))}
      </ul>
      <h2>{ABOUT.ai.heading}</h2>
      <ul>
        {ABOUT.ai.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <p>
        <ExternalLink link={ABOUT.ai.link} />
      </p>
      <h2>{ABOUT.nasa.heading}</h2>
      <p>{ABOUT.nasa.intro}</p>
      <ul>
        {[...ABOUT.nasa.links, ABOUT.nasa.notes].map((link) => (
          <li key={link.url}>
            <ExternalLink link={link} />
          </li>
        ))}
      </ul>
    </InfoShell>
  );
}

function CreditItem({ entry }: { entry: CreditEntry }) {
  return (
    <li>
      <strong>{entry.name}</strong>: {entry.detail}
      {entry.link && (
        <>
          {' '}
          <ExternalLink link={entry.link} />
        </>
      )}
    </li>
  );
}

/** Libraries, tools and art with their licences, and the research the game stands on. */
export function CreditsPanel({ onBack }: InfoPanelProps) {
  return (
    <InfoShell id="credits" title={CREDITS.heading} backLabel={CREDITS.back} onBack={onBack}>
      <p>
        <ExternalLink link={CREDITS.licenses} />
      </p>
      {CREDITS.groups.map((group) => (
        <section key={group.heading}>
          <h2>{group.heading}</h2>
          <ul>
            {group.entries.map((entry) => (
              <CreditItem key={entry.name} entry={entry} />
            ))}
          </ul>
        </section>
      ))}
    </InfoShell>
  );
}

/** The resources a How to play line can show as an icon, by placeholder, with the words they stand for. */
const INLINE_ICONS = {
  '{fuel}': { resource: 'fuel', label: 'Fuel' },
  '{materials}': { resource: 'materials', label: 'Materials' },
} as const;

/** A How to play line with its `{fuel}` and `{materials}` placeholders drawn as the yield icons. */
function withIcons(line: string): ReactNode[] {
  return line.split(/(\{fuel\}|\{materials\})/).map((part, index) => {
    if (part !== '{fuel}' && part !== '{materials}') return part;
    const { resource, label } = INLINE_ICONS[part];
    return <ResourceIcon key={`${part}-${String(index)}`} resource={resource} label={label} />;
  });
}

/** The rules in eight short steps, in glossary terms. */
export function HowToPlayPanel({ onBack }: InfoPanelProps) {
  return (
    <InfoShell
      id="how-to-play"
      title={HOW_TO_PLAY.heading}
      backLabel={HOW_TO_PLAY.back}
      onBack={onBack}
    >
      {HOW_TO_PLAY.steps.map((step) => (
        <section key={step.heading}>
          <h2>{step.heading}</h2>
          <p>{withIcons(step.body.join(' '))}</p>
        </section>
      ))}
    </InfoShell>
  );
}
