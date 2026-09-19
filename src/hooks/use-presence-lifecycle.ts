// Mount once (AppLayout).
//
// Two independent things happen here:
//
//  1. Local viewer presence (heartbeat/sweep) — DISPLAY ONLY. It drives "who is
//     watching" chips. It no longer decides anything about infrastructure.
//
//  2. Phase D server lease renewal — AUTHORITATIVE. While this tab has an
//     active session open, it renews its own per-tab lease every ~15s against a
//     45s TTL. Stopping renewal (tab closed, browser killed, machine asleep) is
//     the ONLY abandonment signal; the server tears the caller down when every
//     holder for the session has expired. Human inactivity is irrelevant here.

import { useEffect } from "react";
import {
  getCurrentUserRef,
  heartbeat,
  sweepPresence,
} from "@/lib/session-store";
import { readCurrentSession } from "@/hooks/use-current-session";
import { LEASE_RENEW_MS, renewSessionLease } from "@/lib/session-lease";
import { supabase } from "@/integrations/supabase/client";

const HEARTBEAT_MS = 25_000;
const SWEEP_MS = 15_000;

export function usePresenceLifecycle() {
  // Server lease: one renewing holder per tab, for as long as this tab has an
  // active session. Never gated on user interaction.
  useEffect(() => {
    let cancelled = false;
    // Sessions the server has declared over: never renewed again.
    const terminal = new Set<string>();
    const renew = async () => {
      const s = readCurrentSession();
      if (!s || s.status !== "active" || terminal.has(s.id)) return;
      const { data } = await supabase.auth.getSession();
      if (!data?.session || cancelled) return; // no verified user, no lease
      const result = await renewSessionLease(s.id);
      if (!result.renewed && result.reason === "session_terminal") {
        terminal.add(s.id);
      }
    };
    void renew();
    const timer = window.setInterval(() => void renew(), LEASE_RENEW_MS);
    // Waking from sleep or refocusing renews immediately rather than waiting.
    const onWake = () => void renew();
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, []);

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
