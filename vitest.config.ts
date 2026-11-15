import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { readBuildInfo } from './scripts/buildInfo.ts';

// Two projects:
//  - unit:    pure logic (simulation, rules, data) in Node. `*.test.ts`
//  - browser: anything that needs a real DOM/canvas (Phaser scenes, React UI). `*.browser.test.ts(x)`
export default defineConfig({
  plugins: [react()],
  define: { BUILD_INFO: JSON.stringify(readBuildInfo(process.cwd())) },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          // Many rule tests sweep hundreds of generated Star Systems. Since #188, generation
          // redraws until the opening is fair, so a sweep can pass the 5 s default on a loaded CI runner.
          testTimeout: 30_000,
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
          exclude: ['**/*.browser.test.*', '**/node_modules/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.{ts,tsx}'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
