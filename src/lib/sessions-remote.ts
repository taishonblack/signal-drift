// Frontend sync layer for signed-in members.
//
// Guests remain 100% client-side (sessionStorage). Members write through
// to the backend via three edge functions and one direct SELECT during
// hydration. The local session-store stays the UI source of truth — this
// layer only mirrors it in the background.

import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { attachmentIntents } from "@/lib/session-attachments";
import {
  addSession,
  getSessionById,
  getSessions,
  updateSession,
  type SessionRecord,
} from "@/lib/session-store";

// Which SessionRecord fields are represented as their own columns in the
// `sessions` table (everything else is stuffed into `payload`).
const TOP_LEVEL_KEYS = ["id", "name", "status", "pin"] as const;

// Runtime-only fields. Attachments live in public.session_sources and are
// derived there — they must never be round-tripped through the payload.
const RUNTIME_ONLY_KEYS = ["attachments", "attachmentsLoaded"] as const;

/** Split a SessionRecord into the shape save-session expects. */
function toRemote(session: SessionRecord) {
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(session)) {
    if ((TOP_LEVEL_KEYS as readonly string[]).includes(k)) continue;
    if ((RUNTIME_ONLY_KEYS as readonly string[]).includes(k)) continue;
    payload[k] = v;
  }
  return {
    id: session.id,
    name: session.name,
    status: session.status,
    pin: session.pin,
    payload,
  };
}

/**
 * Rebuild a SessionRecord from a `sessions` row. The payload holds
 * everything the client stamped, minus the PIN (server keeps the hash
 * only). We inject a placeholder PIN so UI that renders "***" works.
 */
export function fromRemote(row: {
  id: string;
  name: string;
  status: string;
  payload: unknown;
}): SessionRecord {
  const payload = (row.payload && typeof row.payload === "object"
    ? (row.payload as Record<string, unknown>)
    : {}) as Partial<SessionRecord>;
  return {
    // sensible fallbacks so the record is always well-formed
    createdAt: new Date().toISOString(),
    host: "",
    hostUserId: "",
    defaultOriginTimeZone: "UTC",
    lines: [],
    notes: [],
    markers: [],
    ...payload,
    id: row.id,
    name: row.name,
    status: row.status as SessionRecord["status"],
    pin: (payload.pin as string) ?? "••••",
  };
}

/** Load one session through its normal RLS-protected row access. */
export async function loadAuthorizedSession(sessionId: string): Promise<SessionRecord | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, name, status, payload")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRemote(data) : null;
}

// ─── Edge function wrappers ──────────────────────────────────────────

/**
 * Persist an owner's session upstream. Member-only.
 *
 * The session row and the complete intended persistent-source attachment set
 * are written in ONE database transaction by save-session, so a session can
 * never end up with a half-applied source configuration. Only slot +
 * ingest_source_id (+ optional session label) are sent: ownership and the
 * playback path are derived server-side from the owner's own sources.
 */
export async function saveSessionRemote(session: SessionRecord): Promise<void> {
  const { data, error } = await supabase.functions.invoke("save-session", {
    body: {
      session: toRemote(session),
      attachments: attachmentIntents(session.lines ?? []),
    },
  });
  if (error) {
    const details =
      error instanceof FunctionsHttpError ? await error.context.text() : error.message;
    throw new Error(details || "save-session failed");
  }
  if (data?.error) throw new Error(String(data.error));
}

/** One caller-backed slot: MAKO dials this external SRT listener. */
export interface RuntimeSlotIntent {
  slot: number;
  name: string;
  host: string;
  port: number;
}

export interface ProvisionSessionResult {
  routes: { slot: number; route_id: string; playback_path: string }[];
}

const PROVISION_MESSAGES: Record<string, string> = {
  endpoint_conflict:
    "This slot is already connected to a different address and port. End the session or use a new session to change it.",
  route_tearing_down: "This slot is still being released. Try again in a moment.",
  route_tombstoned:
    "That connection was permanently removed. Start a new session to monitor this feed.",
  provisioning_failed: "MAKO could not connect to that SRT listener. Check the address and port.",
  route_persist_failed: "MAKO could not save the connection. Nothing was left running.",
  save_failed: "MAKO could not save the session.",
  unauthorized: "Please sign in again.",
  service_unavailable: "Monitoring infrastructure is unavailable right now.",
};

/**
 * Phase C — caller-first provisioning. AWAITED on purpose: MAKO provisions a
 * caller to every enabled external listener, persists the trusted runtime
 * identities, attaches them to the session and activates it. The browser may
 * only enter the Session Room after this resolves successfully.
 */
export async function provisionSessionRemote(
  session: SessionRecord,
  slots: RuntimeSlotIntent[],
): Promise<ProvisionSessionResult> {
  const { data, error } = await supabase.functions.invoke("provision-session", {
    body: {
      session: toRemote(session),
      slots,
      library_attachments: attachmentIntents(session.lines ?? []),
    },
  });

  let payload: Record<string, unknown> | null =
    data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (error) {
    if (error instanceof FunctionsHttpError) {
      payload = await error.context.json().catch(() => null);
    }
    if (!payload?.error) throw new Error(error.message || "provision-session failed");
  }
  const code = payload?.error ? String(payload.error) : null;
  if (code) throw new Error(PROVISION_MESSAGES[code] ?? code);

  return {
    routes: (payload?.routes as ProvisionSessionResult["routes"]) ?? [],
  };
}

/**
 * Mirror a locally-ended session upstream so the server stamps
 * `session_sources.detached_at` for its attachments. Best-effort and silent:
 * the local end is authoritative for the UI. The persistent sources themselves
 * are never touched — only the attachment rows are released.
 */
export function syncEndedSessionRemote(sessionId: string): void {
  void (async () => {
    try {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) return; // guest sessions are purely local
      const record = getSessionById(sessionId);
      if (!record) return;
      await saveSessionRemote(record);
    } catch {
      // Non-fatal: reconciliation happens on the next successful save.
    }
  })();
}

/**
 * Owner-side revoke: mark a viewer's shared_session_access row revoked.
 * RLS restricts this to the session owner (see policy
 * "Owner updates shares for own sessions").
 */
export async function revokeViewerAccess(
  sessionId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("shared_session_access")
    .update({ revoked_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .eq("user_id", userId);
  if (error) throw error;
}

export interface JoinRemoteResult {
  ok: true;
  session: {
    id: string;
    name: string;
    status: string;
    owner_name: string;
    viewer_count: number;
    source_count: number;
  };
  granted: boolean;
}

/**
 * Server-validate a session PIN and (if the caller is signed in) get a
 * persistent shared_session_access record back.
 */
export async function joinSessionRemote(
  sessionId: string,
  pin: string,
): Promise<JoinRemoteResult> {
  const { data, error } = await supabase.functions.invoke("join-session", {
    body: { session_id: sessionId, pin },
  });
  if (error) throw error;
  if (!data || data.error) {
    const message =
      data?.error === "invalid_credentials"
        ? "That Session ID and PIN don't match."
        : data?.error === "not_found"
          ? "No session with that ID."
          : data?.error === "session_ended"
            ? "That session has already ended."
            : (data?.error as string) || "Could not join session.";
    throw new Error(message);
  }
  return data as JoinRemoteResult;
}

// ─── Hydration ───────────────────────────────────────────────────────

/**
 * Pull every session the current member owns or has access to and merge
 * them into the local store. Called once at sign-in and on demand.
 */
export async function hydrateMemberSessions(): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) return;

  // Grants first, then the sessions themselves.
  const { data: grants, error: grantsErr } = await supabase
    .from("shared_session_access")
    .select("session_id, role, revoked_at")
    .eq("user_id", user.id)
    .is("revoked_at", null);
  if (grantsErr || !grants || grants.length === 0) return;

  const ids = grants.map((g) => g.session_id);
  const { data: rows, error: rowsErr } = await supabase
    .from("sessions")
    .select("id, name, status, payload")
    .in("id", ids);
  if (rowsErr || !rows) return;

  const existing = new Map(getSessions().map((s) => [s.id, s]));
  const TERMINAL = new Set(["completed", "archived"]);
  for (const row of rows) {
    const record = fromRemote(row);
    const prior = existing.get(row.id);
    if (prior) {
      // Never resurrect a locally-ended session. If the local copy is
      // terminal (completed/archived) or already carries an endedAt,
      // preserve that status/endedAt regardless of what the remote row
      // still reports — the End Session write is authoritative for this
      // client and remote may not yet have caught up.
      const localTerminal = TERMINAL.has(prior.status) || !!prior.endedAt;
      const merged: SessionRecord = { ...prior, ...record };
      if (localTerminal) {
        merged.status = prior.status;
        merged.endedAt = prior.endedAt ?? merged.endedAt;
        merged.endReason = prior.endReason ?? merged.endReason;
      }
      updateSession(row.id, merged);
    } else {
      addSession(record);
    }
  }
}

/**
 * Convenience for JoinSession — after a successful remote join, stamp a
 * skeleton record into local storage so the SessionRoom has something to
 * render immediately; hydration will fill in the rest.
 */
export function upsertLocalStub(
  summary: JoinRemoteResult["session"],
  self: { id: string; name: string },
): void {
  if (getSessionById(summary.id)) return;
  addSession({
    id: summary.id,
    name: summary.name,
    status: summary.status as SessionRecord["status"],
    createdAt: new Date().toISOString(),
    host: summary.owner_name,
    hostUserId: "",
    ownerUserId: "",
    defaultOriginTimeZone: "UTC",
    lines: [],
    pin: "••••",
    notes: [],
    markers: [],
    viewers: [
      {
        userId: self.id,
        name: self.name,
        isOwner: false,
        joinedAt: new Date().toISOString(),
      },
    ],
  });
}
