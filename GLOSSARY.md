# Heliopause

A roguelike in which the player escapes randomly generated star systems one Hop at a time, learning what it takes to design and fly a space mission.

## The run

**Run**:
One attempt from a fresh start until the Spacecraft is lost, Destroyed or Stranded. A Run spans as many Star Systems as the player escapes.
_Avoid_: Game, playthrough, session

**New Run**:
A Run started fresh in a newly generated Star System, after the previous Run has ended.
_Avoid_: Restart, retry, new game

**Star System**:
One randomly generated star and the Bodies orbiting it. Escaping it leads to the next, harder Star System in the same Run.
_Avoid_: Solar system, level, map

**Home Planet**:
Retired: the small rocky planet where the Spacecraft started in each Star System before spec #96 (#189). Specs #12, #14 and #15 still use the term; read it as Starting Moon.
_Avoid_: Start, spawn, Earth

**Starting Moon**:
The randomly chosen Moon where the Spacecraft is marooned at the start of each Star System, knowing nothing but where it stands and one nearby Body. Its yield is collected at the start, so it begins Depleted. Replaces the Home Planet.
_Avoid_: Start, spawn, Earth

**Stranded**:
A Run's end when no Hop could have any Success Chance, whatever Components the Spacecraft could still install, remove or Repair. Generation keeps it out of the opening: no Hop the plan shows at 100% from the start leads straight into it.
_Avoid_: Stuck, softlock

**Score**:
The number of Star Systems escaped in a Run, with fewer Hops flown as the tie-breaker. The Best Score is the highest one reached on this device.
_Avoid_: Points, high score

**Escape**:
Leaving a Star System by making the Jump, which wins that Star System.
_Avoid_: Win, exit

**Jump**:
Firing the Jump Drive at the Heliopause, which carries the Spacecraft to the next Star System's Starting Moon and burns the Jump Drive out.
_Avoid_: Warp, hyperspace, FTL

**Heliopause**:
The outer edge of a Star System, where the star's influence ends and the Jump Drive can fire. A Hop to it has a Takeoff and Transfer but no Landing.
_Avoid_: Edge, border

## Places

**Body**:
A planet or Moon in a Star System. Rocky planets and Moons can be landed on; gas giants cannot.
_Avoid_: Node, location, world

**Icy Body**:
A landable Body whose ice yields Fuel the first time the Spacecraft lands on it in a Run.
_Avoid_: Water world, ice planet

**Rocky Body**:
A landable Body whose ground yields Materials the first time the Spacecraft lands on it in a Run.
_Avoid_: Mineral world, terrestrial

**Depleted**:
A Body that has already given up its Fuel or Materials in this Run and yields nothing more.
_Avoid_: Empty, mined out, used

**Gas Giant**:
A planet with no surface: never a Hop target, but home to Moons.
_Avoid_: Gas planet, jovian

**Moon**:
A natural Body orbiting a planet.
_Avoid_: Satellite

**Detected**:
A Body whose position and distance the player knows, but not what it is. Shown as a blip.
_Avoid_: Spotted, blip (as a state), unknown

**Surveyed**:
A Body whose type, gravity and resources the player knows, from landing on it or from a level-2 Radar.
_Avoid_: Scanned, revealed, explored

## The craft

**Spacecraft**:
The player's one vehicle, built on the Chassis picked at New Run, kept and modified for the whole Run.
_Avoid_: Ship, satellite, rocket, vessel

**Chassis**:
The starting design of the Spacecraft, picked at New Run. It sets the Spacecraft's shape and its starting dry mass, Fuel capacity and engine.
_Avoid_: Hull, frame, model, class

**Component**:
A part installed on the Spacecraft in a Slot, with its own mass and Materials cost. Kinds so far: Engine, Fuel Tank, Drill, Radar (each with levels) and the Jump Drive.
_Avoid_: Module, part, upgrade, item

**Slot**:
A place on the Spacecraft that holds one Component; the Spacecraft has a fixed number of them.
_Avoid_: Socket, bay, hardpoint

**Mount point**:
Where a Component's art attaches to the Chassis art on the drawn Spacecraft. A drawing term only; it has no effect on play.
_Avoid_: Hardpoint, socket

**Engine**:
The Component that turns Fuel into Δv; a better Engine gets more Δv from the same Fuel.
_Avoid_: Thruster, motor

**Fuel Tank**:
The Component that sets how much Fuel the Spacecraft can carry.
_Avoid_: Tank, storage

**Jump Drive**:
A heavy, costly Component that makes the Jump possible; built anew in every Star System.
_Avoid_: Super engine, warp drive, hyperdrive

**Drill**:
The Component that increases how much a Body yields when the Spacecraft lands on it.
_Avoid_: Miner, extractor, harvester

**Radar**:
The Component that Detects every Body within its range, and at level 2 also Surveys them. The only way to find the Heliopause.
_Avoid_: Sensor, scanner, telescope

**Comms**:
The Spacecraft's built-in communications system, not a Component: after every landing it Detects the nearest landable Body not yet Detected.
_Avoid_: Radio, antenna, beacon

**Damaged**:
A Component hit by a Cruise event. It works worse until Repaired.
_Avoid_: broken, destroyed, hurt

**Repair**:
Clearing a Component's Damage. It takes Cruise time and costs nothing, or can be Rushed.
_Avoid_: fix, heal, mend

**Rush**:
Paying Materials (later Scrap) to finish a Repair at once.
_Avoid_: speed up, skip, boost

## Resources

**Fuel**:
Propellant the Spacecraft spends on every Hop, refilled on suitable Bodies.
_Avoid_: Propellant, gas, energy

**Materials**:
Raw stock gathered on Bodies and spent to build or install Components.
_Avoid_: Money, budget, credits, scrap

## Travel

**Hop**:
One planned trip of the Spacecraft from the Body it is on to another Body or to the Heliopause, played out after the player commits to it.
_Avoid_: Jump, mission, trip, turn

**Burn**:
One engine firing within a Hop: Takeoff from the current Body, Transfer through space, or Landing on the target.
_Avoid_: Phase, maneuver, stage

**Δv**:
Delta-v, the change in speed a Burn needs or the Spacecraft's Fuel can provide; how every Hop's cost is read.
_Avoid_: Delta-V, dv, thrust, range

**Success Chance**:
The probability, shown before launch, that the Spacecraft's Fuel covers the actual Δv of every Burn in a Hop, for the Spacecraft as it stands at launch; Cruise events are not included.
_Avoid_: Odds, risk, probability

**Margin**:
The Δv left over after a Hop's Burns; spare capacity against Burns costing more than estimated.
_Avoid_: Buffer, slack, reserve

**Arrived**:
A Hop outcome where every Burn is covered and the Spacecraft lands on the target Body.
_Avoid_: Success, reached

**Fell Short**:
A Hop outcome where the Spacecraft runs out of Fuel during Takeoff or Transfer.
_Avoid_: Out of gas, drifted

**Crashed**:
A Hop outcome where the Spacecraft completes the Transfer but lacks the Δv to finish Landing.
_Avoid_: died

**Destroyed**:
A Run's end when an Engine fire left without a Repair blows up the Spacecraft.
_Avoid_: exploded, died, killed

**Cruise**:
The coast through space after the Transfer's engine firing, about 2 minutes on every Hop, during which Cruise events happen and the player can Repair.
_Avoid_: travel, flight, transit

**Cruise event**:
Something that happens to the Spacecraft during the Cruise, settled by the seed: an Engine fire, a Fuel leak, a Debris field or a solar flare.
_Avoid_: incident, hazard, random event

**Engine fire**:
A Cruise event that sets an Engine burning; left without a Repair, it Destroys the Spacecraft.
_Avoid_: engine failure, explosion (for the event)

**Fuel leak**:
A Cruise event that makes a Fuel Tank lose Fuel until it is Repaired.
_Avoid_: vent, spill

**Debris field**:
Junk the Spacecraft can fly through during the Cruise, which may Damage one Component.
_Avoid_: asteroid field, junk, hazard

**Solar flare**:
A Cruise event in which the star knocks out the Spacecraft's electronics, such as the Radar.
_Avoid_: storm, radiation burst
