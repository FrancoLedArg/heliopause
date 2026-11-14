import { describe, expect, it } from 'vitest';
import { parsePort, runSteps, type Step } from './verifyRunner.ts';

describe('parsePort', () => {
  it('is undefined when --port is absent', () => {
    expect(parsePort([])).toEqual({ ok: true, port: undefined, rest: [] });
  });

  it('reads --port <n> and leaves other args for pass-through', () => {
    expect(parsePort(['--port', '4555', '--grep', 'title'])).toEqual({
      ok: true,
      port: 4555,
      rest: ['--grep', 'title'],
    });
  });

  it('reads --port=<n>', () => {
    expect(parsePort(['--port=4555'])).toEqual({ ok: true, port: 4555, rest: [] });
  });

  it.each([[['--port']], [['--port', 'abc']], [['--port', '0']], [['--port', '70000']]])(
    'rejects an invalid port: %j',
    (args) => {
      expect(parsePort(args).ok).toBe(false);
    },
  );
});

describe('runSteps', () => {
  const steps: Step[] = [
    { name: 'typecheck', command: ['pnpm', 'typecheck'] },
    { name: 'lint', command: ['pnpm', 'lint'] },
    { name: 'e2e', command: ['pnpm', 'test:e2e'] },
  ];

  it('runs every step in order and reports success', () => {
    const ran: string[] = [];
    const result = runSteps(steps, (s) => {
      ran.push(s.name);
      return 0;
    });
    expect(ran).toEqual(['typecheck', 'lint', 'e2e']);
    expect(result).toEqual({ ok: true });
  });

  it('stops at the first failing step and names it', () => {
    const ran: string[] = [];
    const result = runSteps(steps, (s) => {
      ran.push(s.name);
      return s.name === 'lint' ? 2 : 0;
    });
    expect(ran).toEqual(['typecheck', 'lint']);
    expect(result).toEqual({ ok: false, failed: 'lint', code: 2 });
  });
});
