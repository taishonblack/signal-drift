// One-shot admin function that provisions the Root Operator test user.
// Idempotent — safe to call repeatedly. Reads ROOT_TEST_USER_PASSWORD
// from the environment. Never accepts a password from the caller.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const EMAIL = "root@makosrt.com";
const DISPLAY_NAME = "Root Operator";
const ROLE = "account_owner";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const password = Deno.env.get("ROOT_TEST_USER_PASSWORD");
    if (!password) {
      return json({ error: "ROOT_TEST_USER_PASSWORD is not configured" }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Look up existing user via listUsers (Admin API has no getByEmail).
    let userId: string | null = null;
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) return json({ error: listErr.message }, 500);
    const existing = list.users.find((u) => u.email?.toLowerCase() === EMAIL);

    if (existing) {
      userId = existing.id;
      // Ensure the password matches what's configured now.
      const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: {
          display_name: DISPLAY_NAME,
          role: ROLE,
        },
      });
      if (updErr) return json({ error: updErr.message }, 500);
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: EMAIL,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: DISPLAY_NAME,
          role: ROLE,
        },
      });
      if (createErr) return json({ error: createErr.message }, 500);
      userId = created.user!.id;
    }

    // Upsert profile explicitly in case the auth trigger didn't populate the
    // fields we want (e.g. for pre-existing users).
    const { error: profErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        display_name: DISPLAY_NAME,
        role: ROLE,
      },
      { onConflict: "id" },
    );
    if (profErr) return json({ error: profErr.message }, 500);

    return json({
      ok: true,
      user_id: userId,
      email: EMAIL,
      display_name: DISPLAY_NAME,
      role: ROLE,
      already_existed: !!existing,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
