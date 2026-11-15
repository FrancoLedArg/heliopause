# A Chassis is cosmetic; every Chassis shares one gameplay tuning

Supersedes [ADR 0005](0005-chassis-is-its-mass-plus-component-factors.md).

With point-to-point Hops (#283), the careful explorer escaped Star System 1 in fewer than one Run in five, and almost never on the hauler: Runs were decided by how much Fuel each Chassis started with. The human decided (#298, 2026-11-15) that **a Chassis only changes how the Spacecraft looks**. Every Chassis has the same gameplay figures: one dry mass, one Engine Isp, one 36 t Fuel Tank started full, the same Slots and the same starting Components (`CHASSIS_TUNING` in `src/game/sim/data.ts` points every Chassis at one shared tuning). Icy yields rose to three times their first tuning in the same change. Tuned together, the careful explorer escapes Star System 1 in about 66% of Runs over 500 seeds on every Chassis.

The calibration from ADR 0005 is kept as plumbing: each Chassis still derives its own mass and its factors on Engine Isp and Fuel Tank capacity from `CHASSIS_TUNING`, but the figures are equal, so the factors are equal too. The Chassis keeps its art, its silhouette and the composed parts drawn on it (#230, #232, #233). The Chassis pick shows its name and its look, with no stat bars (#226's bars would all read the same).

## Considered options

- **Equal starting Fuel, different capacities** (the first draft of #298). Measured: the hauler's dry mass still kept it from escaping (about 3% even with a full 66 t tank), so the Chassis kept deciding the Run.
- **Per-Chassis Slots and loadouts** (#231, PR #272). Superseded: they made the Chassis matter more, not less.

## Slot count (#316)

The Slots every Chassis shares are now **six** (`SLOT_COUNT` in `src/game/sim/spacecraft.ts`), up from four, so a Drill, a Radar, a Jump Drive and an Instrument can all be carried. The starting Components are unchanged; the new Slots start empty. The chassis art already had room for six.
