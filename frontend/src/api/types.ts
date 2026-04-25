/**
 * TypeScript mirror of backend Pydantic schemas.
 *
 * Source of truth: docs/api-contract.md and backend/models/schemas.py.
 * Keep in sync when the wire contract changes — the field names here
 * land directly in fetch payloads.
 */

export type ClassLabel =
  | "NEO"
  | "MBA"
  | "COMET"
  | "ARTIFACT"
  | "UNCONFIRMED";

export type ChunkType =
  | "reasoning"
  | "text"
  | "thinking"
  | "meta"
  | "done"
  | "error";

export type DataSource = "LIVE_MPC_NEOCP" | "DEMO_FIXTURE";

export interface Candidate {
  trksub: string;
  ra_deg: number;
  dec_deg: number;
  mean_magnitude_v: number;
  rate_arcsec_min: number;
  observatory_code: string;
  first_obs_datetime: string;
  n_observations: number;
  arc_length_minutes: number;
  digest2_neo_noid: number;
  ecliptic_latitude_deg: number;
  impact_probability?: number | null;
  absolute_magnitude_h?: number | null;
  data_source?: DataSource;
  data_source_url?: string | null;
  data_source_fetched_at_utc?: string | null;
}

export interface Prediction {
  trksub: string;
  prob_neo: number;
  prob_pha: number;
  prob_neo_ci_90: [number, number];
  map_class: ClassLabel;
  uncertainty_entropy_bits: number;
  model_version: string;
}

export type ClassEndorsement = "CONCUR" | "DISSENT" | "PARTIAL_CONCUR";
export type EndorsedClass =
  | "NEO"
  | "MBA"
  | "COMET"
  | "ARTIFACT"
  | "UNCONFIRMED";
export type ConfidenceMatch = "HIGH" | "MEDIUM" | "LOW";
export type SuggestedAction =
  | "follow_up_immediately"
  | "queue_normal"
  | "request_second_epoch"
  | "deprioritize"
  | "monitor";
export type CaveatSeverity = "INFO" | "WARN" | "CRITICAL";

export interface ExpertCaveat {
  severity: CaveatSeverity;
  code: string;
  explanation: string;
}

export interface ExpertReview {
  trksub: string;
  reviewed_at_utc: string;
  model: string;
  class_endorsement: ClassEndorsement;
  endorsed_class: EndorsedClass;
  confidence_match: ConfidenceMatch;
  reasoning_trace: string;
  caveats: ExpertCaveat[];
  suggested_action: SuggestedAction;
  /**
   * One or two sentences from Opus naming the Find_Orb-style astrometric
   * quality grade and how it shaped its endorsement. Optional — present
   * for reviews where the prompt carried a quality breakdown.
   */
  quality_acknowledgment?: string | null;
  thinking_tokens_used: number;
  output_tokens_used: number;
  cost_usd: number;
  cache_hit: boolean;
}

export type AstrometricGrade = "A" | "B" | "C" | "F";
export type GradeColor = "emerald" | "amber" | "orange" | "rose";
export type OperatorActionVerb = "COMMIT" | "OBSERVE" | "URGENT" | "TRIAGE";

export type AstrometricCheckName =
  | "observations"
  | "arc_length"
  | "magnitude"
  | "digest2";

export interface AstrometricQualityCheck {
  name: AstrometricCheckName;
  label: string;
  value: number | null;
  unit: string;
  threshold_a: number | null;
  threshold_b: number | null;
  threshold_c: number | null;
  passes_a: boolean;
  passes_b: boolean;
  passes_c: boolean;
  interpretation: string;
}

export interface AstrometricQualityBreakdown {
  grade: AstrometricGrade;
  grade_color: GradeColor;
  grade_summary: string;
  operator_implication: string;
  operator_action_verb: OperatorActionVerb;
  checks: AstrometricQualityCheck[];
  why_this_grade: string;
  what_would_upgrade: string | null;
  methodology_reference: string;
  methodology_caveat: string;
}

export interface RankedCandidate extends Candidate {
  prediction: Prediction;
  /**
   * True when the row is a curated demo fixture (`MOCK_CANDIDATES`
   * server-side) rather than a live NEOCP tracklet. Surfaced in the
   * Live Feed as a "DEMO" badge so the user can tell narrative anchors
   * apart from real submissions at a glance.
   */
  is_demo?: boolean;
  /**
   * Opus 4.7 hybrid-classifier second opinion. Populated only on the
   * top-K rows when the caller requests `?expert=true`, and on rows
   * pushed by the agent loop's expert-review pass.
   */
  expert_review?: ExpertReview | null;
  /**
   * Find_Orb-style A/B/C/F grade indicating astrometric quality.
   * 'A' is strong arc + many obs; 'F' is too thin to support OD.
   * Backward-compat letter accessor — `astrometric_quality.grade`
   * carries the same value plus full reasoning when available.
   */
  astrometric_quality_grade?: AstrometricGrade;
  astrometric_quality?: AstrometricQualityBreakdown | null;
}

export interface BriefingChunk {
  type: ChunkType;
  content: string;
  cumulative_cost_usd: number | null;
}

export interface BriefingRequest {
  candidate: Candidate;
  prediction?: Prediction | null;
  cross_survey_context?: string | null;
  include_reasoning?: boolean;
  observer_location?: string | null;
}

export interface StreamReport {
  source: DataSource;
  label: string;
  description: string;
  url: string | null;
  candidate_count: number;
  last_fetched_at_utc: string | null;
  next_scheduled_fetch_at_utc: string | null;
  ttl_seconds: number | null;
  fetch_status: "OK" | "ERROR" | "EMPTY" | "STATIC";
  error_message: string | null;
}

export interface DataSourceReport {
  streams: StreamReport[];
  retrieved_at_utc: string;
  famous_neos_count: number;
  famous_neos_epoch_jd: number;
  famous_neos_last_verified: string;
  notes: string;
  // Backwards-compat fields, still emitted by /api/meta/data-source
  primary_source?: "mock" | "live_neocp" | "hybrid";
  primary_description?: string;
  primary_count?: number;
  live_feed_available?: boolean;
  live_feed_candidate_count?: number | null;
  live_feed_sample_trksubs?: string[];
}

export interface CostSummary {
  total_spent_usd: number;
  n_calls: number;
  budget_remaining_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_thinking_tokens: number;
  last_call_at: string | null;
}

// ---- Agent / WebSocket feed types ----------------------------------------

export interface AgentStatus {
  cycle_count: number;
  last_cycle_at: string | null;
  session_cost_usd: number;
  prev_trksubs_count: number;
  connection_count: number;
  status: "running" | "stopped" | "error";
}

export type AgentEventType = "new_candidate" | "cycle_complete" | "error";

export interface AgentEventNewCandidate {
  type: "new_candidate";
  candidate: Candidate;
  prediction: Prediction;
  briefing_preview: string;
  timestamp: string;
  expert_review?: ExpertReview | null;
}

export interface AgentEventCycleComplete {
  type: "cycle_complete";
  cycle: number;
  candidates_seen: number;
  new_count: number;
  cost_delta_usd: number;
  session_cost_usd: number;
  timestamp: string;
}

export interface AgentEventError {
  type: "error";
  message: string;
  timestamp: string;
}

export type AgentEvent =
  | AgentEventNewCandidate
  | AgentEventCycleComplete
  | AgentEventError;

// ---- YR4 Replay types ----------------------------------------------------

// ---- External planetary-defense data sources ----------------------------

export type SentryStatus = "IN_RISK_LIST" | "REMOVED" | "NOT_FOUND" | "ERROR";

export interface SentryVI {
  date: string;
  energy_mt_tnt: number;
  impact_probability: number;
  palermo_scale: number;
  torino_scale: number | null;
  sigma: number | null;
}

export interface SentryObjectSummary {
  designation: string;
  fullname: string | null;
  diameter_km: number | null;
  h: number | null;
  impact_probability_cumulative: number;
  palermo_scale_cumulative: number;
  palermo_scale_max: number;
  torino_scale_max: number | null;
  n_impacts: number;
  impact_year_range: string;
  last_observed: string | null;
  velocity_infinity_km_s: number | null;
  velocity_impact_km_s: number | null;
  method: "IOBS" | "LOV" | "MC" | "unknown";
  fetched_at_utc: string;
  source: string;
  source_url: string;
}

export interface UncertaintyBands {
  n_virtual_impactors: number;
  ip_per_vi_min: number | null;
  ip_per_vi_max: number | null;
  ip_per_vi_median: number | null;
  ps_per_vi_min: number | null;
  ps_per_vi_max: number | null;
  sigma_median: number | null;
  method: string;
}

export interface SentryDetailReport {
  designation_query: string;
  status: SentryStatus;
  summary: SentryObjectSummary | null;
  virtual_impactors: SentryVI[];
  uncertainty_bands: UncertaintyBands | null;
  removed_at_utc: string | null;
  error_message: string | null;
  fetched_at_utc: string;
  cache_hit: boolean;
}

export interface AegisRiskEntry {
  designation: string;
  name: string | null;
  diameter_m: number | null;
  star_flag: boolean;
  vi_max_date_utc: string | null;
  impact_probability_max: number;
  palermo_scale_max: number;
  torino_scale: number;
  velocity_km_s: number | null;
  impact_year_range: string;
  impact_probability_cumulative: number;
  palermo_scale_cumulative: number;
  fetched_at_utc: string;
  source: string;
  source_url: string;
}

/**
 * Approximate impact-corridor estimate from JPL Sentry-II top virtual
 * impactor + Earth-rotation uncertainty. Returned by
 * GET /api/risk/corridor/{designation}. Null when the object is not
 * Sentry-tracked or has no positive-IP virtual impactor — caller falls
 * back to the deferred placeholder.
 */
export interface ImpactCorridorEstimate {
  designation: string;
  center_latitude_deg: number;
  center_longitude_deg: number;
  major_axis_km: number;
  minor_axis_km: number;
  orientation_deg: number;
  based_on_vi_date: string;
  based_on_vi_ip: number;
  based_on_vi_sigma: number | null;
  method: "jpl_sentry_approximate_b_plane";
  caveat: string;
  source: string;
  source_url: string;
  fetched_at_utc: string;
}

export interface PopulationRiskRequest {
  designation: string;
  impact_probability: number;
  velocity_km_s: number;
  diameter_m?: number | null;
  absolute_magnitude_h?: number | null;
  albedo?: number;
  density_kg_m3?: number;
  impact_latitude_deg?: number;
  impact_longitude_deg?: number;
}

export interface PopulationRiskResponse {
  designation: string;
  diameter_m: number;
  velocity_km_s: number;
  impact_probability: number;
  energy_megatons_tnt: number;
  severe_damage_radius_km: number;
  thermal_radiation_radius_km: number;
  seismic_radius_km: number;
  population_in_zone: number;
  cities_in_zone: string[];
  metro_population_in_zone: number;
  background_population_in_zone: number;
  expected_casualties_unconditional: number;
  expected_casualties_if_impact: number;
  impact_latitude_deg: number;
  impact_longitude_deg: number;
  local_density_per_km2: number;
  casualty_fraction_assumed: number;
  population_grid_source: string;
  caveat: string;
  methodology: string;
  grade: "demo" | "production";
  computed_at_utc: string;
}

export interface CloseApproach {
  designation: string;
  julian_date: number;
  calendar_date: string;
  miss_distance_au: number;
  miss_distance_min_au: number;
  miss_distance_max_au: number;
  relative_velocity_km_s: number;
  velocity_infinity_km_s: number;
  time_uncertainty_3sigma: string;
  h: number | null;
  body: string;
  fetched_at_utc: string;
  source: string;
  source_url: string;
}

export type ConvergenceVerdict = "concur" | "diverge" | "insufficient_data";

export interface CrossValidationReport {
  designation_query: string;
  sentry: SentryDetailReport | null;
  aegis: AegisRiskEntry | null;
  in_aegis_risk_list: boolean;
  convergence: ConvergenceVerdict;
  convergence_explanation: string;
  retrieved_at_utc: string;
}

export interface YR4Milestone {
  hour: number;
  n_observations: number;
  arc_length_minutes: number;
  mean_magnitude_v: number;
  rate_arcsec_min: number;
  digest2_neo_noid: number;
  prob_neo_estimate: number;
  prob_pha_estimate: number;
  map_class: ClassLabel;
  is_pha: boolean;
  event: string;
  event_description: string;
  narrative_context: string;
  impact_probability: number;
  absolute_magnitude_h: number;
}

// ---------------------------------------------------------------------------
// Imminent Impactors Library — six historically verified pre-impact predictions
// ---------------------------------------------------------------------------

export interface CorridorVertex {
  name: string;
  lat_deg: number;
  lon_deg: number;
}

export interface MeteoriteRecovery {
  name: string;
  fragments_recovered: number;
  total_mass_kg: number | null;
  first_recovery_date: string;
  first_recovery_finder: string | null;
  search_lead: string;
  meteorite_class: string;
  strewn_field_lat_deg: number | null;
  strewn_field_lon_deg: number | null;
  strewn_field_long_axis_km: number | null;
  strewn_field_short_axis_km: number | null;
}

export type ImminentImpactorCaseType = "CLEARED" | "IMPACTED";

export interface ImminentImpactorCase {
  designation: string;
  designation_temporary: string | null;
  case_number_in_history: number;
  case_type: ImminentImpactorCaseType;
  discovery_date_utc: string;
  discovery_observer: string;
  discovery_observatory: string;
  warning_time_hours: number | null;
  diameter_m: number;
  diameter_uncertainty_m: number | null;
  absolute_magnitude_h: number | null;
  spectral_type: string | null;
  impact_time_utc: string | null;
  impact_lat_deg: number | null;
  impact_lon_deg: number | null;
  impact_uncertainty_km: number | null;
  impact_location_name: string | null;
  impact_velocity_km_s: number | null;
  impact_energy_kt_tnt: number | null;
  explosion_altitude_km: number | null;
  meteorite_recovery: MeteoriteRecovery | null;
  corridor_polyline: CorridorVertex[] | null;
  estimated_population_in_corridor: number | null;
  peak_torino_scale: number | null;
  peak_impact_probability: number | null;
  peak_impact_probability_date: string | null;
  cleared_date: string | null;
  cleared_by: string | null;
  historical_significance: string;
  iawn_activated: boolean;
  smpag_activated: boolean;
  sources: string[];
  fetched_at_utc: string;
}

export interface ImminentImpactorsSummary {
  designation: string;
  case_number_in_history: number;
  case_type: ImminentImpactorCaseType;
  discovery_date_utc: string;
  impact_time_utc: string | null;
  diameter_m: number;
  impact_lat_deg: number | null;
  impact_lon_deg: number | null;
  impact_location_name: string | null;
  has_meteorite_recovery: boolean;
  has_corridor_polyline: boolean;
  historical_significance: string;
}
