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
  thinking_tokens_used: number;
  output_tokens_used: number;
  cost_usd: number;
  cache_hit: boolean;
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

export interface SentryDetailReport {
  designation_query: string;
  status: SentryStatus;
  summary: SentryObjectSummary | null;
  virtual_impactors: SentryVI[];
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
