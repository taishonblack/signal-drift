// Central Current-Session hook.
//
// Every page that needs to know "what session is the user currently
// working with?" reads from here. This is the single source of truth
// used by SessionRoom, Configure, Sessions, RecentSessionsPanel,
// OpsDashboard, and the sidebar.

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
}

export function useCurrentSession(pollMs: number = 2000): CurrentSessionState {
  const identity = useIdentity();
  const currentUser = getCurrentUserRef();
  const [session, setSession] = useState<SessionRecord | null>(
    () => getActiveSessionForUser(currentUser.id) ?? null,
  );

  useEffect(() => {
    const refresh = () => {
      const next = getActiveSessionForUser(currentUser.id) ?? null;
      setSession(next);
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

  return { session, isTemporary, currentUserId: currentUser.id };
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
