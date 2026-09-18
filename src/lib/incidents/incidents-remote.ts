// Phase E.5A — client access to the persistent incident ledger.
//
// Reads go through RLS-protected SELECTs. Writes go exclusively through the
// trusted server routines `submit_signal_incident` / `recover_signal_incident`,
// which own authorization, serialization and deduplication. Nothing here
// invents, seeds or estimates a value.

import { supabase } from "@/integrations/supabase/client";
import {
  rowToEvidence,
  rowToIncident,
  type EvidenceRow,
  type IncidentRecord,
  type IncidentEvidenceRecord,
  type IncidentRecoveryResult,
  type IncidentRow,
  type IncidentSubmission,
  type IncidentSubmissionResult,
} from "./contract";

const client = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/** Authorized incidents for a session, newest observation first. */
export async function fetchSessionIncidents(
  sessionId: string,
): Promise<IncidentRecord[]> {
  const { data, error } = await client
    .from("signal_incidents")
    .select("*")
    .eq("session_id", sessionId)
    .order("observed_started_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as IncidentRow[]).map(rowToIncident);
}

export async function fetchIncidentEvidence(
  incidentId: string,
): Promise<IncidentEvidenceRecord[]> {
  const { data, error } = await client
    .from("signal_incident_evidence")
    .select("*")
    .eq("incident_id", incidentId)
    .order("captured_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as EvidenceRow[]).map(rowToEvidence);
}

/**
 * Submit an observed condition. The server decides create vs corroborate —
 * the client never gets to declare a new incident.
 *
 * No detector calls this in E.5A.
 */
export async function submitIncidentCandidate(
  input: IncidentSubmission,
): Promise<IncidentSubmissionResult> {
  const { data, error } = await client.rpc("submit_signal_incident", {
    _session_id: input.sessionId,
    _runtime_route_id: input.runtimeRouteId,
    _slot: input.slot,
    _source_name: input.sourceName,
    _incident_type: input.incidentType,
    _detector_id: input.detectorId,
    _detector_version: input.detectorVersion,
    _threshold: input.threshold ?? {},
    _observation_point: input.observationPoint,
    _observed_started_at: input.observedStartedAt,
    _detected_at: input.detectedAt,
    _evidence: input.evidence
      ? {
          phase: input.evidence.phase,
          captured_at: input.evidence.capturedAt,
          observation_point: input.evidence.observationPoint,
          payload: input.evidence.payload,
          still_image_path: input.evidence.stillImagePath ?? null,
        }
      : null,
  });
  if (error) return { ok: false, error: error.message };
  return data as IncidentSubmissionResult;
}

/** Close an incident with its observed end time. Idempotent server-side. */
export async function recoverIncident(args: {
  incidentId: string;
  observedEndedAt: string;
  recoveryNote?: string | null;
  evidence?: IncidentSubmission["evidence"];
}): Promise<IncidentRecoveryResult> {
  const { data, error } = await client.rpc("recover_signal_incident", {
    _incident_id: args.incidentId,
    _observed_ended_at: args.observedEndedAt,
    _recovery_note: args.recoveryNote ?? null,
    _evidence: args.evidence
      ? {
          phase: args.evidence.phase,
          captured_at: args.evidence.capturedAt,
          observation_point: args.evidence.observationPoint,
          payload: args.evidence.payload,
          still_image_path: args.evidence.stillImagePath ?? null,
        }
      : null,
  });
  if (error) return { ok: false, error: error.message };
  return data as IncidentRecoveryResult;
}
