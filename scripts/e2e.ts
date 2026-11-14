import { spawnSync } from 'node:child_process';
import { parsePort } from './verifyRunner.ts';

const parsed = parsePort(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(2);
}

// playwright.config.ts reads the port from E2E_PORT; this runner is what sets it.
const env = { ...process.env };
if (parsed.port !== undefined) env['E2E_PORT'] = String(parsed.port);

const status = spawnSync('playwright', ['test', ...parsed.rest], { stdio: 'inherit', env }).status;
process.exit(status ?? 1);
