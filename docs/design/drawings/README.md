# Drawings

The human's rough scene sketches. They set composition and mood only; agents generate original pixel art that follows them, in the UI kit palette (ADR 0004).

| File                 | Shows                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `landed-sketch.jpeg` | **Landed** and the Arrived report ("Éxito"): the whole Spacecraft at a slight 3/4 angle, standing on the ground. Top bar above. Its curved horizon is **superseded**: the ground is flat (see Ground below). |
| `flight-sketch.jpeg` | **Transfer**: the Spacecraft at a 3/4 angle, climbing diagonally to the upper right, with speed streaks behind it.                                                                                           |

## Direction (2026-11-14)

- **Landscape, not a diagram**: wide shots that show a lot of the surface, and the complete Spacecraft with a little perspective.
- **Never quite still**: very slow camera drift with parallax, sky Bodies creeping, low blowing dust, blinking Spacecraft lights and a faint engine glow.
- **Sci-fi videogame look**: a player picks one of three Chassis, each with a distinct silhouette. Spacecraft hover on thrusters to take off and land; no tail-first rocket landings.
- **Spacecraft style reference**: [Voxel Spaceships by Max Parata](https://maxparata.itch.io/voxel-spaceships): chunky, blocky shapes, glowing thrusters, cockpit glass, a 3/4 view. The pack is CC BY-ND 4.0, so it is a **style reference only**: never trace, convert, render, recolour or ship its models or sprites. Our Chassis are original designs in the kit palette (gunmetal plating, cyan glass and lights, amber thruster glow).

## Ground (decided 2026-11-14, replaces the curved horizon)

- **Flat**: one straight, level horizon across the whole screen. No curvature, no limb, no hills or mountains on the horizon. On a curved ground the Spacecraft looked like it didn't belong.
- **One surface**: the ground must read as a single place. The old ground was three parallax layers, each with its own curved skyline, and it looked like three planets stacked up. Depth comes from perspective instead: craters and stones get smaller and flatter toward the horizon. There's no visible edge or band boundary inside the ground and no bright rim line on the horizon.
- **Quiet**: low-contrast ground so the Spacecraft and the FX stand out. The background is the sky: stars, the Star and the nearby Bodies.
- **Mockup**: direction D ("Flat and simple") in `docs/design/landed-look-directions.html` (open it in a browser). Directions A–C on the same page were rejected. Its grey rocket is a placeholder for scale, not a Chassis design.
