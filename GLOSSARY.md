# Heliopause

A roguelike in which the player escapes randomly generated star systems one Hop at a time, learning what it takes to design and fly a space mission.

## The run

**Run**:
One attempt from a fresh start until the Spacecraft is lost or stranded. A Run spans as many Star Systems as the player escapes.
_Avoid_: Game, playthrough, session

**Star System**:
One randomly generated star and the Bodies orbiting it. Escaping it leads to the next, harder Star System in the same Run.
_Avoid_: Solar system, level, map

**Home Planet**:
The small rocky planet, close to its star and with at least one Moon, where a Run begins.
_Avoid_: Start, spawn, Earth

**Stranded**:
A Run's end when the Spacecraft is on a Body and cannot afford any Hop.
_Avoid_: Stuck, softlock

**Escape**:
Crossing the Heliopause of the current Star System, which wins that Star System.
_Avoid_: Win, exit

**Heliopause**:
The outer edge of a Star System, where the star's influence ends.
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

## The craft

**Spacecraft**:
The player's one vehicle, kept and modified for the whole Run.
_Avoid_: Ship, satellite, rocket, vessel

**Component**:
A part installed on the Spacecraft in a Slot, with its own mass and Materials cost. Kinds so far: Engine, Fuel Tank, Drill, each with levels.
_Avoid_: Module, part, upgrade, item

**Slot**:
A place on the Spacecraft that holds one Component; the Spacecraft has a fixed number of them.
_Avoid_: Socket, bay, hardpoint

**Engine**:
The Component that turns Fuel into Δv; a better Engine gets more Δv from the same Fuel.
_Avoid_: Thruster, motor

**Fuel Tank**:
The Component that sets how much Fuel the Spacecraft can carry.
_Avoid_: Tank, storage

**Drill**:
The Component that increases how much a Body yields when the Spacecraft lands on it.
_Avoid_: Miner, extractor, harvester

## Resources

**Fuel**:
Propellant the Spacecraft spends on every Hop, refilled on suitable Bodies.
_Avoid_: Propellant, gas, energy

**Materials**:
Raw stock gathered on Bodies and spent to build or install Components.
_Avoid_: Money, budget, credits, scrap

## Travel

**Hop**:
One planned trip of the Spacecraft from the Body it is on to another, played out after the player commits to it.
_Avoid_: Jump, mission, trip, turn

**Burn**:
One engine firing within a Hop: Takeoff from the current Body, Transfer through space, or Landing on the target.
_Avoid_: Phase, maneuver, stage

**Δv**:
Delta-v, the change in speed a Burn needs or the Spacecraft's Fuel can provide; how every Hop's cost is read.
_Avoid_: Delta-V, dv, thrust, range

**Success Chance**:
The probability, shown before launch, that the Spacecraft's Fuel covers the actual Δv of every Burn in a Hop.
_Avoid_: Odds, risk, probability

**Margin**:
The Δv left over after a Hop's Burns; spare capacity against Burns costing more than estimated.
_Avoid_: Buffer, slack, reserve

**Fell Short**:
A Hop outcome where the Spacecraft runs out of Fuel during Takeoff or Transfer.
_Avoid_: Out of gas, drifted

**Crashed**:
A Hop outcome where the Spacecraft completes the Transfer but lacks the Δv to finish Landing.
_Avoid_: Destroyed, died
