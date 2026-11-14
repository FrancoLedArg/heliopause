import { CHASSIS_IDS, type ChassisId } from '../sim/index.ts';

/**
 * The Chassis the page URL's `?chassis=<id>` names, so tests and bug reports can skip the picker;
 * `undefined` when the URL names none or an unknown one, and the player picks.
 */
export function chooseUrlChassis(search: string): ChassisId | undefined {
  const fromUrl = new URLSearchParams(search).get('chassis');
  return CHASSIS_IDS.find((id) => id === fromUrl);
}
