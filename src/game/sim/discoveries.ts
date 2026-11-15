// Discoveries and Science (#171, #318): what an Instrument reveals on a Body, and the Science it earns.
import { createRng } from '../lib/rng.ts';
import { stringSeed } from '../lib/stringSeed.ts';
import { COMPONENTS, type ComponentId } from './catalogue.ts';
import type { Run } from './run.ts';
import { findBody, listBodies, type Body, type BodyId, type StarSystem } from './starSystem.ts';

/** The Instruments, by Component id. */
export type InstrumentId = Extract<ComponentId, 'camera' | 'chemistry-scanner' | 'sample-lab'>;

/** The Body types that hide Discoveries. */
export type DiscoveryBodyType = 'rocky' | 'icy' | 'gas-giant';

export const DISCOVERY_IDS = [
  'river-delta',
  'shadowed-crater-ice',
  'water-salt',
  'ice-geysers',
  'nitrogen-glacier',
  'plume-organics',
  'six-sided-storm',
  'giant-storm',
] as const;

export type DiscoveryId = (typeof DISCOVERY_IDS)[number];

/** One Discovery: a real find, retold in plain words from `docs/research/science-for-beginners.md` §2. */
export interface Discovery {
  readonly id: DiscoveryId;
  /** The plain name the player reads first. */
  readonly name: string;
  readonly bodyType: DiscoveryBodyType;
  readonly instrument: InstrumentId;
  readonly science: number;
  /** One sentence of surprise. */
  readonly fact: string;
  /** Two or three sentences behind "Tell me more". */
  readonly tellMore: string;
  /** Where the real find happened: a place, never a mission or instrument name. */
  readonly place: string;
  /** One NASA or JPL page it comes from. */
  readonly source: string;
}

/**
 * Science per Discovery, by the Instrument that reveals it: gameplay tuning, ordered as #171 says
 * (Camera least, Sample lab most).
 */
export const SCIENCE_BY_INSTRUMENT = {
  camera: 10,
  'chemistry-scanner': 25,
  'sample-lab': 50,
} as const satisfies Record<InstrumentId, number>;

const discovery = <Id extends DiscoveryId>(
  entry: Omit<Discovery, 'science'> & { readonly id: Id },
): Discovery & { readonly id: Id } => ({
  ...entry,
  science: SCIENCE_BY_INSTRUMENT[entry.instrument],
});

const ENCELADUS = 'https://science.nasa.gov/mission/cassini/science/enceladus/';

/** The Discovery catalogue: 3 for each landable Body type, 2 for Gas Giants (#171's table). */
export const DISCOVERIES: { readonly [Id in DiscoveryId]: Discovery & { readonly id: Id } } = {
  'river-delta': discovery({
    id: 'river-delta',
    name: 'A dried-up river delta',
    bodyType: 'rocky',
    instrument: 'camera',
    fact: 'A river once fed a lake here, on a world that is bone dry today.',
    tellMore:
      'Mars once had a lake about 35 km across and about 30 m deep at most, fed by a river. Rock samples from the old lake bed have not yet shown signs of ancient life.',
    place: 'Jezero Crater, Mars',
    source:
      'https://www.jpl.nasa.gov/news/nasas-perseverance-rover-deciphers-ancient-history-of-martian-lake/',
  }),
  'shadowed-crater-ice': discovery({
    id: 'shadowed-crater-ice',
    name: 'Ice in craters that never see sunlight',
    bodyType: 'rocky',
    instrument: 'chemistry-scanner',
    fact: 'Real water ice hides in craters where the Sun never shines.',
    tellMore:
      'The Moon has water ice in craters that never get sunlight. Grains of water ice were seen in material thrown up from one of them, and several shadowed spots are confirmed. How much ice there is overall is not known.',
    place: 'Dark craters near the Moon’s poles',
    source: 'https://science.nasa.gov/moon/moon-water-and-ices/',
  }),
  'water-salt': discovery({
    id: 'water-salt',
    name: 'Salt left behind by water',
    bodyType: 'rocky',
    instrument: 'sample-lab',
    fact: 'Bright patches are salt, left when salty water reached the surface.',
    tellMore:
      'More than 300 bright areas dot the dwarf planet Ceres. They are salt left behind after salty water reached the surface, so Ceres is surprisingly active.',
    place: 'Ceres, the dwarf planet in the asteroid belt',
    source: 'https://www.jpl.nasa.gov/news/bright-areas-on-ceres-suggest-geologic-activity/',
  }),
  'ice-geysers': discovery({
    id: 'ice-geysers',
    name: 'Geysers shooting into space',
    bodyType: 'icy',
    instrument: 'camera',
    fact: 'Jets of water shoot out of this ice into space, at about 400 m/s.',
    tellMore:
      'Saturn’s small icy Moon Enceladus shoots jets of water into space at about 400 meters per second. It hides an ocean about 10 km deep under an ice shell 30 to 40 km thick.',
    place: 'Enceladus, a Moon of Saturn',
    source: ENCELADUS,
  }),
  'nitrogen-glacier': discovery({
    id: 'nitrogen-glacier',
    name: 'A glacier of frozen nitrogen',
    bodyType: 'icy',
    instrument: 'chemistry-scanner',
    fact: 'A huge glacier here is made of nitrogen ice, not water.',
    tellMore:
      'Pluto’s “heart” is a huge glacier of mostly nitrogen ice, with dozens of glaciers flowing into it, next to mountains of water ice. There is probably an ocean under the surface, about 200 miles of ice down.',
    place: 'The “heart” of Pluto',
    source:
      'https://www.nasa.gov/solar-system/five-years-after-new-horizons-historic-flyby-here-are-10-cool-things-we-learned-about-pluto/',
  }),
  'plume-organics': discovery({
    id: 'plume-organics',
    name: 'Carbon-rich chemistry in the ice',
    bodyType: 'icy',
    instrument: 'sample-lab',
    fact: 'The spray from this ice is rich in organic material.',
    tellMore:
      'Organic material in the plume of Enceladus was about 20 times denser than expected. The plume comes from an ocean hidden under the ice.',
    place: 'The plume of Enceladus, a Moon of Saturn',
    source: ENCELADUS,
  }),
  'six-sided-storm': discovery({
    id: 'six-sided-storm',
    name: 'A six-sided storm',
    bodyType: 'gas-giant',
    instrument: 'camera',
    fact: 'A jet stream with six straight sides circles this planet’s pole.',
    tellMore:
      'A six-sided jet stream circles Saturn’s north pole. It is about 30,000 km across, more than twice Earth’s width, and was first seen in 1980 and 1981.',
    place: 'The north pole of Saturn',
    source: 'https://science.nasa.gov/mission/cassini/science/saturn/hexagon-in-motion/',
  }),
  'giant-storm': discovery({
    id: 'giant-storm',
    name: 'A storm wider than Earth',
    bodyType: 'gas-giant',
    instrument: 'camera',
    fact: 'One storm here is wider than the whole Earth.',
    tellMore:
      'Jupiter’s Great Red Spot is 1.3 times as wide as Earth, and its roots reach about 300 kilometers down. It has been watched since 1830.',
    place: 'The Great Red Spot, Jupiter',
    source:
      'https://www.jpl.nasa.gov/news/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/',
  }),
};

/** The Body type a Body hides Discoveries for. */
export function discoveryBodyType(body: Body): DiscoveryBodyType {
  return body.landable ? body.composition : 'gas-giant';
}

/**
 * The Discoveries each Body of `system` hides, generated from its seed on a stream of its own (so
 * the Star System's layout is untouched): every landable Body hides one or two of its type's set,
 * every Gas Giant one or both of its set. The same Star System always hides the same Discoveries.
 */
export function hiddenDiscoveries(system: StarSystem): ReadonlyMap<BodyId, readonly DiscoveryId[]> {
  const rng = createRng(system.seed ^ stringSeed('discoveries'));
  const hidden = new Map<BodyId, readonly DiscoveryId[]>();
  for (const body of listBodies(system)) {
    const type = discoveryBodyType(body);
    const pool: DiscoveryId[] = DISCOVERY_IDS.filter((id) => DISCOVERIES[id].bodyType === type);
    const count = rng.int(1, Math.min(2, pool.length));
    const picked: DiscoveryId[] = [];
    for (let i = 0; i < count; i++) {
      const [taken] = pool.splice(rng.int(0, pool.length - 1), 1);
      if (taken) picked.push(taken);
    }
    hidden.set(
      body.id,
      DISCOVERY_IDS.filter((id) => picked.includes(id)),
    );
  }
  return hidden;
}

/** The Discoveries `bodyId` hides. */
export function discoveriesOn(system: StarSystem, bodyId: BodyId): readonly DiscoveryId[] {
  return hiddenDiscoveries(system).get(bodyId) ?? [];
}

/** A Discovery made in the Run: on which Body, in which Star System, and the Science it gave. */
export interface MadeDiscovery {
  readonly discoveryId: DiscoveryId;
  /** The Body that hides it (a Gas Giant's, for one seen from its Moon). */
  readonly bodyId: BodyId;
  readonly starSystemNumber: number;
  /** 0 when it was already found here, on another Body of the same Star System. */
  readonly science: number;
}

/** What one reveal found: a first in this Star System (with its Science), or already found here. */
export type DiscoveryReveal =
  | {
      readonly kind: 'new';
      readonly discoveryId: DiscoveryId;
      readonly bodyId: BodyId;
      readonly science: number;
    }
  | {
      readonly kind: 'already-found-here';
      readonly discoveryId: DiscoveryId;
      readonly bodyId: BodyId;
    };

/** The Instruments aboard that work: not Damaged, and a Sample lab only with a Drill aboard. */
function workingInstruments(run: Run): readonly InstrumentId[] {
  const { slots, damage } = run.spacecraft;
  const drillAboard = slots.some((slot) => slot !== null && COMPONENTS[slot].kind === 'drill');
  const working: InstrumentId[] = [];
  for (const [i, slot] of slots.entries()) {
    if (slot === null || damage[i]) continue;
    const component = COMPONENTS[slot];
    if (component.kind !== 'instrument') continue;
    if (component.needsDrill && !drillAboard) continue;
    working.push(component.id);
  }
  return working;
}

/**
 * What the working Instruments aboard reveal on the Body the Spacecraft has landed on, `bodyId`
 * (Depleted or not): on an Arrived landing after the yield, and when an Instrument is installed
 * there. A Camera on a Gas Giant's Moon also reveals the Gas Giant's. Each Discovery gives its
 * Science the first time it is revealed in a Star System; on another Body of the same Star System it
 * is already found here, for nothing. One already made on this Body is not revealed again.
 */
export function revealDiscoveries(
  run: Run,
  bodyId: BodyId,
): { readonly run: Run; readonly revealed: readonly DiscoveryReveal[] } {
  const body = findBody(run.starSystem, bodyId);
  if (!body?.landable) return { run, revealed: [] };
  const instruments = workingInstruments(run);
  if (instruments.length === 0) return { run, revealed: [] };
  const hidden = hiddenDiscoveries(run.starSystem);
  const places: BodyId[] = [body.id];
  if (body.kind === 'moon' && instruments.includes('camera')) places.push(body.planetId);

  let { science } = run;
  const made = [...run.discoveries];
  const revealed: DiscoveryReveal[] = [];
  for (const place of places) {
    for (const discoveryId of hidden.get(place) ?? []) {
      const entry = DISCOVERIES[discoveryId];
      if (!instruments.includes(entry.instrument)) continue;
      const here = made.filter((m) => m.starSystemNumber === run.starSystemNumber);
      if (here.some((m) => m.discoveryId === discoveryId && m.bodyId === place)) continue;
      const first = !here.some((m) => m.discoveryId === discoveryId);
      const gained = first ? entry.science : 0;
      made.push({
        discoveryId,
        bodyId: place,
        starSystemNumber: run.starSystemNumber,
        science: gained,
      });
      science += gained;
      revealed.push(
        first
          ? { kind: 'new', discoveryId, bodyId: place, science: gained }
          : { kind: 'already-found-here', discoveryId, bodyId: place },
      );
    }
  }
  if (revealed.length === 0) return { run, revealed };
  return { run: { ...run, science, discoveries: made }, revealed };
}

/** How many Discoveries `bodyId` hides, and how many of them the Run has made in this Star System. */
export function bodyDiscoveryCount(
  run: Run,
  bodyId: BodyId,
): { readonly found: number; readonly hidden: number } {
  const hidden = discoveriesOn(run.starSystem, bodyId);
  const found = hidden.filter((id) =>
    run.discoveries.some(
      (m) =>
        m.discoveryId === id && m.bodyId === bodyId && m.starSystemNumber === run.starSystemNumber,
    ),
  ).length;
  return { found, hidden: hidden.length };
}
