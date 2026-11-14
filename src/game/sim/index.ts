// The simulation module's public interface: pure TypeScript game rules, no Phaser or React.
// The UI and tests use only what is exported here.
export { generateStarSystem, homePlanet, listBodies } from './starSystem.ts';
export type {
  Body,
  BodyId,
  GasGiant,
  LandableBody,
  Moon,
  Planet,
  RockyPlanet,
  Seed,
  Star,
  StarSystem,
} from './starSystem.ts';
export { GENERATION_TUNING, SOURCED_RANGES, STARTER_SPACECRAFT_TUNING } from './data.ts';
export type { SourcedRange, TuningRange } from './data.ts';
export type {
  AstronomicalUnits,
  Kilograms,
  Kilometers,
  MetersPerSecond,
  MetersPerSecondSquared,
  Radians,
  Seconds,
} from './units.ts';
