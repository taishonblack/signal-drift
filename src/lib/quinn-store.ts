// Quinn data model — mock store using localStorage

export type UserRole = "viewer" | "host" | "ops";

export interface QuinnUser {
  id: string;
  name: string;
  role: UserRole;
}

export type IncidentStatus = "open" | "ack" | "resolved";
export type Severity = "info" | "warn" | "critical";

export type EventType =
  | "packet_loss_spike"
  | "bitrate_drop"
  | "freeze_detected"
  | "pts_jump"
  | "audio_clipping"
  | "black_frames"
  | "resolution_change"
  | "codec_change";

export interface QuinnEvent {
  id: string;
  incidentId: string;
  sessionId: string;
  lineId: string;
  tsUtc: string;
  type: EventType;
  severity: Severity;
  confidence: number;
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

// ─── Current user (mock) ───

const CURRENT_USER: QuinnUser = { id: "u1", name: "You", role: "ops" };

export function getCurrentUser(): QuinnUser {
  return CURRENT_USER;
}

export function isHost(sessionHostUserId: string): boolean {
  return CURRENT_USER.id === sessionHostUserId;
}

export function isOps(): boolean {
  return CURRENT_USER.role === "ops";
}

// ─── Seed data ───

const seedIncidents: Incident[] = [
  {
    id: "inc-001",
    sessionId: "sess-001",
    sessionName: "Super Bowl LVIII — Main Feed",
    primaryLineId: "line-3",
    primaryLineLabel: "Line 3 — Program",
    startedAtUtc: "2026-02-13T15:14:08Z",
    endedAtUtc: null,
    severity: "critical",
    status: "open",
    summary: "Sustained packet loss spike on Line 3 (1.8%) with freeze risk. Loss rose from 0.1% → 1.8% over 4 seconds.",
    createdBy: "quinn",
  },
  {
    id: "inc-002",
    sessionId: "sess-001",
    sessionName: "Super Bowl LVIII — Main Feed",
    primaryLineId: "line-1",
    primaryLineLabel: "Line 1 — Camera A",
    startedAtUtc: "2026-02-13T14:52:30Z",
    endedAtUtc: "2026-02-13T14:53:45Z",
    severity: "warn",
    status: "resolved",
    summary: "Brief audio clipping detected on Line 1. Peak exceeded -1.0 dBFS for 800ms.",
    createdBy: "quinn",
  },
  {
    id: "inc-003",
    sessionId: "sess-002",
    sessionName: "Champions League Semi — QC",
    primaryLineId: "line-2",
    primaryLineLabel: "Line 2 — Camera B",
    startedAtUtc: "2026-02-13T13:22:00Z",
    endedAtUtc: "2026-02-13T13:22:18Z",
    severity: "warn",
    status: "ack",
    summary: "Bitrate dropped 42% on Line 2 for 18 seconds. Recovered automatically.",
    createdBy: "quinn",
  },
  {
    id: "inc-004",
    sessionId: "sess-001",
    sessionName: "Super Bowl LVIII — Main Feed",
    primaryLineId: "line-2",
    primaryLineLabel: "Line 2 — Camera B",
    startedAtUtc: "2026-02-13T14:41:00Z",
    endedAtUtc: "2026-02-13T14:41:30Z",
    severity: "info",
    status: "resolved",
    summary: "Resolution change detected on Line 2: 1920×1080 → 3840×2160. Codec switched to H.265.",
    createdBy: "quinn",
  },
];

const seedEvents: QuinnEvent[] = [
  { id: "ev-001", incidentId: "inc-001", sessionId: "sess-001", lineId: "line-3", tsUtc: "2026-02-13T15:14:08Z", type: "packet_loss_spike", severity: "critical", confidence: 0.95, evidence: { lossBefore: 0.1, lossAfter: 1.8, durationMs: 4200 } },
  { id: "ev-002", incidentId: "inc-001", sessionId: "sess-001", lineId: "line-3", tsUtc: "2026-02-13T15:14:12Z", type: "freeze_detected", severity: "critical", confidence: 0.88, evidence: { freezeDurationMs: 2100, framesDuplicated: 63 } },
  { id: "ev-003", incidentId: "inc-002", sessionId: "sess-001", lineId: "line-1", tsUtc: "2026-02-13T14:52:30Z", type: "audio_clipping", severity: "warn", confidence: 0.92, evidence: { peakDbfs: -0.3, durationMs: 800 } },
  { id: "ev-004", incidentId: "inc-003", sessionId: "sess-002", lineId: "line-2", tsUtc: "2026-02-13T13:22:00Z", type: "bitrate_drop", severity: "warn", confidence: 0.97, evidence: { bitrateBefore: 12.1, bitrateAfter: 7.0, dropPct: 42 } },
  { id: "ev-005", incidentId: "inc-004", sessionId: "sess-001", lineId: "line-2", tsUtc: "2026-02-13T14:41:00Z", type: "resolution_change", severity: "info", confidence: 1.0, evidence: { from: "1920×1080", to: "3840×2160" } },
  { id: "ev-006", incidentId: "inc-004", sessionId: "sess-001", lineId: "line-2", tsUtc: "2026-02-13T14:41:00Z", type: "codec_change", severity: "info", confidence: 1.0, evidence: { from: "H.264 High", to: "H.265 Main" } },
];

const seedAlerts: QuinnAlert[] = [
  { id: "al-001", incidentId: "inc-001", targetUserId: "u1", deliveredAtUtc: "2026-02-13T15:14:10Z", ackAtUtc: null },
  { id: "al-002", incidentId: "inc-002", targetUserId: "u1", deliveredAtUtc: "2026-02-13T14:52:32Z", ackAtUtc: "2026-02-13T14:53:00Z" },
];

// ─── localStorage helpers ───

const INCIDENTS_KEY = "mako_quinn_incidents";
const EVENTS_KEY = "mako_quinn_events";
const ALERTS_KEY = "mako_quinn_alerts";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ─── Public API ───

export function getIncidents(): Incident[] {
  const stored = read<Incident[] | null>(INCIDENTS_KEY, null);
  if (!stored) { write(INCIDENTS_KEY, seedIncidents); return seedIncidents; }
  return stored;
}

export function getIncidentsForSession(sessionId: string): Incident[] {
  return getIncidents().filter((i) => i.sessionId === sessionId);
}

export function getEventsForIncident(incidentId: string): QuinnEvent[] {
  return getEvents().filter((e) => e.incidentId === incidentId);
}

export function getEvents(): QuinnEvent[] {
  const stored = read<QuinnEvent[] | null>(EVENTS_KEY, null);
  if (!stored) { write(EVENTS_KEY, seedEvents); return seedEvents; }
  return stored;
}

export function getAlerts(): QuinnAlert[] {
  const stored = read<QuinnAlert[] | null>(ALERTS_KEY, null);
  if (!stored) { write(ALERTS_KEY, seedAlerts); return seedAlerts; }
  return stored;
}

export function getUnackedAlertCount(userId: string): number {
  return getAlerts().filter((a) => a.targetUserId === userId && !a.ackAtUtc).length;
}

export function getUnackedAlertCountForSession(sessionId: string, userId: string): number {
  const incidentIds = new Set(getIncidentsForSession(sessionId).map((i) => i.id));
  return getAlerts().filter((a) => a.targetUserId === userId && !a.ackAtUtc && incidentIds.has(a.incidentId)).length;
}

export function updateIncidentStatus(incidentId: string, status: IncidentStatus) {
  const incidents = getIncidents();
  const idx = incidents.findIndex((i) => i.id === incidentId);
  if (idx === -1) return;
  incidents[idx] = {
    ...incidents[idx],
    status,
    endedAtUtc: status === "resolved" ? new Date().toISOString() : incidents[idx].endedAtUtc,
  };
  write(INCIDENTS_KEY, incidents);

  // Auto-ack alert
  if (status === "ack" || status === "resolved") {
    const alerts = getAlerts();
    const updated = alerts.map((a) =>
      a.incidentId === incidentId && !a.ackAtUtc
        ? { ...a, ackAtUtc: new Date().toISOString() }
        : a
    );
    write(ALERTS_KEY, updated);
  }
}

export function exportIncidentReport(incidentId: string): string {
  const incident = getIncidents().find((i) => i.id === incidentId);
  if (!incident) return "{}";
  const events = getEventsForIncident(incidentId);
  return JSON.stringify({ incident, events }, null, 2);
}

// ─── Severity helpers ───

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
