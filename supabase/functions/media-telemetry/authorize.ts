/**
 * Phase E.2B — server-side authorization for a media telemetry read.
 *
 * The canonical input is the runtime route id. Knowing a `src_xxxxxx` grants
 * nothing, and no UI-level gating is trusted. Access is granted only to:
 *   - the session owner (this includes an anonymous Temporary Operator, whose
 *     guest identity owns the temporary session), or
 *   - a non-revoked `shared_session_access` grant for that session.
 */

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SOURCE_ID_RE = /^src_[a-f0-9]{6}$/;

export interface RuntimeRouteRow {
  id: string;
  session_id: string;
  owner_id: string;
  slot: number;
  infrastructure_source_id: string | null;
  playback_path: string | null;
  lifecycle_status: string;
}

export interface RouteReader {
  /** Service-role read of the runtime route. */
  getRoute(routeId: string): Promise<RuntimeRouteRow | null>;
  /** True when the user holds a non-revoked share grant for the session. */
  hasSharedAccess(sessionId: string, userId: string): Promise<boolean>;
}

export type AuthorizeResult =
  | { ok: true; route: RuntimeRouteRow; sourceId: string }
  | { ok: false; status: number; error: "unauthorized" | "not_found" | "telemetry_unavailable" };

export async function authorizeRouteTelemetry(
  reader: RouteReader,
  userId: string | null,
  routeId: string,
): Promise<AuthorizeResult> {
  if (!userId) return { ok: false, status: 401, error: "unauthorized" };
  if (!UUID_RE.test(routeId)) return { ok: false, status: 404, error: "not_found" };

  const route = await reader.getRoute(routeId);
  // An unknown route and a route the caller may not see are indistinguishable.
  if (!route) return { ok: false, status: 404, error: "not_found" };

  if (route.owner_id !== userId) {
    const shared = await reader.hasSharedAccess(route.session_id, userId);
    if (!shared) return { ok: false, status: 404, error: "not_found" };
  }

  const sourceId = route.infrastructure_source_id;
  // Not ready yet: there is nothing to probe. This is not a fault.
  if (!sourceId || !SOURCE_ID_RE.test(sourceId) || !route.playback_path) {
    return { ok: false, status: 200, error: "telemetry_unavailable" };
  }

  return { ok: true, route, sourceId };
}
