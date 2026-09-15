// My Sources — the authenticated Operator's private source library.
//
// Reads come straight from public.ingest_sources; RLS (owner_id = auth.uid())
// is the authoritative boundary, so no Edge Function is involved in listing.
// Writes that touch MAKO Receive infrastructure go through the mako-ingest
// Edge Function, which owns the MAKO API token and the quota reservation.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Product limit, mirrored server-side in create-source.ts / the database. */
export const MAX_ACTIVE_SOURCES = 4;

/** Encoder destination for every MAKO Receive source in this phase. */
export const RECEIVE_DESTINATION = "stream.makosrt.com";

export interface MySource {
  id: string;
  name: string;
  connectionMode: string;
  lifecycleStatus: string;
  connectionStatus: string;
  srtPort: number | null;
  /** Internal infrastructure identity — used for delete, never featured in UI. */
  infrastructureSourceId: string | null;
  createdAt: string;
}

export type CreatedSource = {
  name: string;
  port: number | null;
};

const SELECT =
  "id, name, connection_mode, lifecycle_status, connection_status, srt_port, infrastructure_source_id, created_at";

type Row = {
  id: string;
  name: string;
  connection_mode: string;
  lifecycle_status: string;
  connection_status: string;
  srt_port: number | null;
  infrastructure_source_id: string | null;
  created_at: string;
};

function toSource(row: Row): MySource {
  return {
    id: row.id,
    name: row.name,
    connectionMode: row.connection_mode,
    lifecycleStatus: row.lifecycle_status,
    connectionStatus: row.connection_status,
    srtPort: row.srt_port,
    infrastructureSourceId: row.infrastructure_source_id,
    createdAt: row.created_at,
  };
}

function messageFor(error: unknown): string {
  const code =
    typeof error === "object" && error !== null
      ? ((error as { message?: string }).message ?? "")
      : "";
  if (code.includes("source_limit_reached")) return "limit";
  return code || "unknown";
}

export function useMySources(enabled: boolean) {
  const [sources, setSources] = useState<MySource[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setSources([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: selErr } = await supabase
      .from("ingest_sources")
      .select(SELECT)
      // Deleted rows stay in the registry as history, but are not part of the
      // Operator's active library and never count toward the quota.
      .neq("lifecycle_status", "deleted")
      .order("created_at", { ascending: false });

    if (selErr) {
      setError("Unable to load your sources right now.");
      setSources([]);
    } else {
      setError(null);
      setSources(((data ?? []) as Row[]).map(toSource));
    }
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Provision a new MAKO Receive source owned by the signed-in user. */
  const createSource = useCallback(
    async (name: string): Promise<{ ok: true; source: CreatedSource } | { ok: false; reason: string }> => {
      const { data, error: fnErr } = await supabase.functions.invoke("mako-ingest", {
        body: { action: "create_source", name },
      });
      if (fnErr) {
        const body = (data ?? {}) as { error?: string };
        const reason = body.error ?? messageFor(fnErr);
        return { ok: false, reason: reason.includes("limit") ? "limit" : reason };
      }
      const payload = (data ?? {}) as { source?: { name?: string; port?: number }; error?: string };
      if (payload.error) {
        return { ok: false, reason: payload.error };
      }
      await refresh();
      return {
        ok: true,
        source: { name: payload.source?.name ?? name, port: payload.source?.port ?? null },
      };
    },
    [refresh],
  );

  /**
   * Rename an owned source. A direct update is enough: RLS restricts the row to
   * its owner and the database trigger rejects any change to the
   * infrastructure-managed columns, so no privileged server path is needed.
   */
  const renameSource = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      const { error: updErr } = await supabase
        .from("ingest_sources")
        .update({ name })
        .eq("id", id)
        .neq("lifecycle_status", "deleted");
      if (updErr) return false;
      await refresh();
      return true;
    },
    [refresh],
  );

  /** Delete an owned source and its MAKO Receive destination. */
  const deleteSource = useCallback(
    async (source: MySource): Promise<{ ok: true } | { ok: false; reason: string }> => {
      if (!source.infrastructureSourceId) {
        return { ok: false, reason: "not_ready" };
      }
      const { data, error: fnErr } = await supabase.functions.invoke("mako-ingest", {
        body: { action: "delete_source", source_id: source.infrastructureSourceId },
      });
      if (fnErr) {
        const body = (data ?? {}) as { error?: string };
        return { ok: false, reason: body.error ?? messageFor(fnErr) };
      }
      const payload = (data ?? {}) as { error?: string };
      if (payload.error) return { ok: false, reason: payload.error };
      await refresh();
      return { ok: true };
    },
    [refresh],
  );

  return {
    sources,
    loading,
    error,
    refresh,
    createSource,
    renameSource,
    deleteSource,
    atLimit: sources.length >= MAX_ACTIVE_SOURCES,
  };
}

/** Human labels for the two independent status dimensions. */
export function lifecycleLabel(status: string): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "provisioning":
      return "Provisioning";
    case "deleting":
      return "Deleting";
    case "error":
      return "Error";
    case "deleted":
      return "Deleted";
    default:
      return status;
  }
}

export function connectionLabel(status: string): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "offline":
      return "Encoder Offline";
    case "unknown":
    default:
      return "Connection not checked";
  }
}
