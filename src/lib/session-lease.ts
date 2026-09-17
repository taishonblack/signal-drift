// Phase D — client side of the server-authoritative presence lease.
//
// Each TAB/DEVICE is its own lease holder, identified by a per-tab instance id.
// That is what makes multi-tab safe: a closing tab merely stops renewing its own
// row, and the session stays alive as long as ANY holder is still renewing.
// A page refresh keeps the same tab id (sessionStorage), so refreshing never
// looks like abandonment.
//
// Human inactivity is NOT abandonment. An operator can watch a feed for an hour
// without touching the UI; this lease keeps renewing regardless.

import { supabase } from "@/integrations/supabase/client";

const INSTANCE_KEY = "mako.client_instance_id";

/** Renewal cadence: 3 renewals per 45s TTL, so two may fail before expiry. */
export const LEASE_RENEW_MS = 15_000;

/** Stable for the lifetime of this tab, preserved across reloads. */
export function getClientInstanceId(): string {
  try {
    const existing = sessionStorage.getItem(INSTANCE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(INSTANCE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Renew this tab's presence. Silent best-effort: expiry is the safety net. */
export async function renewSessionLease(sessionId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke("session-lease", {
      body: {
        action: "renew",
        session_id: sessionId,
        client_instance_id: getClientInstanceId(),
      },
    });
    if (error) return false;
    return Boolean((data as { renewed?: boolean } | null)?.renewed ?? true);
  } catch {
    return false;
  }
}

/**
 * Explicit End Session — authoritative and deliberate. Ends the session,
 * invalidates every holder (including other tabs), detaches attachments and
 * tears down every runtime caller. Never triggered by a tab merely closing.
 */
export async function releaseSessionRemote(
  sessionId: string,
  reason: "owner_ended" | "scheduled_end" = "owner_ended",
): Promise<{ ok: boolean; retained: number }> {
  try {
    const { data, error } = await supabase.functions.invoke("session-lease", {
      body: { action: "end", session_id: sessionId, reason },
    });
    if (error) return { ok: false, retained: 0 };
    const body = (data ?? {}) as { ok?: boolean; retained?: number };
    return { ok: Boolean(body.ok), retained: body.retained ?? 0 };
  } catch {
    return { ok: false, retained: 0 };
  }
}

export type EndpointAvailability = {
  available: boolean;
  /** Privacy-safe: never the other session's name, owner or identity. */
  reason: "available" | "in_use" | "unknown";
};

/**
 * Privacy-safe availability hint for Create Session. Advisory only — the real
 * guarantee is the server-enforced check inside provisioning, so two operators
 * clicking Start Monitoring at once cannot both win.
 */
export async function checkEndpointAvailability(
  host: string,
  port: number,
): Promise<EndpointAvailability> {
  try {
    const { data, error } = await supabase.rpc("check_endpoint_availability", {
      _host: host,
      _port: port,
    });
    if (error) return { available: true, reason: "unknown" };
    // The RPC returns a plain boolean and deliberately reveals nothing about
    // the occupying session.
    return data === false
      ? { available: false, reason: "in_use" }
      : { available: true, reason: "available" };
  } catch {
    return { available: true, reason: "unknown" };
  }
}
