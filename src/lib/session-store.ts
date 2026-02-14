// Client-side mock store using localStorage

export type SrtMode = "caller" | "listener";

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
  status: "active" | "expired";
  createdAt: string;
  endedAt?: string;
  host: string;
  hostUserId: string;
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
  { id: "sess-001", name: "Super Bowl LVIII — Main Feed", status: "active", createdAt: "2026-02-13T14:30:00Z", host: "You", hostUserId: "u1", pin: "7284", defaultOriginTimeZone: "America/Los_Angeles", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-002", name: "Champions League Semi — QC", status: "active", createdAt: "2026-02-13T12:00:00Z", host: "You", hostUserId: "u1", pin: "3910", defaultOriginTimeZone: "Europe/London", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-003", name: "Concert Livestream — Audio", status: "expired", createdAt: "2026-02-12T20:00:00Z", endedAt: "2026-02-12T23:00:00Z", host: "You", hostUserId: "u1", pin: "5561", defaultOriginTimeZone: "America/New_York", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-004", name: "News Broadcast — Pre-flight", status: "expired", createdAt: "2026-02-11T08:00:00Z", endedAt: "2026-02-11T10:00:00Z", host: "You", hostUserId: "u1", pin: "1122", defaultOriginTimeZone: "Europe/London", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-005", name: "F1 Onboard — Camera Check", status: "expired", createdAt: "2026-02-10T15:00:00Z", endedAt: "2026-02-10T17:00:00Z", host: "You", hostUserId: "u1", pin: "8833", defaultOriginTimeZone: "Europe/Paris", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-006", name: "Olympics Ceremony — Rehearsal", status: "expired", createdAt: "2026-02-09T09:00:00Z", endedAt: "2026-02-09T12:00:00Z", host: "You", hostUserId: "u1", pin: "4421", defaultOriginTimeZone: "Asia/Tokyo", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-007", name: "NBA Finals — Remote Review", status: "expired", createdAt: "2026-02-08T19:00:00Z", endedAt: "2026-02-08T22:00:00Z", host: "You", hostUserId: "u1", pin: "6650", defaultOriginTimeZone: "America/Chicago", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-008", name: "Festival Main Stage — Audio QC", status: "expired", createdAt: "2026-02-07T14:00:00Z", endedAt: "2026-02-07T18:00:00Z", host: "You", hostUserId: "u1", pin: "2290", defaultOriginTimeZone: "Europe/Berlin", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-009", name: "Rugby World Cup — Backup Feed", status: "expired", createdAt: "2026-02-06T10:00:00Z", endedAt: "2026-02-06T13:00:00Z", host: "You", hostUserId: "u1", pin: "7713", defaultOriginTimeZone: "Europe/London", lines: [createDefaultLine(1)], notes: [], markers: [] },
  { id: "sess-010", name: "Esports Finals — Stream Test", status: "expired", createdAt: "2026-02-05T16:00:00Z", endedAt: "2026-02-05T18:00:00Z", host: "You", hostUserId: "u1", pin: "9901", defaultOriginTimeZone: "Asia/Seoul", lines: [createDefaultLine(1)], notes: [], markers: [] },
];

export function getSessions(): SessionRecord[] {
  const stored = read<SessionRecord[] | null>(SESSIONS_KEY, null);
  if (!stored) {
    write(SESSIONS_KEY, seedSessions);
    return seedSessions;
  }
  return stored;
}

export function addSession(session: SessionRecord) {
  const sessions = getSessions();
  sessions.unshift(session);
  write(SESSIONS_KEY, sessions.slice(0, 50));
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
  { id: "ab-1", tag: "Main Ingest", address: "srt://ingest.example.com:9000?streamid=main", lastUsed: "2026-02-12T14:00:00Z" },
  { id: "ab-2", tag: "Backup Feed", address: "srt://ingest.example.com:9001?streamid=backup", lastUsed: "2026-02-10T10:00:00Z" },
  { id: "ab-3", tag: "Remote Camera", address: "srt://remote.example.com:9002?streamid=cam-1", lastUsed: "2026-02-08T08:00:00Z" },
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

// ─── Auth (mock) ───

export function isLoggedIn(): boolean {
  return read(AUTH_KEY, false);
}

export function setLoggedIn(val: boolean) {
  write(AUTH_KEY, val);
}

// ─── Session log export ───

export function exportSessionLog(session: SessionRecord): string {
  const log = {
    session: session.name,
    id: session.id,
    host: session.host,
    pin: session.pin,
    started: session.createdAt,
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
