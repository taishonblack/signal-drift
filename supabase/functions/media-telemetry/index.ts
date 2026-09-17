// Phase E.2B — media telemetry bridge.
//
// The browser asks for ONE runtime route's media format, by canonical
// `session_runtime_routes.id`. This function authorizes the read server-side,
// then probes MAKO's own RTSP publication through the private caller API
// (GET /pull-sources/{source_id}/telemetry/media). MAKO_API_TOKEN never leaves
// this function, and the remote endpoint, filesystem and process detail are
// never returned to the client.
//
// Read-only: no session, lease, provisioning, teardown or schema effect.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { authorizeRouteTelemetry, type RouteReader, type RuntimeRouteRow } from "./authorize.ts";

const BodySchema = z.object({
  runtime_route_id: z.string().max(64),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authz = req.headers.get("Authorization") ?? "";
  if (!authz.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const jwt = authz.slice(7);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  // Anonymous Temporary Operator identities are real Supabase users and pass here.
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const reader: RouteReader = {
    async getRoute(routeId) {
      const { data } = await admin
        .from("session_runtime_routes")
        .select(
          "id, session_id, owner_id, slot, infrastructure_source_id, playback_path, lifecycle_status",
        )
        .eq("id", routeId)
        .maybeSingle();
      return (data as RuntimeRouteRow | null) ?? null;
    },
    async hasSharedAccess(sessionId, uid) {
      const { data } = await admin
        .from("shared_session_access")
        .select("session_id")
        .eq("session_id", sessionId)
        .eq("user_id", uid)
        .is("revoked_at", null)
        .maybeSingle();
      return !!data;
    },
  };

  const auth = await authorizeRouteTelemetry(reader, userId, body.runtime_route_id);
  if (!auth.ok) {
    return json(
      auth.error === "telemetry_unavailable"
        ? { ok: false, error: "telemetry_unavailable", reason: "route_not_ready" }
        : { error: auth.error },
      auth.status,
    );
  }

  const base = Deno.env.get("MAKO_API_BASE_URL");
  const token = Deno.env.get("MAKO_API_TOKEN");
  if (!base || !token) return json({ ok: false, error: "upstream_error" }, 200);

  let upstream: Response;
  try {
    upstream = await fetch(
      `${base.replace(/\/+$/, "")}/pull-sources/${auth.sourceId}/telemetry/media`,
      { method: "GET", headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (e) {
    console.error("media-telemetry upstream fetch failed", auth.route.id, String(e));
    return json({ ok: false, error: "upstream_error" }, 200);
  }

  const text = await upstream.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    parsed = null;
  }

  if (upstream.status === 404) {
    return json({ ok: false, error: "telemetry_unavailable", reason: "source_unknown" }, 200);
  }
  if (!upstream.ok || !parsed) {
    // Upstream detail is logged server-side only.
    console.error("media-telemetry upstream error", upstream.status, text.slice(0, 500));
    return json({ ok: false, error: "upstream_error" }, 200);
  }
  if (parsed.status === "telemetry_unavailable" || parsed.available === false) {
    return json(
      {
        ok: false,
        error: "telemetry_unavailable",
        reason: typeof parsed.reason === "string" ? parsed.reason : null,
      },
      200,
    );
  }

  // Only the normalized, non-sensitive shape is forwarded.
  return json(
    {
      ok: true,
      telemetry: {
        source_id: auth.sourceId,
        playback_path: auth.route.playback_path,
        observed_at: typeof parsed.observed_at === "string"
          ? parsed.observed_at
          : new Date().toISOString(),
        observation_point: "rtsp_publication",
        video: parsed.video ?? null,
        audio_output: parsed.audio_output ?? null,
      },
    },
    200,
  );
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
