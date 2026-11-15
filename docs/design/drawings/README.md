# Drawings

The human's rough scene sketches. They set composition and mood only; agents generate original pixel art that follows them, in the UI kit palette (ADR 0004).

| File                 | Shows                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `landed-sketch.jpeg` | **Landed** and the Arrived report ("Éxito"): the whole Spacecraft at a slight 3/4 angle, standing on the ground. Top bar above. Its curved horizon is **superseded**: the ground is flat (see Ground below). |
| `flight-sketch.jpeg` | **Transfer**: the Spacecraft at a 3/4 angle, climbing diagonally to the upper right, with speed streaks behind it.                                                                                           |

## Direction (2026-11-14)

- **Landscape, not a diagram**: wide shots that show a lot of the surface, and the complete Spacecraft with a little perspective.
- **Never quite still**: very slow camera drift with parallax, sky Bodies creeping, low blowing dust, blinking Spacecraft lights and a faint engine glow.
- **Sci-fi videogame look**: a player picks one of three Chassis, each with a distinct silhouette. Spacecraft stand upright and take off and land tail-first, on their engines (#200, #201).
- **Spacecraft style** (updated 2026-11-15, spec #230): flat, non-3D pixel art with curved silhouettes, rim light, glowing windows and blinking lamps; no 3D or voxel look. The reference is the human-approved Shipwright Bench mockup (`docs/design/shipwright-bench.html`) and its Python port (`docs/design/sprites/gen_ships.py`). The drawn Spacecraft is its Chassis art plus one Component art per installed Component, each at a mount point, so better art drops in by files and manifest only. The current art is interim; the final designs follow the human's 2–3 style references when they arrive. Our Chassis are original designs in the kit palette (gunmetal plating, cyan glass and lights, amber thruster glow).

## Ground (decided 2026-11-14, replaces the curved horizon)

- **Side view, literally flat**: the ground is a horizontal strip seen from the side, like a 2D side-view game. Its top edge is a straight, level line and the Spacecraft stands on it. There is no perspective, curve, limb, horizon plane or planet texture: on every one of those, the ship "looked like it didn't belong".
- **Inside the strip**: stones in cross-section, packed in rows, lit on the upper left and darker with depth. The top surface line is the brightest part, with a few pebbles resting on it, kept clear of the Spacecraft.
- **Background**: the sky that's already there (stars, the Star, nearby Bodies). No hills or ridges for now.
- **Composition reference**: a ship centred on flat side-view ground, as in a Super Metroid landing-site painting the human shared. It's a reference for composition only; nothing from it is copied.
- **Mockup**: the "Landed" scene in `docs/design/shipwright-bench.html` (open it in a browser, Backdrop: Sky only). Rejected along the way: a curved limb, a mountain range, a giant planet and a perspective floor.
