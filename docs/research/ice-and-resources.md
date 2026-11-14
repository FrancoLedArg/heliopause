# Ice-to-propellant and the ice line

Research for #110 (spec #14). Feeds #112. Quotes below were checked against the extracted page or PDF text, not search snippets.

## 1. Player sentence (story 4)

> NASA plans to split lunar water ice into hydrogen and oxygen, so rockets could refuel on the Moon.

18 words (limit 25). Phrased as a plan, not a fact: no such plant has flown, per the sources below.

### Sources

- Sanders, Kleinhenz, Linne (NASA JSC/GRC), "NASA Plans for In Situ Resource Utilization (ISRU) Development, Demonstration, and Implementation", COSPAR presentation, 14 Jul 2022. <https://ntrs.nasa.gov/api/citations/20220008799/downloads/NASA%20ISRU%20Plans_Sanders_COSPAR-Final.pdf>
  - A mission-study slide shows "Mine the water in the permanently shadowed crater and periodically deliver the water", then "Convert water into liquid oxygen and hydrogen in the sunlight".
  - Study ground rule: "Oxygen and hydrogen are liquefied and stored in cryogenic tanks"; water mining target "15 metric tons of H2O per year".
  - Comparison slide: water ice "Provides full propellant for vehicles"; oxygen from regolith "Only oxygen is provided."
  - Candidate projects listed include "Lunar Polar Propellant Mining Outpost – TransAstra – NIAC Phase II" and "Lunar Propellant Production Plant (LP3) – Skyre".
  - Same slide: for water ice, "Resource is not yet characterized, exploration is required prior to operations", hence "plans", not "does".
- Jones et al. (NASA Langley), "Cost Breakeven Analysis of Lunar In-Situ Propellant Production for Human Missions to the Moon and Mars", AIAA ASCEND 2020. <https://ntrs.nasa.gov/api/citations/20205007564/downloads/ISRU-Paper3-Final.pdf>
  - Abstract: "an alternative approach is to use the potentially vast quantities of lunar ice to enable in-situ propellant production on the lunar surface."
  - Abstract: both a lunar campaign and Mars missions "will require tens to hundreds of tonnes of propellant."

Not fetched, so not relied on: LCROSS water detection, current Artemis/Moon to Mars ISRU pages. Any claim from them is UNVERIFIED.

## 2. Solar System ice (snow) line

**Answer: about 2.7 AU, in the outer asteroid belt.**

- Martin and Livio, "On the evolution of the snow line in protoplanetary discs", MNRAS (2013), arXiv:1306.5243. <https://arxiv.org/pdf/1306.5243> Introduction: "The current location of the snow line in our solar system is within the asteroid belt, at 2.7 AU. The outer asteroids are icy C-class objects ... whereas the inner asteroid belt objects contain little water."
- Lecar, Podolak, Sasselov, Chiang, "On the Location of the Snow Line in a Protoplanetary Disk", ApJ 640, 1115 (2006). <https://arxiv.org/abs/astro-ph/0602217> Abstract: "Observations of the Solar System's asteroid belt suggest that the snow line occurred near 2.7 AU." Text: "The evidence points to about 2.7 AU, in the outer asteroid belt where icy C-class asteroids abound"; also "While this evidence has been questioned, and alternatives proposed".
- Caveat from the same paper: their minimum-mass disk model puts the line at "1.6-1.8 AU, just past the orbit of Mars", and the abstract says moving it past 2.7 AU needs higher opacity, accretion rate or disk mass. So 2.7 AU is an observational inference from asteroid composition; models vary. Say "around 2.7 AU" to the player, not an exact value.

Why ice is more common farther out (from the above): beyond the snow line water condenses to ice, so solid mass density outside it is much larger (Martin and Livio, Introduction).

Not verified: the ~5 AU figure often quoted for Jupiter's formation region, and the 3.1 AU figure attributed to a 2012 Martin and Livio paper. UNVERIFIED (not read at the source).

## 3. Suggestion for generation

Keep `iceLineAu = 2.7`: it already equals the peer-reviewed estimate, so PR #119 needs no numeric change. Change only the comment: cite Lecar et al. 2006 and Martin and Livio 2013 instead of calling it "gameplay tuning", and keep the curve.

- `d / (d + iceLineAu)` is a game curve, not physics. It gives exactly 50% Icy at the ice line, about 27% at 1 AU and 65% at 5 AU. It is a reasonable soft version of the real step (mostly dry inside, icy beyond). Bodies inside the line can still hold ice (lunar polar ice), so a soft curve is truer than a hard cutoff.
- Player line for the Nav Chart or report: "Ice is common beyond about 2.7 AU, where water freezes."
- Real ice lines depend on the star; the sources above cover the Sun only. If the game varies stars, scaling the line is UNVERIFIED here; keep 2.7 AU fixed unless a follow-up ticket sources it.
