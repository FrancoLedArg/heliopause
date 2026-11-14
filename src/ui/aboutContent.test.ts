import { describe, expect, it } from 'vitest';
import { ABOUT, CREDITS, type ContentLink } from './aboutContent.ts';

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

  it('ships the team as a visible placeholder, not invented names', () => {
    expect(ABOUT.team.members.length).toBeGreaterThan(0);
    expect(ABOUT.team.members.every((m) => m.placeholder === true)).toBe(true);
  });

  it('credits the Voxel Spaceships pack as a style reference under its licence', () => {
    const voxel = CREDITS.groups.flatMap((g) => g.entries).find((e) => e.name.includes('Voxel'));
    expect(voxel?.detail).toContain('CC BY-ND 4.0');
    expect(voxel?.detail).toContain('style reference');
  });

  it('lists shipped libraries apart from dev-only tools', () => {
    const shipped = CREDITS.groups.find((g) => g.heading.startsWith('Libraries'));
    const tools = CREDITS.groups.find((g) => g.heading.startsWith('Tools'));
    expect(shipped?.entries.map((e) => e.name).join()).toMatch(/Phaser.*React.*Silkscreen/);
    expect(tools?.entries.map((e) => e.name)).toContain('Vite');
  });

  it('leaves out the unconfirmed Inspiration credit', () => {
    expect(JSON.stringify(CREDITS)).not.toContain('Astro Sweepers');
  });
});
