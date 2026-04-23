/**
 * Curated catalog of famous Near-Earth Objects and small bodies — the
 * ones NASA Eyes labels by default. Used as backdrop context in Sky View:
 * these are "every asteroid you've heard of" plotted at a plausible sky
 * position so the demo feels connected to the real catalog.
 *
 * Coordinates (ra_deg, dec_deg) are representative positions near the
 * ecliptic — not live ephemerides. The point is labelling, not
 * astrometry. For live positions we defer to the NASA Eyes iframe below.
 *
 * Sources: JPL Small-Body Database (sbdb.jpl.nasa.gov), classification
 * reference from the NEO program. H magnitudes and diameters are the
 * published best values.
 */

export interface FamousNEO {
  name: string;
  designation: string;
  /** Rough RA in degrees — representative, not live ephemeris. */
  ra_deg: number;
  /** Rough Dec in degrees. */
  dec_deg: number;
  /** Absolute magnitude H. */
  h: number;
  /** Mean diameter in metres. */
  diameter_m: number;
  /** SMASS spectral class (best available). */
  spectral_class: string;
  /** JPL orbit class. */
  orbit_class: "Aten" | "Apollo" | "Amor" | "MBA" | "Comet" | "TNO";
  /** One-line significance note. */
  note: string;
}

export const FAMOUS_NEOS: FamousNEO[] = [
  {
    name: "Bennu",
    designation: "101955",
    ra_deg: 280.1,
    dec_deg: -17.8,
    h: 20.9,
    diameter_m: 492,
    spectral_class: "B",
    orbit_class: "Apollo",
    note: "OSIRIS-REx target — sample returned 2023-09-24",
  },
  {
    name: "Apophis",
    designation: "99942",
    ra_deg: 149.7,
    dec_deg: 3.2,
    h: 19.7,
    diameter_m: 370,
    spectral_class: "Sq",
    orbit_class: "Aten",
    note: "2029-04-13 close approach — 31 600 km",
  },
  {
    name: "Didymos",
    designation: "65803",
    ra_deg: 312.4,
    dec_deg: -28.7,
    h: 18.0,
    diameter_m: 780,
    spectral_class: "S",
    orbit_class: "Apollo",
    note: "DART target — Dimorphos deflected 2022-09-26",
  },
  {
    name: "Ryugu",
    designation: "162173",
    ra_deg: 58.6,
    dec_deg: 12.4,
    h: 19.3,
    diameter_m: 900,
    spectral_class: "Cg",
    orbit_class: "Apollo",
    note: "Hayabusa2 target — sample returned 2020-12-06",
  },
  {
    name: "Itokawa",
    designation: "25143",
    ra_deg: 203.8,
    dec_deg: -5.1,
    h: 19.2,
    diameter_m: 330,
    spectral_class: "S",
    orbit_class: "Apollo",
    note: "Hayabusa target — first sample return from an asteroid",
  },
  {
    name: "Eros",
    designation: "433",
    ra_deg: 45.1,
    dec_deg: 18.9,
    h: 10.3,
    diameter_m: 16840,
    spectral_class: "S",
    orbit_class: "Amor",
    note: "NEAR-Shoemaker first-ever asteroid landing, 2001",
  },
  {
    name: "Psyche",
    designation: "16",
    ra_deg: 96.2,
    dec_deg: 8.3,
    h: 5.9,
    diameter_m: 226000,
    spectral_class: "M",
    orbit_class: "MBA",
    note: "Metal-rich, NASA Psyche spacecraft in transit",
  },
  {
    name: "Ceres",
    designation: "1",
    ra_deg: 252.7,
    dec_deg: -26.4,
    h: 3.3,
    diameter_m: 939000,
    spectral_class: "C",
    orbit_class: "MBA",
    note: "Dwarf planet — Dawn mission 2015–18",
  },
  {
    name: "Vesta",
    designation: "4",
    ra_deg: 138.4,
    dec_deg: 6.1,
    h: 3.2,
    diameter_m: 525000,
    spectral_class: "V",
    orbit_class: "MBA",
    note: "Second-largest asteroid — Dawn mission 2011–12",
  },
  {
    name: "Bennu",
    designation: "1620 Geographos",
    ra_deg: 22.9,
    dec_deg: -14.5,
    h: 15.6,
    diameter_m: 2500,
    spectral_class: "S",
    orbit_class: "Apollo",
    note: "Highly elongated — radar-imaged close approach 1994",
  },
  {
    name: "Toutatis",
    designation: "4179",
    ra_deg: 352.1,
    dec_deg: -9.8,
    h: 15.3,
    diameter_m: 4500,
    spectral_class: "S",
    orbit_class: "Apollo",
    note: "Chaotic tumbler — Chang'e 2 flyby 2012",
  },
  {
    name: "Dinkinesh",
    designation: "152830",
    ra_deg: 186.3,
    dec_deg: 1.7,
    h: 17.5,
    diameter_m: 790,
    spectral_class: "S",
    orbit_class: "MBA",
    note: "Lucy mission flyby 2023 — first binary MBA observed",
  },
  {
    name: "Annefrank",
    designation: "5535",
    ra_deg: 79.4,
    dec_deg: -2.8,
    h: 13.6,
    diameter_m: 4800,
    spectral_class: "S",
    orbit_class: "MBA",
    note: "Stardust flyby 2002 — Dutch girl's 75th birthday",
  },
  {
    name: "Braille",
    designation: "9969",
    ra_deg: 108.6,
    dec_deg: 22.1,
    h: 15.8,
    diameter_m: 2200,
    spectral_class: "Q",
    orbit_class: "Apollo",
    note: "Deep Space 1 flyby 1999",
  },
  {
    name: "Gaspra",
    designation: "951",
    ra_deg: 261.3,
    dec_deg: 15.9,
    h: 11.5,
    diameter_m: 12200,
    spectral_class: "S",
    orbit_class: "MBA",
    note: "Galileo flyby 1991 — first close-up of an asteroid",
  },
  {
    name: "Ida",
    designation: "243",
    ra_deg: 164.8,
    dec_deg: 3.3,
    h: 9.9,
    diameter_m: 31400,
    spectral_class: "S",
    orbit_class: "MBA",
    note: "Galileo flyby 1993 — first asteroid moon (Dactyl)",
  },
  {
    name: "Tempel 1",
    designation: "9P",
    ra_deg: 128.8,
    dec_deg: 14.6,
    h: 14.4,
    diameter_m: 7600,
    spectral_class: "-",
    orbit_class: "Comet",
    note: "Deep Impact probe 2005 — hypervelocity impactor test",
  },
  {
    name: "67P/Churyumov–Gerasimenko",
    designation: "67P",
    ra_deg: 68.3,
    dec_deg: 22.8,
    h: 15.2,
    diameter_m: 4100,
    spectral_class: "-",
    orbit_class: "Comet",
    note: "Rosetta orbiter + Philae lander 2014",
  },
];
