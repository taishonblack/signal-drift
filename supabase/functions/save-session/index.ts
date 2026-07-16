// Upserts a persistent session for a signed-in member. Accepts the full
// SessionRecord payload from the client and hashes the PIN before
// storage. Owner is always the authenticated caller — the caller cannot
// spoof owner_id.
//
// Request:  POST { session: SessionRecord }
// Response: { ok, session: { id } }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const SessionSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  status: z.enum(["draft", "scheduled", "active", "paused", "completed", "archived"]),
  pin: z.string().min(3).max(12).optional(),
  payload: z.record(z.unknown()),
});

const Body = z.object({ session: SessionSchema });

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
  const { data: me, error: meErr } = await userClient.auth.getUser();
  if (meErr || !me?.user) return json({ error: "unauthorized" }, 401);
  const userId = me.user.id;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "invalid_body", details: parsed.error.flatten() }, 400);
  const { session } = parsed.data;

  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify this user actually owns the session (if it exists).
  const { data: existing } = await service
    .from("sessions")
    .select("owner_id, pin_hash")
    .eq("id", session.id)
    .maybeSingle();
  if (existing && existing.owner_id !== userId) {
    return json({ error: "forbidden" }, 403);
  }

  // Hash the PIN only when it changed or is new.
  let pin_hash: string | null = existing?.pin_hash ?? null;
  if (session.pin) {
    const { data: hash, error: hashErr } = await service.rpc("hash_session_pin", {
      _pin: session.pin,
    });
    if (hashErr) return json({ error: hashErr.message }, 500);
    pin_hash = hash as string;
  }

  const row = {
    id: session.id,
    owner_id: userId,
    name: session.name,
    status: session.status,
    pin_hash,
    payload: session.payload,
  };

  const { error: upErr } = await service.from("sessions").upsert(row, { onConflict: "id" });
  if (upErr) return json({ error: upErr.message }, 500);

  // Ensure owner has a shared_session_access "owner" record so listing works uniformly.
  await service
    .from("shared_session_access")
    .upsert(
      {
        session_id: session.id,
        user_id: userId,
        role: "owner",
        granted_at: new Date().toISOString(),
        last_accessed_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: "session_id,user_id" },
    );

  return json({ ok: true, session: { id: session.id } });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
