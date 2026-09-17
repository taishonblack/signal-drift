// Phase D — the ONE runtime-route release implementation.
//
// Every path that gives a caller back (explicit End Session, scheduled end,
// lease expiry, reconciliation) runs through here, so teardown behaviour can
// never diverge between them.
//
// Invariants:
//   - Attachments are detached before any route can be archived
//     (session_sources.runtime_route_id is ON DELETE RESTRICT). That happens
//     transactionally inside begin_session_release, before we touch the network.
//   - A route is archived (and its endpoint freed) ONLY after upstream teardown
//     is CONFIRMED. Unconfirmed teardown retains the row, its identity, attempt
//     count and error — and therefore keeps the endpoint occupied.
//   - Nothing here ever creates infrastructure. Recovery is lookup-only.
//   - Every operation is idempotent, so reconciliation may run repeatedly.

export type ReleaseRoute = {
  route_id: string;
  owner_id: string;
  slot?: number;
  infrastructure_source_id: string | null;
  lifecycle_status: string;
};

export type CallerLookup = {
  ok: boolean;
  status?: number;
  source?: { source_id: string; state?: string | null } | undefined;
};

export type ReleaseDeps = {
  /** Transactional steps 1-4: presence, status, detach, flag routes. */
  beginRelease: (
    sessionId: string,
    reason: string,
  ) => Promise<{ ok: boolean; routes: ReleaseRoute[]; error?: string }>;
  /** Recover an infrastructure identity by idempotency key (= route id). */
  lookupCaller: (idempotencyKey: string) => Promise<CallerLookup>;
  deleteCaller: (sourceId: string) => Promise<{ ok: boolean; error?: string }>;
  archiveRoute: (
    ownerId: string,
    routeId: string,
    finalStatus: "torn_down" | "error",
  ) => Promise<boolean>;
  recordTeardownFailure: (
    ownerId: string,
    routeId: string,
    error: string,
  ) => Promise<void>;
  logError: (message: string) => void;
};

export type ReleaseSummary = {
  /** Routes confirmed gone upstream and archived — endpoint freed. */
  released: number;
  /** Routes whose teardown could not be confirmed — endpoint still occupied. */
  retained: number;
};

/**
 * Release ONE route. Safe to call repeatedly for the same route.
 *
 * A route with no infrastructure identity never reached upstream successfully,
 * but a lost create response means we cannot assume that — so we always look it
 * up by its idempotency key (which is the route id) before concluding.
 */
export async function releaseRoute(
  route: ReleaseRoute,
  deps: ReleaseDeps,
): Promise<"released" | "retained"> {
  let sourceId = route.infrastructure_source_id;

  if (!sourceId) {
    const recovered = await deps.lookupCaller(route.route_id);
    if (recovered.ok && recovered.source?.source_id) {
      if (recovered.source.state === "tombstoned") {
        // Upstream confirms the caller is already gone.
        const archived = await deps.archiveRoute(route.owner_id, route.route_id, "torn_down");
        if (archived) return "released";
        await deps.recordTeardownFailure(route.owner_id, route.route_id, "archive_failed");
        return "retained";
      }
      sourceId = recovered.source.source_id;
    } else if (recovered.status === 404) {
      // Upstream has no record of this key at all: nothing was ever created.
      const archived = await deps.archiveRoute(route.owner_id, route.route_id, "torn_down");
      if (archived) return "released";
      await deps.recordTeardownFailure(route.owner_id, route.route_id, "archive_failed");
      return "retained";
    } else {
      // Upstream unreachable / ambiguous: keep the row AND the endpoint.
      deps.logError(`release: cannot resolve infrastructure for route ${route.route_id}`);
      await deps.recordTeardownFailure(route.owner_id, route.route_id, "identity_unresolved");
      return "retained";
    }
  }

  const deleted = await deps.deleteCaller(sourceId!);
  if (!deleted.ok) {
    deps.logError(`release: teardown unconfirmed for route ${route.route_id}`);
    await deps.recordTeardownFailure(
      route.owner_id,
      route.route_id,
      deleted.error || "teardown_failed",
    );
    return "retained";
  }

  const archived = await deps.archiveRoute(route.owner_id, route.route_id, "torn_down");
  if (archived) return "released";
  await deps.recordTeardownFailure(route.owner_id, route.route_id, "archive_failed");
  return "retained";
}

/** Release a set of already-flagged routes (reconciliation path). */
export async function releaseRoutes(
  routes: ReleaseRoute[],
  deps: ReleaseDeps,
): Promise<ReleaseSummary> {
  let released = 0;
  let retained = 0;
  for (const route of routes) {
    const outcome = await releaseRoute(route, deps);
    if (outcome === "released") released += 1;
    else retained += 1;
  }
  return { released, retained };
}

/**
 * Release a whole session: end it, detach its sources, then give every caller
 * back. Used by explicit End Session, scheduled end and lease expiry alike —
 * only the `reason` differs.
 */
export async function releaseSession(
  sessionId: string,
  reason: string,
  deps: ReleaseDeps,
): Promise<{ ok: boolean; error?: string } & Partial<ReleaseSummary>> {
  const begun = await deps.beginRelease(sessionId, reason);
  if (!begun.ok) return { ok: false, error: begun.error || "release_failed" };
  const summary = await releaseRoutes(begun.routes, deps);
  return { ok: true, ...summary };
}
