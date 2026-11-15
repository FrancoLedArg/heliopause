/**
 * Everything the About and Credits screens say, in one place so the team can edit text, links and
 * the team list without touching the components. Text only: no NASA logos, insignia or mission
 * identifiers (Space Apps rules).
 */

export interface ContentLink {
  label: string;
  /** Always an absolute https URL: it opens in a new tab. */
  url: string;
}

export interface TeamMember {
  name: string;
  role: string;
  /** A stand-in the team replaces; the screen marks it visibly. */
  placeholder?: boolean;
}

export interface CreditEntry {
  name: string;
  detail: string;
  link?: ContentLink;
}

export interface CreditGroup {
  heading: string;
  entries: readonly CreditEntry[];
}

const REPO_BLOB = 'https://github.com/FrancoLedArg/heliopause/blob/main';

const TEAM: readonly TeamMember[] = [{ name: 'FrancoLedArg', role: 'Solo team (GitHub handle)' }];

export const ABOUT = {
  heading: 'About',
  summary: [
    'Heliopause is a space mission design game made for the NASA Space Apps Challenge 2026, "Space Mission Design Game".',
    'You fly a Spacecraft out of a procedurally generated Star System one Hop at a time, spending Fuel and Δv, and every Run is a new system.',
  ],
  challenge: {
    label: 'The challenge page',
    url: 'https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/',
  } satisfies ContentLink,
  team: {
    heading: 'Team',
    members: TEAM,
  },
  ai: {
    heading: 'How AI was used',
    points: [
      'The idea, the design direction and every product decision are human. AI interviewed the team, stress-tested ideas and wrote the agreed decisions down as specs.',
      'Real-world data was gathered by AI research agents from NASA and other primary sources, and every figure cites its source in docs/research.',
      'The code is written and reviewed by AI agents (Anthropic Claude) and checked by automated tests.',
      'The art is AI-generated, and every screen carries an "AI-generated art" label. The human sketches set the composition.',
    ],
    link: {
      label: 'Read the full AI usage statement',
      url: `${REPO_BLOB}/AI-USAGE.md`,
    } satisfies ContentLink,
  },
  nasa: {
    heading: 'NASA data and resources used',
    intro: 'Real figures behind the game, each cited in our research notes.',
    links: [
      {
        label: 'Planetary and satellite fact sheets (NSSDCA)',
        url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
      },
      {
        label: 'The ideal rocket equation (NASA Glenn)',
        url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/',
      },
      {
        label: 'Mars ascent and descent Δv (NASA NTRS, Palaszewski)',
        url: 'https://ntrs.nasa.gov/citations/20210026187',
      },
      {
        label: 'Astrodynamic parameters (NASA/JPL Solar System Dynamics)',
        url: 'https://ssd.jpl.nasa.gov/astro_par.html',
      },
      {
        label: 'Voyager interstellar mission',
        url: 'https://science.nasa.gov/mission/voyager/interstellar-mission/',
      },
    ] satisfies readonly ContentLink[],
    notes: {
      label: 'All sources, with citations',
      url: `${REPO_BLOB}/docs/research/nasa-data-for-generation.md`,
    } satisfies ContentLink,
  },
  back: 'Back',
};

function ref(label: string, detail: string, url: string): CreditEntry {
  return { name: label, detail, link: { label: 'Source', url } };
}

export const CREDITS: {
  heading: string;
  /** The generated notices file the build writes next to the game; a relative URL, so it works under any base path. */
  licenses: ContentLink;
  groups: readonly CreditGroup[];
  back: string;
} = {
  heading: 'Credits & References',
  licenses: {
    label: 'Full licence texts of everything shipped (THIRD-PARTY-LICENSES.txt)',
    url: './THIRD-PARTY-LICENSES.txt',
  },
  groups: [
    {
      heading: 'Libraries (shipped in the game)',
      entries: [
        {
          name: 'Phaser 4',
          detail: 'MIT licence',
          link: { label: 'phaser.io', url: 'https://phaser.io/' },
        },
        {
          name: 'React 19',
          detail: 'MIT licence',
          link: { label: 'react.dev', url: 'https://react.dev/' },
        },
        {
          name: 'eventemitter3',
          detail: 'MIT licence, used inside Phaser',
          link: {
            label: 'github.com/primus/eventemitter3',
            url: 'https://github.com/primus/eventemitter3',
          },
        },
        {
          name: 'Silkscreen and VT323 fonts',
          detail: 'SIL Open Font License 1.1, bundled with Fontsource',
          link: { label: 'fontsource.org', url: 'https://fontsource.org/' },
        },
      ],
    },
    {
      heading: 'Tools (used to build the game)',
      entries: [
        {
          name: 'Vite',
          detail: 'MIT licence. A few small helpers it injects are part of the game bundle',
          link: { label: 'vite.dev', url: 'https://vite.dev/' },
        },
        { name: 'TypeScript', detail: 'Apache-2.0 licence' },
        { name: 'Vitest', detail: 'MIT licence' },
        { name: 'Playwright', detail: 'Apache-2.0 licence' },
      ],
    },
    {
      heading: 'Art',
      entries: [
        { name: 'UI kit', detail: 'AI-generated by the human team' },
        { name: 'Game sprites', detail: 'AI-generated by AI agents (Claude)' },
        {
          name: 'Voxel Spaceships by Max Parata',
          detail:
            'CC BY-ND 4.0. Style reference for the earlier Spacecraft art; nothing from the pack is used in the game',
          link: { label: 'maxparata.itch.io', url: 'https://maxparata.itch.io/voxel-spaceships' },
        },
      ],
    },
    {
      heading: 'Inspiration',
      entries: [
        {
          name: 'NASA Space Apps Challenge 2026: "Lunar Landing Site Navigator"',
          detail:
            'The challenge behind our day and night and temperature ideas (a challenge, not a team project)',
          link: {
            label: 'Challenge page',
            url: 'https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/',
          },
        },
        {
          name: 'Astro Sweepers: We Catch What Space Leaves Behind',
          detail: 'NASA Space Apps Challenge 2025 project that inspired our space debris ideas',
          link: {
            label: 'Project page',
            url: 'https://www.spaceappschallenge.org/2025/find-a-team/astro-sweepers-we-catch-what-space-leaves-behind/',
          },
        },
      ],
    },
    {
      heading: 'References (the sources behind the game data)',
      entries: [
        ref(
          'NASA NSSDCA planetary fact sheets',
          'Planet and moon gravity, escape and orbital velocity, distances',
          'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
        ),
        ref(
          'NASA NSSDCA Mars fact sheet',
          'Mars escape velocity',
          'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html',
        ),
        ref(
          'NASA NSSDCA Galilean satellite fact sheet',
          'Io, Europa, Ganymede and Callisto figures',
          'https://nssdc.gsfc.nasa.gov/planetary/factsheet/galileanfact_table.html',
        ),
        ref(
          'NASA NSSDCA Saturnian satellite fact sheet',
          'Enceladus mass and radius',
          'https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturniansatfact.html',
        ),
        ref(
          'NASA Glenn: Specific Impulse',
          'Standard gravity and Isp',
          'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/specific-impulse/',
        ),
        ref(
          'NASA Glenn: Ideal Rocket Equation',
          'The Δv rule behind every Hop',
          'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/',
        ),
        ref(
          'NASA NTRS: Mars Landing Vehicles, Descent and Ascent Propulsion Design Issues (Palaszewski)',
          'Mars ascent Δv',
          'https://ntrs.nasa.gov/citations/20210026187',
        ),
        ref(
          'NASA NTRS: Borowski et al., nuclear thermal propulsion',
          'Engine Isp and the drop tank',
          'https://ntrs.nasa.gov/citations/20120003776',
        ),
        ref(
          'NASA/JPL Solar System Dynamics: Astrodynamic Parameters',
          'The astronomical unit',
          'https://ssd.jpl.nasa.gov/astro_par.html',
        ),
        ref(
          'Lecar et al. 2006, ApJ 640, 1115',
          'The Solar System ice line',
          'https://doi.org/10.1086/500159',
        ),
        ref(
          'Our research notes',
          'Every figure we use, with its source',
          `${REPO_BLOB}/docs/research/`,
        ),
      ],
    },
  ],
  back: 'Back',
};
