import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectNotices, packageDirOf, readNotice, renderNotices } from './licenseNotices.ts';

function fakePackage(
  root: string,
  name: string,
  files: Record<string, string>,
  dependencies: Record<string, string> = {},
): string {
  const dir = join(root, 'node_modules', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name, version: '1.2.3', dependencies }),
  );
  for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text);
  return dir;
}

const root = () => mkdtempSync(join(tmpdir(), 'heliopause-lic-'));

describe('packageDirOf', () => {
  it('finds the package directory for plain, scoped and pnpm-nested paths', () => {
    expect(packageDirOf('/a/node_modules/react/index.js')).toBe('/a/node_modules/react');
    expect(packageDirOf('/a/node_modules/@fontsource/vt323/400.css?inline')).toBe(
      '/a/node_modules/@fontsource/vt323',
    );
    expect(packageDirOf('/a/node_modules/.pnpm/x@1/node_modules/phaser/src/a.js')).toBe(
      '/a/node_modules/.pnpm/x@1/node_modules/phaser',
    );
  });

  it('ignores first-party and virtual modules', () => {
    expect(packageDirOf('/a/src/main.tsx')).toBeUndefined();
    expect(packageDirOf('\0vite/preload-helper.js')).toBeUndefined();
  });
});

describe('collectNotices', () => {
  it('lists each bundled package once with its version and full licence text', () => {
    const dir = root();
    const a = fakePackage(dir, 'alpha', { LICENSE: 'MIT text A\n' });
    const b = fakePackage(dir, '@scope/beta', { 'LICENSE.md': 'OFL text B' });
    const notices = collectNotices([`${b}/x.css`, `${a}/index.js`, `${a}/other.js`]);
    expect(notices).toEqual([
      { name: '@scope/beta', version: '1.2.3', licenseText: 'OFL text B' },
      { name: 'alpha', version: '1.2.3', licenseText: 'MIT text A' },
    ]);
    const text = renderNotices(notices);
    expect(text).toContain('alpha 1.2.3');
    expect(text).toContain('MIT text A');
    expect(text).toContain('OFL text B');
  });

  it('includes dependencies a pre-bundled package inlines, which the module graph never shows', () => {
    const dir = root();
    fakePackage(dir, 'inlined', { LICENSE: 'inlined text' });
    const host = fakePackage(dir, 'host', { LICENSE: 'host text' }, { inlined: '^1.0.0' });
    expect(collectNotices([`${host}/dist/host.js`]).map((n) => n.name)).toEqual([
      'host',
      'inlined',
    ]);
  });

  it('includes the Vite and rolldown helpers injected into the bundle under virtual ids', () => {
    const names = collectNotices(['\0vite/preload-helper.js', 'rolldown/runtime.js']).map(
      (n) => n.name,
    );
    expect(names).toEqual(['rolldown', 'vite']);
  });

  it('fails when a declared dependency is not installed', () => {
    const dir = root();
    const host = fakePackage(dir, 'host', { LICENSE: 'x' }, { ghost: '^1.0.0' });
    expect(() => collectNotices([`${host}/index.js`])).toThrow(/ghost/);
  });

  it('fails when a bundled package has no licence file', () => {
    const dir = root();
    const bare = fakePackage(dir, 'unlicensed', { 'README.md': 'hi' });
    expect(() => collectNotices([`${bare}/index.js`])).toThrow(/unlicensed.*no licence file/);
    expect(() => readNotice(bare)).toThrow();
  });
});
