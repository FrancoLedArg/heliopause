# Detecting Bodies and deep-space communication

Research for ticket #48 (post-v1 idea: "Sensors: reveal the Star System progressively"). This file does not change any v1 code or spec.

Sections 1 to 4 are sourced facts only; figures are the source's own. Anything not confirmed on a primary page is marked UNVERIFIED. Gameplay simplifications are confined to section 5.

## Direct answers

1. Four instrument families detect or characterise a Body: optical cameras and telescopes (existence, direction, size), laser altimeters (range and shape), spectrometers (composition) and radar (subsurface structure, ice). One real mission example for each is below.
2. They split naturally into a sequence: a faint point of light (camera) then a resolved size and shape (camera, laser) then surface composition (spectrometer) then composition below the surface (gamma-ray and neutron detector, radar).
3. The Deep Space Network (DSN) is NASA's network of large radio antennas at three sites about 120 degrees of longitude apart. Voyager 1's 160 bits per second at 164.7 AU, against 115,200 bits per second at Jupiter in 1979, supports "signal too weak far from home" as a fair simplification, with the caveats in section 3.

## 1. Instruments, ranges and one mission each

### Optical navigation camera / telescope: detects that a Body exists

- **New Horizons, LORRI (Long Range Reconnaissance Imager).** On 21 September 2006, during an optical navigation test, LORRI imaged Pluto as an unresolved point of light at its predicted position from about 4.2 billion kilometres (2.6 billion miles). Source: https://science.nasa.gov/photojournal/new-horizons-sees-pluto-sept-21/ (the NASA release at https://www.nasa.gov/mission_pages/newhorizons/news/first_sighting.html returned HTTP 404 when fetched). A search-result summary of the NASA release states the test showed the spacecraft "can find and track long-range targets"; I did not fetch the page, so treat that wording as UNVERIFIED.
- **OSIRIS-REx, OCAMS (PolyCam, MapCam, SamCam).** NASA: in August 2018 the spacecraft "got its first glimpse of Bennu", a grainy image taken from about 1.4 million miles (2.3 million kilometres). Source: https://science.nasa.gov/mission/osiris-rex . The mission paper says observing began in June 2018 "when the asteroid is just bright enough for detection by PolyCam (~15th magnitude)". Source: Lauretta et al. 2017, Space Science Reviews 212:925-984, DOI 10.1007/s11214-017-0405-1, https://science.gsfc.nasa.gov/sed/content/uploadFiles/publication_files/Lauretta_2017_SSR_OSIRIS-REx-Mission.pdf (a GSFC-hosted mission paper, not a mission web page).
- The same paper says MapCam (about 70 mrad, 4 degree field of view) "will be used to search for natural satellites and dust plumes during approach" and to produce shape models. Same source.

### Laser altimeter (lidar): distance, shape and size

- **OSIRIS-REx, OLA (OSIRIS-REx Laser Altimeter).** "With two laser transmitters, OLA can range to Bennu from beyond 7 km at a 100-Hz measurement rate and as close as 50 m at a 10-kHz measurement rate." It builds a 3D model of the asteroid (shape, topography) and 5-cm resolution maps of proposed sample sites. Source: Lauretta et al. 2017 (same URL as above).
- A laser altimeter is a close-range tool (kilometres), not a detector from afar. The figures above are from the mission paper; I did not find the figure on a NASA mission web page.

### Spectrometer: surface composition (ice vs rock, minerals, organics)

- **OSIRIS-REx, OVIRS.** Point spectrometer, 4-mrad field of view, 0.4 to 4.3 micrometres; the range "covers spectral bands needed to identify key mineral species, water, and organic materials". Spot size 20 m during Detailed Survey. Source: Lauretta et al. 2017.
- **OSIRIS-REx, OTES.** Measures thermally emitted radiation from 5.5 to 50 micrometres. Source: Lauretta et al. 2017.
- **Dawn, VIR (Visible and InfraRed mapping spectrometer).** Covers the 0.25-1 micrometre and 1-5 micrometre ranges on two detectors. Source: https://science.nasa.gov/mission/dawn/technology/vir-instrument/ . The page does not say which materials VIR identifies. A search summary attributes carbonate and ammonia detections on Ceres to VIR, citing journal and arXiv papers; UNVERIFIED against a NASA page.
- **Mars Reconnaissance Orbiter, CRISM.** Aims "to search for the residue of minerals that form in the presence of water"; maps at scales as small as about 18 meters. Source: https://science.nasa.gov/mission/mars-reconnaissance-orbiter/science-instruments/

### Gamma-ray and neutron detector: elements below the surface

- **Dawn, GRaND.** 21 sensors measuring "the energy from gamma rays and neutrons that either bounce off or are emitted by a celestial body", revealing elemental makeup of Vesta and Ceres "down to a depth of one meter (three feet)". Source: https://science.nasa.gov/mission/dawn/technology/grand-instrument/ . The page gives no operating altitude or exposure time. A search summary says its Ceres maps needed weeks-long exposures; UNVERIFIED.

### Radar: subsurface layers and ice

- **Mars Reconnaissance Orbiter, SHARAD.** Looks for "liquid or frozen water in the first few hundreds of feet (up to 1 kilometer) of Mars' crust". Vertical resolution about 15 meters in free space, better than 10 meters in the Martian subsurface; horizontal resolution roughly 0.3 to 3 kilometers; radar "chirps" in the 15 to 25 MHz band. Source: https://science.nasa.gov/mission/mars-reconnaissance-orbiter/science-instruments/
- This is a planetary orbiter example. I did not find a primary source for a radar that characterises a small Body in a Star System.

### Not covered

- Juno (named in the ticket) was not researched; no Juno figures are included. UNVERIFIED / not done.

## 2. Which instrument reveals what, in order

This is the sourced mapping of reveal stages to instruments. The game-level ladder is in section 5.

| Stage                           | Instrument evidence                                                  | Source figure                                               |
| ------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| A Body exists in that direction | LORRI saw Pluto as an unresolved point of light                      | 4.2 billion km (2.6 billion miles), 2006                    |
| Its distance and size           | OLA lidar ranges and builds a shape model; MapCam makes shape models | beyond 7 km down to 50 m                                    |
| Icy or rocky                    | OVIRS and OTES spectra; VIR spectra                                  | 0.4 to 4.3 and 5.5 to 50 micrometres; 0.25 to 5 micrometres |
| What it holds (resources)       | GRaND elemental makeup; SHARAD subsurface water ice                  | down to 1 m; up to about 1 km                               |

Note that imaging alone gives a direction (a point of light); distance of a body in practice comes from tracking its motion and from spacecraft position, which none of the pages above state. UNVERIFIED as a primary-source statement.

## 3. Communication

### What the DSN is

- "The largest and most sensitive scientific telecommunications system in the world." It is NASA's international network of large radio antennas that communicates with interplanetary spacecraft and some Earth-orbiting missions, and also supports radar and radio astronomy. JPL operates it. Source: https://www.nasa.gov/directorates/heo/scan/services/networks/deep_space_network/about
- Three complexes, "approximately 120 degrees apart in longitude": Goldstone near Barstow, California; near Madrid, Spain; near Canberra, Australia. Each has at least four antenna stations. Same source.
- Antennas: the largest at each site is 70 meters (230 feet) in diameter. A 34-meter (111-foot) antenna (DSS-35, Canberra) appears in the page's photo caption. The 70-meter antennas can track a spacecraft "traveling tens of billions of miles from Earth". Same source; also https://spaceplace.nasa.gov/dsn-antennas/en/
- The page does not give a total antenna count or a data rate table. Count of 34-meter antennas: UNVERIFIED.
- Because the sites are spaced about 120 degrees apart, a spacecraft is always in view of at least one (inference from the stated spacing; the page does not state it). UNVERIFIED.

### How signal and data rate fall with distance

- Voyager 1 transmits "at about 23 watts", described as a "household appliance lamp"; by the time it reaches Earth the signal is "a fraction of a billion-billionth of a watt". Instrument data is "transmitted to Earth typically at 160 bits per second" and captured by 34- and 70-meter DSN stations. Source: https://www.jpl.nasa.gov/news/nasa-spacecraft-embarks-on-historic-journey-into-interstellar-space/ (2013 release; it gives 12 billion miles / 19 billion km from the sun at that date).
- The power the DSN receives from the Voyagers is "20 billion times weaker than what a digital watch needs to run". Source: https://spaceplace.nasa.gov/dsn-antennas/en/ . The same page says farther spacecraft need larger antennas.
- Voyager 1's spacecraft page: 3.7 m high-gain antenna; X-band downlink 160 bits/sec normally, 1.4 kbps for playback of high-rate plasma wave data; S-band uplink 16 bits/sec. The page itself lists conflicting figures (it also says science data rates reach 7.2 kbps) without reconciling them. Source: https://science.nasa.gov/mission/voyager/spacecraft/
- Voyager 1 was 164.7 AU from Earth on 21 August 2024. The one light-day milestone is shown as 18 November 2026, "more than 16 billion miles". Source: https://science.nasa.gov/mission/voyager/voyager-1/
- At Jupiter in 1979 the maximum downlink rate was 115,200 bits per second (44,800 bits per second at Saturn in 1981), using DSN 64-m stations. Source: a NASA Voyager telecommunications chapter, https://voyager.gsfc.nasa.gov/Library/DeepCommo_Chapter3--141029.pdf , and a NASA mission summary at https://ntrs.nasa.gov/api/citations/19810001583/downloads/19810001583.pdf . I got these numbers from a search summary and did not read them in the PDFs; UNVERIFIED against the documents. Jupiter's distance at encounter is not in the sources; UNVERIFIED.
- **Comparison.** 115,200 bits per second (Jupiter, 1979) against 160 bits per second (164.7 AU, 2024) is a factor of 720 lower. This is not a pure distance effect: the antennas, coding and spacecraft state changed between the two, and the cruise rate is chosen for the available ground antenna. No source states the data rate as a function of distance.
- **New Horizons.** NASA: at about 3 billion miles from Earth, "radio signals take more than 4 1/2 hours" to arrive; data rates are "typically about 1-4 kilobits per second" depending on method and DSN antenna; the full downlink was expected to take about one year. Source: https://www.nasa.gov/general/nasas-new-horizons-spacecraft-begins-intensive-data-downlink-phase/ . A search summary reports a later NASA page giving 1 to 2 kbps and over 15 months for about 6.25 GB; UNVERIFIED.
- General physics (not stated on a NASA page I fetched): received signal power falls with the square of distance, so each doubling of distance cuts it to a quarter. UNVERIFIED as a primary-source quote.

### Is "signal too weak far from home" fair?

Mostly yes as a gameplay simplification. NASA's own pages say the signal is faint, farther spacecraft need larger antennas, and the achievable rate drops (115,200 down to 160 bits per second). What it hides: the rate is engineering-dependent (antenna size, transmitter power, coding, how many antennas are arrayed), the link is limited by light-time delay (4.5 hours one way at New Horizons, about a day at the Voyager 1 milestone), and the signal does not cut off, it just carries less data and takes longer.

## 4. Candidate in-game explanations (draft copy)

These are drafts for post-v1 and are not sourced facts. They follow the 3-level ladder in section 5.

- **Level 1, Telescope:** "Your telescope picks out faint points of light that move against the stars. You can tell something is out there, and in which direction, but not how far or how big."
- **Level 2, Ranging:** "A laser or radar pulse timed on its return gives distance, and the image gives size. You now know where each Body is and how large it is, but not what it is made of."
- **Level 3, Spectrometer:** "Sunlight reflected from a Body carries its fingerprint. Ice, rock and metal each absorb different colours, so you can tell what the Body is made of and which resources it holds."
- **Communication:** "The farther you are from home, the weaker your signal. Far enough out, only a trickle of data reaches the Deep Space Network antennas."

## 5. Gameplay simplifications (not facts)

Everything in this section is a design suggestion, not a sourced claim.

- **Suggested 3-level Sensors Component:**
  1. Detect: reveal that a Body exists and its direction on the Nav Chart (point of light; LORRI example).
  2. Measure: reveal distance and size (lidar and imaging; OLA and MapCam examples).
  3. Analyse: reveal type (icy or rocky) from spectrometers (OVIRS, VIR examples), and resources, which in reality needs gamma-ray, neutron or radar sensing at close range (GRaND, SHARAD examples). The game could fold these into one top level, or hold resources back for a fourth level.
- Real instruments have very different ranges (lidar works at kilometres, a telescope at billions of kilometres). The game could use one "reveal radius" per level instead.
- Real spectrometers and neutron detectors need close approach. A fair simplification is "higher level means larger reveal radius for the same stage".
- Communication: model signal as a quality that falls with distance from home (for example, linearly or by inverse square), limiting how much Nav Chart information updates, not a hard cutoff. Delay can be shown as a number without making it a mechanic.
- Do not name real instruments in the in-game text; keep generic terms such as telescope, ranging and spectrometer.

## Source list

- https://www.nasa.gov/directorates/heo/scan/services/networks/deep_space_network/about
- https://spaceplace.nasa.gov/dsn-antennas/en/
- https://www.jpl.nasa.gov/news/nasa-spacecraft-embarks-on-historic-journey-into-interstellar-space/
- https://science.nasa.gov/mission/voyager/voyager-1/
- https://science.nasa.gov/mission/voyager/spacecraft/
- https://www.nasa.gov/general/nasas-new-horizons-spacecraft-begins-intensive-data-downlink-phase/
- https://science.nasa.gov/photojournal/new-horizons-sees-pluto-sept-21/
- https://science.nasa.gov/mission/osiris-rex
- https://science.gsfc.nasa.gov/sed/content/uploadFiles/publication_files/Lauretta_2017_SSR_OSIRIS-REx-Mission.pdf
- https://science.nasa.gov/mission/dawn/technology/grand-instrument/
- https://science.nasa.gov/mission/dawn/technology/vir-instrument/
- https://science.nasa.gov/mission/mars-reconnaissance-orbiter/science-instruments/
