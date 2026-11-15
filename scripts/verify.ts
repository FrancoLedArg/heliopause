import { spawnSync } from 'node:child_process';
import { parsePort, runSteps, type Step } from './verifyRunner.ts';

// --quick skips the browser and e2e suites: Builders run it locally, CI runs the full gate on every PR.
const argv = process.argv.slice(2);
const quick = argv.includes('--quick');
const parsed = parsePort(argv.filter((arg) => arg !== '--quick'));
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(2);
}

const portArgs = parsed.port === undefined ? [] : ['--port', String(parsed.port)];

const allSteps: Step[] = [
  { name: 'typecheck', command: ['pnpm', 'typecheck'] },
  { name: 'lint', command: ['pnpm', 'lint'] },
  { name: 'format:check', command: ['pnpm', 'format:check'] },
  { name: 'unit', command: ['pnpm', 'test'] },
  { name: 'browser', command: ['pnpm', 'test:browser'] },
  { name: 'build', command: ['pnpm', 'build'] },
  { name: 'e2e', command: ['pnpm', 'test:e2e', ...portArgs] },
];
const slowSteps = new Set(['browser', 'e2e']);
const steps = quick ? allSteps.filter((step) => !slowSteps.has(step.name)) : allSteps;

const result = runSteps(steps, (step) => {
  console.log(`\n> verify: ${step.name}`);
  const [cmd = '', ...args] = step.command;
  return spawnSync(cmd, args, { stdio: 'inherit' }).status ?? 1;
});

if (!result.ok) {
  console.error(`\nverify failed at step: ${result.failed}`);
  process.exit(result.code);
}
console.log(quick ? '\nverify --quick passed (browser and e2e run in CI)' : '\nverify passed');
