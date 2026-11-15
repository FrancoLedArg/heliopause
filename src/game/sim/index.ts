// The simulation module's public interface: pure TypeScript game rules, no Phaser or React.
// The UI and tests use only what is exported here.
export { findBody, generateStarSystem, homePlanet, listBodies } from './starSystem.ts';
export {
  currentBody,
  generateSystem,
  starSystemNumber,
  starSystemSeed,
  startRun,
  STARTING_MATERIALS,
} from './run.ts';
export { collectYield, isDepleted } from './gather.ts';
export type { Collection, Landing } from './gather.ts';
export { install } from './install.ts';
export type { InstallRefusal, InstallResult } from './install.ts';
export { preview } from './preview.ts';
export type { Preview, ProposedChange } from './preview.ts';
export { remove } from './remove.ts';
export type { RemoveRefusal, RemoveResult } from './remove.ts';
export type { Run, RunStatus } from './run.ts';
export { BURNS, flyHop, launchHop, marginShare, planHop } from './hop.ts';
export type {
  Burn,
  BurnResult,
  HopFlight,
  HopOutcome,
  HopPlan,
  HopPlanResult,
  InvalidTargetReason,
  LaunchResult,
} from './hop.ts';
export {
  availableDeltaV,
  componentEffect,
  drillMultiplier,
  fuelAfterBurning,
  newSpacecraft,
  refit,
  SLOT_COUNT,
  STARTING_SLOTS,
} from './spacecraft.ts';
export type { ComponentEffect, Loadout, Slot, Spacecraft } from './spacecraft.ts';
export { COMPONENT_IDS, COMPONENTS } from './catalogue.ts';
export type {
  Component,
  ComponentId,
  ComponentKind,
  ComponentLevel,
  Drill,
  Engine,
  FuelTank,
  Provenance,
} from './catalogue.ts';
export type {
  Body,
  BodyComposition,
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
  BODY_TUNING,
  ICE_LINE,
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
  materials,
  metersPerSecond,
  metersPerSecondSquared,
  radians,
  seconds,
} from './units.ts';
export type {
  AstronomicalUnits,
  Kilograms,
  Kilometers,
  Materials,
  MetersPerSecond,
  MetersPerSecondSquared,
  Radians,
  Seconds,
} from './units.ts';
