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
  originTimeZone: string;
}

export interface SessionDraft {
  id: string;
  name: string;
  lines: SrtLine[];
  createdAt: string;
}

export interface SessionViewer {
  userId: string;
  name: string;
  isOwner: boolean;
  isCoOwner?: boolean;
  joinedAt: string;
  focus?: string; // friendly label of currently focused input
}

export type OwnershipRequestKind = "full" | "co";
export type OwnershipRequestStatus = "pending" | "approved" | "denied";

export interface SessionOwnershipRequest {
  id: string;
  userId: string;
  userName: string;
  kind: OwnershipRequestKind;
  status: OwnershipRequestStatus;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}


export type SessionChangeKind =
  | "session_renamed"
  | "purpose_changed"
  | "duration_changed"
  | "timezone_changed"
  | "source_added"
  | "source_removed"
  | "source_renamed"
  | "source_address_changed"
  | "source_notes_changed"
  | "config_saved"
  | "ownership_requested"
  | "ownership_granted"
  | "co_ownership_granted"
  | "ownership_denied";


export interface SessionChangeEntry {
  id: string;
  at: string;
  userId: string;
  userName: string;
  kind: SessionChangeKind;
  summary: string;
  before?: string;
  after?: string;
  target?: string;
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
  team?: string;
  defaultOriginTimeZone: string;
  lines: SrtLine[];
  pin: string;
  notes: string[];
  markers: { timestamp: string; streamLabel: string; note: string }[];
  viewers?: SessionViewer[];
  changeLog?: SessionChangeEntry[];
  ownershipRequests?: SessionOwnershipRequest[];
  /** When ownership became vacant. Used for the 30s orphan-termination sweep. */
  noOwnerSince?: number | null;
  /** True when the creator was a temporary Operator (unauthenticated). */
  guestOwned?: boolean;
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

const SESSIONS_KEY = "mako_sessions_v3";
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

// ─── Current user ───
// Delegates to the identity layer so guest (Temporary Operator) sessions
// carry a stable id/name without requiring authentication.

import { getIdentity } from "@/lib/identity";

export const CURRENT_USER_ID = "u1";
export const CURRENT_USER_NAME = "You";

export function getCurrentUserRef(): { id: string; name: string } {
  const identity = getIdentity();
  if (identity.kind === "anon") {
    return { id: CURRENT_USER_ID, name: CURRENT_USER_NAME };
  }
  return { id: identity.id, name: identity.name };
}


// ─── Sessions ───

const now = Date.now();
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

const seedSessions: SessionRecord[] = [
  // Team active — owned by other operators
  {
    id: "sess-001",
    name: "Super Bowl LIX — Main Feed Review",
    status: "active",
    purpose: "QC",
    createdAt: iso(-74 * 60_000),
    scheduledEndAt: iso(46 * 60_000),
    host: "Quinn Roberts",
    hostUserId: "u2",
    ownerUserId: "u2",
    team: "Broadcast Ops",
    pin: "7284",
    defaultOriginTimeZone: "America/Los_Angeles",
    lines: [createDefaultLine(1), { ...createDefaultLine(2), enabled: true }, { ...createDefaultLine(3), enabled: true }, { ...createDefaultLine(4), enabled: true }],
    notes: [],
    markers: [],
    viewers: [
      { userId: "u2", name: "Quinn Roberts", isOwner: true, joinedAt: iso(-74 * 60_000), focus: "Line 2 — Camera B" },
      { userId: "u3", name: "Stephanie Black", isOwner: false, joinedAt: iso(-60 * 60_000), focus: "Program" },
      { userId: "u4", name: "Chris Martin", isOwner: false, joinedAt: iso(-40 * 60_000) },
      { userId: "u5", name: "Jennifer Day", isOwner: false, joinedAt: iso(-20 * 60_000) },
    ],
    changeLog: [
      { id: "cl-1", at: iso(-70 * 60_000), userId: "u2", userName: "Quinn Roberts", kind: "config_saved", summary: "Started monitoring session" },
      { id: "cl-2", at: iso(-56 * 60_000), userId: "u2", userName: "Quinn Roberts", kind: "source_renamed", target: "Source 2", before: "Camera 2", after: "Truck B Program", summary: "Renamed Source 2 from “Camera 2” to “Truck B Program”" },
      { id: "cl-3", at: iso(-42 * 60_000), userId: "u3", userName: "Stephanie Black", kind: "source_added", target: "Source 4", after: "ISO — Sideline", summary: "Added Source 4 “ISO — Sideline”" },
    ],
  },
  {
    id: "sess-002",
    name: "Champions League Semi — Remote QC",
    status: "active",
    purpose: "QC",
    createdAt: iso(-38 * 60_000),
    scheduledEndAt: iso(82 * 60_000),
    host: "Stephanie Black",
    hostUserId: "u3",
    ownerUserId: "u3",
    team: "Broadcast Ops",
    pin: "3910",
    defaultOriginTimeZone: "Europe/London",
    lines: [createDefaultLine(1), { ...createDefaultLine(2), enabled: true }],
    notes: [],
    markers: [],
    viewers: [
      { userId: "u3", name: "Stephanie Black", isOwner: true, joinedAt: iso(-38 * 60_000) },
      { userId: "u6", name: "Marcus Lee", isOwner: false, joinedAt: iso(-15 * 60_000), focus: "Line 1" },
    ],
  },
  {
    id: "sess-003",
    name: "NBC Nightly — Pre-flight",
    status: "active",
    purpose: "Engineering",
    createdAt: iso(-12 * 60_000),
    scheduledEndAt: iso(48 * 60_000),
    host: "Chris Martin",
    hostUserId: "u4",
    ownerUserId: "u4",
    team: "Engineering",
    pin: "1122",
    defaultOriginTimeZone: "America/New_York",
    lines: [createDefaultLine(1)],
    notes: [],
    markers: [],
    viewers: [
      { userId: "u4", name: "Chris Martin", isOwner: true, joinedAt: iso(-12 * 60_000), focus: "Line 1" },
    ],
  },
  // Drafts
  {
    id: "sess-draft-1",
    name: "Grammys — Multicam Setup",
    status: "draft",
    purpose: "Review",
    createdAt: iso(-2 * 60 * 60_000),
    host: CURRENT_USER_NAME,
    hostUserId: CURRENT_USER_ID,
    ownerUserId: CURRENT_USER_ID,
    team: "Broadcast Ops",
    pin: "0000",
    defaultOriginTimeZone: "America/Los_Angeles",
    lines: [createDefaultLine(1)],
    notes: [],
    markers: [],
    viewers: [],
  },
  // Completed
  {
    id: "sess-004",
    name: "Concert Livestream — Audio Check",
    status: "completed",
    purpose: "Review",
    createdAt: iso(-26 * 60 * 60_000),
    endedAt: iso(-23 * 60 * 60_000),
    host: CURRENT_USER_NAME,
    hostUserId: CURRENT_USER_ID,
    ownerUserId: CURRENT_USER_ID,
    team: "Broadcast Ops",
    pin: "5561",
    defaultOriginTimeZone: "America/New_York",
    lines: [createDefaultLine(1)],
    notes: [],
    markers: [],
  },
  {
    id: "sess-005",
    name: "F1 Onboard — Camera Check",
    status: "completed",
    purpose: "Troubleshooting",
    createdAt: iso(-3 * 24 * 60 * 60_000),
    endedAt: iso(-3 * 24 * 60 * 60_000 + 2 * 60 * 60_000),
    host: "Quinn Roberts",
    hostUserId: "u2",
    ownerUserId: "u2",
    team: "Broadcast Ops",
    pin: "8833",
    defaultOriginTimeZone: "Europe/Paris",
    lines: [createDefaultLine(1)],
    notes: [],
    markers: [],
  },
  {
    id: "sess-006",
    name: "Olympics Ceremony — Rehearsal",
    status: "completed",
    purpose: "Review",
    createdAt: iso(-5 * 24 * 60 * 60_000),
    endedAt: iso(-5 * 24 * 60 * 60_000 + 3 * 60 * 60_000),
    host: CURRENT_USER_NAME,
    hostUserId: CURRENT_USER_ID,
    ownerUserId: CURRENT_USER_ID,
    team: "Broadcast Ops",
    pin: "4421",
    defaultOriginTimeZone: "Asia/Tokyo",
    lines: [createDefaultLine(1)],
    notes: [],
    markers: [],
  },
  // Archived
  {
    id: "sess-007",
    name: "NBA Finals — Remote Review",
    status: "archived",
    purpose: "Replay Review",
    createdAt: iso(-30 * 24 * 60 * 60_000),
    endedAt: iso(-30 * 24 * 60 * 60_000 + 3 * 60 * 60_000),
    host: "Stephanie Black",
    hostUserId: "u3",
    ownerUserId: "u3",
    team: "Broadcast Ops",
    pin: "6650",
    defaultOriginTimeZone: "America/Chicago",
    lines: [createDefaultLine(1)],
    notes: [],
    markers: [],
  },
];

function migrateStatus(s: any): SessionStatus {
  if (s === "expired" || s === "ended") return "completed";
  if (s === "live") return "active";
  if (["draft","scheduled","active","paused","completed","archived"].includes(s)) return s;
  return "completed";
}

export function getSessions(): SessionRecord[] {
  const stored = read<SessionRecord[] | null>(SESSIONS_KEY, null);
  if (!stored) {
    write(SESSIONS_KEY, seedSessions);
    return seedSessions;
  }
  return stored.map((s) => ({
    ...s,
    status: migrateStatus((s as any).status),
    ownerUserId: s.ownerUserId ?? s.hostUserId,
    viewers: s.viewers ?? [],
    changeLog: s.changeLog ?? [],
    ownershipRequests: s.ownershipRequests ?? [],

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
  updateSession(id, { status: "completed", endedAt, viewers: [] });
}

/**
 * Returns any active session the user owns OR is a viewer in.
 */
export function getActiveSessionForUser(userId: string): SessionRecord | undefined {
  return getSessions().find(
    (s) =>
      s.status === "active" &&
      ((s.ownerUserId ?? s.hostUserId) === userId ||
        (s.viewers ?? []).some((v) => v.userId === userId))
  );
}

export function joinSession(
  sessionId: string,
  user: { id: string; name: string }
) {
  const s = getSessionById(sessionId);
  if (!s) return;
  const viewers = s.viewers ?? [];
  if (viewers.some((v) => v.userId === user.id)) return;
  const isOwner = (s.ownerUserId ?? s.hostUserId) === user.id;
  viewers.push({
    userId: user.id,
    name: user.name,
    isOwner,
    joinedAt: new Date().toISOString(),
  });
  updateSession(sessionId, { viewers });
}

export function leaveSession(sessionId: string, userId: string) {
  const s = getSessionById(sessionId);
  if (!s) return;
  const viewers = (s.viewers ?? []).filter((v) => v.userId !== userId);
  // If owner left and others remain → clear owner to prompt transfer.
  const wasOwner = (s.ownerUserId ?? s.hostUserId) === userId;
  const patch: Partial<SessionRecord> = { viewers };
  if (wasOwner && viewers.length > 0) {
    patch.ownerUserId = undefined;
  }
  // If nobody left, keep session but empty.
  updateSession(sessionId, patch);
}

export function transferOwnership(sessionId: string, newOwnerId: string) {
  const s = getSessionById(sessionId);
  if (!s) return;
  const viewers = (s.viewers ?? []).map((v) => ({
    ...v,
    isOwner: v.userId === newOwnerId,
  }));
  const newOwner = viewers.find((v) => v.userId === newOwnerId);
  updateSession(sessionId, {
    viewers,
    ownerUserId: newOwnerId,
    hostUserId: newOwnerId,
    host: newOwner?.name ?? s.host,
  });
}

export function updateViewerFocus(
  sessionId: string,
  userId: string,
  focus: string
) {
  const s = getSessionById(sessionId);
  if (!s) return;
  const viewers = (s.viewers ?? []).map((v) =>
    v.userId === userId ? { ...v, focus } : v
  );
  updateSession(sessionId, { viewers });
}

export interface GroupedSessions {
  yourActive: SessionRecord | null;
  teamActive: SessionRecord[];
  drafts: SessionRecord[];
  completed: SessionRecord[];
  archived: SessionRecord[];
}

export function groupSessions(
  sessions: SessionRecord[],
  currentUserId: string
): GroupedSessions {
  const active = sessions.filter((s) => s.status === "active");
  const yourActive =
    active.find(
      (s) =>
        (s.ownerUserId ?? s.hostUserId) === currentUserId ||
        (s.viewers ?? []).some((v) => v.userId === currentUserId)
    ) ?? null;
  const teamActive = active.filter((s) => s.id !== yourActive?.id);
  const drafts = sessions.filter((s) => s.status === "draft");
  const completed = sessions
    .filter((s) => s.status === "completed" || s.status === "paused" || s.status === "scheduled")
    .sort(
      (a, b) =>
        new Date(b.endedAt ?? b.createdAt).getTime() -
        new Date(a.endedAt ?? a.createdAt).getTime()
    );
  const archived = sessions.filter((s) => s.status === "archived");
  return { yourActive, teamActive, drafts, completed, archived };
}

// ─── Permissions ───

export function isAdmin(_userId: string): boolean {
  // Role management stub — always false for now. Owner path is the working case.
  return false;
}

export function canConfigureSession(
  session: SessionRecord | undefined | null,
  userId: string
): boolean {
  if (!session) return false;
  if ((session.ownerUserId ?? session.hostUserId) === userId) return true;
  if ((session.viewers ?? []).some((v) => v.userId === userId && v.isCoOwner)) return true;
  return isAdmin(userId);
}

// ─── Ownership requests ───

export function requestOwnership(
  sessionId: string,
  user: { id: string; name: string },
  kind: OwnershipRequestKind
): SessionOwnershipRequest | undefined {
  const s = getSessionById(sessionId);
  if (!s) return;
  const existing = (s.ownershipRequests ?? []).find(
    (r) => r.userId === user.id && r.status === "pending"
  );
  if (existing) return existing;
  const req: SessionOwnershipRequest = {
    id: `or-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId: user.id,
    userName: user.name,
    kind,
    status: "pending",
    requestedAt: new Date().toISOString(),
  };
  updateSession(sessionId, {
    ownershipRequests: [...(s.ownershipRequests ?? []), req],
  });
  appendChangeLog(sessionId, {
    id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    at: req.requestedAt,
    userId: user.id,
    userName: user.name,
    kind: "ownership_requested",
    summary:
      kind === "full"
        ? `${user.name} requested full ownership`
        : `${user.name} requested co-ownership`,
  });
  return req;
}

export function resolveOwnershipRequest(
  sessionId: string,
  requestId: string,
  decision: "approve" | "deny",
  approver: { id: string; name: string }
) {
  const s = getSessionById(sessionId);
  if (!s) return;
  const requests = s.ownershipRequests ?? [];
  const req = requests.find((r) => r.id === requestId);
  if (!req || req.status !== "pending") return;
  const at = new Date().toISOString();
  const nextRequests = requests.map((r) =>
    r.id === requestId
      ? { ...r, status: decision === "approve" ? "approved" as const : "denied" as const, resolvedAt: at, resolvedBy: approver.name }
      : r
  );
  updateSession(sessionId, { ownershipRequests: nextRequests });

  if (decision === "deny") {
    appendChangeLog(sessionId, {
      id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      at,
      userId: approver.id,
      userName: approver.name,
      kind: "ownership_denied",
      summary: `Denied ${req.userName}'s ${req.kind === "full" ? "ownership" : "co-ownership"} request`,
    });
    return;
  }

  if (req.kind === "full") {
    transferOwnership(sessionId, req.userId);
    appendChangeLog(sessionId, {
      id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      at,
      userId: approver.id,
      userName: approver.name,
      kind: "ownership_granted",
      summary: `Transferred ownership to ${req.userName}`,
    });
  } else {
    // Co-ownership: mark viewer as co-owner
    const after = getSessionById(sessionId);
    const viewers = (after?.viewers ?? []).map((v) =>
      v.userId === req.userId ? { ...v, isCoOwner: true } : v
    );
    updateSession(sessionId, { viewers });
    appendChangeLog(sessionId, {
      id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      at,
      userId: approver.id,
      userName: approver.name,
      kind: "co_ownership_granted",
      summary: `Granted co-ownership to ${req.userName}`,
    });
  }
}

export function cancelOwnershipRequest(
  sessionId: string,
  requestId: string,
  actor: { id: string; name: string }
) {
  const s = getSessionById(sessionId);
  if (!s) return;
  const requests = s.ownershipRequests ?? [];
  const req = requests.find((r) => r.id === requestId);
  if (!req || req.status !== "pending") return;
  // Only requester can cancel their own request
  if (req.userId !== actor.id) return;
  const nextRequests = requests.filter((r) => r.id !== requestId);
  updateSession(sessionId, { ownershipRequests: nextRequests });
  appendChangeLog(sessionId, {
    id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    at: new Date().toISOString(),
    userId: actor.id,
    userName: actor.name,
    kind: "ownership_denied",
    summary: `${actor.name} cancelled their ${req.kind === "full" ? "ownership" : "co-ownership"} request`,
  });
}



// ─── Change log ───

function labelForLine(l: SrtLine | undefined, fallbackIdx?: number): string {
  if (!l) return `Source ${fallbackIdx ?? "?"}`;
  return /^Line \d+$/.test(l.label) ? `Source ${l.id}` : l.label;
}

export function appendChangeLog(sessionId: string, entry: SessionChangeEntry) {
  const s = getSessionById(sessionId);
  if (!s) return;
  const log = [...(s.changeLog ?? []), entry].slice(-200);
  updateSession(sessionId, { changeLog: log });
}

export function diffSessionConfig(
  prev: SessionRecord,
  next: Pick<
    SessionRecord,
    "name" | "purpose" | "scheduledEndAt" | "defaultOriginTimeZone" | "lines"
  >,
  actor: { id: string; name: string }
): SessionChangeEntry[] {
  const entries: SessionChangeEntry[] = [];
  const at = new Date().toISOString();
  const mk = (
    kind: SessionChangeKind,
    summary: string,
    extra: Partial<SessionChangeEntry> = {}
  ): SessionChangeEntry => ({
    id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at,
    userId: actor.id,
    userName: actor.name,
    kind,
    summary,
    ...extra,
  });

  if ((prev.name || "") !== (next.name || "")) {
    entries.push(
      mk(
        "session_renamed",
        `Renamed session from “${prev.name}” to “${next.name}”`,
        { before: prev.name, after: next.name }
      )
    );
  }
  if ((prev.purpose || "") !== (next.purpose || "")) {
    entries.push(
      mk("purpose_changed", `Changed purpose to “${next.purpose}”`, {
        before: prev.purpose as string,
        after: next.purpose as string,
      })
    );
  }
  if ((prev.scheduledEndAt || "") !== (next.scheduledEndAt || "")) {
    entries.push(
      mk("duration_changed", "Updated session duration", {
        before: prev.scheduledEndAt,
        after: next.scheduledEndAt,
      })
    );
  }
  if (prev.defaultOriginTimeZone !== next.defaultOriginTimeZone) {
    entries.push(
      mk(
        "timezone_changed",
        `Changed event time zone to ${next.defaultOriginTimeZone}`,
        { before: prev.defaultOriginTimeZone, after: next.defaultOriginTimeZone }
      )
    );
  }

  // Sources — key by line.id
  const prevById = new Map(prev.lines.map((l) => [l.id, l]));
  const nextById = new Map(next.lines.map((l) => [l.id, l]));

  for (const [id, nLine] of nextById) {
    const pLine = prevById.get(id);
    const wasActive = !!pLine?.enabled && !!pLine?.srtAddress?.trim();
    const isActive = !!nLine.enabled && !!nLine.srtAddress?.trim();
    const target = labelForLine(nLine);

    if (!wasActive && isActive) {
      entries.push(
        mk("source_added", `Added ${target}`, {
          target,
          after: nLine.srtAddress,
        })
      );
      continue;
    }
    if (wasActive && !isActive) {
      entries.push(
        mk("source_removed", `Removed ${labelForLine(pLine)}`, {
          target: labelForLine(pLine),
          before: pLine?.srtAddress,
        })
      );
      continue;
    }
    if (!pLine) continue;

    if (pLine.label !== nLine.label) {
      entries.push(
        mk(
          "source_renamed",
          `Renamed ${labelForLine(pLine)} to “${nLine.label}”`,
          { target, before: pLine.label, after: nLine.label }
        )
      );
    }
    if (pLine.srtAddress !== nLine.srtAddress && isActive) {
      entries.push(
        mk("source_address_changed", `Changed address for ${target}`, {
          target,
          before: pLine.srtAddress,
          after: nLine.srtAddress,
        })
      );
    }
    if ((pLine.notes || "") !== (nLine.notes || "") && isActive) {
      entries.push(
        mk("source_notes_changed", `Updated notes for ${target}`, {
          target,
          before: pLine.notes,
          after: nLine.notes,
        })
      );
    }
  }

  return entries;
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

// ─── Retention ───

export type RetentionDays = 30 | 90 | 365 | 0;

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

// ─── Duration formatting ───

export function formatDuration(startIso: string, endIso?: string): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const ms = Math.max(0, end - start);
  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours === 0) return `${remMins}m`;
  if (remMins === 0) return `${hours}h`;
  return `${hours}h ${remMins}m`;
}

export function generateSessionId(): string {
  return `sess-${Date.now().toString(36)}`;
}

export function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function formatStartedTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}
