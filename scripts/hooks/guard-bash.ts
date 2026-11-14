/**
 * Claude Code PreToolUse hook for Bash (wired in .claude/settings.json via guard-bash.sh).
 * Reads the hook payload on stdin; exit 2 blocks the command and shows stderr to the agent.
 * Fails closed: if the guard itself breaks, the command is blocked.
 */
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { guard } from './guard.ts';

function main(): number {
  try {
    const payload = JSON.parse(readFileSync(0, 'utf8')) as {
      cwd?: string;
      tool_input?: { command?: string };
    };
    const command = payload.tool_input?.command ?? '';
    const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? payload.cwd ?? process.cwd();
    const tmpDir = os.tmpdir();
    const scratchDirs = ['/tmp', '/private/tmp', tmpDir];
    const cwd = payload.cwd ?? projectDir;
    const reason = guard(command, { projectDir, cwd, scratchDirs, tmpDir });
    if (!reason) return 0;
    process.stderr.write(`Blocked by the Bash guard: ${reason}. See docs/agents/workflow.md.\n`);
    return 2;
  } catch (error) {
    process.stderr.write(`Bash guard failed, blocking to be safe: ${String(error)}\n`);
    return 2;
  }
}

process.exitCode = main();
