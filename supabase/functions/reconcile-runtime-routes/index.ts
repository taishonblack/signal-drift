// Phase D — server-side lifecycle enforcement. Service-role only, invoked by
// two separate schedules with two separate responsibilities:
//
//   mode "lease_expiry"  (every minute)
//     Sessions whose EVERY client presence row has expired are released.
//     Combined with the 45s TTL this cleans a disappeared browser up roughly
//     45-105s after its last renewal. A session that never took a lease
//     (legacy / pre-Phase D) is never touched.
//
//   mode "reconcile"     (every 15 minutes)
//     Only uncertainty: routes flagged for teardown that never confirmed,
//     routes stuck in tearing_down, and error routes whose infrastructure may
//     still exist. Idempotent, and it NEVER creates replacement infrastructure.
//
// Endpoint occupancy is deliberately retained for every route this pass cannot
// confirm as gone.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { makoUpstream } from "../_shared/mako-upstream.ts";
import {
  releaseRoutes,
  releaseSession,
  type ReleaseDeps,
  type ReleaseRoute,
} from "../_shared/route-release.ts";

const MAX_SESSIONS_PER_PASS = 50;
const MAX_ROUTES_PER_PASS = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Scheduler-only. This endpoint can tear infrastructure down, so it accepts
  // nothing but the service role credential — never a user JWT.
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer || bearer !== serviceKey) return json({ error: "unauthorized" }, 401);

  const apiBase = Deno.env.get("MAKO_API_BASE_URL");
  const apiToken = Deno.env.get("MAKO_API_TOKEN");
  if (!apiBase || !apiToken) {
    console.error("reconcile-runtime-routes: MAKO API not configured");
    return json({ error: "service_unavailable" }, 503);
  }

  const body = (await req.json().catch(() => ({}))) as { mode?: string };
  const mode = body.mode === "reconcile" ? "reconcile" : "lease_expiry";

  const service = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const upstream = makoUpstream({ apiBase, apiToken });
  const deps = buildDeps(service, upstream);

  if (mode === "lease_expiry") {
    const { data, error } = await service.rpc("sessions_with_expired_leases", {
      _limit: MAX_SESSIONS_PER_PASS,
    });
    if (error) {
      console.error(`reconcile: lease scan failed — ${error.message}`);
      return json({ error: "scan_failed" }, 500);
    }
    const sessions = (data as { session_id: string }[] | null) ?? [];
    let released = 0;
    let retained = 0;
    for (const row of sessions) {
      const outcome = await releaseSession(row.session_id, "lease_expired", deps);
      released += outcome.released ?? 0;
      retained += outcome.retained ?? 0;
    }
    return json({ mode, sessions: sessions.length, released, retained });
  }

  // mode === "reconcile": uncertainty only.
  const { data, error } = await service
    .from("session_runtime_routes")
    .select("id, owner_id, slot, infrastructure_source_id, lifecycle_status, teardown_requested_at")
    .or("lifecycle_status.eq.tearing_down,lifecycle_status.eq.error")
    .not("teardown_requested_at", "is", null)
    .is("teardown_completed_at", null)
    .order("teardown_requested_at", { ascending: true })
    .limit(MAX_ROUTES_PER_PASS);
  if (error) {
    console.error(`reconcile: route scan failed — ${error.message}`);
    return json({ error: "scan_failed" }, 500);
  }

  const routes: ReleaseRoute[] = (data ?? []).map((r) => ({
    route_id: r.id as string,
    owner_id: r.owner_id as string,
    slot: r.slot as number,
    infrastructure_source_id: (r.infrastructure_source_id as string | null) ?? null,
    lifecycle_status: r.lifecycle_status as string,
  }));

  const summary = await releaseRoutes(routes, deps);
  return json({ mode, routes: routes.length, ...summary });
});

function buildDeps(
  service: ReturnType<typeof createClient>,
  upstream: ReturnType<typeof makoUpstream>,
): ReleaseDeps {
  return {
    beginRelease: async (sessionId, reason) => {
      const { data, error } = await service.rpc("begin_session_release", {
        _session_id: sessionId,
        _reason: reason,
      });
      if (error) {
        console.error(`reconcile: begin_session_release failed — ${error.message}`);
        return { ok: false, routes: [], error: "release_failed" };
      }
      return { ok: true, routes: (data as { routes?: ReleaseRoute[] } | null)?.routes ?? [] };
    },
    lookupCaller: (key) => upstream.lookupCaller(key),
    deleteCaller: (sourceId) => upstream.deleteCaller(sourceId),
    archiveRoute: async (ownerId, routeId, finalStatus) => {
      const { error } = await service.rpc("archive_session_runtime_route", {
        _owner: ownerId,
        _route_id: routeId,
        _final_status: finalStatus,
      });
      if (error) console.error(`reconcile: archive failed — ${error.message}`);
      return !error;
    },
    recordTeardownFailure: async (ownerId, routeId, reason) => {
      await service.rpc("record_runtime_route_teardown_failure", {
        _owner: ownerId,
        _route_id: routeId,
        _error: reason,
      });
    },
    logError: (message) => console.error(message),
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
