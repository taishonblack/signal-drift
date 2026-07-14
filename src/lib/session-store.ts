// Client-side mock store using localStorage

export type SrtMode = "caller" | "listener";

export type SessionStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export type SessionPurpose =
  | "Review"
  | "QC"
  | "Troubleshooting"
  | "Replay Review"
  | "Engineering"
  | "Custom";

export interface SrtLine {
  id: number;
  enabled: boolean;
  label: string;
  srtAddress: string;
  passphrase: string;
  bitrate: string;
  mode: SrtMode;
  notes: string;
  originTimeZone: string; // IANA e.g. "America/New_York", empty = use session default
}

export interface SessionDraft {
  id: string;
  name: string;
  lines: SrtLine[];
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  name: string;
  status: SessionStatus;
  createdAt: string;
  endedAt?: string;
  scheduledEndAt?: string;
  purpose?: SessionPurpose | string;
  host: string;
  hostUserId: string;
  ownerUserId?: string;
  defaultOriginTimeZone: string; // IANA e.g. "Europe/London"
  lines: SrtLine[];
  pin: string;
  notes: string[];
  markers: { timestamp: string; streamLabel: string; note: string }[];
}

export interface AddressBookEntry {
  id: string;
  tag: string;
  address: string;
  port?: string;
  passphrase?: string;
  description?: string;
  lastUsed: string;
}

// Default line factory
export const createDefaultLine = (n: number): SrtLine => ({
  id: n,
  enabled: n === 1,
  label: `Line ${n}`,
  srtAddress: "",
  passphrase: "",
  bitrate: "",
  mode: "caller",
  notes: "",
  originTimeZone: "",
});

// ─── localStorage helpers ───

const SESSIONS_KEY = "mako_sessions";
const DRAFTS_KEY = "mako_drafts";
const ADDRESS_BOOK_KEY = "mako_address_book";
const AUTH_KEY = "mako_auth";
const RETENTION_KEY = "mako_retention_days";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ─── Sessions ───

const seedSessions: SessionRecord[] = [
  { id: "sess-001", name: "Super Bowl LVIII — Main Feed", status: "active", purpose: "QC", createdAt: "2026-02-13T14:30:00Z", host: "You", hostUserId: "u1", ownerUserId: "u1", pin: "7284", defaultOriginTimeZone: "America/Los_Angeles", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-002", name: "Champions League Semi — QC", status: "active", purpose: "QC", createdAt: "2026-02-13T12:00:00Z", host: "You", hostUserId: "u1", ownerUserId: "u1", pin: "3910", defaultOriginTimeZone: "Europe/London", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-003", name: "Concert Livestream — Audio", status: "completed", purpose: "Review", createdAt: "2026-02-12T20:00:00Z", endedAt: "2026-02-12T23:00:00Z", host: "You", hostUserId: "u1", ownerUserId: "u1", pin: "5561", defaultOriginTimeZone: "America/New_York", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-004", name: "News Broadcast — Pre-flight", status: "completed", purpose: "Engineering", createdAt: "2026-02-11T08:00:00Z", endedAt: "2026-02-11T10:00:00Z", host: "You", hostUserId: "u1", ownerUserId: "u1", pin: "1122", defaultOriginTimeZone: "Europe/London", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-005", name: "F1 Onboard — Camera Check", status: "completed", purpose: "Troubleshooting", createdAt: "2026-02-10T15:00:00Z", endedAt: "2026-02-10T17:00:00Z", host: "You", hostUserId: "u1", ownerUserId: "u1", pin: "8833", defaultOriginTimeZone: "Europe/Paris", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-006", name: "Olympics Ceremony — Rehearsal", status: "completed", purpose: "Review", createdAt: "2026-02-09T09:00:00Z", endedAt: "2026-02-09T12:00:00Z", host: "You", hostUserId: "u1", ownerUserId: "u1", pin: "4421", defaultOriginTimeZone: "Asia/Tokyo", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-007", name: "NBA Finals — Remote Review", status: "completed", purpose: "Replay Review", createdAt: "2026-02-08T19:00:00Z", endedAt: "2026-02-08T22:00:00Z", host: "You", hostUserId: "u1", ownerUserId: "u1", pin: "6650", defaultOriginTimeZone: "America/Chicago", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-008", name: "Festival Main Stage — Audio QC", status: "completed", purpose: "QC", createdAt: "2026-02-07T14:00:00Z", endedAt: "2026-02-07T18:00:00Z", host: "You", hostUserId: "u1", ownerUserId: "u1", pin: "2290", defaultOriginTimeZone: "Europe/Berlin", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-009", name: "Rugby World Cup — Backup Feed", status: "completed", purpose: "QC", createdAt: "2026-02-06T10:00:00Z", endedAt: "2026-02-06T13:00:00Z", host: "You", hostUserId: "u1", ownerUserId: "u1", pin: "7713", defaultOriginTimeZone: "Europe/London", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-010", name: "Esports Finals — Stream Test", status: "completed", purpose: "Engineering", createdAt: "2026-02-05T16:00:00Z", endedAt: "2026-02-05T18:00:00Z", host: "You", hostUserId: "u1", ownerUserId: "u1", pin: "9901", defaultOriginTimeZone: "Asia/Seoul", lines: [createDefaultLine(1)], notes: [], markers: [] },
];

// Migration for legacy `expired`/`active`-only status values.
function migrateStatus(s: any): SessionStatus {
  if (s === "expired") return "completed";
  if (
    s === "draft" || s === "scheduled" || s === "active" ||
    s === "paused" || s === "completed" || s === "archived"
  ) return s;
  return "completed";
}

export function getSessions(): SessionRecord[] {
  const stored = read<SessionRecord[] | null>(SESSIONS_KEY, null);
  if (!stored) {
    write(SESSIONS_KEY, seedSessions);
    return seedSessions;
  }
  // Migrate legacy statuses in-place on read.
  return stored.map((s) => ({
    ...s,
    status: migrateStatus((s as any).status),
    ownerUserId: s.ownerUserId ?? s.hostUserId,
  }));
}

export function getSessionById(id: string): SessionRecord | undefined {
  return getSessions().find((s) => s.id === id);
}

export function addSession(session: SessionRecord) {
  const sessions = getSessions();
  sessions.unshift(session);
  write(SESSIONS_KEY, sessions.slice(0, 50));
}

export function updateSession(id: string, patch: Partial<SessionRecord>) {
  const sessions = getSessions();
  const next = sessions.map((s) => (s.id === id ? { ...s, ...patch } : s));
  write(SESSIONS_KEY, next);
}

export function endSession(id: string, endedAt: string = new Date().toISOString()) {
  updateSession(id, { status: "completed", endedAt });
}

export function getActiveSessionForUser(userId: string): SessionRecord | undefined {
  return getSessions().find(
    (s) => s.status === "active" && (s.ownerUserId ?? s.hostUserId) === userId
  );
}

export function generateSessionId(): string {
  return `sess-${Date.now().toString(36)}`;
}

export function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// ─── Drafts ───

export function getDrafts(): SessionDraft[] {
  return read(DRAFTS_KEY, []);
}

export function saveDraft(draft: SessionDraft) {
  const drafts = getDrafts().filter((d) => d.id !== draft.id);
  drafts.unshift(draft);
  write(DRAFTS_KEY, drafts.slice(0, 20));
}

// ─── Address Book ───

const seedAddressBook: AddressBookEntry[] = [
  { id: "ab-1", tag: "Main Ingest", address: "ingest.example.com", port: "9000", description: "Primary program feed", lastUsed: "2026-02-12T14:00:00Z" },
  { id: "ab-2", tag: "Backup Feed", address: "ingest.example.com", port: "9001", description: "Failover ingest", lastUsed: "2026-02-10T10:00:00Z" },
  { id: "ab-3", tag: "Remote Camera", address: "remote.example.com", port: "9002", description: "Roaming ISO camera", lastUsed: "2026-02-08T08:00:00Z" },
];

export function getAddressBook(): AddressBookEntry[] {
  const stored = read<AddressBookEntry[] | null>(ADDRESS_BOOK_KEY, null);
  if (!stored) {
    write(ADDRESS_BOOK_KEY, seedAddressBook);
    return seedAddressBook;
  }
  return stored;
}

export function saveAddressBook(entries: AddressBookEntry[]) {
  write(ADDRESS_BOOK_KEY, entries);
}

// ─── SRT parsing helpers ───

export function parseSrtInput(raw: string): { host: string; port: string } {
  let s = (raw || "").trim();
  if (!s) return { host: "", port: "" };
  s = s.replace(/^srt:\/\//i, "");
  s = s.split("?")[0];
  s = s.split("/")[0];
  const [host, port = ""] = s.split(":");
  return { host: host || "", port: (port || "").replace(/\D/g, "") };
}

export function composeSrt(host: string, port: string): string {
  const h = (host || "").trim();
  const p = (port || "").trim();
  if (!h) return "";
  if (!p) return `srt://${h}`;
  return `srt://${h}:${p}?mode=caller`;
}

// ─── Auth (mock) ───

export function isLoggedIn(): boolean {
  return read(AUTH_KEY, false);
}

export function setLoggedIn(val: boolean) {
  write(AUTH_KEY, val);
}

// ─── Retention (scaffold, not enforced) ───

export type RetentionDays = 30 | 90 | 365 | 0; // 0 = indefinite

export function getRetentionDays(): RetentionDays {
  return read<RetentionDays>(RETENTION_KEY, 90);
}

export function setRetentionDays(days: RetentionDays) {
  write(RETENTION_KEY, days);
}

// ─── Session log export ───

export function exportSessionLog(session: SessionRecord): string {
  const log = {
    session: session.name,
    id: session.id,
    host: session.host,
    pin: session.pin,
    purpose: session.purpose,
    started: session.createdAt,
    scheduledEnd: session.scheduledEndAt || "N/A",
    ended: session.endedAt || "N/A",
    lines: session.lines.filter((l) => l.enabled).map((l) => ({
      label: l.label,
      address: l.srtAddress,
      mode: l.mode,
    })),
    notes: session.notes,
    markers: session.markers,
  };
  return JSON.stringify(log, null, 2);
}
