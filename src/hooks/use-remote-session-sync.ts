// One-shot member hydration + periodic refresh. Mount once (AppLayout).
//
// Guests are a no-op. Members trigger `hydrateMemberSessions` on sign-in
// and every few minutes while the tab is open.

import { useEffect } from "react";
import { useIdentity } from "@/lib/identity";
import { hydrateMemberSessions } from "@/lib/sessions-remote";

const REFRESH_MS = 3 * 60_000;

export function useRemoteSessionSync() {
  const identity = useIdentity();
  const isMember = identity.kind === "member";

  useEffect(() => {
    if (!isMember) return;
    let cancelled = false;
    const run = () => {
      hydrateMemberSessions().catch(() => {
        /* soft-fail: local store keeps working */
      });
    };
    run();
    const id = window.setInterval(() => {
      if (!cancelled) run();
    }, REFRESH_MS);
    const onFocus = () => run();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [isMember, identity.id]);
}
