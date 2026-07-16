// Mount once (AppLayout). Runs presence heartbeats for the current user's
// session and a global presence sweep so idle detection and idle expiry
// happen regardless of which page the user is on.

import { useEffect } from "react";
import {
  getCurrentUserRef,
  heartbeat,
  sweepPresence,
  readCurrentSession,
} from "@/lib/session-store";

const HEARTBEAT_MS = 25_000;
const SWEEP_MS = 15_000;

export function usePresenceLifecycle() {
  useEffect(() => {
    const doHeartbeat = () => {
      const s = readCurrentSession();
      if (!s) return;
      const me = getCurrentUserRef();
      const isParticipant = (s.viewers ?? []).some((v) => v.userId === me.id);
      if (!isParticipant) return;
      heartbeat(s.id, me.id);
    };
    // Beat immediately so freshly-loaded pages restore presence right away.
    doHeartbeat();
    sweepPresence();

    const beat = window.setInterval(doHeartbeat, HEARTBEAT_MS);
    const sweep = window.setInterval(() => sweepPresence(), SWEEP_MS);
    const onFocus = () => {
      doHeartbeat();
      sweepPresence();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(beat);
      window.clearInterval(sweep);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);
}
