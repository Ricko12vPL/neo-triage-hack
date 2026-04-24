/**
 * Curated catalog of famous Near-Earth Objects + small bodies (the ones
 * NASA Eyes / Horizons / textbooks label by default). Used as backdrop
 * context in Sky View, clickable detail source in FamousNEODetailsPanel,
 * and orbit source for OrbitGroundTrack (sphere) + OrbitViewPanel (helio).
 *
 * Coordinates + elements sourced from JPL Horizons (ssd.jpl.nasa.gov).
 * Orbital elements are osculating heliocentric ecliptic (equinox J2000);
 * each entry declares its own `orbital_epoch_jd`, so kepler.ts propagates
 * accurately for the current observation time. Refresh via
 * `python scripts/verify_jpl_orbital_elements.py --epoch today` followed
 * by `python scripts/apply_jpl_patches.py`. Current-epoch elements are
 * strongly preferred over J2000 for visualisation — 26 years of Kepler
 * drift from J2000 yields multi-degree sky error for well-studied NEOs.
 * Reports: docs/verification/jpl-orbital-elements-verification.md and
 * docs/verification/current-positions-verification.md.
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
  /**
   * Mean anomaly (degrees) at the reference epoch `orbital_epoch_jd`.
   * Historically this field was named `mean_anomaly_deg_j2000` when all
   * elements were stored at the J2000 epoch; for current-epoch elements
   * the name `_epoch` is literal about the reference time.
   */
  mean_anomaly_deg_epoch: number;
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
  /** Julian Date at which `orbit` elements are instantaneous. J2000 = 2451545.0. */
  orbital_epoch_jd: number;
  /** Provenance string — who/when we fetched the elements from. */
  data_source: string;
  /** ISO date (YYYY-MM-DD) when elements were last cross-checked against source. */
  last_verified_date: string;

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
      semi_major_axis_au: 1.125985,
      eccentricity: 0.203700,
      inclination_deg: 6.0329,
      longitude_ascending_node_deg: 1.9675,
      argument_periapsis_deg: 66.4157,
      mean_anomaly_deg_epoch: 34.4983,
      orbital_period_years: 1.1948,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
      semi_major_axis_au: 0.922366,
      eccentricity: 0.191142,
      inclination_deg: 3.3409,
      longitude_ascending_node_deg: 203.8974,
      argument_periapsis_deg: 126.6769,
      mean_anomaly_deg_epoch: 124.1482,
      orbital_period_years: 0.8859,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
      semi_major_axis_au: 1.642668,
      eccentricity: 0.383147,
      inclination_deg: 3.4139,
      longitude_ascending_node_deg: 72.9858,
      argument_periapsis_deg: 319.5841,
      mean_anomaly_deg_epoch: 239.3242,
      orbital_period_years: 2.1054,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
      semi_major_axis_au: 1.190952,
      eccentricity: 0.191092,
      inclination_deg: 5.8664,
      longitude_ascending_node_deg: 251.2906,
      argument_periapsis_deg: 211.6129,
      mean_anomaly_deg_epoch: 27.4508,
      orbital_period_years: 1.2997,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
      semi_major_axis_au: 1.324065,
      eccentricity: 0.280170,
      inclination_deg: 1.6209,
      longitude_ascending_node_deg: 69.0744,
      argument_periapsis_deg: 162.8432,
      mean_anomaly_deg_epoch: 140.8928,
      orbital_period_years: 1.5236,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
      semi_major_axis_au: 1.458249,
      eccentricity: 0.222891,
      inclination_deg: 10.8286,
      longitude_ascending_node_deg: 304.2681,
      argument_periapsis_deg: 178.9163,
      mean_anomaly_deg_epoch: 36.7652,
      orbital_period_years: 1.7610,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
      semi_major_axis_au: 2.925238,
      eccentricity: 0.134781,
      inclination_deg: 3.0981,
      longitude_ascending_node_deg: 149.9845,
      argument_periapsis_deg: 229.9704,
      mean_anomaly_deg_epoch: 70.7778,
      orbital_period_years: 5.0032,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
      semi_major_axis_au: 2.765522,
      eccentricity: 0.079669,
      inclination_deg: 10.5880,
      longitude_ascending_node_deg: 80.2486,
      argument_periapsis_deg: 73.3024,
      mean_anomaly_deg_epoch: 264.5502,
      orbital_period_years: 4.5991,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
      semi_major_axis_au: 2.361428,
      eccentricity: 0.090189,
      inclination_deg: 7.1440,
      longitude_ascending_node_deg: 103.7018,
      argument_periapsis_deg: 151.4874,
      mean_anomaly_deg_epoch: 68.6789,
      orbital_period_years: 3.6289,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
      semi_major_axis_au: 1.245755,
      eccentricity: 0.335492,
      inclination_deg: 13.3369,
      longitude_ascending_node_deg: 337.1358,
      argument_periapsis_deg: 277.0295,
      mean_anomaly_deg_epoch: 322.0712,
      orbital_period_years: 1.3905,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
      semi_major_axis_au: 2.543027,
      eccentricity: 0.624663,
      inclination_deg: 0.4481,
      longitude_ascending_node_deg: 125.3701,
      argument_periapsis_deg: 277.8570,
      mean_anomaly_deg_epoch: 114.3322,
      orbital_period_years: 4.0554,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
      semi_major_axis_au: 2.191733,
      eccentricity: 0.112647,
      inclination_deg: 2.0931,
      longitude_ascending_node_deg: 21.3578,
      argument_periapsis_deg: 66.9341,
      mean_anomaly_deg_epoch: 15.6181,
      orbital_period_years: 3.2448,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
      semi_major_axis_au: 2.212444,
      eccentricity: 0.063189,
      inclination_deg: 4.2474,
      longitude_ascending_node_deg: 120.5510,
      argument_periapsis_deg: 9.5222,
      mean_anomaly_deg_epoch: 247.1353,
      orbital_period_years: 3.2909,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
      semi_major_axis_au: 2.339484,
      eccentricity: 0.434075,
      inclination_deg: 29.0210,
      longitude_ascending_node_deg: 241.8991,
      argument_periapsis_deg: 356.1126,
      mean_anomaly_deg_epoch: 165.0150,
      orbital_period_years: 3.5784,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
      semi_major_axis_au: 2.210178,
      eccentricity: 0.173662,
      inclination_deg: 4.1048,
      longitude_ascending_node_deg: 252.9729,
      argument_periapsis_deg: 130.0237,
      mean_anomaly_deg_epoch: 99.1302,
      orbital_period_years: 3.2859,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
      semi_major_axis_au: 2.863545,
      eccentricity: 0.046051,
      inclination_deg: 1.1303,
      longitude_ascending_node_deg: 323.5370,
      argument_periapsis_deg: 113.4470,
      mean_anomaly_deg_epoch: 40.1171,
      orbital_period_years: 4.8458,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
      semi_major_axis_au: 3.302522,
      eccentricity: 0.466408,
      inclination_deg: 10.5053,
      longitude_ascending_node_deg: 66.9569,
      argument_periapsis_deg: 184.5345,
      mean_anomaly_deg_epoch: 251.9386,
      orbital_period_years: 6.0017,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
      semi_major_axis_au: 3.458829,
      eccentricity: 0.649607,
      inclination_deg: 3.8666,
      longitude_ascending_node_deg: 36.2965,
      argument_periapsis_deg: 22.2338,
      mean_anomaly_deg_epoch: 250.2255,
      orbital_period_years: 6.4328,
    },  // JPL Horizons @ JD 2461154.5, fetched 2026-04-24
    orbital_epoch_jd: 2461154.5,
    data_source: "JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api) ELEMENTS @500@10",
    last_verified_date: "2026-04-24",
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
    // Provenance — every entry must declare its epoch + source. Epoch may
    // be any valid Julian Date; kepler.ts propagates from orbital_epoch_jd
    // to the render time, so current-epoch sources give better accuracy.
    if (!Number.isFinite(neo.orbital_epoch_jd) || neo.orbital_epoch_jd < 2400000) {
      throw new Error(
        `famous_neos: "${neo.name}" has implausible orbital_epoch_jd (${neo.orbital_epoch_jd})`,
      );
    }
    if (!neo.data_source || !neo.data_source.trim()) {
      throw new Error(`famous_neos: "${neo.name}" missing data_source`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(neo.last_verified_date)) {
      throw new Error(
        `famous_neos: "${neo.name}" invalid last_verified_date "${neo.last_verified_date}" (expect YYYY-MM-DD)`,
      );
    }
    // Orbit-class plausibility: NEO classes should have a<5 AU.
    if (
      (neo.orbit_class === "Apollo" ||
        neo.orbit_class === "Aten" ||
        neo.orbit_class === "Amor" ||
        neo.orbit_class === "Atira") &&
      neo.orbit.semi_major_axis_au > 5
    ) {
      throw new Error(
        `famous_neos: "${neo.name}" classed as NEO but a=${neo.orbit.semi_major_axis_au} AU (out of range)`,
      );
    }
  }
}

validateFamousNeos();
