import { describe, expect, it } from 'vitest';
import { COMPONENTS } from '../game/sim/catalogue.ts';
import { FUEL_NOTE, ICE_LINE, SOURCED_CONSTANTS, SOURCED_RANGES } from '../game/sim/data.ts';
import { ABOUT, CREDITS, type ContentLink } from './aboutContent.ts';

/** Every URL the simulation data cites in a `source` field or a Component's sourced provenance. */
function citedUrls(): Set<string> {
  const sources: string[] = [
    ...Object.values(SOURCED_RANGES).flatMap((body) => Object.values(body).map((r) => r.source)),
    ...Object.values(SOURCED_CONSTANTS).map((c) => c.source),
    ICE_LINE.distance.source,
    FUEL_NOTE.source,
    ...Object.values(COMPONENTS).flatMap((c) =>
      c.provenance.kind === 'sourced' ? [c.provenance.source] : [],
    ),
  ];
  const urls = sources.flatMap((s) => s.match(/https?:\/\/[^\s`'"<>)]+/g) ?? []);
  return new Set(urls.map((u) => u.replace(/[;,.]+$/, '')));
}

function group(prefix: string) {
  return CREDITS.groups.find((g) => g.heading.startsWith(prefix));
}

function allLinks(): ContentLink[] {
  return [
    ABOUT.challenge,
    ABOUT.ai.link,
    ...ABOUT.nasa.links,
    ABOUT.nasa.notes,
    ...CREDITS.groups.flatMap((g) => g.entries.flatMap((e) => (e.link ? [e.link] : []))),
  ];
}

describe('About and Credits content', () => {
  it('links every external resource over https', () => {
    for (const { url } of allLinks()) expect(url).toMatch(/^https:\/\/[^\s]+$/);
  });

  it('points GitHub links at the main branch of this repository', () => {
    const github = allLinks().filter(({ url }) => url.includes('github.com/FrancoLedArg'));
    expect(github.length).toBeGreaterThan(0);
    for (const { url } of github) {
      expect(url).toMatch(/^https:\/\/github\.com\/FrancoLedArg\/heliopause\/blob\/main\//);
    }
  });

  it('links the generated licence notices by a relative URL so it works under any base path', () => {
    expect(CREDITS.licenses.url).toBe('./THIRD-PARTY-LICENSES.txt');
  });

  it('does not call the build tools not shipped, since Vite injects helpers into the bundle', () => {
    expect(CREDITS.groups.map((g) => g.heading).join()).not.toContain('not shipped');
  });

  it('shows the solo team by its GitHub handle, with no placeholder', () => {
    expect(ABOUT.team.members.map((m) => m.name)).toEqual(['FrancoLedArg']);
    expect(JSON.stringify(ABOUT.team)).not.toMatch(/placeholder|TO BE ADDED/i);
  });

  it('credits the Voxel Spaceships pack, under its licence, as the style reference of the earlier art', () => {
    const voxel = CREDITS.groups.flatMap((g) => g.entries).find((e) => e.name.includes('Voxel'));
    expect(voxel?.detail).toContain('CC BY-ND 4.0');
    expect(voxel?.detail).toMatch(/style reference for the earlier Spacecraft art/i);
    expect(voxel?.detail).toContain('nothing from the pack is used in the game');
  });

  it('lists shipped libraries apart from dev-only tools', () => {
    const shipped = CREDITS.groups.find((g) => g.heading.startsWith('Libraries'));
    const tools = CREDITS.groups.find((g) => g.heading.startsWith('Tools'));
    expect(shipped?.entries.map((e) => e.name).join()).toMatch(/Phaser.*React.*Silkscreen/);
    expect(tools?.entries.map((e) => e.name)).toContain('Vite');
  });

  it("lists every source URL the game's data cites in the References", () => {
    const cited = citedUrls();
    expect(cited.size).toBeGreaterThan(5);
    const listed = new Set(group('References')?.entries.map((e) => e.link?.url));
    for (const url of cited) expect(listed).toContain(url);
  });

  it('gives every Reference a readable label and puts NASA sources first', () => {
    const entries = group('References')?.entries ?? [];
    for (const e of entries) expect(e.link?.label.length).toBeGreaterThan(3);
    const isNasa = entries.map((e) => (e.link?.url ?? '').includes('nasa.gov'));
    expect(isNasa.indexOf(false)).toBeGreaterThan(0);
    expect(isNasa.lastIndexOf(true)).toBeLessThan(isNasa.indexOf(false));
    expect(entries.map((e) => e.link?.url)).toContain(
      'https://github.com/FrancoLedArg/heliopause/blob/main/docs/research/',
    );
  });

  it('gives every Reference link a distinct accessible name', () => {
    const labels = (group('References')?.entries ?? []).map((e) => e.link?.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label).toMatch(/^Source: /);
  });

  it('is named Credits & References', () => {
    expect(CREDITS.heading).toBe('Credits & References');
  });

  it('credits the work behind #52 and #70 as Inspiration, a challenge not a team project', () => {
    const text = JSON.stringify(group('Inspiration'));
    expect(text).toContain('Lunar Landing Site Navigator');
    expect(text).toContain('NASA Space Apps Challenge 2026');
    expect(text).toContain('Astro Sweepers: We Catch What Space Leaves Behind');
    expect(text).toContain('NASA Space Apps Challenge 2025 project');
  });

  it('states no award or placement for the Inspiration credits', () => {
    expect(JSON.stringify(group('Inspiration'))).not.toMatch(
      /award|winner|galactic impact|place[ds]?\b|finalist|nominee|prize|1st|2nd|3rd/i,
    );
  });

  it('shows no NASA logo, insignia or image in any credit', () => {
    expect(JSON.stringify(CREDITS)).not.toMatch(/\.(png|svg|jpg)|insignia|meatball|worm/i);
  });
});
