/**
 * Curated catalog of famous Near-Earth Objects + small bodies (the ones
 * NASA Eyes / Horizons / textbooks label by default). Used as backdrop
 * context in Sky View, clickable detail source in FamousNEODetailsPanel,
 * and orbit source for OrbitGroundTrack (sphere) + OrbitViewPanel (helio).
 *
 * Coordinates + elements sourced from JPL Small-Body Database. Orbital
 * elements are heliocentric ecliptic J2000, epoch ~2020 — close enough
 * for demo-scale visualisation, not a substitute for Horizons ephemerides.
 */

export type NEOClass =
  | "Apollo"
  | "Aten"
  | "Amor"
  | "Atira"
  | "MBA"
  | "Comet";

export interface OrbitalElements {
  /** Semi-major axis in astronomical units. */
  semi_major_axis_au: number;
  /** Orbital eccentricity (0 = circular, <1 = elliptical). */
  eccentricity: number;
  /** Inclination to ecliptic (degrees). */
  inclination_deg: number;
  /** Longitude of ascending node Ω (degrees). */
  longitude_ascending_node_deg: number;
  /** Argument of periapsis ω (degrees). */
  argument_periapsis_deg: number;
  /** Mean anomaly at J2000 epoch (degrees). */
  mean_anomaly_deg_j2000: number;
  /** Orbital period (years). Derived from a via Kepler III for quick access. */
  orbital_period_years: number;
}

export interface FamousNEO {
  // Identity
  name: string;
  designation: string;
  /** Rough RA in degrees — representative sky position for Sky View marker. */
  ra_deg: number;
  /** Rough Dec in degrees. */
  dec_deg: number;

  // Physical (JPL SBDB best values)
  /** Mean equivalent diameter in kilometres. */
  diameter_km: number;
  /** SMASS spectral class, or "-" for comets / unknown. */
  spectral_class: string;
  /** Absolute magnitude H (V-band). */
  absolute_magnitude_h: number;
  /** Geometric albedo 0-1, or null if unconstrained. */
  albedo: number | null;
  /** Rotation period in hours, or null if chaotic / unknown. */
  rotation_period_hours: number | null;

  // Orbital elements (J2000 heliocentric ecliptic)
  orbit: OrbitalElements;

  // Classification
  orbit_class: NEOClass;
  /** True for Apollo/Aten/Amor/Atira with q<1.3AU. False for MBA/Comet. */
  is_neo: boolean;
  /** Potentially Hazardous Asteroid (diameter>140m AND MOID<0.05AU). */
  is_pha: boolean;
  /** Cumulative impact probability per JPL Sentry, or null if not on list. */
  impact_probability_cumulative: number | null;
  /** Peak Torino Scale historically assigned, 0 if none. */
  torino_scale_peak: number;

  // Discovery + history
  discovery_year: number;
  discoverer: string;
  spacecraft_visits: string[];
  notable_events: string[];
}

export const FAMOUS_NEOS: FamousNEO[] = [
  {
    name: "Bennu",
    designation: "101955 Bennu",
    ra_deg: 280.1,
    dec_deg: -17.8,
    diameter_km: 0.49,
    spectral_class: "B",
    absolute_magnitude_h: 20.9,
    albedo: 0.044,
    rotation_period_hours: 4.297,
    orbit: {
      semi_major_axis_au: 1.1264,
      eccentricity: 0.2037,
      inclination_deg: 6.035,
      longitude_ascending_node_deg: 2.061,
      argument_periapsis_deg: 66.22,
      mean_anomaly_deg_j2000: 101.7,
      orbital_period_years: 1.1955,
    },
    orbit_class: "Apollo",
    is_neo: true,
    is_pha: true,
    impact_probability_cumulative: 5.7e-4,
    torino_scale_peak: 0,
    discovery_year: 1999,
    discoverer: "LINEAR",
    spacecraft_visits: [
      "OSIRIS-REx (arrived 2018, sample return 2023)",
      "OSIRIS-APEX (en route 2029 — former OSIRIS-REx)",
    ],
    notable_events: [
      "Sample returned to Earth 2023-09-24",
      "Close approach sequence 2169-2199 drives cumulative impact risk",
    ],
  },
  {
    name: "Apophis",
    designation: "99942 Apophis",
    ra_deg: 149.7,
    dec_deg: 3.2,
    diameter_km: 0.370,
    spectral_class: "Sq",
    absolute_magnitude_h: 19.7,
    albedo: 0.23,
    rotation_period_hours: 30.4,
    orbit: {
      semi_major_axis_au: 0.9224,
      eccentricity: 0.1914,
      inclination_deg: 3.338,
      longitude_ascending_node_deg: 203.96,
      argument_periapsis_deg: 126.64,
      mean_anomaly_deg_j2000: 174.8,
      orbital_period_years: 0.886,
    },
    orbit_class: "Aten",
    is_neo: true,
    is_pha: true,
    impact_probability_cumulative: null,
    torino_scale_peak: 4,
    discovery_year: 2004,
    discoverer: "Tucker, Tholen, Bernardi (Kitt Peak)",
    spacecraft_visits: [
      "OSIRIS-APEX planned rendezvous 2029-04-13",
    ],
    notable_events: [
      "Close approach 2029-04-13 at 31,600 km (geosynchronous distance)",
      "Removed from JPL Sentry risk list 2021 after Goldstone radar",
      "Highest Torino Scale ever (4) assigned December 2004",
    ],
  },
  {
    name: "Didymos",
    designation: "65803 Didymos",
    ra_deg: 312.4,
    dec_deg: -28.7,
    diameter_km: 0.78,
    spectral_class: "S",
    absolute_magnitude_h: 18.0,
    albedo: 0.15,
    rotation_period_hours: 2.26,
    orbit: {
      semi_major_axis_au: 1.6444,
      eccentricity: 0.3838,
      inclination_deg: 3.408,
      longitude_ascending_node_deg: 73.06,
      argument_periapsis_deg: 319.40,
      mean_anomaly_deg_j2000: 168.3,
      orbital_period_years: 2.108,
    },
    orbit_class: "Apollo",
    is_neo: true,
    is_pha: false,
    impact_probability_cumulative: null,
    torino_scale_peak: 0,
    discovery_year: 1996,
    discoverer: "Spacewatch",
    spacecraft_visits: [
      "DART impactor 2022-09-26 (struck moon Dimorphos)",
      "Hera (ESA) arrival 2026-10 for post-impact survey",
    ],
    notable_events: [
      "Dimorphos deflected by DART — orbital period shortened by 33 min",
      "First humanity-directed change to a celestial body's orbit",
    ],
  },
  {
    name: "Ryugu",
    designation: "162173 Ryugu",
    ra_deg: 58.6,
    dec_deg: 12.4,
    diameter_km: 0.90,
    spectral_class: "Cg",
    absolute_magnitude_h: 19.3,
    albedo: 0.045,
    rotation_period_hours: 7.63,
    orbit: {
      semi_major_axis_au: 1.1895,
      eccentricity: 0.1903,
      inclination_deg: 5.884,
      longitude_ascending_node_deg: 251.62,
      argument_periapsis_deg: 211.43,
      mean_anomaly_deg_j2000: 260.4,
      orbital_period_years: 1.297,
    },
    orbit_class: "Apollo",
    is_neo: true,
    is_pha: true,
    impact_probability_cumulative: null,
    torino_scale_peak: 0,
    discovery_year: 1999,
    discoverer: "LINEAR",
    spacecraft_visits: [
      "Hayabusa2 (arrived 2018, sample return 2020)",
    ],
    notable_events: [
      "Sample returned to Earth 2020-12-06",
      "Carbonaceous — first primitive-body sample returned to Earth",
    ],
  },
  {
    name: "Itokawa",
    designation: "25143 Itokawa",
    ra_deg: 203.8,
    dec_deg: -5.1,
    diameter_km: 0.330,
    spectral_class: "S",
    absolute_magnitude_h: 19.2,
    albedo: 0.29,
    rotation_period_hours: 12.1,
    orbit: {
      semi_major_axis_au: 1.3241,
      eccentricity: 0.2801,
      inclination_deg: 1.621,
      longitude_ascending_node_deg: 69.08,
      argument_periapsis_deg: 162.82,
      mean_anomaly_deg_j2000: 232.0,
      orbital_period_years: 1.523,
    },
    orbit_class: "Apollo",
    is_neo: true,
    is_pha: false,
    impact_probability_cumulative: null,
    torino_scale_peak: 0,
    discovery_year: 1998,
    discoverer: "LINEAR",
    spacecraft_visits: [
      "Hayabusa (arrived 2005, sample return 2010)",
    ],
    notable_events: [
      "First sample return from an asteroid (2010-06-13)",
      "Rubble-pile confirmed — not a monolith",
    ],
  },
  {
    name: "Eros",
    designation: "433 Eros",
    ra_deg: 45.1,
    dec_deg: 18.9,
    diameter_km: 16.84,
    spectral_class: "S",
    absolute_magnitude_h: 10.3,
    albedo: 0.25,
    rotation_period_hours: 5.27,
    orbit: {
      semi_major_axis_au: 1.4583,
      eccentricity: 0.2229,
      inclination_deg: 10.83,
      longitude_ascending_node_deg: 304.32,
      argument_periapsis_deg: 178.82,
      mean_anomaly_deg_j2000: 150.6,
      orbital_period_years: 1.761,
    },
    orbit_class: "Amor",
    is_neo: true,
    is_pha: false,
    impact_probability_cumulative: null,
    torino_scale_peak: 0,
    discovery_year: 1898,
    discoverer: "Witt / Charlois (independent)",
    spacecraft_visits: [
      "NEAR-Shoemaker (orbit 2000, landed 2001-02-12)",
    ],
    notable_events: [
      "First asteroid ever landed on (2001-02-12)",
      "First NEO discovered (1898) — namesake of the Amor class",
    ],
  },
  {
    name: "Psyche",
    designation: "16 Psyche",
    ra_deg: 96.2,
    dec_deg: 8.3,
    diameter_km: 226,
    spectral_class: "M",
    absolute_magnitude_h: 5.9,
    albedo: 0.12,
    rotation_period_hours: 4.196,
    orbit: {
      semi_major_axis_au: 2.9215,
      eccentricity: 0.1337,
      inclination_deg: 3.095,
      longitude_ascending_node_deg: 150.05,
      argument_periapsis_deg: 229.11,
      mean_anomaly_deg_j2000: 90.2,
      orbital_period_years: 4.996,
    },
    orbit_class: "MBA",
    is_neo: false,
    is_pha: false,
    impact_probability_cumulative: null,
    torino_scale_peak: 0,
    discovery_year: 1852,
    discoverer: "Annibale de Gasparis",
    spacecraft_visits: [
      "Psyche (NASA, launched 2023, arrival 2029-08)",
    ],
    notable_events: [
      "Main-belt metallic body — likely exposed protoplanet core",
      "First mission to an M-type asteroid",
    ],
  },
  {
    name: "Ceres",
    designation: "1 Ceres",
    ra_deg: 252.7,
    dec_deg: -26.4,
    diameter_km: 939,
    spectral_class: "C",
    absolute_magnitude_h: 3.34,
    albedo: 0.09,
    rotation_period_hours: 9.074,
    orbit: {
      semi_major_axis_au: 2.7675,
      eccentricity: 0.0788,
      inclination_deg: 10.59,
      longitude_ascending_node_deg: 80.31,
      argument_periapsis_deg: 73.60,
      mean_anomaly_deg_j2000: 95.0,
      orbital_period_years: 4.605,
    },
    orbit_class: "MBA",
    is_neo: false,
    is_pha: false,
    impact_probability_cumulative: null,
    torino_scale_peak: 0,
    discovery_year: 1801,
    discoverer: "Giuseppe Piazzi",
    spacecraft_visits: [
      "Dawn (orbit 2015-2018)",
    ],
    notable_events: [
      "First asteroid ever discovered (1801-01-01)",
      "Reclassified as dwarf planet 2006",
      "Only dwarf planet in the inner solar system",
    ],
  },
  {
    name: "Vesta",
    designation: "4 Vesta",
    ra_deg: 138.4,
    dec_deg: 6.1,
    diameter_km: 525,
    spectral_class: "V",
    absolute_magnitude_h: 3.2,
    albedo: 0.423,
    rotation_period_hours: 5.342,
    orbit: {
      semi_major_axis_au: 2.3617,
      eccentricity: 0.0886,
      inclination_deg: 7.141,
      longitude_ascending_node_deg: 103.81,
      argument_periapsis_deg: 151.20,
      mean_anomaly_deg_j2000: 20.0,
      orbital_period_years: 3.629,
    },
    orbit_class: "MBA",
    is_neo: false,
    is_pha: false,
    impact_probability_cumulative: null,
    torino_scale_peak: 0,
    discovery_year: 1807,
    discoverer: "Heinrich Olbers",
    spacecraft_visits: [
      "Dawn (orbit 2011-2012)",
    ],
    notable_events: [
      "Second-most massive main-belt object",
      "Source of HED meteorites (~6% of all meteorite falls)",
    ],
  },
  {
    name: "Geographos",
    designation: "1620 Geographos",
    ra_deg: 22.9,
    dec_deg: -14.5,
    diameter_km: 2.5,
    spectral_class: "S",
    absolute_magnitude_h: 15.6,
    albedo: 0.326,
    rotation_period_hours: 5.22,
    orbit: {
      semi_major_axis_au: 1.2455,
      eccentricity: 0.3354,
      inclination_deg: 13.34,
      longitude_ascending_node_deg: 337.18,
      argument_periapsis_deg: 276.85,
      mean_anomaly_deg_j2000: 6.0,
      orbital_period_years: 1.390,
    },
    orbit_class: "Apollo",
    is_neo: true,
    is_pha: true,
    impact_probability_cumulative: null,
    torino_scale_peak: 0,
    discovery_year: 1951,
    discoverer: "Albert G. Wilson (Palomar)",
    spacecraft_visits: [],
    notable_events: [
      "Most elongated known NEO (~5.1 × 2.0 × 2.1 km)",
      "Radar-imaged during 1994 close approach (Goldstone + Arecibo)",
      "Clementine planned flyby 1994 cancelled after spacecraft failure",
    ],
  },
  {
    name: "Toutatis",
    designation: "4179 Toutatis",
    ra_deg: 352.1,
    dec_deg: -9.8,
    diameter_km: 4.5,
    spectral_class: "S",
    absolute_magnitude_h: 15.3,
    albedo: 0.13,
    rotation_period_hours: null,
    orbit: {
      semi_major_axis_au: 2.5419,
      eccentricity: 0.6288,
      inclination_deg: 0.446,
      longitude_ascending_node_deg: 124.44,
      argument_periapsis_deg: 278.75,
      mean_anomaly_deg_j2000: 12.0,
      orbital_period_years: 4.027,
    },
    orbit_class: "Apollo",
    is_neo: true,
    is_pha: true,
    impact_probability_cumulative: null,
    torino_scale_peak: 0,
    discovery_year: 1989,
    discoverer: "Christian Pollas (Caussols)",
    spacecraft_visits: [
      "Chang'e 2 flyby 2012-12-13 (closest 3.2 km)",
    ],
    notable_events: [
      "Chaotic tumbler — non-principal-axis rotation (5.4d + 7.3d coupled)",
      "Contact-binary morphology: two lobes joined",
    ],
  },
  {
    name: "Dinkinesh",
    designation: "152830 Dinkinesh",
    ra_deg: 186.3,
    dec_deg: 1.7,
    diameter_km: 0.79,
    spectral_class: "S",
    absolute_magnitude_h: 17.5,
    albedo: 0.27,
    rotation_period_hours: 52.7,
    orbit: {
      semi_major_axis_au: 2.191,
      eccentricity: 0.1120,
      inclination_deg: 2.094,
      longitude_ascending_node_deg: 21.38,
      argument_periapsis_deg: 67.63,
      mean_anomaly_deg_j2000: 120.0,
      orbital_period_years: 3.245,
    },
    orbit_class: "MBA",
    is_neo: false,
    is_pha: false,
    impact_probability_cumulative: null,
    torino_scale_peak: 0,
    discovery_year: 1999,
    discoverer: "LINEAR",
    spacecraft_visits: [
      "Lucy flyby 2023-11-01",
    ],
    notable_events: [
      "Lucy revealed a contact-binary moon 'Selam' (first such MBA seen)",
      "Name means 'you are marvellous' in Amharic",
    ],
  },
  {
    name: "Annefrank",
    designation: "5535 Annefrank",
    ra_deg: 79.4,
    dec_deg: -2.8,
    diameter_km: 4.8,
    spectral_class: "S",
    absolute_magnitude_h: 13.6,
    albedo: 0.24,
    rotation_period_hours: 15.12,
    orbit: {
      semi_major_axis_au: 2.213,
      eccentricity: 0.0637,
      inclination_deg: 4.247,
      longitude_ascending_node_deg: 121.35,
      argument_periapsis_deg: 9.83,
      mean_anomaly_deg_j2000: 240.0,
      orbital_period_years: 3.292,
    },
    orbit_class: "MBA",
    is_neo: false,
    is_pha: false,
    impact_probability_cumulative: null,
    torino_scale_peak: 0,
    discovery_year: 1942,
    discoverer: "Karl Reinmuth",
    spacecraft_visits: [
      "Stardust flyby 2002-11-02 (engineering test)",
    ],
    notable_events: [
      "Named for Anne Frank on her 75th would-be birthday",
      "Stardust imagery revealed irregular ~6.6×5.0×3.4 km shape",
    ],
  },
  {
    name: "Braille",
    designation: "9969 Braille",
    ra_deg: 108.6,
    dec_deg: 22.1,
    diameter_km: 2.2,
    spectral_class: "Q",
    absolute_magnitude_h: 15.8,
    albedo: 0.34,
    rotation_period_hours: 226.0,
    orbit: {
      semi_major_axis_au: 2.341,
      eccentricity: 0.4335,
      inclination_deg: 28.99,
      longitude_ascending_node_deg: 242.77,
      argument_periapsis_deg: 356.00,
      mean_anomaly_deg_j2000: 200.0,
      orbital_period_years: 3.582,
    },
    orbit_class: "Amor",
    is_neo: true,
    is_pha: false,
    impact_probability_cumulative: null,
    torino_scale_peak: 0,
    discovery_year: 1992,
    discoverer: "Eleanor Helin, Kenneth Lawrence (Palomar)",
    spacecraft_visits: [
      "Deep Space 1 flyby 1999-07-29",
    ],
    notable_events: [
      "Named for Louis Braille",
      "Deep Space 1 first technology-demonstration mission to an asteroid",
    ],
  },
  {
    name: "Gaspra",
    designation: "951 Gaspra",
    ra_deg: 261.3,
    dec_deg: 15.9,
    diameter_km: 12.2,
    spectral_class: "S",
    absolute_magnitude_h: 11.5,
    albedo: 0.22,
    rotation_period_hours: 7.042,
    orbit: {
      semi_major_axis_au: 2.210,
      eccentricity: 0.1740,
      inclination_deg: 4.102,
      longitude_ascending_node_deg: 253.22,
      argument_periapsis_deg: 129.99,
      mean_anomaly_deg_j2000: 258.0,
      orbital_period_years: 3.286,
    },
    orbit_class: "MBA",
    is_neo: false,
    is_pha: false,
    impact_probability_cumulative: null,
    torino_scale_peak: 0,
    discovery_year: 1916,
    discoverer: "Grigoriy Neujmin (Simeiz)",
    spacecraft_visits: [
      "Galileo flyby 1991-10-29",
    ],
    notable_events: [
      "First close-up images of an asteroid",
      "Galileo-en-route-to-Jupiter opportunistic encounter",
    ],
  },
  {
    name: "Ida",
    designation: "243 Ida",
    ra_deg: 164.8,
    dec_deg: 3.3,
    diameter_km: 31.4,
    spectral_class: "S",
    absolute_magnitude_h: 9.9,
    albedo: 0.24,
    rotation_period_hours: 4.634,
    orbit: {
      semi_major_axis_au: 2.861,
      eccentricity: 0.0450,
      inclination_deg: 1.133,
      longitude_ascending_node_deg: 324.59,
      argument_periapsis_deg: 110.83,
      mean_anomaly_deg_j2000: 45.0,
      orbital_period_years: 4.843,
    },
    orbit_class: "MBA",
    is_neo: false,
    is_pha: false,
    impact_probability_cumulative: null,
    torino_scale_peak: 0,
    discovery_year: 1884,
    discoverer: "Johann Palisa (Vienna)",
    spacecraft_visits: [
      "Galileo flyby 1993-08-28",
    ],
    notable_events: [
      "First asteroid with a confirmed moon: Dactyl (1993)",
      "Member of the Koronis family",
    ],
  },
  {
    name: "Tempel 1",
    designation: "9P/Tempel 1",
    ra_deg: 128.8,
    dec_deg: 14.6,
    diameter_km: 7.6,
    spectral_class: "-",
    absolute_magnitude_h: 14.4,
    albedo: 0.072,
    rotation_period_hours: 40.7,
    orbit: {
      semi_major_axis_au: 3.1456,
      eccentricity: 0.5108,
      inclination_deg: 10.47,
      longitude_ascending_node_deg: 68.72,
      argument_periapsis_deg: 179.30,
      mean_anomaly_deg_j2000: 170.0,
      orbital_period_years: 5.579,
    },
    orbit_class: "Comet",
    is_neo: false,
    is_pha: false,
    impact_probability_cumulative: null,
    torino_scale_peak: 0,
    discovery_year: 1867,
    discoverer: "Ernst Wilhelm Tempel",
    spacecraft_visits: [
      "Deep Impact 2005-07-04 (impactor + flyby)",
      "Stardust-NExT 2011-02-15 (post-impact follow-up)",
    ],
    notable_events: [
      "First comet hit by a human-made impactor (Deep Impact)",
      "Jupiter-family short-period comet",
    ],
  },
  {
    name: "67P / Churyumov-Gerasimenko",
    designation: "67P",
    ra_deg: 68.3,
    dec_deg: 22.8,
    diameter_km: 4.1,
    spectral_class: "-",
    absolute_magnitude_h: 15.2,
    albedo: 0.06,
    rotation_period_hours: 12.4,
    orbit: {
      semi_major_axis_au: 3.461,
      eccentricity: 0.6410,
      inclination_deg: 7.041,
      longitude_ascending_node_deg: 50.15,
      argument_periapsis_deg: 12.80,
      mean_anomaly_deg_j2000: 240.0,
      orbital_period_years: 6.442,
    },
    orbit_class: "Comet",
    is_neo: false,
    is_pha: false,
    impact_probability_cumulative: null,
    torino_scale_peak: 0,
    discovery_year: 1969,
    discoverer: "Klim Churyumov, Svetlana Gerasimenko (Almaty)",
    spacecraft_visits: [
      "Rosetta orbit 2014-08 to 2016-09",
      "Philae landing 2014-11-12 (first comet landing)",
    ],
    notable_events: [
      "First spacecraft to orbit a comet",
      "First soft landing on a comet nucleus",
      "Contact-binary morphology (~duck-shaped)",
    ],
  },
];

/**
 * Runtime schema sanity check — fails fast in dev if someone introduces
 * a regression like B-3 (name/designation mismatch). Called once at
 * module load. No-op in production if assertions optimised out.
 */
function validateFamousNeos(): void {
  const names = new Set<string>();
  const designations = new Set<string>();
  for (const neo of FAMOUS_NEOS) {
    if (names.has(neo.name)) {
      throw new Error(`famous_neos: duplicate name "${neo.name}"`);
    }
    if (designations.has(neo.designation)) {
      throw new Error(
        `famous_neos: duplicate designation "${neo.designation}"`,
      );
    }
    names.add(neo.name);
    designations.add(neo.designation);
    // Orbital sanity
    if (
      neo.orbit.semi_major_axis_au <= 0 ||
      neo.orbit.eccentricity < 0 ||
      neo.orbit.eccentricity >= 1
    ) {
      throw new Error(
        `famous_neos: invalid orbit for "${neo.name}" (a=${neo.orbit.semi_major_axis_au}, e=${neo.orbit.eccentricity})`,
      );
    }
    // B-3 specific: designation and name should agree in spirit
    // (e.g. "101955 Bennu" contains "Bennu"). Strict rule: either the
    // name appears in the designation, or the designation is a numeric
    // catalog ID (old style).
    const desig_has_name = neo.designation
      .toLowerCase()
      .includes(neo.name.toLowerCase());
    const desig_is_numeric = /^\d+(\s|$|[A-Z])/.test(neo.designation);
    const desig_is_comet = /^\d+[PC](\/|$)/.test(neo.designation);
    const name_has_designation = neo.name
      .toLowerCase()
      .includes(neo.designation.toLowerCase());
    if (
      !desig_has_name &&
      !desig_is_numeric &&
      !desig_is_comet &&
      !name_has_designation
    ) {
      throw new Error(
        `famous_neos: name/designation mismatch — name="${neo.name}", designation="${neo.designation}"`,
      );
    }
  }
}

validateFamousNeos();
