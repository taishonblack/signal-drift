// Phase D — server-authoritative session presence.
//
// PRESENCE, NOT HUMAN ACTIVITY, decides whether a caller lives. An operator
// watching a feed without touching anything is a working operator; the only
// abandonment signal is the absence of a renewing client.
//
// Actions:
//   renew — one client instance renews its own presence row (45s TTL).
//           Called ~every 15s while a Session Room is open. Non-destructive:
//           a closing tab simply STOPS renewing. It can never release a
//           session that another tab or device is still renewing.
//   end   — explicit owner End Session. Authoritative: it ends the session even
//           if other tabs are open, invalidates all presence, detaches sources
//           and tears down every caller.
//
// Identity chain: browser JWT -> auth.getUser() -> verified user.id -> RPC.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { makoUpstream } from "../_shared/mako-upstream.ts";
import { releaseSession, type ReleaseDeps, type ReleaseRoute } from "../_shared/route-release.ts";

const Body = z
  .object({
    action: z.enum(["renew", "end"]),
    session_id: z.string().min(1).max(64),
    client_instance_id: z.string().uuid().optional(),
    reason: z.enum(["owner_ended", "scheduled_end"]).optional(),
  })
  .strict();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authz = req.headers.get("Authorization") ?? "";
  if (!authz.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authz } },
  });
  const { data: me, error: meErr } = await userClient.auth.getUser();
  if (meErr || !me?.user) return json({ error: "unauthorized" }, 401);
  const ownerId = me.user.id;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "invalid_body" }, 400);
  const { action, session_id, client_instance_id, reason } = parsed.data;

  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Ownership is verified for both actions. Only an owner's clients hold a
  // lease, and only an owner may end a session.
  const { data: session } = await service
    .from("sessions")
    .select("owner_id, status")
    .eq("id", session_id)
    .maybeSingle();
  if (!session) return json({ error: "session_not_found" }, 404);
  if (session.owner_id !== ownerId) return json({ error: "forbidden" }, 403);

  if (action === "renew") {
    if (!client_instance_id) return json({ error: "client_instance_required" }, 400);
    const { data, error } = await service.rpc("renew_session_lease", {
      _owner: ownerId,
      _session_id: session_id,
      _client_instance_id: client_instance_id,
    });
    if (error) {
      console.error(`session-lease: renew failed — ${error.message}`);
      return json({ error: "renew_failed" }, 500);
    }
    return json(data ?? { renewed: false });
  }

  // action === "end" — explicit, authoritative.
  const apiBase = Deno.env.get("MAKO_API_BASE_URL");
  const apiToken = Deno.env.get("MAKO_API_TOKEN");
  if (!apiBase || !apiToken) {
    console.error("session-lease: MAKO API not configured");
    return json({ error: "service_unavailable" }, 503);
  }

  const deps = releaseDeps(service, makoUpstream({ apiBase, apiToken }));
  const outcome = await releaseSession(session_id, reason ?? "owner_ended", deps);
  if (!outcome.ok) return json({ error: outcome.error ?? "release_failed" }, 500);
  return json({
    ok: true,
    released: outcome.released ?? 0,
    retained: outcome.retained ?? 0,
  });
});

/** Wire the pure release module to the database and upstream. */
export function releaseDeps(
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
        console.error(`release: begin failed — ${error.message}`);
        return { ok: false, routes: [], error: "release_failed" };
      }
      const routes = (data as { routes?: ReleaseRoute[] } | null)?.routes ?? [];
      return { ok: true, routes };
    },
    lookupCaller: (key) => upstream.lookupCaller(key),
    deleteCaller: (sourceId) => upstream.deleteCaller(sourceId),
    archiveRoute: async (ownerId, routeId, finalStatus) => {
      const { error } = await service.rpc("archive_session_runtime_route", {
        _owner: ownerId,
        _route_id: routeId,
        _final_status: finalStatus,
      });
      if (error) console.error(`release: archive failed — ${error.message}`);
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
