export interface Step {
  name: string;
  command: readonly string[];
}

export type PortArgs =
  { ok: true; port: number | undefined; rest: string[] } | { ok: false; error: string };

/** Extracts `--port <n>` / `--port=<n>` from `args`; every other argument is returned in `rest`. */
export function parsePort(args: readonly string[]): PortArgs {
  const rest: string[] = [];
  let raw: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '--port') {
      raw = args[++i] ?? '';
    } else if (arg.startsWith('--port=')) {
      raw = arg.slice('--port='.length);
    } else {
      rest.push(arg);
    }
  }
  if (raw === undefined) return { ok: true, port: undefined, rest };
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port < 1 || port > 65535) {
    return { ok: false, error: `--port needs an integer from 1 to 65535, got "${raw}"` };
  }
  return { ok: true, port, rest };
}

export type RunResult = { ok: true } | { ok: false; failed: string; code: number };

/** Runs steps in order via `run` (returns an exit code); stops at the first non-zero one. */
export function runSteps(steps: readonly Step[], run: (step: Step) => number): RunResult {
  for (const step of steps) {
    const code = run(step);
    if (code !== 0) return { ok: false, failed: step.name, code };
  }
  return { ok: true };
}
