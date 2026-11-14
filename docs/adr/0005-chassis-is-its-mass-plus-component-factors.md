# A Chassis is its own mass plus factors on its Engines and Fuel Tanks

With Components (spec #14), the Spacecraft's dry mass, Fuel capacity and Isp are derived from what is in its Slots: dry mass is the Chassis's own mass plus every installed Component's, Fuel capacity is the sum of the Fuel Tanks, and Isp is the best installed Engine's. A Chassis keeps its identity as three gameplay-tuning figures: **its own mass**, a **factor on Engine Isp** and a **factor on Fuel Tank capacity**. The Components themselves are the same on every Chassis (`src/game/sim/catalogue.ts`); the Chassis scales the Isp and capacity they give. The three figures are not written by hand: they are calibrated from Spec A's `CHASSIS_TUNING`, so a new Spacecraft with its starting Components (a level-1 Engine and a level-1 Fuel Tank) has exactly the dry mass, Fuel capacity and Isp, and so the Δv, that Spec A tuned and tested. We chose this so that Spec A's balance, its tests and every seeded Hop outcome stay exactly as they were, while the three Chassis still play differently after an upgrade: the same Fuel Tank adds far more Fuel to the hauler than to the scout, and the same extra mass costs the light scout more Δv.

The ticket called the Chassis's own mass its "hull mass"; the code says the Chassis's `mass`, because the glossary avoids "hull" as a synonym for Chassis.

## Considered options

- **Drop the Chassis; every Spacecraft starts from the same Components.** Simplest, but the three Chassis would play the same and Spec A's tuning and tests would all change.
- **Per-Chassis versions of each Component** (a scout Engine, a hauler Engine). Keeps the Chassis distinct, but triples the catalogue the player has to read.
- **The Chassis supplies a built-in Engine and Tank outside the Slots.** Keeps Spec A's numbers, but the starting Engine could never be swapped or removed, which blocks a later thrust-and-Isp Engine choice (#50).

## Consequences

- Retuning a level-1 Engine or Fuel Tank recalibrates every Chassis and leaves the starting figures unchanged; Spec A's numbers move only by editing `CHASSIS_TUNING`.
- A Component's catalogue Isp and capacity are not what the player gets on any Chassis: any display of "what this Component gives" must show the scaled figure for the Spacecraft's Chassis, which `refit` (and the later preview) returns.
- The Spacecraft stores its derived figures (`dryMass`, `fuelCapacity`, `engineIsp`) beside its Slots, so every reader keeps reading plain figures. They are only correct because every change to the Slots goes through `refit`.
