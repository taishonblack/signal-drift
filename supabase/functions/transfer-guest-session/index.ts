// Guest -> existing account ownership transfer.
//
// Only needed when a temporary (anonymous) operator signs into an account that
// already exists, because the browser then holds a DIFFERENT user id. Adding
// credentials to the anonymous user itself keeps the same id and needs nothing.
//
// Proof model (no service-role key ever reaches the browser, no capability
// tokens): the request must carry BOTH
//   • Authorization: the destination (signed-in) user's JWT, and
//   • anonymous_access_token: the anonymous user's JWT it is transferring from.
// Both are verified server-side. The transfer itself is a single idempotent
// database routine which never touches infrastructure: the runtime route id,
// infrastructure source id, playback path and running SRT caller all survive.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const Body = z
  .object({
    anonymous_access_token: z.string().min(20).max(4000),
    session_ids: z.array(z.string().min(1).max(64)).min(1).max(20),
  })
  .strict();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authz = req.headers.get("Authorization") ?? "";
  if (!authz.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Destination identity — must be a real, non-anonymous account.
  const destClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authz } },
  });
  const { data: dest, error: destErr } = await destClient.auth.getUser();
  if (destErr || !dest?.user) return json({ error: "unauthorized" }, 401);
  if ((dest.user as { is_anonymous?: boolean }).is_anonymous) {
    return json({ error: "destination_anonymous" }, 400);
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "invalid_body" }, 400);
  const { anonymous_access_token, session_ids } = parsed.data;

  // Source identity — must be the anonymous user the browser really held.
  const srcClient = createClient(url, anonKey);
  const { data: src, error: srcErr } = await srcClient.auth.getUser(anonymous_access_token);
  if (srcErr || !src?.user) return json({ error: "invalid_anonymous_token" }, 401);
  if (!(src.user as { is_anonymous?: boolean }).is_anonymous) {
    return json({ error: "source_not_anonymous" }, 400);
  }
  if (src.user.id === dest.user.id) {
    return json({ ok: true, transferred: [], skipped: session_ids, same_identity: true });
  }

  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const transferred: string[] = [];
  const skipped: string[] = [];
  for (const sessionId of session_ids) {
    const { data, error } = await service.rpc("transfer_session_ownership", {
      _session_id: sessionId,
      _from: src.user.id,
      _to: dest.user.id,
    });
    if (error) {
      // forbidden / session_not_found are expected for anything this anonymous
      // identity did not own. Never leak details about another owner's session.
      console.error(`transfer-guest-session: ${sessionId} — ${error.message}`);
      skipped.push(sessionId);
      continue;
    }
    const result = data as { transferred?: boolean } | null;
    if (result?.transferred) transferred.push(sessionId);
    else skipped.push(sessionId);
  }

  return json({ ok: true, transferred, skipped });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
