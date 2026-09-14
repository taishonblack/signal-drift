// Secure bridge between the authenticated MAKO web app and the private
// MAKO ingest API at https://api.makosrt.com.
//
// READ-ONLY in this first version: only action = "list_sources" is supported.
// The MAKO_API_TOKEN never leaves this Edge Function.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { createSource } from "./create-source.ts";

const BodySchema = z.object({
  action: z.string().min(1).max(64),
  name: z.string().max(200).optional(),
  source_id: z.string().max(64).optional(),
});

const SourceIdSchema = z.string().regex(/^src_[a-f0-9]{6}$/);

const NameSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v.length >= 1 && v.length <= 64, "invalid length")
  .refine((v) => /^[A-Za-z0-9 _-]+$/.test(v), "invalid characters");

function sanitizeSource(raw: unknown) {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    name: s.name ?? null,
    source_id: s.source_id ?? null,
    port: s.port ?? null,
    output_path: s.output_path ?? null,
    state: s.state ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // Verify the caller is a signed-in Supabase user.
  const authz = req.headers.get("Authorization") ?? "";
  if (!authz.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }
  const jwt = authz.slice(7);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: me, error: meErr } = await userClient.auth.getUser();
  if (meErr || !me?.user) {
    return json({ error: "unauthorized" }, 401);
  }

  // Validate request body.
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return json({ error: "invalid_body" }, 400);
  }
  const { action } = parsed.data;

  if (action !== "list_sources" && action !== "create_source" && action !== "delete_source") {
    return json({ error: "Unsupported action" }, 400);
  }

  // Forward to the private MAKO ingest API.
  const apiBase = Deno.env.get("MAKO_API_BASE_URL");
  const apiToken = Deno.env.get("MAKO_API_TOKEN");
  if (!apiBase || !apiToken) {
    console.error("mako-ingest: MAKO_API_BASE_URL or MAKO_API_TOKEN not configured");
    return json({ error: "service_unavailable" }, 503);
  }

  if (action === "create_source") {
    // Infrastructure changes require the existing admin role model.
    const { data: isAdmin, error: roleErr } = await userClient.rpc("has_role", {
      _user_id: me.user.id,
      _role: "admin",
    });
    if (roleErr || isAdmin !== true) {
      return json({ error: "forbidden" }, 403);
    }

    const nameParsed = NameSchema.safeParse(parsed.data.name ?? "");
    if (!nameParsed.success) {
      return json({ error: "invalid_name" }, 400);
    }

    // Service-role client: the only path allowed to write the
    // infrastructure-managed columns on public.ingest_sources.
    const adminDb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const outcome = await createSource(
      { ownerId: me.user.id, name: nameParsed.data },
      {
        provision: async (name) => {
          try {
            const upstream = await fetch(`${apiBase}/sources`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({ name }),
            });

            if (!upstream.ok) {
              console.error(`mako-ingest: create upstream returned ${upstream.status}`);
              return { ok: false, error: "upstream_error", status: 502 };
            }

            const created = await upstream.json().catch(() => null);
            if (created === null || typeof created !== "object") {
              return { ok: false, error: "invalid_upstream_response", status: 502 };
            }
            return { ok: true, raw: created as Record<string, unknown> };
          } catch (e) {
            console.error(
              "mako-ingest: create fetch failed",
              e instanceof Error ? e.message : "unknown",
            );
            return { ok: false, error: "upstream_unreachable", status: 502 };
          }
        },
        insertRegistryRow: async (row) => {
          const { data, error } = await adminDb
            .from("ingest_sources")
            .insert(row)
            .select("id")
            .single();
          if (error) {
            console.error(`mako-ingest: registry insert failed (${error.code ?? "unknown"})`);
            return { ok: false, duplicate: error.code === "23505" };
          }
          return { ok: true, id: (data as { id: string } | null)?.id ?? null };
        },
        deleteUpstream: async (sourceId) => {
          const res = await fetch(`${apiBase}/sources/${sourceId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
          });
          return res.ok || res.status === 404;
        },
        logError: (message) => console.error(message),
      },
    );

    return json(outcome.body, outcome.status);
  }

  if (action === "delete_source") {
    // Infrastructure changes require the existing admin role model.
    const { data: isAdmin, error: roleErr } = await userClient.rpc("has_role", {
      _user_id: me.user.id,
      _role: "admin",
    });
    if (roleErr || isAdmin !== true) {
      return json({ error: "forbidden" }, 403);
    }

    const idParsed = SourceIdSchema.safeParse(parsed.data.source_id ?? "");
    if (!idParsed.success) {
      return json({ error: "invalid_source_id" }, 400);
    }
    const sourceId = idParsed.data;

    try {
      const upstream = await fetch(`${apiBase}/sources/${sourceId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: "application/json",
        },
      });

      if (upstream.status === 404) {
        return json({ error: "not_found" }, 404);
      }
      if (!upstream.ok) {
        console.error(`mako-ingest: delete upstream returned ${upstream.status}`);
        return json({ error: "upstream_error" }, 502);
      }

      return json({ source_id: sourceId, deleted: true }, 200);
    } catch (e) {
      console.error("mako-ingest: delete fetch failed", e instanceof Error ? e.message : "unknown");
      return json({ error: "upstream_unreachable" }, 502);
    }
  }

  try {
    const upstream = await fetch(`${apiBase}/sources`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
    });

    if (!upstream.ok) {
      console.error(`mako-ingest: upstream returned ${upstream.status}`);
      return json({ error: "upstream_error" }, 502);
    }

    const data = await upstream.json().catch(() => null);
    if (data === null) {
      return json({ error: "invalid_upstream_response" }, 502);
    }

    return json(data, upstream.status);
  } catch (e) {
    console.error("mako-ingest: upstream fetch failed", e instanceof Error ? e.message : "unknown");
    return json({ error: "upstream_unreachable" }, 502);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
