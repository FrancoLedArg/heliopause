# A Chassis is its own mass plus factors on its Engines and Fuel Tanks

With Components (spec #14), the Spacecraft's dry mass, Fuel capacity and Isp are derived from what is in its Slots: dry mass is the Chassis's own mass plus every installed Component's, Fuel capacity is the sum of the Fuel Tanks, and Isp is the best installed Engine's. A Chassis keeps its identity as three gameplay-tuning figures: **its own mass**, a **factor on Engine Isp** and a **factor on Fuel Tank capacity**. The Components themselves are the same on every Chassis (`src/game/sim/catalogue.ts`); the Chassis scales the Isp and capacity they give. The three figures are not written by hand: they are calibrated from Spec A's `CHASSIS_TUNING`, so a new Spacecraft with its starting Components (a level-1 Engine and a level-1 Fuel Tank) has exactly the dry mass, Fuel capacity and Isp, and so the Δv, that Spec A tuned and tested. We chose this so that Spec A's balance, its tests and every seeded Hop outcome stay exactly as they were, while the three Chassis still play differently after an upgrade: the same Fuel Tank adds far more Fuel to the hauler than to the scout, and the same extra mass costs the light scout more Δv.

The ticket called the Chassis's own mass its "hull mass"; the code says the Chassis's `mass`, because the glossary avoids "hull" as a synonym for Chassis.

## Considered options

- **Drop the Chassis; every Spacecraft starts from the same Components.** Simplest, but the three Chassis would play the same and Spec A's tuning and tests would all change.
- **Per-Chassis versions of each Component** (a scout Engine, a hauler Engine). Keeps the Chassis distinct, but triples the catalogue the player has to read.
- **The Chassis supplies a built-in Engine and Tank outside the Slots.** Keeps Spec A's numbers, but the starting Engine could never be swapped or removed, which blocks a later thrust-and-Isp Engine choice (#50).
- **Per-Chassis starting Components** (taken, spec #230): see the amendment below.

## Consequences

- Retuning a level-1 Engine or Fuel Tank recalibrates every Chassis and leaves the calibration-loadout figures unchanged, and a test pins them bit for bit (a Chassis factor times a retuned base figure can miss Spec A's figure by one floating-point ulp; the pin test would catch it). The calibration-loadout figures move only by editing `CHASSIS_TUNING`. A Chassis's starting figures also move when its starting Components change; the pin test pins the Hauler's too.
- A Component's catalogue Isp and capacity (`baseIsp`, `baseFuelCapacity`) are not what the player gets on any Chassis. `componentEffect(chassisId, componentId)` in `src/game/sim/spacecraft.ts` applies the Chassis factor, and it is the only source for showing a Component's effect; the Spacecraft's own figures are derived from it, so the scaling lives in one place.
- The Spacecraft stores its derived figures (`dryMass`, `fuelCapacity`, `engineIsp`) beside its Slots, so every reader keeps reading plain figures. The Slots are an opaque `Loadout` type that only `newSpacecraft` and `refit` make, so a Spacecraft copied with new Slots and stale figures does not typecheck.

## Slots and starting Components (amended by spec #230, #231)

A Chassis also sets how many Slots the Spacecraft has (the Scout 4, the Lancer 5, the Hauler 6) and its **starting Components**, which fill its first Slots at New Run (`CHASSIS_LAYOUT` in `src/game/sim/data.ts`). Its own mass and factors are still calibrated from one fixed **calibration loadout**, a level-1 Engine and a level-1 Fuel Tank, the same for every Chassis, never from its starting Components. So the Scout and the Lancer, which start with the calibration loadout, start bit for bit as before; the Hauler starts with a second level-1 Fuel Tank, so its starting figures are no longer Spec A's (16.5 t dry, 132 t of Fuel, Spec A's Isp). Its starting Components are ordinary ones: removable for half their cost, and weighed by the Stranded check.

Spec #230 also gave the Hauler a level-2 Drill. #231 left it out: after #247 raised every Chassis's Isp, two Fuel Tanks alone bring a cautious Hauler player level with the others, and any starting Drill, stripped for its refund (or multiplying a Rocky Starting Moon's yield), pays for a Jump Drive before the first Hop, which no opening may do (#189).
