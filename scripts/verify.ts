import { spawnSync } from 'node:child_process';
import { parsePort, runSteps, type Step } from './verifyRunner.ts';

const parsed = parsePort(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(2);
}

const portArgs = parsed.port === undefined ? [] : ['--port', String(parsed.port)];

const steps: Step[] = [
  { name: 'typecheck', command: ['pnpm', 'typecheck'] },
  { name: 'lint', command: ['pnpm', 'lint'] },
  { name: 'format:check', command: ['pnpm', 'format:check'] },
  { name: 'unit', command: ['pnpm', 'test'] },
  { name: 'browser', command: ['pnpm', 'test:browser'] },
  { name: 'build', command: ['pnpm', 'build'] },
  { name: 'e2e', command: ['pnpm', 'test:e2e', ...portArgs] },
];

const result = runSteps(steps, (step) => {
  console.log(`\n> verify: ${step.name}`);
  const [cmd = '', ...args] = step.command;
  return spawnSync(cmd, args, { stdio: 'inherit' }).status ?? 1;
});

if (!result.ok) {
  console.error(`\nverify failed at step: ${result.failed}`);
  process.exit(result.code);
}
console.log('\nverify passed');
