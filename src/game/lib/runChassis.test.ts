import { describe, expect, it } from 'vitest';
import { chooseUrlChassis } from './runChassis.ts';

describe('chooseUrlChassis', () => {
  it.each(['scout', 'hauler', 'lancer'] as const)(
    'uses the Chassis named in the URL (%s)',
    (id) => {
      expect(chooseUrlChassis(`?chassis=${id}`)).toBe(id);
    },
  );

  it('finds the Chassis among other URL parameters', () => {
    expect(chooseUrlChassis('?seed=123&chassis=lancer')).toBe('lancer');
  });

  it.each(['', '?seed=1', '?chassis=', '?chassis=tug', '?chassis=Lancer', '?chassis=toString'])(
    'leaves the choice to the player when the URL has no usable Chassis (%s)',
    (search) => {
      expect(chooseUrlChassis(search)).toBeUndefined();
    },
  );
});
