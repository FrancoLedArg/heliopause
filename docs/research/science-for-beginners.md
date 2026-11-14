# Science for beginners: instruments, discoveries and big questions

Research for ticket #73 (post-v1 idea: "Science: discoveries and instruments"). This file does not change any v1 code or spec.

Sections 1 to 5 are sourced facts only; figures are the source's own. Anything not confirmed on a primary page is marked UNVERIFIED. Gameplay simplifications are confined to section 6. The "In plain words" lines are draft in-game copy for beginners; they are plain restatements of the cited fact, not extra claims.

This file extends `docs/research/sensors-and-communication.md` (ticket #48). That file covers the instruments that detect and characterise a Body (camera, laser altimeter, spectrometer, gamma-ray and neutron detector, radar). This file adds the magnetometer and the sample-analysis lab, and it uses the same mission figures where they overlap (HiRISE aside, nothing here contradicts it). Juno, which #48 did not cover, was checked here and no NASA page gave its instrument mass or power (see 1.3).

## Direct answers

1. Five instrument families: cameras, spectrometers, magnetometers, radar, and sample-analysis labs. Each has a mass and power from a NASA mission page in section 1 (one power figure for the lab is UNVERIFIED).
2. Discoveries are listed for rocky planets (3), Moons (5), icy and small Bodies (5), Gas Giants (4) and the Sun (4) in section 2, each with the instrument type. Fewer than 4 only where noted.
3. Seven big questions, drawn from the 2023-2032 US planetary decadal survey and NASA's astrobiology pages, each mapped to discoveries in section 3.
4. NASA Space Place, Eyes on the Solar System and the NASA Astrobiology pages are suitable to cite and link (section 4).

## 1. Instrument families

Mass and power are the page's own wording. "What makes it heavy or power-hungry" is only stated where the page says it; otherwise it is marked as an inference or UNVERIFIED.

### 1.1 Camera (imager)

- **In plain words:** A camera shows you what a place looks like, from a whole planet down to boulders.
- **Mission example:** Mars Reconnaissance Orbiter, HiRISE (High Resolution Imaging Experiment). Mass: "~143 pounds (65 kilograms), including thermal control system, cables, etc." Power: "60 watts". Pixel size from 300 km altitude is "about 12 inches (30 centimeters) across"; swath width 6 km; focal length "~40 feet (12 meters)", f/24. Source: https://science.nasa.gov/mission/mars-reconnaissance-orbiter/science-instruments/
- **Why heavy or power-hungry:** The page does not say. It gives a 12 m focal length, which suggests a long, large optical system (inference, UNVERIFIED). The mass figure includes thermal control and cables.
- Other cameras: New Horizons LORRI and OSIRIS-REx OCAMS are in `sensors-and-communication.md`; Perseverance's Mastcam-Z took a 360-degree panorama from 993 images (https://www.jpl.nasa.gov/news/nasas-perseverance-rover-deciphers-ancient-history-of-martian-lake/). No mass or power was confirmed for them.

### 1.2 Spectrometer

- **In plain words:** A spectrometer splits light into colours. Each material absorbs different colours, so the pattern tells you what a place is made of.
- **Mission example A:** Mars Reconnaissance Orbiter, CRISM. Mass "~72.5 pounds (32.92 kilograms)". Power "44.4 - 47.3 Watts during normal operations (~16 Watts during standby)". Spectral range "362 - 3920 nm". It searches for minerals left by water. Source: same MRO page as 1.1.
- **Mission example B:** Dawn, VIR. The page gives parts, not one total: optical system 5.0 kg; proximity electronics 3.0 kg and 5 W; cryocooler with driving electronics 1.3 kg and 12.6 W; mounting 5.0 kg. Observes roughly 0.3 to 5 microns on two detectors (0.25 to 1 and 1 to 5 micrometres). Source: https://science.nasa.gov/mission/dawn/technology/vir-instrument/
- **Why heavy or power-hungry:** On the VIR page the cryocooler is the largest single power item (12.6 W of the 17.6 W listed for electronics and cooler). The page does not say what the cooler cools; that it chills the infrared detector is UNVERIFIED on that page. The CRISM page does not mention cooling.

### 1.3 Magnetometer

- **In plain words:** A magnetometer measures magnetic fields. It can show whether a world has its own field, and whether something hidden, such as salty water, is changing a nearby field.
- **Mission example:** Cassini, MAG. "Mass (current best estimate) = 3.00 kg"; "Average Operating Power (current best estimate) = 3.10 W". The goal is "to determine the planetary magnetic fields and the dynamic interactions in the planetary environment". The page says one sensor sits "midway out" on a boom and the other at its end. Source: https://science.nasa.gov/mission/cassini/spacecraft/cassini-orbiter/magnetometer/mag-technical-write-up
- **Why heavy or power-hungry:** It is not; this is the lightest instrument in the list. Its cost is placement: it needs a boom to sit away from the spacecraft's own magnetic fields. The boom's stated purpose and a length of 36 feet (11 metres) appeared in a search summary of NASA pages, not in the page I fetched. Boom length UNVERIFIED.
- **Juno:** The JPL Juno spacecraft page lists MAG as one of eight science instruments but gives no mass or power (http://www.jpl.nasa.gov/news/press_kits/juno/spacecraft/). Other figures I found (15.25 kg; 3.53 kg and 7.2 W) came from non-NASA or unscoped tables and disagree. UNVERIFIED.

### 1.4 Radar and altimeter

- **In plain words:** Radar sends out radio pulses and times the echoes. It can map a surface through clouds and look under the ground.
- **Mission example:** Cassini, RADAR. "Mass (current best estimate) = 41.43 kg"; peak operating power 108.40 W. No average power on the page. It images Titan, whose thick clouds block ordinary cameras. Source: https://science.nasa.gov/mission/cassini/spacecraft/cassini-orbiter/radio-detection-and-ranging/radar-technical-write-up
- **Why heavy or power-hungry:** Per the page, the high-power amplifier boosts the transmit signal, and an energy-storage subsystem raises roughly 30 V to about 85 V and holds energy in a capacitor bank to feed the amplifier during pulse bursts.
- **Second example:** Mars Reconnaissance Orbiter, SHARAD. Mass "33 pounds (15 kilograms)"; frequency 15 to 25 megahertz; a "~33-foot (10-meter) antenna made up of two ~16-foot (5 meter) foldable tubes"; probes up to about 1 km down. Total power is not on the page (the "10 watts" there describes the transmitted signal). Source: MRO page above.

### 1.5 Sample-analysis lab

- **In plain words:** A lab on the spacecraft scoops up dirt or rock, heats it or tests it, and tells you which chemicals are in it, including carbon-based ones that life is built from.
- **Mission example:** Curiosity, SAM (Sample Analysis at Mars). Mass "About 40 kilograms". Its main job is to "Identify a wide range of organic (carbon-containing) compounds". Source: https://science.nasa.gov/mission/msl-curiosity/science-instruments/ . NASA Goddard's SAM fact sheet says it has three instruments (gas chromatograph, quadrupole mass spectrometer, tunable laser spectrometer) and fits "the space of a typical microwave oven" (https://science.gsfc.nasa.gov/sam/samfactsheet.html).
- **Power:** Not on either NASA page. A search summary of a NASA Goddard workshop slide gave about 11 W average; I did not open the slide. UNVERIFIED.
- **Why heavy:** Not stated. It packs three separate instruments plus sample handling into one box (the three instruments are sourced; "that is why it is heavy" is inference).
- Perseverance's lab-style instruments (PIXL X-ray chemistry, etc.) are named on the JPL page above; no mass or power confirmed.

### 1.6 Not an instrument, but important: the radio link

Several finds below (Enceladus's ocean, Io's interior, the Great Red Spot's depth) came from measuring tiny Doppler shifts in the spacecraft's radio signal as gravity tugged it. NASA calls this gravity data from radio tracking. It needs no extra instrument on the spacecraft, only the telecom link described in `sensors-and-communication.md`.

## 2. Discoveries by Body type

Format: discovery, instrument type, plain fact, source. Where a page does not name the instrument I say so.

### 2.1 Rocky planets

1. **Ancient lake and river delta on Mars (Jezero Crater).** Camera, plus an X-ray chemistry instrument (PIXL). In plain words: Mars once had a lake about 35 km across and about 30 m deep at most, fed by a river. The rover has collected 23 samples and has not yet found signs of ancient life. Source: https://www.jpl.nasa.gov/news/nasas-perseverance-rover-deciphers-ancient-history-of-martian-lake/
2. **Water ice at Mercury's poles.** Radar (Arecibo, from Earth) first saw radar-bright patches in 1991; MESSENGER images showed they all lie in permanent shadow. In plain words: the planet closest to the Sun has ice in craters that never see sunlight. If spread over an area the size of Washington, D.C., it would be "more than 2 miles thick". Source: https://www.jpl.nasa.gov/news/nasa-spacecraft-finds-new-mercury-water-ice-evidence/ . A search summary of NASA pages also credited MESSENGER's neutron spectrometer and laser altimeter; the fetched JPL page names neither. Those two are UNVERIFIED here.
3. **Venus's surface seen through its clouds.** Radar (Magellan). In plain words: radar saw through the thick clouds and showed volcanoes and "pancake domes". The first 243-day mapping cycle imaged 84 percent of the planet. Source: https://www.jpl.nasa.gov/news/magellan-radar-mapping-results/
4. **Venus may still erupt.** A JPL page is titled "Ongoing Venus Volcanic Activity Discovered With NASA's Magellan Data" (https://www.jpl.nasa.gov/news/ongoing-venus-volcanic-activity-discovered-with-nasas-magellan-data/). I read only the title and a search summary; the details are UNVERIFIED.

### 2.2 Moons

1. **Enceladus's plumes and salty ocean.** Cameras found the water-vapour cloud in 2005; the magnetometer prompted a closer flyby; the plume was sampled directly in 2008; radio-Doppler gravity data revealed the ocean. In plain words: Saturn's small icy Moon shoots jets of water into space at "about 800 miles per hour (400 meters per second)", and it hides an ocean about 10 km deep under an ice shell 30 to 40 km thick. Organic material in the plume was about 20 times denser than expected. Source: https://science.nasa.gov/mission/cassini/science/enceladus/
2. **Europa's hidden ocean.** Magnetometer (Galileo). In plain words: Jupiter's magnetic field behaves around Europa as if a layer of salty water is under the ice. NASA's 2000 release called the evidence "still indirect"; Europa Clipper is meant to confirm it. Source: https://science.nasa.gov/solar-system/galileo-evidence-points-to-possible-water-world-under-europas-icy-crust/
3. **Io's volcanoes.** Camera (Voyager 1, 1979, spotted by JPL navigator Linda Morabito), later Juno gravity data. In plain words: Io is the most volcanically active body in the solar system, with an estimated 400 volcanoes, heated by Jupiter's gravity squeezing it. Juno found each volcano is likely fed by its own magma chamber, not one global magma ocean. Sources: https://science.nasa.gov/photojournal/volcanic-eruptions-on-io/ and https://www.jpl.nasa.gov/news/nasas-juno-mission-uncovers-heart-of-jovian-moons-volcanic-rage/
4. **Titan's lakes and seas of liquid methane.** Radar (Cassini); the Huygens probe made the first landing on a surface in the outer solar system. In plain words: on Titan it rains and rivers run, but the liquid is methane and ethane, not water. Cassini data show dunes of ice coated with hydrocarbons around its equator. Source: https://science.nasa.gov/mission/cassini/science/titan/ . The radar attribution is from a search summary of NASA pages (the fetched page does not mention radar); the lakes were first confirmed by radar in July 2006 per that summary. Radar attribution UNVERIFIED on the fetched page.
5. **Ice in dark lunar craters.** Spectrometer (Moon Mineralogy Mapper, Chandrayaan-1) and an impact test (LCROSS, watched by LRO). In plain words: the Moon has real water ice in craters that never get sunlight. NASA says LCROSS and LRO saw "grains of water ice in the ejected material", and M3's full dataset "revealed multiple confirmed locations of water ice in permanently shadowed regions". How much ice is there overall is not known. Source: https://science.nasa.gov/moon/moon-water-and-ices/

### 2.3 Icy and small Bodies

1. **Pluto's frozen heart.** Camera and spectrometer (New Horizons); the page does not name instruments. In plain words: the "heart" is a huge glacier of mostly nitrogen ice with dozens of glaciers flowing into it, next to mountains of water ice. NASA also says there is probably an ocean under the surface, about 200 miles of ice down. Source: https://www.nasa.gov/solar-system/five-years-after-new-horizons-historic-flyby-here-are-10-cool-things-we-learned-about-pluto/
2. **Ceres's bright spots are salt.** Dawn found more than 300 bright areas. In plain words: the dwarf planet's bright patches are salt left behind after salty water reached the surface, so Ceres is "surprisingly active" (Carol Raymond, Dawn). The page does not say which instrument. Source: https://www.jpl.nasa.gov/news/bright-areas-on-ceres-suggest-geologic-activity/
3. **Comet water that looks like Earth's.** Mass spectrometer (Rosetta, ESA). In plain words: a 2024 reanalysis of more than 16,000 measurements found Comet 67P's water is a close match to Earth's ocean water (Earth's oceans have about 1 deuterium atom per 6,420 hydrogen atoms), reviving the idea that comets helped fill our oceans. An earlier 2014 reading had suggested a different value, about three times higher. Source: https://science.nasa.gov/solar-system/comets/nasa-led-team-links-comet-water-to-earths-oceans/ . The page does not name the instrument; "mass spectrometer" is from the ESA/JPL search results (https://blogs.esa.int/rosetta/2014/12/10/rosetta-fuels-debate-on-origin-of-earths-oceans/), not fetched. UNVERIFIED.
4. **Geysers on Triton.** Camera (Voyager 2, 1989); the page names the spacecraft, not the instrument. In plain words: Neptune's largest Moon has geysers that shoot icy material up "more than 5 miles" (8 km). Source: https://science.nasa.gov/neptune/neptune-facts/
5. **Asteroid Bennu holds the ingredients of life.** Sample-analysis labs on Earth (OSIRIS-REx brought samples home). In plain words: Bennu's samples contain amino acids (33 types in one 52 mg sample) and all five nucleobases, and salt crystals that formed in sodium-rich water. The amino acids were an equal mix of left- and right-handed forms, unlike life on Earth. Source: a NASA-authored Nature Astronomy paper, https://science.gsfc.nasa.gov/sed/content/uploadFiles/publication_files/Glavin%20Dworkin%202025.pdf , found through a search summary and not read in full. Details UNVERIFIED; a NASA page for this result was not opened.

### 2.4 Gas Giants (and ice giants)

1. **Saturn's six-sided storm.** Camera and infrared spectrometer. In plain words: a six-sided jet stream circles Saturn's north pole, about 30,000 km across (more than twice Earth's width), seen first by Voyager in 1980 and 1981. Cassini's infrared spectrometer (VIMS) studied it in the polar dark in 2006; the camera (ISS) imaged it in sunlight from 2009. Source: https://science.nasa.gov/mission/cassini/science/saturn/hexagon-in-motion/
2. **The Great Red Spot goes deep.** Microwave radiometer (Juno). In plain words: Jupiter's famous storm is 1.3 times as wide as Earth and its roots reach about 200 miles (300 kilometers) down. It has been watched since 1830. Source: https://www.jpl.nasa.gov/news/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/ . A search summary of NASA pages also reported a radio-gravity result of about 300 miles (500 km), including a JPL photojournal caption that says 186 miles (300 km). I did not open those pages; the gravity figure is UNVERIFIED and the figures are not reconciled.
3. **Neptune's winds.** Camera and radio tracking (Voyager 2, 1989). In plain words: Neptune is "our solar system's windiest world", with winds near 1,200 mph, about three times stronger than Jupiter's. Voyager 2 saw a storm there large enough to hold the whole Earth; it has since vanished. Source: https://science.nasa.gov/neptune/neptune-facts/
4. **Tilted magnetic fields.** Magnetometer (Voyager 2). In plain words: Neptune's magnetic field is tipped about 47 degrees from its spin axis and is about 27 times stronger than Earth's, so its magnetic bubble changes shape as it spins. Source: same Neptune page. Uranus's field tilt (about 60 degrees per a search summary of a NASA page) is UNVERIFIED here.

### 2.5 The Sun

1. **A spacecraft entered the Sun's atmosphere.** Magnetic and particle instruments (Parker Solar Probe). In plain words: in April 2021 Parker became the first spacecraft to touch the Sun by flying through its corona, about 20 solar radii (roughly 8 million miles) from the Sun's surface. At closest approach it comes within about 3.9 million miles (6.2 million km) at about 430,000 mph (700,000 kph). Sources: https://svs.gsfc.nasa.gov/vis/a010000/a014000/a014045/script_31955_00.html and https://science.nasa.gov/mission/parker-solar-probe/
2. **Kinks in the solar wind.** Instruments on Parker traced "switchbacks" to bursts at the Sun's visible surface. Same SVS page.
3. **First views of the Sun's poles.** Cameras and a spectrometer (ESA's Solar Orbiter: PHI, EUI, SPICE). In plain words: in March 2025 Solar Orbiter looked down on the south pole from about 15 degrees below the Sun's equator; no earlier spacecraft had gone further than 7 degrees from it. The magnetic field there was mixed, both north and south polarity. Source: https://www.esa.int/Science_Exploration/Space_Science/Solar_Orbiter/Solar_Orbiter_gets_world-first_views_of_the_Sun_s_poles (via search summary; page not opened in full).
4. **Thousands of comets next to the Sun.** Coronagraph (SOHO, LASCO). In plain words: SOHO has found over 5,000 comets, more than half of all known comets, because its coronagraph blocks the Sun's glare. It also traced the fast solar wind to honeycomb-shaped magnetic fields near the poles. Source: https://science.nasa.gov/mission/soho/

## 3. Big questions

Questions 1 to 6 are drawn from the 12 priority science questions of the 2023-2032 US planetary decadal survey (published by the National Academies, written for NASA; short titles from https://www.nationalacademies.org/read/26522/chapter/2). The "Where" line for each is mine. Not a NASA page, but the survey is the community's own agenda; flagged for that reason. Question 7 draws on NASA's astrobiology pages.

| #   | Big question (plain)                                                                      | Survey topic                                                                        | Discoveries in section 2 that help                                                                  |
| --- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Where did Earth's water come from?                                                        | Origin of Earth and inner solar system bodies (Q3)                                  | Comet 67P water (2.3.3); ice at Mercury's poles (2.1.2) and the Moon (2.2.5); Bennu's salts (2.3.5) |
| 2   | Is there life in the hidden oceans of icy Moons?                                          | Search for life elsewhere (Q11); Dynamic habitability (Q10)                         | Enceladus (2.2.1); Europa (2.2.2); Ceres (2.3.2); Pluto (2.3.1); Bennu's amino acids (2.3.5)        |
| 3   | How do planets and moons form?                                                            | Evolution of the protoplanetary disk (Q1); Accretion in the outer solar system (Q2) | Bennu samples (2.3.5); Comet 67P (2.3.3); Io (2.2.3); Neptune and Triton (2.4.3, 2.3.4)             |
| 4   | Why did Earth, Venus and Mars turn out so different?                                      | Atmospheres, magnetospheres, climate evolution (Q6)                                 | Mars lakes (2.1.1); Venus volcanoes (2.1.3, 2.1.4); tilted magnetic fields (2.4.4)                  |
| 5   | What is inside giant planets, and why are they so stormy?                                 | Giant planet structure and evolution (Q7)                                           | Great Red Spot depth (2.4.2); Saturn's hexagon (2.4.1); Neptune's winds (2.4.3)                     |
| 6   | What heats the worlds that should be frozen?                                              | Solid body interiors; Circumplanetary systems (Q5, Q8)                              | Io (2.2.2/2.2.3); Enceladus (2.2.1); Titan (2.2.4); Ceres (2.3.2)                                   |
| 7   | Why is the Sun's atmosphere hotter than its surface, and how does it make the solar wind? | NASA's stated Parker Solar Probe goals                                              | Parker corona and switchbacks (2.5.1, 2.5.2); Solar Orbiter poles (2.5.3); SOHO wind origin (2.5.4) |

Sources for what the questions mean:

- Decadal survey: the question titles above and the statement that Mars Sample Return, then the Uranus Orbiter and Probe, then the Enceladus Orbilander, were top mission priorities (search summary of https://www.nationalacademies.org/read/26522; mission-priority claims UNVERIFIED, not needed by the game).
- NASA Astrobiology: the three core questions of how life begins and evolves, whether life exists elsewhere, and how to search for it; "no evidence of extraterrestrial life has been found yet" (https://science.nasa.gov/astrobiology/strategy/ , https://astrobiology.nasa.gov/ask-an-astrobiologist/). Via search summary, pages not opened in full.
- Parker questions, quoted from https://science.nasa.gov/mission/parker-solar-probe/: "Why is the corona much hotter than the Sun's surface (the photosphere)?" and "How does the solar wind accelerate?"
- Question 6 is my grouping of decadal topics Q5 and Q8; the survey does not phrase it that way. Question 1: NASA says the 67P result "revives the idea" of comets delivering water. It does not say it is settled; the earlier 2014 value pointed the other way.

Honest limit: none of these is answered. Question 2 especially has no evidence of life. NASA's own pages say Perseverance has "yet to see evidence" of ancient life and no life elsewhere has been found.

## 4. Existing NASA resources the game could cite or link

- **NASA Space Place** ("NASA Science for Kids"): written for young learners with games and crafts. Relevant pages: "Europa: Jupiter's Ocean World" https://spaceplace.nasa.gov/europa/en/ , "Thirsty? Have a comet!" https://spaceplace.nasa.gov/comet-ocean/en/ , "Why Do We Care About Water on Mars?" https://spaceplace.nasa.gov/water-on-mars/en/ . Index: https://spaceplace.nasa.gov/menu/solar-system/ . The page lists no Sun-specific article.
- **Eyes on the Solar System** (NASA/JPL): free browser 3D simulation; planets, moons, asteroids, comets and spacecraft; time from 1950 to 2050; "more than 150 missions" including Voyager, Cassini, OSIRIS-REx and New Horizons. https://science.nasa.gov/eyes/ and https://eyes.nasa.gov/apps/solar-system/ . It states no specific usage terms; a link, not embedding, is the safe use. Feedback contact on the page: eyes@jpl.nasa.gov.
- **NASA Astrobiology**: https://science.nasa.gov/astrobiology/at-nasa/ and https://astrobiology.nasa.gov/ask-an-astrobiologist/ (summary-level; pages not opened in full).
- **Mission pages and Photojournal**: those cited in section 2. NASA media usage terms were not checked, UNVERIFIED; check before reusing any NASA image in the game.

## 5. Things NASA pages disagree on or that remain open

- Great Red Spot depth: 200 miles (300 km) on the JPL release; about 300 miles (500 km) in a gravity-based release found by search. Not reconciled.
- Europa: the 2000 Galileo page calls the ocean evidence "still indirect".
- Saturn hexagon winds: about 300 mph (500 kph) for the jet stream; up to 895 mph (1,440 kph) for gravity-derived cloud-top winds. Different measurements, both on one NASA page.
- Comet 67P water: 2014 ratio about three times Earth's; the 2024 reanalysis finds a match.
- Neptune's winds: 1,200 mph on the facts page; other NASA pages show 1,500 mph or 2,000 km/h (search summary). Quote the facts-page figure.

## 6. Gameplay simplifications (not facts)

Everything in this section is a design suggestion. It does not change v1.

- **Instrument Components.** Cameras, spectrometers, magnetometers, radar and labs could be five post-v1 Components; mass and power from section 1 give believable relative weights: a magnetometer (3 kg, 3 W) is light, a lab (about 40 kg) and a radar (41 kg, 108 W peak) are heavy, a camera (65 kg, 60 W) is heaviest in this sample. Real numbers differ widely by design, so use them for ordering, not exact values.
- **Instrument to discovery mapping.** Camera reveals surface features; radar reveals what is under clouds or ground; magnetometer reveals hidden oceans or tilted fields; spectrometer reveals ice and minerals; lab reveals life ingredients. This matches section 2 but is a simplification; for example, the Enceladus ocean needed gravity data.
- **Big question as a Star System objective.** "Find three discoveries that bear on question N" using the table in section 3. Never claim the question is answered; show "evidence for" and "still open".
- **Wording.** Keep real mission and instrument names (Cassini, HiRISE) out of in-game text, as #48 recommends; use "a camera", "a radar". Use the plain-words lines above, which stay close to the NASA wording.
- **Fiction versus fact.** Game Bodies are generated; a discovery in the game is "a real kind of find", not a real result. A short caption "this really happened at Enceladus" with a link is a possible bridge to real data.

## Source list

- https://science.nasa.gov/mission/mars-reconnaissance-orbiter/science-instruments/
- https://science.nasa.gov/mission/dawn/technology/vir-instrument/
- https://science.nasa.gov/mission/cassini/spacecraft/cassini-orbiter/magnetometer/mag-technical-write-up
- https://science.nasa.gov/mission/cassini/spacecraft/cassini-orbiter/radio-detection-and-ranging/radar-technical-write-up
- https://science.nasa.gov/mission/msl-curiosity/science-instruments/
- https://science.gsfc.nasa.gov/sam/samfactsheet.html
- http://www.jpl.nasa.gov/news/press_kits/juno/spacecraft/
- https://science.nasa.gov/mission/cassini/science/enceladus/
- https://science.nasa.gov/solar-system/galileo-evidence-points-to-possible-water-world-under-europas-icy-crust/
- https://www.jpl.nasa.gov/news/nasas-juno-mission-uncovers-heart-of-jovian-moons-volcanic-rage/
- https://science.nasa.gov/photojournal/volcanic-eruptions-on-io/
- https://science.nasa.gov/mission/cassini/science/titan/
- https://science.nasa.gov/moon/moon-water-and-ices/
- https://www.jpl.nasa.gov/news/nasas-perseverance-rover-deciphers-ancient-history-of-martian-lake/
- https://www.jpl.nasa.gov/news/nasa-spacecraft-finds-new-mercury-water-ice-evidence/
- https://www.jpl.nasa.gov/news/magellan-radar-mapping-results/
- https://www.nasa.gov/solar-system/five-years-after-new-horizons-historic-flyby-here-are-10-cool-things-we-learned-about-pluto/
- https://www.jpl.nasa.gov/news/bright-areas-on-ceres-suggest-geologic-activity/
- https://science.nasa.gov/solar-system/comets/nasa-led-team-links-comet-water-to-earths-oceans/
- https://science.nasa.gov/mission/cassini/science/saturn/hexagon-in-motion/
- https://www.jpl.nasa.gov/news/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- https://science.nasa.gov/neptune/neptune-facts/
- https://svs.gsfc.nasa.gov/vis/a010000/a014000/a014045/script_31955_00.html
- https://science.nasa.gov/mission/parker-solar-probe/
- https://science.nasa.gov/mission/soho/
- https://www.esa.int/Science_Exploration/Space_Science/Solar_Orbiter/Solar_Orbiter_gets_world-first_views_of_the_Sun_s_poles
- https://www.nationalacademies.org/read/26522/chapter/2
- https://spaceplace.nasa.gov/menu/solar-system/
- https://science.nasa.gov/eyes/
