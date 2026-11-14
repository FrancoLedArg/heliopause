# NASA data for the Star System generator and parts catalogue

Researched 2026-11-14. Each section leads with the number and unit, then the source URL. UNVERIFIED marks anything not confirmed against a NASA/JPL page. "Derived" means computed by us from NASA mass/radius, not printed by NASA.

## 1. Planetary and satellite fact sheets (NSSDCA)

Sources:

- Planets: https://nssdc.gsfc.nasa.gov/planetary/factsheet/ (comparison table; Jupiter, Saturn, Uranus, Neptune show "Unknown*" surface pressure because they have no solid surface, per the sheet's notes, which we did not read: UNVERIFIED reason)
- Galilean moons: https://nssdc.gsfc.nasa.gov/planetary/factsheet/galileanfact_table.html
- Saturn moons: https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturniansatfact.html (mass, radius, density, orbit only)
- Neptune moons: https://nssdc.gsfc.nasa.gov/planetary/factsheet/neptuniansatfact.html (same, only mass, radius, density, orbit)

### Table (NASA's own figures unless marked)

| Body      | Type            | g (m/s²)                                          | Escape v (km/s) | Dist. from Sun (10⁶ km)       | Mean surface temp                | Surface pressure / atmosphere          |
| --------- | --------------- | ------------------------------------------------- | --------------- | ----------------------------- | -------------------------------- | -------------------------------------- |
| Mercury   | rocky           | 3.7                                               | 4.3             | 57.9                          | 167 °C                           | 0 bar (none)                           |
| Venus     | rocky           | 8.9                                               | 10.4            | 108.2                         | 464 °C                           | 92 bar                                 |
| Earth     | rocky           | 9.8                                               | 11.2            | 149.6                         | 15 °C                            | 1 bar                                  |
| Moon      | moon (of Earth) | 1.6                                               | 2.4             | 149.6 (orbits Earth at 0.384) | -20 °C                           | 0 bar                                  |
| Mars      | rocky           | 3.7                                               | 5.0             | 228.0                         | -65 °C                           | 0.01 bar                               |
| Jupiter   | gas giant       | 23.1                                              | 59.5            | 778.5                         | -110 °C (1 bar level)            | no solid surface (sheet: "Unknown*")   |
| Saturn    | gas giant       | 9.0                                               | 35.5            | 1432.0                        | -140 °C                          | no solid surface                       |
| Uranus    | ice giant       | 8.7                                               | 21.3            | 2867.0                        | -195 °C                          | no solid surface                       |
| Neptune   | ice giant       | 11.0                                              | 23.5            | 4515.0                        | -200 °C                          | no solid surface                       |
| Pluto     | dwarf, ice/rock | 0.6                                               | 1.2             | 5906.4                        | -225 °C                          | 0.00001 bar                            |
| Io        | moon (Jupiter)  | 1.80                                              | 2.6             | 778.5 (Jupiter)               | -155 °C                          | not on sheet (UNVERIFIED: tenuous SO2) |
| Europa    | moon (Jupiter)  | 1.31                                              | 2.0             | 778.5                         | -170 °C                          | not on sheet                           |
| Ganymede  | moon (Jupiter)  | 1.43                                              | 2.7             | 778.5                         | -160 °C                          | not on sheet                           |
| Callisto  | moon (Jupiter)  | 1.24                                              | 2.4             | 778.5                         | -155 °C                          | not on sheet                           |
| Titan     | moon (Saturn)   | 1.35 (derived: M 1345.5e20 kg, R 2575 km)         | 2.64 (derived)  | 1432.0                        | UNVERIFIED: about -179 °C / 94 K | UNVERIFIED: about 1.5 bar, thick N2    |
| Enceladus | moon (Saturn)   | 0.11 (derived: M 1.08e20 kg, mean R about 252 km) | 0.24 (derived)  | 1432.0                        | UNVERIFIED                       | UNVERIFIED (no thick atmosphere)       |
| Triton    | moon (Neptune)  | 0.78 (derived: M 214e20 kg, R 1353.4 km)          | 1.45 (derived)  | 4515.0                        | UNVERIFIED: about 38 K (-235 °C) | UNVERIFIED                             |

Titan temperature and pressure: NASA Science (https://science.nasa.gov/saturn/moons/titan/facts/ and https://science.nasa.gov/mission/voyager/fact-sheet/, found via search, not read in full) give "94 kelvins" and "1.5 atmospheres" (UNVERIFIED); a Cassini press kit gives 1.6 bar. Triton 38 K (UNVERIFIED) is from the Voyager fact sheet (search snippet; the page text was confusingly placed under Neptune). Titan/Enceladus/Triton gravity and escape velocity were computed with G = 6.674e-11 and g = GM/R², v = sqrt(2GM/R) from the NSSDCA mass and radius; they are not printed on those sheets. Treat as derived.

Moon -20 °C is the fact sheet's "mean temperature" figure as returned by our fetch; the sheet has a separate day/night discussion we did not check.

### Sampling ranges for the generator (from the table above)

Rocky planets (Mercury, Venus, Earth, Mars):

- g: 3.7 to 9.8 m/s²
- escape velocity: 4.3 to 11.2 km/s
- distance: 57.9 to 228.0 x10⁶ km (0.39 to 1.52 AU)
- mean temperature: -65 to 464 °C
- surface pressure: 0 to 92 bar (use 0 / 0.01 / 1 / 92 as archetypes: airless, thin, Earth-like, crushing)

Gas and ice giants (Jupiter, Saturn, Uranus, Neptune):

- g: 8.7 to 23.1 m/s² (at the sheet's reference level, not a landable surface)
- escape velocity: 21.3 to 59.5 km/s
- distance: 778.5 to 4515 x10⁶ km (5.2 to 30.2 AU)
- temperature: -110 to -200 °C
- no solid surface (gameplay: no landing, only orbit or aerobrake)

Moons (Moon, Io, Europa, Ganymede, Callisto, Titan, Triton, Enceladus):

- g: 0.11 to 1.80 m/s² (Enceladus derived low, Io high)
- escape velocity: 0.24 to 2.7 km/s
- distance from Sun: that of the parent planet
- temperature: -235 to -20 °C (the -235 low is Triton, UNVERIFIED; Moon high); the Galilean moons sit at -155 to -170 °C
- pressure: mostly 0; Titan is the outlier at about 1.5 bar

Dwarf/ice-rock (Pluto) fits neither group: g 0.6 m/s², escape 1.2 km/s, -225 °C, 0.00001 bar. Treat as a "small icy body" class if wanted.

AU conversion: 149.6 x10⁶ km = 1 AU (Earth's row on the same sheet).

## 2. Solar irradiance and power at distance

- 1360.8 W/m² at 1 AU (SORCE total solar irradiance). Source: JPL, "Calculating Solar Power in Space", https://www.jpl.nasa.gov/edu/resources/lesson-plan/calculating-solar-power-in-space/. The same page states the inverse-square law as "1/d²", d being distance relative to Earth's distance. Formula to use: S = S₀ / d² with d in AU.
- UNVERIFIED: 1361.6 ± 0.3 W/m² measured by TSIS-1 at the 2019 solar minimum (NASA Earth Science, https://earth.gsfc.nasa.gov/climate/projects/solar-irradiance/science, found via search, not read in full). TSI varies about 0.1% over the 11-year cycle (same; UNVERIFIED).
- Worked example from the JPL page: Juno at 5.3 AU gets about 3.6% of Earth's sunlight, about 48.99 W/m².
- Juno (the solar exception): the arrays make about 14 kW at Earth's distance and "only 500 watts" at Jupiter; sunlight at Jupiter "packs 25 times less punch" (JPL, https://www.jpl.nasa.gov/news/nasas-juno-spacecraft-breaks-solar-power-distance-record/). Juno has 50 m² of active solar cells (JPL lesson page above) and 18,698 solar cells (JPL news page). The JPL article says all eight earlier spacecraft that reached Jupiter used nuclear power sources.
- Why RTGs beyond Jupiter: solar power "becomes less viable for missions that venture even farther" and Voyagers run on plutonium-238 decay (NASA Science, https://science.nasa.gov/sun/how-nasa-uses-and-improves-solar-power/, found via search, UNVERIFIED wording). NASA's RPS mission-needs fact sheet also notes RPS elements are not greatly threatened by radiation, unlike solar cells, at Jupiter: https://science.nasa.gov/wp-content/uploads/2024/02/final-rps-nasa-mission-needs-fact-sheet-11-6-17.pdf (search snippet; not read in full).

Generator hint: solar flux table W/m² = 1361 / d²: Mercury 0.39 AU about 8900, Mars 1.52 AU about 590, Jupiter 5.2 AU about 50, Saturn 9.6 AU about 15, Neptune 30 AU about 1.5 (our arithmetic).

## 3. Delta-v and rocket propulsion

Tsiolkovsky (NASA Glenn, https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/): Δu = V_eq ln(m_f / m_e), where m_f is full mass at liftoff, m_e empty mass (structure, engines, payload), V_eq equivalent exhaust velocity. Isp definition (https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/specific-impulse/): ratio of thrust to propellant weight flow, in seconds; Isp = V_eq / g0, g0 = 9.8 m/s². No Isp values on that page. So Δv = Isp × 9.80665 × ln(m_wet/m_dry).

Delta-v figures. A single NASA/JPL page with the whole budget was NOT found. What was found:

- Mars surface to 100 km low Mars orbit: 4,200 m/s, including 20% for gravity losses; 4.4 km/s to a 500 km circular orbit. Source: NASA NTRS, Palaszewski, "Mars Landing Vehicles: Descent and Ascent Propulsion Design Issues", https://ntrs.nasa.gov/citations/20210026187. Same paper: total descent less than 1,000 m/s.
- Earth surface to LEO: NO NASA source verified for the usual about 9.4 km/s. A NASA intern paper (https://ntrs.nasa.gov/api/citations/20120000518/downloads/20120000518.pdf, search snippet) says about 7.5 km/s ideal, closer to 10 km/s realistic. A NASA-contract lunar lander study cites about 9.1 km/s median across launchers (https://ntrs.nasa.gov/api/citations/19880020470/downloads/19880020470.pdf, snippet). Use about 9.4 km/s as UNVERIFIED convention; the NASA 7.5 to 10 km/s range is itself UNVERIFIED (search snippet only), so cite it only with that caveat.
- LEO to lunar surface: UNVERIFIED. No NASA total found. Apollo 13 TLI journal entry about 2,028 m/s to 2,388 m/s (https://www.nasa.gov/history/afj/ap13fj/02earth_orbit_tli.html; cockpit display figures, not mission-design values). JPL Descanso lunar trajectory monograph (https://descanso.jpl.nasa.gov/monograph/series12/LunarTraj--05Chapter4TransferstoLowLunarOrbits.pdf) is the likely primary source for the full budget; not read.
- Hohmann Earth to Mars: UNVERIFIED from NASA. JPL Basics of Space Flight describes the Hohmann transfer and a launch opportunity about every 25 months but gives no km/s (https://science.nasa.gov/learn/basics-of-space-flight/chapter4-1/). Commonly cited about 3.6 km/s from LEO departure (secondary sources only, 4.3 km/s "typical" elsewhere). Trip about 9 months (secondary).

Specific impulse (NASA sources, mostly from search snippets, flagged accordingly):

- Solid: 175 to 250 s typical; Space Shuttle SRB 242 s sea level, 268.6 s vacuum. NASA history handbooks: https://www.hq.nasa.gov/office/pao/History/conghand/propelnt.htm and /propulsn.htm (page returned 403 to us; figures from search summary, UNVERIFIED against page text).
- Kerosene/LOX (RP-1): Saturn V F-1 260 s (same handbooks, same caveat).
- Hydrogen/LOX: RL-10 444 s; Shuttle main engine about 453 to 455 s (same caveat).
- Ion (UNVERIFIED: NSTAR and NEXT-C pages were not read in full): NSTAR (Deep Space 1, Dawn) 1900 s at 0.5 kW to 3100 s at 2.3 kW (https://www.grc.nasa.gov/WWW/ion/past/90s/nstar.htm). NEXT 1400 to 4220 s at 0.5 to 6.9 kW input, 25 to 235 mN thrust (https://www1.grc.nasa.gov/wp-content/uploads/NEXT-C_FactSheet_11_1_21_rev4.pdf). Hall thrusters: over 4000 s only for one test configuration (NASA paper https://ntrs.nasa.gov/api/citations/20020092097/downloads/20020092097.pdf).

## 4. Spacecraft subsystems and figures

CubeSat 101 (https://www3.nasa.gov/sites/default/files/atoms/files/nasa_csli_cubesat_101_508.pdf, text extracted and read). It has few engineering numbers and no subsystem mass/power budget table. It names: structure (dispenser/CDS envelope), power (batteries, solar panels, deployable panels), ADCS (defined: "system designed to stabilize and orient the CubeSat"), propulsion (discouraged by launch providers; not part of CDS-standard design), communications (antennas, burn-wire-deployed), thermal (thermal vacuum bakeout testing), payload, ground station. It does not use the term C&DH as a section we found (not exhaustively checked).

Figures it does give:

- 1U = 10 cm cube (10 x 10 x 11 cm), mass about 1 to 1.33 kg; 3U = 10 x 10 x 34 cm; sizes 1.5U, 2U, 3U, 6U, 12U exist.
- "Small satellite" = under 300 kg (1,100 lb).
- Protrusions up to 6.5 mm from the body.
- CSLI covers launch costs up to $300,000, "typically enough to launch a 3U into low-Earth orbit"; developers pay for building and operating. No standard total price given ("there isn't a standard price tag"). Reserve of at least 10% recommended.
- Example: LightSail 3U with 32 m² sail; its Kickstarter raised over $1.24 million.
- Project timeline items: proposal 3 to 4 months, funding 1 to 12 months, manifesting 1 to 36 months.

NASA "Design and Develop Science Missions" (https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf, 348 lines of extracted text read). It is a SMD systems-engineering webinar. It names four mission segments (launch, space, ground, user), the process steps (Identify Need & Goals, Define Concept, Define Requirements, Design, Build & Verify, Implement), and uses BioNutrients-2 as the example (under 250 g sample container, under 300 mL volume, 12 or more replicate samples). It does NOT list spacecraft subsystems and gives NO mass/power/cost ranges for them.

For typical component mass/power ranges use NASA's "State-of-the-Art of Small Spacecraft Technology": https://www.nasa.gov/smallsat-institute/sst-soa (chapters per subsystem: power, in-space propulsion, comms, thermal, GN&C/ADCS, C&DH, structures). Located via search, NOT read; component numbers UNVERIFIED. The 2018 PDF is at https://www.nasa.gov/wp-content/uploads/2017/03/soa2018_final_doc.pdf.

## 5. Heliopause distance

- Voyager 1: crossed 25 Aug 2012 at about 122 AU (about 11 billion miles, 18 billion km) from the Sun. https://science.nasa.gov/mission/voyager/interstellar-mission/
- Voyager 2: crossed 5 Nov 2018. NASA's release (https://www.nasa.gov/news-release/nasas-voyager-2-probe-enters-interstellar-space/, 10 Dec 2018) gives date and "slightly more than 11 billion miles (18 billion kilometers) from Earth" but no AU figure. About 119 to 120 AU from the Sun appears on NASA infographic/pages seen only in search snippets: UNVERIFIED. Interstellar-mission page also gives Voyager 2's termination shock at 84 AU (Aug 2007).
- Voyager 1's date was reported by NASA as the crossing even though the team did not recognise it immediately (search snippet; UNVERIFIED).

Gameplay suggestion: "escape" distance of about 120 AU is traceable; planets reach only 30 AU (Neptune), so the heliopause is about 4 times Neptune's distance.
