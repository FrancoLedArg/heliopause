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
export { CHOICE_LOG_VERSION, parseChoiceLog, storedChoiceLog } from './choiceLog.ts';
export type { Choice, ChoiceLog, StoredChoiceLog } from './choiceLog.ts';
export { collectYield, isDepleted } from './gather.ts';
export type { Collection, Landing } from './gather.ts';
export { install, standingRefusal } from './install.ts';
export type { InstallRefusal, InstallResult, StandingRefusal } from './install.ts';
export { preview } from './preview.ts';
export type { Preview, ProposedChange } from './preview.ts';
export { remove } from './remove.ts';
export type { RemoveRefusal, RemoveResult } from './remove.ts';
export { replay } from './replay.ts';
export type { ReplayResult } from './replay.ts';
export type { Run, RunEnd, RunStatus } from './run.ts';
export { assessStranding, endIfStranded, strandsOnArrival } from './stranded.ts';
export type { StrandedArrival, Stranding } from './stranded.ts';
export { isBetterScore, runEnd, score } from './score.ts';
export type { Score } from './score.ts';
export { BURNS, flyHop, HELIOPAUSE, launchHop, marginShare, plannedBurns, planHop } from './hop.ts';
export type {
  BodyHopPlan,
  Burn,
  BurnResult,
  HeliopauseHopPlan,
  HopFlight,
  HopOutcome,
  HopPlan,
  HopPlanResult,
  HopTarget,
  InvalidTargetReason,
  LaunchResult,
  PlannedBurn,
} from './hop.ts';
export {
  availableDeltaV,
  carriesJumpDrive,
  componentEffect,
  drillMultiplier,
  fuelAfterBurning,
  newSpacecraft,
  refit,
  SLOT_COUNT,
  STARTING_SLOTS,
} from './spacecraft.ts';
export type { ComponentEffect, Loadout, Slot, Spacecraft } from './spacecraft.ts';
export { COMPONENT_IDS, COMPONENTS, componentCost, JUMP_DRIVE_TUNING } from './catalogue.ts';
export type {
  Component,
  ComponentId,
  ComponentKind,
  ComponentLevel,
  Drill,
  Engine,
  FuelTank,
  JumpDrive,
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
  FUEL_NOTE,
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
