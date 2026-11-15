import { carriesJumpDrive, type Run } from '../game/sim/index.ts';

export type MissionGoalId = 'heliopause' | 'jump-drive' | 'escape';

export interface MissionGoal {
  readonly id: MissionGoalId;
  readonly done: boolean;
  /** The accessible name and tooltip: the meaning the icon carries, state included. */
  readonly label: string;
}

const WORDS: Record<MissionGoalId, readonly [string, string, string]> = {
  heliopause: ['Heliopause', 'found', 'not found yet'],
  'jump-drive': ['Jump Drive', 'built', 'not built yet'],
  escape: ['Escape', 'made', 'not made yet'],
};

function goal(id: MissionGoalId, done: boolean): MissionGoal {
  const [name, yes, no] = WORDS[id];
  return { id, done, label: `${name}: ${done ? yes : no}` };
}

/**
 * The mission tracker's three goals for the Star System the Run is in: the Heliopause found, a Jump
 * Drive installed, and the Escape. The tracker resets with each Star System (the Run's knowledge is
 * fresh there); the Escape is only done in the instant of the Jump, so the caller showing that
 * instant sets `escaped`.
 */
export function missionGoals(
  run: Pick<Run, 'knowledge' | 'spacecraft'>,
  escaped = false,
): readonly MissionGoal[] {
  return [
    goal('heliopause', run.knowledge.heliopauseFound),
    goal('jump-drive', carriesJumpDrive(run.spacecraft)),
    goal('escape', escaped),
  ];
}

/** What the polite live region says when a step lights up between two states; empty when none did. */
export function missionAnnouncement(
  before: readonly MissionGoal[],
  after: readonly MissionGoal[],
): string {
  return after
    .filter((g) => g.done && before.find((b) => b.id === g.id)?.done === false)
    .map((g) => g.label)
    .join('. ');
}
