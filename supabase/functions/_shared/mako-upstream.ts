// Phase D — shared MAKO upstream client for release/reconciliation paths.
//
// Only the two operations a release needs: look a caller up by idempotency key,
// and delete it. Nothing here can create infrastructure.

export const SOURCE_ID_PATTERN = /^src_[a-f0-9]{6}$/;

export type UpstreamConfig = { apiBase: string; apiToken: string };

export function makoUpstream({ apiBase, apiToken }: UpstreamConfig) {
  const headers = { Authorization: `Bearer ${apiToken}`, Accept: "application/json" };

  return {
    /** Recover a caller identity by idempotency key (= runtime route id). */
    lookupCaller: async (key: string) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
        return { ok: false, status: 400 };
      }
      try {
        const res = await fetch(`${apiBase}/pull-sources/by-idempotency-key/${key}`, {
          method: "GET",
          headers,
        });
        if (res.status === 404) return { ok: false, status: 404 };
        if (!res.ok) return { ok: false, status: res.status };
        const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body || typeof body !== "object") return { ok: false, status: 502 };
        const sourceId = typeof body.source_id === "string" ? body.source_id : "";
        if (!SOURCE_ID_PATTERN.test(sourceId)) return { ok: false, status: 502 };
        return {
          ok: true,
          status: res.status,
          source: {
            source_id: sourceId,
            state: typeof body.state === "string" ? body.state : null,
          },
        };
      } catch (e) {
        console.error("upstream lookup failed", e instanceof Error ? e.message : "unknown");
        return { ok: false, status: 502 };
      }
    },

    /** Delete a caller. An already-absent caller is a CONFIRMED teardown. */
    deleteCaller: async (sourceId: string) => {
      if (!SOURCE_ID_PATTERN.test(sourceId)) return { ok: false, error: "invalid_source_id" };
      try {
        const res = await fetch(`${apiBase}/pull-sources/${sourceId}`, {
          method: "DELETE",
          headers,
        });
        if (res.ok || res.status === 404) return { ok: true };
        console.error(`upstream delete returned ${res.status}`);
        return { ok: false, error: "upstream_error" };
      } catch (e) {
        console.error("upstream delete failed", e instanceof Error ? e.message : "unknown");
        return { ok: false, error: "upstream_unreachable" };
      }
    },
  };
}
