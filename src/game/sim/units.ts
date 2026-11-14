// Physical quantities in real units, branded so one unit cannot be passed where another is expected
// (e.g. escape velocity in km/s where m/s is meant). The constructors below are the only place a raw
// number becomes a quantity: the unit boundary, and the only casts in the simulation.

declare const unit: unique symbol;
type Quantity<U extends string> = number & { readonly [unit]: U };

export type MetersPerSecond = Quantity<'m/s'>;
export type MetersPerSecondSquared = Quantity<'m/s²'>;
export type AstronomicalUnits = Quantity<'AU'>;
export type Kilometers = Quantity<'km'>;
export type Kilograms = Quantity<'kg'>;
export type Seconds = Quantity<'s'>;
/** An angle in radians, measured counter-clockwise. */
export type Radians = Quantity<'rad'>;

export const metersPerSecond = (value: number) => value as MetersPerSecond;
export const metersPerSecondSquared = (value: number) => value as MetersPerSecondSquared;
export const astronomicalUnits = (value: number) => value as AstronomicalUnits;
export const kilometers = (value: number) => value as Kilometers;
export const kilograms = (value: number) => value as Kilograms;
export const seconds = (value: number) => value as Seconds;
export const radians = (value: number) => value as Radians;
