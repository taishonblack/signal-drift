// Phase E.5A — typed contracts for MAKO's persistent engineering incident
// ledger. These are deliberately independent of Quinn types: Quinn consumes
// incidents (E.5H), it never produces them. No severity exists here — a
// detector records objective classification and duration only.

export type IncidentType =
  | "audio_silence"
  | "black_video"
  | "frozen_video"
  | "signal_loss"
  | "format_change";

export const INCIDENT_TYPES: readonly IncidentType[] = [
  "audio_silence",
  "black_video",
  "frozen_video",
  "signal_loss",
  "format_change",
];

export type IncidentState = "open" | "recovered";

export type IncidentWorkflowStatus =
  | "new"
  | "acknowledged"
  | "investigating"
  | "resolved";

export type IncidentEvidencePhase = "pre" | "event" | "post";

/** Where the observation was made. Provenance is never inferred. */
export type IncidentObservationPoint =
  | "browser_webrtc_pcm"
  | "browser_decoded_video"
  | "rtsp_publication"
  | "ffmpeg_input"
  | "playback_state";

export interface IncidentEvidenceSubmission {
  phase: IncidentEvidencePhase;
  capturedAt: string;
  observationPoint: IncidentObservationPoint;
  payload: Record<string, unknown>;
  stillImagePath?: string | null;
}

/** What a future detector submits. The server owns identity and dedupe. */
export interface IncidentSubmission {
  sessionId: string;
  runtimeRouteId: string | null;
  slot: number | null;
  sourceName: string;
  incidentType: IncidentType;
  detectorId: string;
  detectorVersion: string;
  threshold: Record<string, unknown>;
  observationPoint: IncidentObservationPoint;
  /** Browser-measured wall-clock start of the condition (UTC ISO). */
  observedStartedAt: string;
  /** When the detector's sustained threshold was satisfied (UTC ISO). */
  detectedAt: string;
  evidence?: IncidentEvidenceSubmission | null;
}

export interface IncidentRecord {
  id: string;
  sessionId: string;
  runtimeRouteId: string | null;
  slot: number | null;
  sourceName: string;
  incidentType: IncidentType;
  detectorId: string;
  detectorVersion: string;
  threshold: Record<string, unknown>;
  observationPoint: IncidentObservationPoint;
  state: IncidentState;
  workflowStatus: IncidentWorkflowStatus;
  /** Observation time — never replaced by server persistence time. */
  observedStartedAt: string;
  observedEndedAt: string | null;
  detectedAt: string;
  /** Server time — persistence provenance only. */
  serverReceivedAt: string;
  serverPersistedAt: string;
  durationMs: number | null;
  corroborationCount: number;
  recoveryNote: string | null;
  ackedBy: string | null;
  ackedAt: string | null;
  assignedTo: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentEvidenceRecord {
  id: string;
  incidentId: string;
  phase: IncidentEvidencePhase;
  capturedAt: string;
  observationPoint: IncidentObservationPoint;
  payload: Record<string, unknown>;
  stillImagePath: string | null;
  createdAt: string;
}

export type IncidentSubmissionOutcome = "created" | "corroborated";

export type IncidentSubmissionResult =
  | { ok: true; outcome: IncidentSubmissionOutcome; incidentId: string }
  | { ok: false; error: string };

export type IncidentRecoveryResult =
  | {
      ok: true;
      outcome: "recovered" | "already_recovered";
      incidentId: string;
      durationMs: number | null;
    }
  | { ok: false; error: string };

/** Timing precision claim. Never frame accurate. */
export const INCIDENT_TIMING_PRECISION_NOTE =
  "Observed times are browser-measured; server times record persistence only. Not frame accurate.";

export interface IncidentRow {
  id: string;
  session_id: string;
  runtime_route_id: string | null;
  slot: number | null;
  source_name: string;
  incident_type: string;
  detector_id: string;
  detector_version: string;
  threshold: unknown;
  observation_point: string;
  state: string;
  workflow_status: string;
  observed_started_at: string;
  observed_ended_at: string | null;
  detected_at: string;
  server_received_at: string;
  server_persisted_at: string;
  duration_ms: number | string | null;
  corroboration_count: number;
  recovery_note: string | null;
  acked_by: string | null;
  acked_at: string | null;
  assigned_to: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToIncident(r: IncidentRow): IncidentRecord {
  return {
    id: r.id,
    sessionId: r.session_id,
    runtimeRouteId: r.runtime_route_id,
    slot: r.slot,
    sourceName: r.source_name,
    incidentType: r.incident_type as IncidentType,
    detectorId: r.detector_id,
    detectorVersion: r.detector_version,
    threshold: (r.threshold as Record<string, unknown>) ?? {},
    observationPoint: r.observation_point as IncidentObservationPoint,
    state: r.state as IncidentState,
    workflowStatus: r.workflow_status as IncidentWorkflowStatus,
    observedStartedAt: r.observed_started_at,
    observedEndedAt: r.observed_ended_at,
    detectedAt: r.detected_at,
    serverReceivedAt: r.server_received_at,
    serverPersistedAt: r.server_persisted_at,
    durationMs: r.duration_ms === null ? null : Number(r.duration_ms),
    corroborationCount: r.corroboration_count,
    recoveryNote: r.recovery_note,
    ackedBy: r.acked_by,
    ackedAt: r.acked_at,
    assignedTo: r.assigned_to,
    resolutionNote: r.resolution_note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface EvidenceRow {
  id: string;
  incident_id: string;
  phase: string;
  captured_at: string;
  observation_point: string;
  payload: unknown;
  still_image_path: string | null;
  created_at: string;
}

export function rowToEvidence(r: EvidenceRow): IncidentEvidenceRecord {
  return {
    id: r.id,
    incidentId: r.incident_id,
    phase: r.phase as IncidentEvidencePhase,
    capturedAt: r.captured_at,
    observationPoint: r.observation_point as IncidentObservationPoint,
    payload: (r.payload as Record<string, unknown>) ?? {},
    stillImagePath: r.still_image_path,
    createdAt: r.created_at,
  };
}
