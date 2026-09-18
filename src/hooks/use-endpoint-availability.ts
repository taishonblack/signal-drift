import { useEffect, useRef, useState } from "react";
import { checkEndpointAvailability } from "@/lib/session-lease";
import type { ReservationState } from "@/lib/diagnostics/signal-diagnostic";

/**
 * Configuration-UX cadence, not telemetry: the server-authoritative endpoint
 * availability hint only needs to stay fresh while the engineer is entering
 * an address.
 */
export const ENDPOINT_REVALIDATE_MS = 5_000;
const ENDPOINT_DEBOUNCE_MS = 500;

export function isValidEndpoint(host: string, port: string): boolean {
  const portNum = Number(port);
  return Boolean(host.trim()) && Number.isFinite(portNum) && portNum >= 1 && portNum <= 65535;
}

/**
 * Advisory endpoint-occupancy hint for the Create/Configure screen.
 *
 * The server remains authoritative: this hook only keeps the existing
 * check_endpoint_availability result fresh. It checks on a debounce when
 * host/port changes, revalidates every ENDPOINT_REVALIDATE_MS while the
 * endpoint is valid, and revalidates again when the tab regains focus or
 * becomes visible — so a stale "In use" clears itself once the occupying
 * route is archived, and a newly reserved endpoint surfaces without the
 * engineer retyping anything.
 *
 * Truthfulness rules:
 * - Only reason === "in_use" shows the warning. RPC/network failures
 *   ("unknown") leave the previous state untouched and never become "in use".
 * - A response from an older host/port can never overwrite a newer one:
 *   each in-flight check captures the current request id and endpoint, and
 *   its result is applied only if both still match.
 */
export function useEndpointReservation(host: string, port: string): ReservationState {
  const [state, setState] = useState<ReservationState>("not_checked");
  const setBusy = (busy: boolean) => setState(busy ? "in_use" : "available");
  const requestSeq = useRef(0);
  const endpointRef = useRef({ host, port });
  endpointRef.current = { host, port };

  useEffect(() => {
    const current = { host: host.trim(), port };
    setBusy(false);

    if (!isValidEndpoint(host, port)) return;
    const portNum = Number(current.port);

    const runCheck = () => {
      const id = ++requestSeq.current;
      const endpointAtRequest = { ...current };
      void checkEndpointAvailability(endpointAtRequest.host, portNum).then((result) => {
        const latest = endpointRef.current;
        const endpointUnchanged =
          latest.host.trim() === endpointAtRequest.host && latest.port === endpointAtRequest.port;
        if (id !== requestSeq.current || !endpointUnchanged) return;
        // Honest errors: only an explicit server "in_use" sets the warning;
        // "unknown"/"available" never do, and unknown leaves prior state alone.
        if (result.reason === "in_use") setBusy(true);
        else if (result.reason === "available") setBusy(false);
      });
    };

    const debounce = window.setTimeout(runCheck, ENDPOINT_DEBOUNCE_MS);
    const interval = window.setInterval(runCheck, ENDPOINT_REVALIDATE_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") runCheck();
    };
    const onFocus = () => runCheck();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      // Invalidate any in-flight result for this endpoint.
      requestSeq.current += 1;
      window.clearTimeout(debounce);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [host, port]);

  return state;
}

/**
 * Backwards-compatible boolean form: true only when the server explicitly
 * reports the endpoint as reserved by another MAKO runtime route.
 */
export function useEndpointAvailability(host: string, port: string): boolean {
  return useEndpointReservation(host, port) === "in_use";
}
