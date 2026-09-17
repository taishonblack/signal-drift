// Phase C — caller-first session provisioning.
//
// The operator supplies, per enabled slot: friendly name + external SRT
// Listener host + port. This function provisions a MAKO caller to each of them
// and attaches the resulting trusted playback identity to the session, then
// activates the session. Only after it returns success may the browser navigate.
//
// Identity chain — the only source of ownership:
//   browser JWT -> auth.getUser() -> verified user.id -> RPC _owner
// The browser never supplies owner_id, infrastructure_source_id or playback_path.
//
// Request:
//   POST {
//     session: { id, name, status, pin?, payload },
//     slots:   [{ slot, name, host, port }],
//     library_attachments?: [{ slot, ingest_source_id, label? }]
//   }
// Response: { ok, routes: [{ slot, route_id, playback_path }] }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import {
  provisionSession,
  type CallerResult,
  type ProvisionDeps,
  type ReserveResult,
} from "./provisioning.ts";

const SessionSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  status: z.enum(["scheduled", "active", "paused"]),
  pin: z.string().min(3).max(12).optional(),
  payload: z.record(z.unknown()),
});

/** Caller-backed slot intent. `.strict()` blocks smuggled infrastructure fields. */
const SlotSchema = z
  .object({
    slot: z.number().int().min(1).max(4),
    name: z.string().min(1).max(64).regex(/^[A-Za-z0-9 _-]+$/),
    host: z.string().min(1).max(300),
    port: z.number().int().min(1).max(65535),
  })
  .strict();

const LibraryAttachmentSchema = z
  .object({
    slot: z.number().int().min(1).max(4),
    ingest_source_id: z.string().uuid(),
    label: z.string().min(1).max(120).optional(),
  })
  .strict();

const Body = z.object({
  session: SessionSchema,
  slots: z.array(SlotSchema).min(1).max(4),
  library_attachments: z.array(LibraryAttachmentSchema).max(4).optional(),
  /** Phase D — the provisioning client's own instance id, so the session takes
   *  its first presence lease the moment it becomes active. */
  client_instance_id: z.string().uuid().optional(),
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
  const { data: me, error: meErr } = await userClient.auth.getUser();
  if (meErr || !me?.user) return json({ error: "unauthorized" }, 401);
  const ownerId = me.user.id;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "invalid_body" }, 400);
  const { session, slots, library_attachments } = parsed.data;

  const usedSlots = new Set(slots.map((s) => s.slot));
  if (usedSlots.size !== slots.length) return json({ error: "duplicate_slot" }, 400);
  for (const a of library_attachments ?? []) {
    if (usedSlots.has(a.slot)) return json({ error: "duplicate_slot" }, 400);
    usedSlots.add(a.slot);
  }

  const apiBase = Deno.env.get("MAKO_API_BASE_URL");
  const apiToken = Deno.env.get("MAKO_API_TOKEN");
  if (!apiBase || !apiToken) {
    console.error("provision-session: MAKO API not configured");
    return json({ error: "service_unavailable" }, 503);
  }

  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Ownership early exit; the database functions re-check inside their
  // transactions.
  const { data: existing } = await service
    .from("sessions")
    .select("owner_id, pin_hash")
    .eq("id", session.id)
    .maybeSingle();
  if (existing && existing.owner_id !== ownerId) return json({ error: "forbidden" }, 403);

  const authHeaders = { Authorization: `Bearer ${apiToken}`, Accept: "application/json" };

  const upstream = async (
    path: string,
    init: RequestInit,
    label: string,
  ): Promise<{ ok: boolean; status?: number; raw?: Record<string, unknown>; error?: string }> => {
    try {
      const res = await fetch(`${apiBase}${path}`, init);
      if (init.method === "DELETE") {
        // An already-absent caller is a confirmed teardown.
        if (res.ok || res.status === 404) return { ok: true, status: res.status };
        console.error(`provision-session: ${label} upstream returned ${res.status}`);
        return { ok: false, status: res.status, error: "upstream_error" };
      }
      if (!res.ok) {
        console.error(`provision-session: ${label} upstream returned ${res.status}`);
        return { ok: false, status: res.status, error: "upstream_error" };
      }
      const body = await res.json().catch(() => null);
      if (body === null || typeof body !== "object") {
        return { ok: false, status: 502, error: "invalid_upstream_response" };
      }
      return { ok: true, status: res.status, raw: body as Record<string, unknown> };
    } catch (e) {
      console.error(
        `provision-session: ${label} fetch failed`,
        e instanceof Error ? e.message : "unknown",
      );
      return { ok: false, status: 502, error: "upstream_unreachable" };
    }
  };

  const asCaller = (raw: Record<string, unknown> | undefined): CallerResult["source"] => {
    if (!raw) return undefined;
    const sourceId = typeof raw.source_id === "string" ? raw.source_id : "";
    const outputPath = typeof raw.output_path === "string" ? raw.output_path : "";
    const key = typeof raw.idempotency_key === "string" ? raw.idempotency_key.toLowerCase() : "";
    return {
      source_id: sourceId,
      output_path: outputPath,
      idempotency_key: key,
      state: typeof raw.state === "string" ? raw.state : null,
    };
  };

  const deps: ProvisionDeps = {
    reserveRoute: async (slot) => {
      const { data, error } = await service.rpc("reserve_session_runtime_route", {
        _owner: ownerId,
        _session_id: session.id,
        _slot: slot.slot,
        _name: slot.name,
        _host: slot.host,
        _port: slot.port,
      });
      if (error) {
        console.error(`provision-session: reservation failed — ${error.message}`);
        throw new Error("reservation_failed");
      }
      return data as ReserveResult;
    },
    createCaller: async (args) => {
      const res = await upstream(
        "/pull-sources",
        {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(args),
        },
        "create_pull_source",
      );
      if (!res.ok) return { ok: false, status: res.status, error: res.error };
      return { ok: true, status: res.status, source: asCaller(res.raw) };
    },
    lookupCaller: async (key) => {
      const res = await upstream(
        `/pull-sources/by-idempotency-key/${key}`,
        { method: "GET", headers: authHeaders },
        "get_pull_source_by_idempotency_key",
      );
      if (!res.ok) return { ok: false, status: res.status, error: res.error };
      return { ok: true, status: res.status, source: asCaller(res.raw) };
    },
    deleteCaller: async (sourceId) => {
      if (!/^src_[a-f0-9]{6}$/.test(sourceId)) return { ok: false, error: "invalid_source_id" };
      const res = await upstream(
        `/pull-sources/${sourceId}`,
        { method: "DELETE", headers: authHeaders },
        "delete_pull_source",
      );
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    },
    finalizeRoute: async (routeId, infraId, playbackPath) => {
      const { error } = await service.rpc("finalize_session_runtime_route", {
        _owner: ownerId,
        _route_id: routeId,
        _infrastructure_source_id: infraId,
        _playback_path: playbackPath,
      });
      if (error) console.error(`provision-session: finalize failed — ${error.message}`);
      return !error;
    },
    failRoute: async (routeId, reason) => {
      await service.rpc("fail_session_runtime_route", {
        _owner: ownerId,
        _route_id: routeId,
        _error: reason,
      });
    },
    recordTeardownFailure: async (routeId, reason) => {
      await service.rpc("record_runtime_route_teardown_failure", {
        _owner: ownerId,
        _route_id: routeId,
        _error: reason,
      });
    },
    archiveRoute: async (routeId, finalStatus) => {
      const { error } = await service.rpc("archive_session_runtime_route", {
        _owner: ownerId,
        _route_id: routeId,
        _final_status: finalStatus,
      });
      if (error) console.error(`provision-session: archive failed — ${error.message}`);
      return !error;
    },
    saveSession: async (attachments) => {
      let pin_hash: string | null = existing?.pin_hash ?? null;
      if (session.pin) {
        const { data: hash, error: hashErr } = await service.rpc("hash_session_pin", {
          _pin: session.pin,
        });
        if (hashErr) return { ok: false, error: "save_failed" };
        pin_hash = hash as string;
      }
      const { error } = await service.rpc("save_session_with_sources", {
        _owner: ownerId,
        _session: {
          id: session.id,
          name: session.name,
          status: session.status,
          pin_hash,
          payload: session.payload,
        },
        _attachments: attachments,
      });
      if (error) {
        console.error(`provision-session: save failed — ${error.message}`);
        return { ok: false, error: "save_failed" };
      }
      await service.from("shared_session_access").upsert(
        {
          session_id: session.id,
          user_id: ownerId,
          role: "owner",
          granted_at: new Date().toISOString(),
          last_accessed_at: new Date().toISOString(),
          revoked_at: null,
        },
        { onConflict: "session_id,user_id" },
      );
      return { ok: true };
    },
    logError: (message) => console.error(message),
  };

  try {
    const outcome = await provisionSession(
      { slots, libraryAttachments: library_attachments },
      deps,
    );
    return json(outcome.body, outcome.status);
  } catch (e) {
    console.error(
      "provision-session: unexpected failure",
      e instanceof Error ? e.message : "unknown",
    );
    return json({ error: "provisioning_failed" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
