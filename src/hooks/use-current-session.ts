// Central Current-Session hook.
//
// Every page that needs to know "what session is the user currently
// working with?" reads from here. Single source of truth used by
// SessionRoom, Configure, Sessions, RecentSessionsPanel, OpsDashboard,
// and the sidebar/return bar.

import { useEffect, useState } from "react";
import {
  getSessions,
  getActiveSessionForUser,
  getCurrentUserRef,
  type SessionRecord,
} from "@/lib/session-store";
import { useIdentity } from "@/lib/identity";

export interface CurrentSessionState {
  session: SessionRecord | null;
  isTemporary: boolean;
  currentUserId: string;
  /** True when the session is active but has no fresh viewers (idle grace). */
  isIdle: boolean;
  /** Epoch ms when idle grace expires (session auto-ends), or null. */
  idleDeadline: number | null;
  /** Milliseconds since session start, updated on each poll tick. */
  uptimeMs: number;
  /** Milliseconds remaining until idle auto-end, or null when not idle. */
  msUntilIdleEnd: number | null;
}

export function useCurrentSession(pollMs: number = 2000): CurrentSessionState {
  const identity = useIdentity();
  const currentUser = getCurrentUserRef();
  const [session, setSession] = useState<SessionRecord | null>(
    () => getActiveSessionForUser(currentUser.id) ?? null,
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const refresh = () => {
      const next = getActiveSessionForUser(currentUser.id) ?? null;
      setSession(next);
      setTick((t) => t + 1);
    };
    refresh();
    const id = window.setInterval(refresh, pollMs);
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, [currentUser.id, pollMs]);

  const isTemporary =
    identity.kind !== "member" || !!session?.guestOwned;

  const idleDeadline = session?.idleDeadline ?? null;
  const isIdle = !!session && !!idleDeadline;
  const now = Date.now();
  const uptimeMs = session
    ? Math.max(0, now - new Date(session.createdAt).getTime())
    : 0;
  const msUntilIdleEnd = idleDeadline
    ? Math.max(0, idleDeadline - now)
    : null;

  // reference tick so re-render occurs on interval even when session ref stable
  void tick;

  return {
    session,
    isTemporary,
    currentUserId: currentUser.id,
    isIdle,
    idleDeadline,
    uptimeMs,
    msUntilIdleEnd,
  };
}

/** Non-reactive read for one-off callers. */
export function readCurrentSession(): SessionRecord | null {
  const { id } = getCurrentUserRef();
  return getActiveSessionForUser(id) ?? null;
}

/** Convenience wrapper if you also want the full session list. */
export function readAllSessions(): SessionRecord[] {
  return getSessions();
}
