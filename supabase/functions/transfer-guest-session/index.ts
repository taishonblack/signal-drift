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
import { transferGuestSessions, type TransferDeps } from "../_shared/guest-transfer.ts";

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

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "invalid_body" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const destClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authz } },
  });
  const verifyClient = createClient(url, anonKey);
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const deps: TransferDeps = {
    getDestinationUser: async () => {
      const { data, error } = await destClient.auth.getUser();
      return error || !data?.user ? null : (data.user as unknown as { id: string; is_anonymous?: boolean });
    },
    getAnonymousUser: async (token) => {
      const { data, error } = await verifyClient.auth.getUser(token);
      return error || !data?.user ? null : (data.user as unknown as { id: string; is_anonymous?: boolean });
    },
    transfer: async (sessionId, from, to) => {
      const { data, error } = await service.rpc("transfer_session_ownership", {
        _session_id: sessionId,
        _from: from,
        _to: to,
      });
      if (error) throw new Error(error.message);
      return data as { transferred: boolean } | null;
    },
    logError: (message) => console.error(message),
  };

  const outcome = await transferGuestSessions(
    {
      anonymousAccessToken: parsed.data.anonymous_access_token,
      sessionIds: parsed.data.session_ids,
    },
    deps,
  );

  if (!outcome.ok) return json({ error: outcome.error }, outcome.status);
  return json({
    ok: true,
    transferred: outcome.transferred,
    skipped: outcome.skipped,
    ...(outcome.sameIdentity ? { same_identity: true } : {}),
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
