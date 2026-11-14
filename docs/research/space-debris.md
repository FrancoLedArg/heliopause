# Space debris, salvage and the Space Apps debris project

Researched 2026-11-14 for ticket #49 (post-v1 planning, design backlog #11 "Space debris salvage"). This file changes no v1 code or spec. Figures are the source's own, with the source's date. Anything not confirmed is marked UNVERIFIED.

## Short answers

1. **Tracked debris.** ESA Space Debris Office (page "last updated 13 November 2026"): about 47,260 objects regularly tracked by Space Surveillance Networks. Modelled population (MASTER-8, reference population 02/2026): 68,450 objects > 10 cm, 1.5 million at 1-10 cm, 230 million at 1 mm-1 cm. NASA ODPO publishes no per-class counts beyond "about 50,000 large trackable objects" and "about 100 million millimeter-sized pieces".
2. **Risk.** Typical LEO relative impact speed is about 10 km/s, maximum about 15 km/s. A 1 cm fragment is mission-ending for most robotic spacecraft and is the largest size the ISS shielding is rated to stop.
3. **Removal and reuse.** Nothing has yet been removed from orbit by a dedicated debris-removal mission. ELSA-d (2021) repeatedly captured its own client; ADRAS-J (2024) approached a real rocket stage to 15 m without capturing it; ClearSpace-1 and ADRAS-J2 are still in development; NASA cancelled OSAM-1 in 2024. In orbit repair and life extension have been done (Hubble SM4, MEV-1/MEV-2).
4. **Space Apps credit.** Identified with moderate confidence as **Astro Sweepers**, 2025, but it is a **Global Winner (Galactic Impact award), not a "2nd place"**. See question 4 for details and candidates.
5. **Game departs from reality** in several ways, listed at the end.

## 1. Real figures

### ESA Space Debris Office

Source: https://sdup.esoc.esa.int/discosweb/statistics/embed/bythenumbers ("Information last updated on 13 November 2026"; the same figures back https://www.esa.int/Space_Safety/Space_Debris/Space_debris_by_the_numbers).

| Quantity                                                                | Figure                                     |
| ----------------------------------------------------------------------- | ------------------------------------------ |
| Rocket launches since 1957 (excluding failures)                         | about 7,420                                |
| Satellites placed in orbit                                              | about 28,830                               |
| Of those, still in space / still functioning                            | about 19,750 / about 15,800                |
| Objects regularly tracked and catalogued by Space Surveillance Networks | about 47,260                               |
| Fragmentation events (break-ups, explosions, collisions, anomalies)     | more than 660                              |
| Estimated objects > 10 cm (MASTER-8, reference population 02/2026)      | 68,450, incl. about 11,300 active payloads |
| Estimated objects 1 cm to 10 cm                                         | 1.5 million                                |
| Estimated objects 1 mm to 1 cm                                          | 230 million                                |
| Total mass of all objects in Earth orbit                                | more than 17,600 tonnes                    |

The size-class counts are model estimates, "not all are tracked". The tracked figure (about 47,260) and the modelled > 10 cm figure (68,450) are different measures; do not add them.

ESA Space Environment Report 2026, published 14 September 2026, covers data to the end of 2025: https://www.esa.int/Space_Safety/Space_Debris/ESA_Space_Environment_Report_2026 (PDF: https://www.sdo.esoc.esa.int/environment_report/Space_Environment_Report_I10R1_20260908.pdf, not read in full).

- "More than three intact satellites or rocket bodies are reentering the Earth's atmosphere every day on average."
- "more than 300 launches took place with over 4000 new payloads put into orbit" in 2025; "ten new payloads are launched daily".
- The Health Index rose "from about 4 to 50 in just one year".

### NASA Orbital Debris Program Office (ODPO)

Source: https://orbitaldebris.jsc.nasa.gov/faq/ (as retrieved 2026-11-14).

- "About 50,000 large, trackable objects orbit Earth" (FAQ 3).
- As of August 2026 the U.S. Space Surveillance Network had cataloged "more than 34,000 objects" in Earth orbit (FAQ 3). This is the public US catalogue and is smaller than ESA's 47,260 because the networks differ.
- About 100 million pieces of millimeter-sized debris are estimated (FAQ 3).
- The SSN routinely tracks objects "generally larger than 10 centimeters" (FAQ 4, 5); NASA radars detect debris down to a few millimeters in LEO (FAQ 5).
- NASA gives no separate counts for the 1-10 cm class; use ESA's 1.5 million estimate.
- ODPO "Space Missions and Satellite Box Score" is in Orbital Debris Quarterly News Vol. 30 Issue 3 (September 2026), https://orbitaldebris.jsc.nasa.gov/quarterly-news/pdfs/ODQNv30i3.pdf. The box-score numbers could not be extracted from the PDF: UNVERIFIED.

## 2. Risk to spacecraft

### Impact speeds

- NASA ODPO FAQ 8: LEO debris moves about 7-8 km/s; average relative impact speed about 10 km/s; maximum relative speed about 15 km/s, "more than 10 times the speed of a bullet". The FAQ's mph conversions are wrong (it prints 6.2 mph and 9.3 mph); use the km/s figures.
- NASA MMOD page (written 14 June 2016, last updated 15 October 2023): average about 10 km/s (22,000 mph). https://www.nasa.gov/centers-and-facilities/white-sands/micrometeoroids-and-orbital-debris-mmod/

### What a small fragment does

- NASA MMOD page: a 1 cm paint fleck at that speed can do damage comparable to a 550-pound object moving at 60 mph; a 10 cm projectile is compared to about 7 kg of TNT. Outcomes range from pitting to catastrophic failure. A debris impact on the ISS Zvezda module window (Expedition Four) is pictured.
- ODPO FAQ 15: "Millimeter-sized orbital debris represents the highest mission-ending penetration risk" to most robotic LEO missions.
- ODPO FAQ 10: ISS critical U.S. components (habitable compartments, high-pressure tanks) "normally withstand impacts from debris as large as 1 centimeter in diameter"; debris of 1-10 cm "poses a slight risk".
- ODPO FAQ 9: the ISS has made 41 collision-avoidance maneuvers since 1999, when collision chance exceeds 1 in 10,000 (as retrieved; the FAQ's own date for this count is not stated, so treat the count as UNVERIFIED for today).

### Shielding

- A Whipple shield is a thin outer bumper spaced from a rear wall; the bumper breaks the projectile into a cloud that spreads over a larger area of the rear wall. NASA JSC Hypervelocity Impact Technology (HVIT): https://hvit.jsc.nasa.gov/shield-development/
- The ISS mainly uses the Stuffed Whipple variant, with ceramic or Kevlar fabric layers between bumper and wall. NASA Handbook for Designing MMOD Protection: https://ntrs.nasa.gov/api/citations/20090010053/downloads/20090010053.pdf. NASA TFAWS 2014 course material: stuffed Whipple weighs 84% less than an equal-mass monolithic shield while stopping a 0.5-inch aluminium projectile at 7 km/s; the ISS uses several hundred MMOD shields, concentrated on the most exposed areas. https://tfaws.nasa.gov/wp-content/uploads/MMOD_Course_TFAWS_2014.pdf
- ODPO FAQ 10 calls the ISS "the most heavily shielded spacecraft ever flown" (the FAQ itself does not mention Whipple shields).

### Kessler syndrome (plain paragraph)

Kessler syndrome, also called collisional cascading, is the idea, proposed by NASA's Donald Kessler in 1978, that once debris in an orbital region passes a critical density, collisions create fragments faster than the atmosphere removes them, and those fragments cause more collisions, so the debris keeps growing even if nothing new is launched. It is a slow process measured in decades, not a sudden event. Sources: NASA MMOD page above; ESA FAQ (https://www.esa.int/Safety_Security/Space_Debris/FAQ_Frequently_asked_questions) says it is most likely near 900 km and 1400 km altitude, where density is high and drag is weak (as summarised from search results; ESA FAQ not fetched in full, UNVERIFIED at that level of detail). The NASA page repeats an expert view that LEO is "already at critical mass"; treat that as opinion, not settled fact.

## 3. Removal and reuse missions

| Mission                                             | What happened                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Source                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ELSA-d** (Astroscale)                             | Launched 22 March 2021. Servicer plus client; servicer has a magnetic docking mechanism. "Repeated Magnetic Capture" demonstrated 25 August 2021; complex rendezvous completed 4 May 2022; deorbit finalised and mission ended 24 January 2024. The client was Astroscale's own test target, not real debris.                                                                                                                                                                                                                                                                                                                                                                                                                                                              | https://astroscale.com/missions/elsa-d/                                                                                                                                                                                                                                                             |
| **ADRAS-J** (Astroscale, for JAXA CRD2 Phase I)     | Launched 18 February 2024. Approached a large real upper stage: first final approach reached 20 m on 13 August 2024, then 15 m. Inspection and imaging only; no capture. Deorbit operations began 25 March 2026.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | https://astroscale.com/missions/adras-j/ ; press: https://astroscale.com/en/news/astroscales-adras-j-achieves-historic-15-meter-approach-to-space-debris                                                                                                                                            |
| **ADRAS-J2** (Astroscale Japan, CRD2 Phase II)      | Under development; aims to capture a rocket upper stage (about 11 m long, 4 m diameter, about 3 tons per search-result summary, UNVERIFIED). Launch no earlier than 2027 per a launch tracker, provisional; Isar Aerospace selected as launch provider.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | https://www.astroscale.com/missions/adras-j2 ; https://astroscale.com/en/news/astroscale-japan-selects-isar-aerospace-to-launch-adras-j2                                                                                                                                                            |
| **ClearSpace-1** (ESA, led by OHB with ClearSpace)  | In development. Target per ESA page: ESA's 95 kg PROBA-1 satellite launched in 2001 (0.6 x 0.6 x 0.8 m). Launch "2029 (planned)". Would be the first removal of an object by capture.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | https://www.esa.int/Space_Safety/ClearSpace-1                                                                                                                                                                                                                                                       |
| **OSAM-1** (NASA)                                   | Planned to rendezvous with, refuel and relocate the US Government satellite Landsat 7 (the IRB report states a requirement to transfer "at least 40 kilograms of hydrazine monopropellant"; an earlier draft of this file said 10 kg, which was wrong), plus SPIDER assembling a 3 m (9-foot) antenna from seven elements and manufacturing a 10 m (32-foot) composite beam. NASA announced on 1 March 2024 it was ending the project (technical, cost and schedule challenges; no committed partner). The NASA Independent Review Board (report dated 29 Feb 2024) said the effort, "originally forecast to cost no more than $750M and launch by 2020, is seven to eight years behind schedule and $1,500M over budget", and recommended it be discontinued. Never flew. | https://www.nasa.gov/missions/update-on-status-of-nasas-osam-1-project/ ; https://www.nasa.gov/mission/on-orbit-servicing-assembly-and-manufacturing-1/ (antenna, beam) ; IRB report: https://www.nasa.gov/wp-content/uploads/2023/02/osam-1-irb-final-report-022729-cleared-redacted-20mar2024.pdf |
| **MEV-1 / MEV-2** (Northrop Grumman SpaceLogistics) | MEV-1 docked with Intelsat 901 on 25 February 2020, first docking of two commercial spacecraft in GEO; it extends life by acting as a thruster pack, not a repair. MEV-2 docked with Intelsat 10-02 in 2021. Per Intelsat release: https://www.intelsat.com/?p=17966 (via search result; page not read in full, details UNVERIFIED beyond this).                                                                                                                                                                                                                                                                                                                                                                                                                           | https://www.satellitetoday.com/technology/2020/04/17/intelsat-901-back-in-service-after-historic-docking-mission/ (secondary; primary is the Intelsat release linked above)                                                                                                                         |
| **Hubble SM4** (NASA, STS-125)                      | 11-24 May 2009. Astronauts cut into two instruments to repair them in orbit for the first time and installed Wide Field Camera 3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | https://science.nasa.gov/mission/hubble/observatory/missions-to-hubble/servicing-mission-4/                                                                                                                                                                                                         |

What has actually been captured or repaired in orbit, honestly: a real debris object has not yet been captured and removed by a dedicated mission (UNVERIFIED for classified or very recent events). Capture has been demonstrated only against a purpose-built client (ELSA-d). Repair has been done by crewed shuttle missions (Hubble). Robotic docking for life extension is operational in GEO (MEV). Astroscale pages are the mission owner's own; JAXA's CRD2 press release is at https://global.jaxa.jp/press/2024/06/20240614-2_e.html (not fetched).

## 4. Space Apps credit

**Result: the best match is Astro Sweepers (2025). It is not a 2nd place. Identification is probable, not certain.**

The official global awards are ten category awards among 11,500+ submitted projects, not a ranked podium (https://www.spaceappschallenge.org/2025/meet-the-2025-global-winners/; "top 10 projects from the 11,500+ submitted" on https://www.spaceappschallenge.org/2025/awards/global-winners/). The memory of "2nd place" may come from a local-event placing, the Global Finalist/Nominee stage, or a different project. I could not confirm any such placing.

### Primary candidate

- **Project:** Astro Sweepers - We Catch What Space Leaves Behind
- **Award:** 2025 Global Winner, **Galactic Impact**
- **Challenge:** Commercializing Low Earth Orbit (LEO)
- **Location label:** Universal Event (not tied to a single country)
- **What it does:** a "credit score" for satellites to hold space businesses accountable for what they leave behind, using NASA orbital debris data and a prototype; the NASA announcement describes an orbital debris compliance and risk intelligence platform producing Debris Assessment Software reports and an Astro Sweepers Risk Index.
- **Official project page:** https://www.spaceappschallenge.org/2025/find-a-team/astro-sweepers-we-catch-what-space-leaves-behind/ (rendered by JavaScript, so the page itself could not be read).
- **Team members** (NASA announcement, "Team Members" line): Harshiv T., Pragathy S., Pratik J., Sherlin D., Yousra H., Zienab E. Project link on that page: https://www.spaceappschallenge.org/2025/find-a-team/astro-sweepers-we-catch-what-space-leaves-behind/?tab=project
- **Caveat:** it is a debris project that placed in the previous hackathon, but it is a category winner rather than a 2nd place, so it may not be the project the human remembers.
- **Official sources:** https://www.spaceappschallenge.org/2025/meet-the-2025-global-winners/ and https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/ (winners announced 18 December 2025).

### Other candidates and non-matches

- **Runtime Terror** (University College Dublin): a Dublin Mission Control global nominee in **2024**, with a digital orrery said to help plot debris pathways. Local-event result, not a debris project per se; from search-result summaries of press coverage, not an official Space Apps page. UNVERIFIED.
- **Photonics Odyssey**, 2025 Most Inspirational winner, is a satellite internet concept (Commercializing LEO). Some press coverage mixed it with debris; the official NASA text does not make it a debris project. Not a match.
- **Debris Destroyers**, a 2020 Global Finalist for "Orbital Scrap Metal - The Video Game V2.0" (https://2020.spaceappschallenge.org/challenges/sustain/orbital-scrap-metal-the-video-game-v20/teams/debris-destroyers/). Older than "previous hackathon", but it is a debris game and relevant to credit.
- The 2025 Global Finalists (45), Honorable Mentions (23) and Global Nominees (1,290+) pages (https://www.spaceappschallenge.org/2025/awards/global-finalists/ and siblings) are rendered by JavaScript and their lists could not be read, so a debris project in those lists could not be ruled out. **To close this, the human should open those pages and the 2025 Find-a-Team search for "debris".**
- The 2026 hackathon is described as "happening now" on the site; its awards are not out, so "previous hackathon" is read as 2025.

## 5. Where the game idea departs from reality (gameplay simplifications)

These are design notes, not research findings.

1. **Location.** Real debris is almost entirely in Earth orbit (LEO, plus GEO and graveyard orbits). Debris "far out in a Star System" would have no real counterpart. Real far-from-Earth leftovers are few and large: spent upper stages, dead probes, landers. Scatter-fields of fragments around other stars are an invention.
2. **Density.** Even in LEO, space is mostly empty. 47,260 tracked objects spread across orbital shells is sparse; real debris pickup needs a dedicated rendezvous per object, and ADRAS-J took months of approaches to reach 15 m. A "field of junk" to fly through is not realistic.
3. **Speed.** Debris relative speeds are about 10 km/s; real capture matches the target's orbit and approaches at walking pace. There is no sweeping up on the fly.
4. **Capture.** No dedicated mission has yet captured real debris, and ELSA-d used a purpose-built client with a docking plate. Grabbing arbitrary tumbling junk is the unsolved part.
5. **Salvage for parts.** Real practice is removal for safety and deorbiting, not reuse. NASA's OSAM-1 reuse-style servicing was cancelled; MEV works because GEO satellites have a standard interface. Stripping random debris for parts is an invention; refuelling and life extension are the realistic analogues.
6. **Origin.** Real debris is fragments from explosions, collisions and anti-satellite tests (660+ fragmentation events), dead satellites and rocket bodies; a "Kessler" cascade is a real, slow, orbit-specific risk. The game could mirror this by making debris the leftover of earlier players' or earlier civilisations' missions.
7. **Hazard scale.** A 1 cm fragment already kills a robotic spacecraft; shielding (Whipple) stops about 1 cm on the ISS only. A game could use "size class vs shield rating" as a simple rule drawn from real figures.
