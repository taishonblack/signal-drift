// Validates a session ID + PIN and, when the caller is signed in,
// grants (or refreshes) a shared_session_access record so they can
// re-enter without the PIN. Guests receive the same session summary
// but no persistent access record.
//
// Request:  POST { session_id: string, pin: string }
// Response: { ok, session: { id, name, owner_name, viewer_count, source_count, status }, granted }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const Body = z.object({
  session_id: z.string().min(1).max(64),
  pin: z.string().min(3).max(12),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "invalid_body" }, 400);
  const { session_id, pin } = parsed.data;

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify the PIN via the server-side function.
  const { data: okData, error: verifyErr } = await service.rpc("verify_session_pin", {
    _session_id: session_id,
    _pin: pin,
  });
  if (verifyErr) return json({ error: verifyErr.message }, 500);
  if (!okData) return json({ error: "invalid_credentials" }, 401);

  // Fetch the session and owner display name.
  const { data: session, error: sessErr } = await service
    .from("sessions")
    .select("id, name, status, owner_id, payload")
    .eq("id", session_id)
    .maybeSingle();
  if (sessErr) return json({ error: sessErr.message }, 500);
  if (!session) return json({ error: "not_found" }, 404);
  if (session.status === "completed" || session.status === "archived") {
    return json({ error: "session_ended" }, 410);
  }

  const { data: ownerProfile } = await service
    .from("profiles")
    .select("display_name")
    .eq("id", session.owner_id)
    .maybeSingle();

  const payload = (session.payload ?? {}) as Record<string, unknown>;
  const viewers = Array.isArray(payload.viewers) ? payload.viewers.length : 0;
  const lines = Array.isArray(payload.lines)
    ? (payload.lines as Array<{ enabled?: boolean }>).filter((l) => l?.enabled).length
    : 0;

  const summary = {
    id: session.id,
    name: session.name,
    status: session.status,
    owner_name: ownerProfile?.display_name ?? "Unknown",
    viewer_count: viewers,
    source_count: lines,
  };

  // If the caller is authenticated, upsert their access record.
  let granted = false;
  const authz = req.headers.get("Authorization") ?? "";
  if (authz.startsWith("Bearer ")) {
    const jwt = authz.slice(7);
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: me } = await userClient.auth.getUser();
    if (me?.user) {
      const nowIso = new Date().toISOString();
      const isOwner = me.user.id === session.owner_id;
      const { error: upsertErr } = await service
        .from("shared_session_access")
        .upsert(
          {
            session_id,
            user_id: me.user.id,
            role: isOwner ? "owner" : "viewer",
            granted_at: nowIso,
            last_accessed_at: nowIso,
            revoked_at: null,
          },
          { onConflict: "session_id,user_id" },
        );
      if (!upsertErr) granted = true;
    }
  }

  return json({ ok: true, session: summary, granted });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
