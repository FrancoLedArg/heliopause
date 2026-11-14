/// <reference types="vite/client" />
import type { BuildInfo } from './game/lib/buildLabel.ts';

declare global {
  /** Injected at build time by Vite `define` (see `scripts/buildInfo.ts`). */
  const BUILD_INFO: BuildInfo;
}
