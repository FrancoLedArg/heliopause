import { useEffect } from 'react';
import { music } from '../game/audio/music.ts';

/** Holds the Approach music for as long as the calling component is mounted with `active` set (the Stranded warning). */
export function useApproachMusic(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    music.setApproach(true);
    return () => {
      music.setApproach(false);
    };
  }, [active]);
}
