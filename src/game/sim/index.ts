// The simulation module's public interface: pure TypeScript game rules, no Phaser or React.
// The UI and tests use only what is exported here.
export { findBody, generateStarSystem, homePlanet, listBodies } from './starSystem.ts';
export { currentBody, startRun } from './run.ts';
export type { Run, RunStatus } from './run.ts';
export { BURNS, flyHop, planHop } from './hop.ts';
export type {
  Burn,
  BurnResult,
  HopFlight,
  HopOutcome,
  HopPlan,
  HopPlanResult,
  InvalidTargetReason,
} from './hop.ts';
export { availableDeltaV, newSpacecraft } from './spacecraft.ts';
export type { Spacecraft } from './spacecraft.ts';
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
export {
  CHASSIS_IDS,
  CHASSIS_TUNING,
  DISPERSION,
  GENERATION_TUNING,
  kilometersToAu,
  SOURCED_CONSTANTS,
  SOURCED_RANGES,
} from './data.ts';
export type {
  ChassisId,
  ChassisTuning,
  Range,
  SourcedRange,
  SourcedValue,
  TuningRange,
} from './data.ts';
export {
  astronomicalUnits,
  kilograms,
  kilometers,
  metersPerSecond,
  metersPerSecondSquared,
  radians,
  seconds,
} from './units.ts';
export type {
  AstronomicalUnits,
  Kilograms,
  Kilometers,
  MetersPerSecond,
  MetersPerSecondSquared,
  Radians,
  Seconds,
} from './units.ts';
