/** Build identity injected at build time by Vite (see `scripts/buildInfo.ts`). */
export interface BuildInfo {
  readonly version: string;
  /** 7-char short commit hash, or `unknown` when git metadata is unavailable. */
  readonly hash: string;
}

/** Text shown on the title screen so a screenshot pins the exact build, e.g. `v0.0.0 · a207078`. */
export function formatBuildLabel({ version, hash }: BuildInfo): string {
  return `v${version} · ${hash}`;
}
