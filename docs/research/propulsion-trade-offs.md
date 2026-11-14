# Propulsion trade-offs: chemical, nuclear thermal, electric

Researched 2026-11-14 for ticket #47. This is **post-v1** planning and changes no v1 code or spec. Sections 1 to 5 hold sourced facts only: each figure is the source's own, with its unit and URL. UNVERIFIED marks anything not confirmed in a primary document we read. "Derived" means computed by us from the source's figures (our arithmetic, not printed by the source). Section 6 holds gameplay simplifications, kept apart on purpose.

Cross-reference: Isp definition, the rocket equation, solar flux (S = 1361 / d² W/m² with d in AU) and the surface gravities for Earth, Moon, Mars and Europa are in `docs/research/nasa-data-for-generation.md` and are reused here, not repeated in full. Where this file reads a primary document that section 3 of that file only saw as a search snippet, the differences are listed in section 7.

## 1. Engine figures (Question 1)

### 1.1 Chemical

| Engine (type)                                                                      | Thrust                                | Isp                                 | Dry mass                                | Thrust-to-weight                                  |
| ---------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------- | --------------------------------------- | ------------------------------------------------- |
| Space Shuttle Orbital Maneuvering Engine, "current" OME (hypergolic, pressure-fed) | 26.7 kN (6,000 lbf)                   | 314 s                               | 135 kg (297 lbm)                        | about 20 (derived: 26,700 N / (135 kg x 9.80665)) |
| RL10A-3-3A (LOX/LH2, expander cycle)                                               | 16,500 lbf, vacuum (73.4 kN, derived) | 444.4 ± 2.5 s (mixture ratio 5.0:1) | UNVERIFIED (not in the NASA paper read) | UNVERIFIED                                        |
| RS-25 (LOX/LH2, shown for scale)                                                   | 512.3 klbf vacuum                     | 452.3 s vacuum (366 s sea level)    | not given                               | not given                                         |

Sources:

- OME: NTRS 19910014943, Bertolino and Boyd (Aerojet / NASA JSC), "Uprated OMS Engine Status - Sea Level Testing Results", https://ntrs.nasa.gov/api/citations/19910014943/downloads/19910014943.pdf. Its table lists the current engine and the uprated one side by side: current 26.7 kN, 135 kg, 314 s; uprated 26.7 kN, 146 kg (322 lbm), "334/331" s. The paper describes the current engine as pressure-fed with storable propellants.
- RL10: NTRS 20140011176, Baumeister (NASA Glenn), "RL10 Engine Ability to Transition from Atlas to Shuttle/Centaur Program", https://ntrs.nasa.gov/api/citations/20140011176/downloads/20140011176.pdf. Its Table 1 lists early RL10 models at 15,000 lb vacuum thrust and Isp 424 to 444 s (5.0 mixture); the RL10A-3-3A is 16,500 lb and 444.4 ± 2.5 s. It states the engine is regeneratively cooled (hydrogen-cooled thrust chamber).
- RS-25 row: NTRS 20190033337, Wilkerson (NASA), "Nuclear Thermal Propulsion: An Overview of NASA Development Efforts", https://ntrs.nasa.gov/api/citations/20190033337/downloads/20190033337.pdf, slide 4 table (table text came out of the PDF extractor in a possibly misaligned form, so treat the RS-25 numbers as a check value only).
- RL10 engine dry mass: not found in a primary document we could open. The L3Harris RL10 data sheet and product page (https://www.l3harris.com/all-capabilities/rl10-engine, https://arsuppliernet.l3harris.com/sites/default/files/documents/RL10_data_sheet.pdf) returned errors (404 or an HTML page, no PDF). Web-search summaries of those pages gave "420 lb" (RL10C-1) and 167 kg (RL10A-4-2) but we did not read them: UNVERIFIED. Use only as a placeholder.
- Kerosene/LOX and solid motors: no new primary reading beyond `nasa-data-for-generation.md` section 3.

Propellants: the OME burns storable hypergolic propellants (they ignite on contact, no igniter, long storage). The OME paper confirms "storable propellants"; the specific pair (monomethylhydrazine and nitrogen tetroxide) comes from secondary write-ups only: UNVERIFIED.

### 1.2 Nuclear thermal (NERVA / Rover, NASA NTP design work)

No nuclear thermal engine has flown. NASA ground-tested twenty reactors in the Rover and NERVA programs, 1955 to 1972 (Borowski, McCurdy, Packard, NTRS 20120003776, https://ntrs.nasa.gov/api/citations/20120003776/downloads/20120003776.pdf). Wilkerson (NTRS 20190033337, slides 12 and 13) gives the tested record:

- Engine sizes tested: 25, 50, 75 and 250 klbf. 75 klbf is 333.6 kN (derived).
- Isp capability: 825 to 850 s for the "hot bleed cycle" tested on the NERVA experimental engine (NRX-XE); 850 to 875 s for the "expander cycle" chosen for the NERVA flight engine.
- Hydrogen exit temperature: 2,350 to 2,550 K in Pewee; NRX-A6 reached 2556 K.
- Burn duration: about 62 min in one burn (NRX-A6); more than 3.5 hours accumulated over 28 burns (NRX-XE).
- Engine thrust-to-weight: "~3 for 75 klbf NERVA". Engine mass is not printed; the implied value is about 11,000 kg (derived: 333,617 N / (3 x 9.80665)), so treat it as an order of magnitude.
- Tests were open air at the Nevada Test Site.

Modern NASA design studies (not built) give a complete set for the 25 klbf "Pewee-class" size:

| Design                                          | Thrust                 | Isp               | Engine mass | Thrust-to-weight | Source                                         |
| ----------------------------------------------- | ---------------------- | ----------------- | ----------- | ---------------- | ---------------------------------------------- |
| NERVA-derived 25 klbf, DRA 5.0 baseline         | 25 klbf (about 111 kN) | about 906 s       | not printed | about 3.50       | Borowski et al., NTRS 20120003776              |
| NERVA-derived, GE-711 fuel, 111 kN class        | 111.2 kN               | 909 s (delivered) | 3,338 kg    | 3.42             | Fittje, Borowski, Schnitzler, NTRS 20150021278 |
| Cermet, 111 kN class                            | 111.6 kN               | 906 s (delivered) | 2,675 kg    | 4.26             | same                                           |
| NERVA-derived, "criticality limited" small size | 33.4 kN                | 894 s (delivered) | 1,789 kg    | 1.91             | same                                           |

NTRS 20150021278: https://ntrs.nasa.gov/api/citations/20150021278/downloads/20150021278.pdf. Its tables print thrust-to-weight and engine mass; the 3.42 and 3,338 kg are consistent with each other (derived check: 111,200 N / (3,338 kg x 9.80665) = 3.40).

Propellant is liquid hydrogen. Borowski states the NTR "can achieve specific impulse (Isp) values of ~900 seconds (s) or more - twice that of today's best chemical rockets" (NTRS 20120003776). Wilkerson's table gives NTP Isp of 800 to 1000 s and thrust of 25 to 250 klbf.

### 1.3 Electric

All thrust figures are millinewtons (1 N = 1000 mN).

| Engine (type)                                        | Input power   | Thrust                                               | Isp                                               | Mass                                                                                         | Thrust-to-weight                       |
| ---------------------------------------------------- | ------------- | ---------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------- |
| NSTAR 30-cm gridded ion (Deep Space 1, Dawn)         | 0.5 to 2.3 kW | 92 mN at full power (about 93 mN measured at 2.3 kW) | about 3300 s predicted; 3160 s measured at 2.3 kW | about 6.4 kg (first engineering-model thruster; excludes some hardware); 8.9 kg each on Dawn | about 0.0015 (derived, 6.4 kg)         |
| NEXT gridded ion (NEXT-C, flew on DART)              | 0.6 to 7.4 kW | 25 to 235 mN                                         | maximum 4220 s                                    | thruster less than 14 kg (with harness); power unit less than 36 kg                          | about 0.0017 (derived, 235 mN / 14 kg) |
| AEPS Hall thruster (HERMeS-derived, for Gateway PPE) | 9 to 12 kW    | 444 mN at 9 kW; 586 mN at 12 kW                      | 2605 s at 9 kW; 2736 s at 12 kW                   | 53 kg                                                                                        | about 0.0011 (derived, 586 mN / 53 kg) |

Sources:

- NSTAR: NTRS TM-113129 (AIAA-97-2778), Polk et al. (NASA Glenn / JPL), "Development of an Ion Thruster and Power Processor for New Millennium's Deep Space 1 Mission", https://ntrs.nasa.gov/api/citations/19980017550/downloads/19980017550.pdf. It states throttling over 0.5 to 2.3 kW; "at full-power ... thrust is 92 mN, and the specific impulse is about 3300 s"; a ground test at the nominal 2.3 kW gave "about 93 mN" and "3160 s"; "the overall mass of the first EMT was about 6.4 kg" (thruster mass excluded some isolators and mesh); the whole NSTAR subsystem dry mass (thruster, power unit, control unit, cables, xenon storage and feed) "about 47 kg including contingency" with maximum xenon tankage "about 81 kg". The author list is not printed in the text we extracted, so we cite the report number only.
- NSTAR on Dawn: NASA Science, https://science.nasa.gov/mission/dawn/toolkit/quick-facts/. Three thrusters, each 20 lb (8.9 kg); thrust 0.07 to 0.33 oz (19 to 91 mN); full thrust takes 0 to 60 mph in 4 days. https://science.nasa.gov/mission/dawn/technology/ion-propulsion/ gives 91 mN per engine at maximum, about 3.25 mg/s xenon, 425 kg (937 lb) xenon at launch, 979 days of thrust to reach the first science orbit and more than 2,000 days over the whole mission.
- NEXT / NEXT-C: NASA Facts sheet MA-2017 11-1-GRC, https://www1.grc.nasa.gov/wp-content/uploads/NEXT-C_FactSheet_11_1_21_rev4.pdf (text extracted and read). "7-kW class gridded ion thruster"; system input power range 0.6 to 7.4 kW; thrust 25 to 235 mN; maximum Isp 4220 s; maximum thruster efficiency 70%; thruster mass (with harness) less than 14 kg; PPU mass less than 36 kg. It was a flight item for DART (launch was scheduled November 2021 to February 2022 in the sheet; we did not check the outcome).
- AEPS: Shastry et al. (NASA Glenn), IEPC-2024-298, "12-kW Advanced Electric Propulsion System Hall Current Thruster Qualification and Production Status", https://ntrs.nasa.gov/api/citations/20240006249/downloads/AEPS%20Status%20IEPC%202024%20v7.pdf. Table 1 (first qualification-model acceptance test, 600 V): 444 mN / 2605 s at 9 kW; 491 mN / 2651 s at 10 kW; 540 mN / 2704 s at 11 kW; 586 mN / 2736 s at 12 kW (uncertainty ±5 mN, ±25 s). Text: total mass 53 kg; envelope 210 mm by 530 mm; "around 600 mN of thrust and a specific impulse of around 2800 s at a 12 kW operating point"; the PPE will use a 48 kW system of three 12 kW AEPS thrusters and four 6 kW Hall thrusters. (Mass, thrust and Isp figures here are the thruster only; the separate power processing unit is not in these numbers.)
- General Hall-versus-ion comparison: the same AEPS paper calls the 12 kW thruster a mid-range point that trades "higher relative thrust" for "more efficient propellant utilization" in the low-thrust, high-efficiency family. NEXT-C sheet: "higher thrust, lower specific impulse operating conditions" suit Earth-orbit uses where "high propellant efficiency isn't as critical".

## 2. Can an engine lift off a Body? (Question 2)

**The rule.** An engine can lift a vehicle off a Body only if the thrust is greater than the vehicle's weight there. Weight is the whole vehicle's mass (engine, tanks, fuel, payload) times that Body's surface gravity g. Written as a ratio, thrust divided by (total mass x g) must be above 1. This is vehicle thrust-to-weight, not the engine's own thrust-to-weight: an engine with an engine-only ratio of 20 can still fail if the tanks and cargo make the vehicle 50 times heavier. The same engine lifts more mass on a low-gravity Body, so one engine can work on the Moon and fail on Earth. This is standard mechanics (F > m x g), not a NASA-printed rule; the g values below are from NASA.

Surface gravity (NASA, m/s²):

| Body   | g (m/s²) | Source                                                                                                                                                                                                              |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Earth  | 9.8      | NSSDCA Planetary Fact Sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/ (see `nasa-data-for-generation.md`)                                                                                                   |
| Moon   | 1.6      | same                                                                                                                                                                                                                |
| Mars   | 3.7      | same                                                                                                                                                                                                                |
| Europa | 1.31     | https://nssdc.gsfc.nasa.gov/planetary/factsheet/galileanfact_table.html                                                                                                                                             |
| Ceres  | 0.27     | JPL Solar System Dynamics, "Planetary Physical Parameters" (equatorial gravity), https://ssd.jpl.nasa.gov/planets/phys_par.html. Same row: mean radius 469.7 km, mass 938.416 x 10¹⁸ kg, escape velocity 0.51 km/s. |

Maximum total vehicle mass each engine could just lift, mass = thrust / g (derived; ignores gravity loss, atmosphere and any margin, and uses the ratios above, not a mission design):

| Engine                         | Thrust   | Earth     | Moon       | Mars      | Europa     | Ceres        |
| ------------------------------ | -------- | --------- | ---------- | --------- | ---------- | ------------ |
| OME                            | 26.7 kN  | 2,724 kg  | 16,688 kg  | 7,216 kg  | 20,382 kg  | 98,889 kg    |
| RL10A-3-3A                     | 73.4 kN  | 7,489 kg  | 45,872 kg  | 19,837 kg | 56,027 kg  | 271,836 kg   |
| NERVA-derived 25 klbf (design) | 111.2 kN | 11,347 kg | 69,500 kg  | 30,054 kg | 84,885 kg  | 411,852 kg   |
| NERVA 75 klbf (tested)         | 333.6 kN | 34,043 kg | 208,510 kg | 90,167 kg | 254,669 kg | 1,235,617 kg |
| NSTAR                          | 0.092 N  | 0.01 kg   | 0.06 kg    | 0.02 kg   | 0.07 kg    | 0.34 kg      |
| NEXT                           | 0.235 N  | 0.02 kg   | 0.15 kg    | 0.06 kg   | 0.18 kg    | 0.87 kg      |
| AEPS                           | 0.586 N  | 0.06 kg   | 0.37 kg    | 0.16 kg   | 0.45 kg    | 2.17 kg      |

Reading the table: chemical engines can lift off every rocky Body listed, with the payload shrinking as gravity grows. An electric engine cannot lift even a tiny probe on any of them. For scale, Dawn launched at 1,217.7 kg (JPL launch press kit, https://www.jpl.nasa.gov/news/press_kits/dawn-launch.pdf; figure found via search summary, UNVERIFIED against the page), which at Ceres' 0.27 m/s² weighs about 329 N (derived) against 0.091 N of thrust. A nuclear thermal engine has more than enough thrust for lift-off by this arithmetic; whether any NASA concept launches from a planetary surface is UNVERIFIED. The NASA NTP concepts we read (Borowski; Fittje) are in-space stages, and the Rover tests were open-air ground tests at the Nevada Test Site, not flights. Europa and Ceres are real landing targets only in the sense of mass tables; nobody has landed on either.

Lift-off also needs delta-v, not only thrust: Mars surface to 100 km low orbit is 4,200 m/s including 20% for gravity losses (NTRS 20210026187, quoted in `nasa-data-for-generation.md`).

## 3. What electric engines need that the others don't (Question 3)

**Power.** Chemical and nuclear thermal engines carry their energy in the propellant. An electric engine needs electric power from outside the engine, and its thrust grows with that power. NSTAR throttled over 0.5 to 2.3 kW (NTRS 19980017550). NEXT takes 0.6 to 7.4 kW (NASA Facts). AEPS takes 9 to 12 kW and the planned Gateway PPE system is 48 kW (IEPC-2024-298). Each also needs a power processing unit: under 36 kg for NEXT.

**Solar distance.** Solar arrays make power in proportion to sunlight, which falls as 1 / d² with d in AU (JPL, https://www.jpl.nasa.gov/edu/resources/lesson-plan/calculating-solar-power-in-space/; see `nasa-data-for-generation.md` section 2). Dawn's two arrays gave "more than 10 kilowatts" near Earth's distance and 1.4 kilowatts at its farthest distance from the Sun (https://science.nasa.gov/mission/dawn/toolkit/quick-facts/), which is why the thrust fell as it went out. The same JPL note records Juno's arrays making about 14 kW at Earth and "only 500 watts" at Jupiter. Beyond Jupiter, missions have used plutonium-fuelled power sources instead (see the cross-referenced file; wording UNVERIFIED there).

**Burn duration.** The thrust is tiny, so the engine runs for days to years. Dawn's ion engine at full thrust takes 4 days to go from 0 to 60 mph, burned 979 days to reach the first science orbit, and more than 2,000 days across the mission (NASA Science, Dawn pages above). NSTAR was ground tested for more than 12,000 hours at 2.3 kW (NTRS 19980017550 states "12,000 h at 2.3 kW"). Compare a chemical burn of minutes (OME 15 hours maximum service life is a secondary figure: UNVERIFIED) or the NERVA record of about 62 minutes in one burn.

Electric propellant is xenon: 425 kg (937 lb) at launch on Dawn, with a flow of about 3.25 mg/s at maximum thrust.

## 4. Fuel tanks and propellant mass fraction (Question 4)

Definition used here (derived convention): propellant mass fraction = propellant mass / (propellant mass + tank and structure mass). A "tank-only" fraction is not the same as a whole-stage fraction, which also carries engines and avionics.

Real examples:

- **Space Shuttle super lightweight external tank** (NASA Marshall fact sheet, https://www.nasa.gov/wp-content/uploads/2016/08/113020main_shuttle_lightweight.pdf): "about 58,500 pounds empty, and 1.6 million pounds when filled with propellants". Derived propellant mass fraction: (1,600,000 - 58,500) / 1,600,000 = 0.963. This is the best case, an expendable tank made of a light, strong alloy for liquid hydrogen and liquid oxygen. NASA's other reference pages also print an older lightweight-tank figure of 78,100 lb empty (seen via search snippet; page not opened: UNVERIFIED), so the empty mass depends on the tank version.
- **NASA Mars NTR "Copernicus" LH2 drop tank** (Borowski et al., NTRS 20120003776): the drop tank has a mass of about 22 t and carries about 102.4 t of liquid hydrogen. Derived propellant mass fraction: 102.4 / (102.4 + 22) = 0.823. Hydrogen is very light per litre, so its tank has a much higher share of empty mass than a dense-propellant tank. The same paper gives the stage's tank as 10 m diameter by 19.7 m long holding about 87.2 t of propellant (tank mass not printed).
- **Dawn spacecraft** (electric; NASA Science, https://science.nasa.gov/mission/dawn/toolkit/quick-facts/): spacecraft weight 747.1 kg, xenon 425 kg, hydrazine 45.6 kg. The page does not print a total, but the launch mass is 1,217.7 kg in the JPL press kit (UNVERIFIED against the page), which these three add to. Xenon is 425 / 1,217.7 = 35% of launch mass (derived). Electric engines carry far less propellant per kilogram of spacecraft because their Isp is high. The xenon tank's own mass is not printed in the pages read: UNVERIFIED.
- **NSTAR subsystem** (NTRS 19980017550): 47 kg dry (everything except xenon, which includes the thruster, power unit, control unit, cables and xenon storage and feed), up to 81 kg of xenon. For the whole propulsion subsystem that is 81 / (81 + 47) = 0.63 (derived).
- **Centaur upper stage**: no primary reading. A secondary table lists about 2,247 kg empty and about 20,830 kg propellant (single-engine stage), a fraction near 0.90 by our arithmetic: UNVERIFIED. For a primary figure, look for the Atlas V launch services user's guide (ULA) or a Centaur NTRS report.
- **Hypergolic stage tank mass**: not found: UNVERIFIED.

Plain pattern for a Fuel Tank Component: for hydrogen, tank is about 18% of tank-plus-fuel; for a big dense-propellant expendable tank about 4%; engines and avionics come on top.

## 5. In-game explanation text (Question 5)

These are player-facing sentences written from the sourced facts above, not themselves sourced.

- **Chemical:** "Burns two fuels together for a short, powerful push. It can lift off from planets and moons, but it burns through fuel quickly." Hydrogen-and-oxygen versions get about 444 s of efficiency; storable hypergolic ones get about 314 s and ignite on contact, so they are simple and stay usable for years.
- **Nuclear thermal:** "A reactor heats hydrogen and shoots it out the back. About twice the fuel efficiency of the best chemical rocket (about 900 s against 450 s), with real thrust, but it is heavy and has never flown." NASA ground-tested these in the 1960s.
- **Electric:** "Uses electricity to fling charged xenon gas out at enormous speed. Extremely fuel-efficient (about 3000 s) but the push is gentler than a hand's weight, so it needs power, patience and light, and it cannot lift off from any Body." Hall thrusters give more push at lower efficiency than gridded ion.

## 6. Gameplay simplifications (suggestions, not sourced facts)

Everything below is design suggestion only, not NASA data.

- **Three engine classes, one score each.** Show Isp (efficiency) as a bar, thrust as a bar, and mass as a number. Use rounded round-number bands from the tables above: chemical 300 to 450 s, nuclear thermal 800 to 900 s, electric 2,000 to 4,000 s.
- **Thrust class and "can it land here".** Thrust and mass sets the heaviest vehicle an engine can lift, as in the table in section 2. A single rule on the part card: "Lifts off: yes or no" per Body, computed as thrust divided by (vehicle mass x g), with a minimum factor such as 1.5 to cover gravity losses and atmosphere (our suggestion; real margins are mission-specific).
- **Electric needs a power budget.** Give each electric engine a kW requirement and let solar output scale as 1 / d² of distance in AU (per `nasa-data-for-generation.md`). Past roughly Jupiter, solar-fed electric engines get a large thrust penalty. Use thrust proportional to power as a simplification; the NASA tables show Isp and thrust both rising with power but not linearly (AEPS: 444 mN at 9 kW to 586 mN at 12 kW).
- **Burn time instead of instant burns.** Electric burns last in-game days to years, chemical minutes, nuclear thermal tens of minutes. Make time-to-delta-v visible.
- **Nuclear thermal in-space only.** Treat as a space-only engine (no surface lift-off) because no NASA concept we read launches from a surface and open-air nuclear exhaust on planets is a design smell. UNVERIFIED as a NASA statement.
- **Fuel Tank Component empty mass.** Use a tank-only propellant fraction around 0.80 for hydrogen tanks and about 0.95 for dense-propellant tanks (from section 4), then add a flat structure term. Treat electric xenon tanks as UNVERIFIED and pick a placeholder around 0.9 until sourced.
- **Use rounded real engines as presets:** OME (26.7 kN, 314 s, 135 kg), RL10A-3-3A (73 kN, 444 s, mass placeholder), NERVA-derived 25 klbf (111 kN, about 900 s, 3,338 kg), NSTAR (0.092 N, 3160 s, 6.4 kg), NEXT (0.235 N, 4220 s, 14 kg), AEPS (0.586 N, 2736 s, 53 kg).

## 7. Differences from `nasa-data-for-generation.md` section 3

That file marked its electric-engine figures UNVERIFIED because it read only search snippets. This research read the actual documents and finds:

- NSTAR: that file says 1900 s at 0.5 kW to 3100 s at 2.3 kW. The 1997 NASA paper (NTRS 19980017550) predicts "about 3300 s" at full power and measured 3160 s at 2.3 kW. The 1900 s low end and the 3100 s figure were not found in a document we read; the GRC page https://www.grc.nasa.gov/WWW/ion/past/90s/nstar.htm now returns 404.
- NEXT: that file says 1400 to 4220 s at 0.5 to 6.9 kW with 25 to 235 mN. The NASA Facts sheet reads "System Input Power Range, kW 0.6 - 7.4", thrust 25 to 235 mN, maximum Isp 4220 s, and prints no minimum Isp. The 4220 s and the thrust range agree; the power range and the 1400 s minimum do not.
- RL-10 at 444 s agrees with the NASA Glenn paper (444.4 ± 2.5 s for the RL10A-3-3A).
- That file's Hall-thruster line cites a 2002 paper for "over 4000 s only for one test configuration"; we did not re-read it. The AEPS paper's 2605 to 2736 s is the production-thruster range.

No edit was made to that file; this research ticket changes only `docs/research/propulsion-trade-offs.md`.
