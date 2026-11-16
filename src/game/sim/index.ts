// The simulation module's public interface: pure TypeScript game rules, no Phaser or React.
// The UI and tests use only what is exported here.
export { findBody, listBodies, startingMoon } from './starSystem.ts';
export { generateStarSystem } from './generation.ts';
export { currentBody, generateSystem, starSystemNumber, starSystemSeed, startRun } from './run.ts';
export type { TemperatureBand } from './clock.ts';
export {
  arrivalDayFraction,
  isHarshArrival,
  temperatureBand,
  landedDayFraction,
  localDayFraction,
  rotationPeriodHours,
  skyDay,
  timeOfDayWords,
} from './clock.ts';
export { firstDetectedBody, STARTING_MATERIALS } from './opening.ts';
export { bodyKnowledge, distanceBetween, knownBodies } from './knowledge.ts';
export type { BodyKnowledge, Knowledge, Reveal } from './knowledge.ts';
export { CHOICE_LOG_VERSION, parseChoiceLog, storedChoiceLog } from './choiceLog.ts';
export type { Choice, ChoiceLog, StoredChoiceLog } from './choiceLog.ts';
export { collectYield, depositLevel, isDepleted, type DepositLevel } from './gather.ts';
export type { Collection, Landing } from './gather.ts';
export {
  bodyDiscoveryCount,
  discoveriesOn,
  DISCOVERIES,
  DISCOVERY_IDS,
  SCIENCE_BY_INSTRUMENT,
} from './discoveries.ts';
export type {
  Discovery,
  DiscoveryBodyType,
  DiscoveryId,
  DiscoveryReveal,
  InstrumentId,
  MadeDiscovery,
} from './discoveries.ts';
export {
  BLUEPRINT_IDS,
  BLUEPRINT_THRESHOLDS,
  EVERY_BLUEPRINT,
  isBlueprint,
  lifetimeScience,
  newlyUnlocked,
  scienceStillNeeded,
} from './blueprints.ts';
export type { BlueprintId } from './blueprints.ts';
export { install, standingRefusal } from './install.ts';
export type { InstallRefusal, InstallResult, StandingRefusal } from './install.ts';
export { preview } from './preview.ts';
export type { Preview, ProposedChange } from './preview.ts';
export { remove } from './remove.ts';
export type { RemoveRefusal, RemoveResult } from './remove.ts';
export { replay } from './replay.ts';
export type { ReplayResult } from './replay.ts';
export type { Run, RunEnd, RunStatus } from './run.ts';
export { cruiseSchedule, repairTicksLeft, rushCost } from './cruise.ts';
export type { Cruise, ScheduledEvent, StruckEvent } from './cruise.ts';
export { assessStranding, endIfStranded } from './stranded.ts';
export type { Stranding } from './stranded.ts';
export { isBetterScore, runEnd, score } from './score.ts';
export type { Score } from './score.ts';
export {
  advanceCruise,
  beginHop,
  BURNS,
  DESTROYED_REASON,
  flyHop,
  HELIOPAUSE,
  launchHop,
  marginShare,
  plannedBurns,
  planHop,
  reachVerdict,
} from './hop.ts';
export { hopRange, isInHopRange } from './hopRange.ts';
export type { HopRange } from './hopRange.ts';
export { rushRepair, startRepair } from './repair.ts';
export type { RepairRefusal, RepairResult, RushResult } from './repair.ts';
export type {
  BeginResult,
  CruiseResult,
  Departure,
  FlownHop,
  HopOptions,
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
  ReachVerdict,
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
export type {
  ComponentEffect,
  Damage,
  Loadout,
  Slot,
  SlotDamage,
  Spacecraft,
} from './spacecraft.ts';
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
  TEMPERATURE_BANDS,
  CHASSIS_IDS,
  OPENING_TUNING,
  REACH_VERDICT,
  UNSURVEYED,
  CHASSIS_TUNING,
  CRUISE_EVENT_KINDS,
  CRUISE_TUNING,
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
  CruiseEventKind,
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
