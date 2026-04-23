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
  // Optional Torino inputs, enriched from orbit determination.
  impact_probability?: number | null;
  absolute_magnitude_h?: number | null;
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

export interface RankedCandidate extends Candidate {
  prediction: Prediction;
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
