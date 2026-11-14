/** Every Component the Spacecraft can carry: Engine, Fuel Tank and Drill, at levels 1 and 2. */
export const COMPONENT_IDS = [
  'engine-1',
  'engine-2',
  'fuel-tank-1',
  'fuel-tank-2',
  'drill-1',
  'drill-2',
] as const;
export type ComponentId = (typeof COMPONENT_IDS)[number];
