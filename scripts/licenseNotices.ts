import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

export const NOTICES_FILE = 'THIRD-PARTY-LICENSES.txt';

export interface PackageNotice {
  name: string;
  version: string;
  /** The licence file's text, verbatim. */
  licenseText: string;
}

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;
const NODE_MODULES = '/node_modules/';

/** The package directory a bundled module id lives in, or undefined for first-party and virtual modules. */
export function packageDirOf(moduleId: string): string | undefined {
  if (moduleId.startsWith('\0')) return undefined;
  const path = (moduleId.split('?')[0] ?? '').replaceAll('\\', '/');
  const at = path.lastIndexOf(NODE_MODULES);
  if (at === -1) return undefined;
  const parts = path.slice(at + NODE_MODULES.length).split('/');
  const nameLength = parts[0]?.startsWith('@') ? 2 : 1;
  return path.slice(0, at + NODE_MODULES.length) + parts.slice(0, nameLength).join('/');
}

/** Reads a package's name, version and licence file. Throws when it ships without a licence text. */
export function readNotice(packageDir: string): PackageNotice {
  const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    name?: string;
    version?: string;
  };
  const name = pkg.name ?? packageDir;
  const file = readdirSync(packageDir).find((entry) => LICENSE_FILE.test(entry));
  if (file === undefined) {
    throw new Error(
      `Bundled package ${name} has no licence file in ${packageDir}. ` +
        `Its notice cannot ship in ${NOTICES_FILE}: add a licence text or stop bundling it.`,
    );
  }
  return {
    name,
    version: pkg.version ?? 'unknown',
    licenseText: readFileSync(join(packageDir, file), 'utf8').trim(),
  };
}

/** Finds an installed dependency by walking up from the package that declares it (pnpm or hoisted). */
function resolveDependencyDir(fromDir: string, dependency: string): string {
  for (let dir = dirname(fromDir); dirname(dir) !== dir; dir = dirname(dir)) {
    for (const candidate of [join(dir, dependency), join(dir, 'node_modules', dependency)]) {
      if (existsSync(join(candidate, 'package.json'))) return candidate;
    }
  }
  throw new Error(`Cannot find ${dependency}, a dependency of ${fromDir}, to read its licence.`);
}

/**
 * Every package that ships, including the declared `dependencies` of each one: a pre-bundled
 * package such as Phaser inlines its dependencies into one file, so the module graph never shows
 * them (eventemitter3 is the case in point).
 */
function withDependencies(dirs: Iterable<string>): Set<string> {
  const all = new Set<string>();
  const pending = [...dirs];
  for (let dir = pending.pop(); dir !== undefined; dir = pending.pop()) {
    if (all.has(dir)) continue;
    all.add(dir);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    for (const dependency of Object.keys(pkg.dependencies ?? {})) {
      pending.push(resolveDependencyDir(dir, dependency));
    }
  }
  return all;
}

const BUILD_HELPER_ID = /^\0?(vite|rolldown)\//;

/**
 * Vite and rolldown inject small runtime helpers (the module-preload polyfill, the module runtime)
 * into the bundle under virtual ids, so their licences ship too. Only those two packages, not their
 * own dependencies: nothing else of them is in the bundle.
 */
function buildHelperDir(moduleId: string, fromDir: string): string | undefined {
  const name = BUILD_HELPER_ID.exec(moduleId)?.[1];
  if (name === undefined) return undefined;
  const viteDir = dirname(
    createRequire(join(fromDir, 'package.json')).resolve('vite/package.json'),
  );
  return name === 'vite' ? viteDir : resolveDependencyDir(viteDir, 'rolldown');
}

/** One notice per distinct package, sorted by name then version. */
export function collectNotices(
  moduleIds: Iterable<string>,
  projectDir = process.cwd(),
): PackageNotice[] {
  const dirs = new Set<string>();
  const helperDirs = new Set<string>();
  for (const id of moduleIds) {
    const dir = packageDirOf(id);
    if (dir !== undefined) dirs.add(dir);
    const helper = buildHelperDir(id, projectDir);
    if (helper !== undefined) helperDirs.add(helper);
  }
  // The same package can sit at two paths (a pnpm symlink and its real directory): list it once.
  const unique = new Map<string, PackageNotice>();
  for (const notice of [...withDependencies(dirs), ...helperDirs].map(readNotice)) {
    unique.set(`${notice.name}@${notice.version}`, notice);
  }
  return [...unique.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

export function renderNotices(notices: readonly PackageNotice[]): string {
  const rule = '='.repeat(72);
  const sections = notices.map(
    (n) => `${rule}\n${n.name} ${n.version}\n${rule}\n\n${n.licenseText}\n`,
  );
  return (
    'Third-party software shipped in this build of Heliopause, with the licence of each package.\n\n' +
    sections.join('\n')
  );
}

/**
 * Writes THIRD-PARTY-LICENSES.txt into the build output, listing every package that ended up in the
 * bundle (JS modules and the CSS the fonts come from). The build fails when one has no licence text.
 */
export function licenseNotices(): Plugin {
  const cssIds = new Set<string>();
  return {
    name: 'heliopause:licence-notices',
    apply: 'build',
    transform(_code, id) {
      if (packageDirOf(id) !== undefined && (id.split('?')[0] ?? '').endsWith('.css')) {
        cssIds.add(id);
      }
    },
    generateBundle(_options, bundle) {
      const ids = new Set(cssIds);
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const [id, mod] of Object.entries(output.modules)) {
          if (mod.renderedLength > 0) ids.add(id);
        }
      }
      this.emitFile({
        type: 'asset',
        fileName: NOTICES_FILE,
        source: renderNotices(collectNotices(ids)),
      });
    },
  };
}
