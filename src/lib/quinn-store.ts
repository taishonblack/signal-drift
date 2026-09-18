/**
 * Signal incident types and presentation helpers (Phase E.5-Truth).
 *
 * This module used to seed simulated incidents and fabricated technical events
 * (packet-loss percentages, bitrate drops, freeze durations, PTS jumps, audio
 * clipping) into localStorage and present them as real observations. All of it
 * has been removed: MAKO must never claim an incident it did not observe.
 *
 * MAKO has no persistent incident source yet — the real one arrives in Phase
 * E.5A (`signal_incidents` / `signal_incident_evidence`). Until then every
 * accessor here truthfully returns nothing, and the UI shows an honest empty
 * state. The types and presentation helpers are deliberately preserved so the
 * existing incident surfaces can be repointed at genuine persisted incidents.
 */

export type UserRole = "viewer" | "host" | "ops";

export interface QuinnUser {
  id: string;
  name: string;
  role: UserRole;
}

export type IncidentStatus = "open" | "ack" | "resolved";
export type Severity = "info" | "warn" | "critical";

/** Deterministic detector classifications MAKO intends to observe (E.5B+). */
export type EventType =
  | "black_video"
  | "frozen_video"
  | "audio_silence"
  | "signal_loss"
  | "format_change";

export interface QuinnEvent {
  id: string;
  incidentId: string;
  sessionId: string;
  lineId: string;
  tsUtc: string;
  type: EventType | string;
  severity: Severity;
  confidence: number | null;
  /** Only genuinely measured values ever appear here. */
  evidence: Record<string, unknown>;
}

export interface Incident {
  id: string;
  sessionId: string;
  sessionName: string;
  primaryLineId: string;
  primaryLineLabel: string;
  startedAtUtc: string;
  endedAtUtc: string | null;
  severity: Severity;
  status: IncidentStatus;
  summary: string;
  createdBy: string;
}

export interface QuinnAlert {
  id: string;
  incidentId: string;
  targetUserId: string;
  deliveredAtUtc: string;
  ackAtUtc: string | null;
}

/** Honest empty state copy for every production incident surface. */
export const NO_INCIDENTS_OBSERVED = "No signal incidents observed.";

// ─── Legacy cleanup ───
//
// Browsers that ran an earlier build still hold the seeded fake incidents in
// localStorage. Remove those keys so no fabricated record can be read back.

const LEGACY_KEYS = ["mako_quinn_incidents", "mako_quinn_events", "mako_quinn_alerts"];

export function purgeLegacySyntheticIncidents(): void {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  } catch {
    /* storage unavailable — nothing to purge */
  }
}

purgeLegacySyntheticIncidents();

// ─── Accessors ───
//
// No incident source exists yet. Nothing is generated, seeded or read back.

export function getIncidents(): Incident[] {
  return [];
}

export function getIncidentsForSession(_sessionId: string): Incident[] {
  return [];
}

export function getEvents(): QuinnEvent[] {
  return [];
}

export function getEventsForIncident(_incidentId: string): QuinnEvent[] {
  return [];
}

export function getAlerts(): QuinnAlert[] {
  return [];
}

export function getUnackedAlertCount(_userId: string): number {
  return 0;
}

export function getUnackedAlertCountForSession(_sessionId: string, _userId: string): number {
  return 0;
}

/**
 * Workflow status changes need a persisted incident to act on. Until E.5A there
 * is nothing to update, and inventing a local record would recreate exactly the
 * synthetic-incident problem this cleanup removed.
 */
export function updateIncidentStatus(_incidentId: string, _status: IncidentStatus): void {
  /* no persisted incident store yet (Phase E.5A) */
}

/** Truthful export: no incidents observed, rather than a seeded example. */
export function exportIncidentReport(incidentId: string): string {
  return JSON.stringify(
    { incidentId, incident: null, events: [], note: NO_INCIDENTS_OBSERVED },
    null,
    2,
  );
}

// ─── Severity / status presentation helpers (preserved for real incidents) ───

export const severityColor: Record<Severity, string> = {
  info: "text-primary",
  warn: "text-[hsl(var(--warning))]",
  critical: "text-destructive",
};

export const severityBg: Record<Severity, string> = {
  info: "bg-primary/15 text-primary",
  warn: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
  critical: "bg-destructive/15 text-destructive",
};

export const statusBg: Record<IncidentStatus, string> = {
  open: "bg-destructive/15 text-destructive",
  ack: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
  resolved: "bg-primary/15 text-primary",
};
