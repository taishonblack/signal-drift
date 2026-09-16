// Phase C — caller-first session provisioning.
//
// These exercise the real orchestration module with fake infrastructure: no
// network, no database, no Deno. Every rule the production path depends on is
// asserted here, including idempotency-key usage, recovery, conflicts,
// tombstones and compensation.

import { describe, expect, it, vi } from "vitest";
import {
  provisionSession,
  type CallerResult,
  type ProvisionDeps,
  type ReserveResult,
  type SavedAttachment,
} from "../../supabase/functions/provision-session/provisioning";
import { inputsFromRecord } from "@/lib/stream-paths";
import { parseSrtInput, type SessionRecord } from "@/lib/session-store";

const ROUTE_1 = "11111111-1111-4111-8111-111111111111";
const ROUTE_2 = "22222222-2222-4222-8222-222222222222";

type Harness = {
  deps: ProvisionDeps;
  created: { key: string; host: string; port: number; name: string }[];
  deleted: string[];
  finalized: { routeId: string; infra: string; path: string }[];
  failed: { routeId: string; error: string }[];
  teardownFailures: { routeId: string; error: string }[];
  archived: string[];
  saved: SavedAttachment[][];
};

function callerFor(key: string, id: string, state = "active"): CallerResult {
  return {
    ok: true,
    status: 200,
    source: {
      source_id: id,
      output_path: `${id}-opus`,
      idempotency_key: key,
      state,
    },
  };
}

function harness(overrides: Partial<ProvisionDeps> = {}, reserves: ReserveResult[] = []): Harness {
  const created: Harness["created"] = [];
  const deleted: string[] = [];
  const finalized: Harness["finalized"] = [];
  const failed: Harness["failed"] = [];
  const teardownFailures: Harness["teardownFailures"] = [];
  const archived: string[] = [];
  const saved: SavedAttachment[][] = [];
  const queue = [...reserves];

  const deps: ProvisionDeps = {
    reserveRoute: async () =>
      queue.shift() ?? ({ status: "reserved", route_id: ROUTE_1 } as ReserveResult),
    createCaller: async (args) => {
      created.push({ key: args.idempotency_key, host: args.host, port: args.port, name: args.name });
      return callerFor(args.idempotency_key, args.idempotency_key === ROUTE_1 ? "src_aaa111" : "src_bbb222");
    },
    lookupCaller: async (key) => callerFor(key, "src_aaa111"),
    deleteCaller: async (id) => {
      deleted.push(id);
      return { ok: true };
    },
    finalizeRoute: async (routeId, infra, path) => {
      finalized.push({ routeId, infra, path });
      return true;
    },
    failRoute: async (routeId, error) => {
      failed.push({ routeId, error });
    },
    recordTeardownFailure: async (routeId, error) => {
      teardownFailures.push({ routeId, error });
    },
    archiveRoute: async (routeId) => {
      archived.push(routeId);
      return true;
    },
    saveSession: async (attachments) => {
      saved.push(attachments);
      return { ok: true };
    },
    logError: () => {},
    ...overrides,
  };

  return { deps, created, deleted, finalized, failed, teardownFailures, archived, saved };
}

const slot = (n: number, port = 8000) => ({
  slot: n,
  name: `Camera ${n}`,
  host: "174.166.29.128",
  port,
});

describe("Phase C provisioning", () => {
  it("provisions a single caller-backed slot", async () => {
    const h = harness();
    const out = await provisionSession({ slots: [slot(1)] }, h.deps);

    expect(out.status).toBe(200);
    expect(out.body.ok).toBe(true);
    expect(h.finalized).toEqual([
      { routeId: ROUTE_1, infra: "src_aaa111", path: "src_aaa111-opus" },
    ]);
  });

  it("provisions multiple slots sequentially", async () => {
    const h = harness({}, [
      { status: "reserved", route_id: ROUTE_1 },
      { status: "reserved", route_id: ROUTE_2 },
    ]);
    const out = await provisionSession({ slots: [slot(1), slot(2, 8001)] }, h.deps);

    expect(out.status).toBe(200);
    expect(h.created.map((c) => c.key)).toEqual([ROUTE_1, ROUTE_2]);
    expect(h.finalized).toHaveLength(2);
  });

  it("uses the runtime route id as the caller idempotency key", async () => {
    const h = harness();
    await provisionSession({ slots: [slot(1)] }, h.deps);
    expect(h.created[0].key).toBe(ROUTE_1);
  });

  it("reuses a ready route for the same endpoint without creating a caller", async () => {
    const h = harness({}, [
      {
        status: "ready",
        route_id: ROUTE_1,
        infrastructure_source_id: "src_aaa111",
        playback_path: "src_aaa111-opus",
      },
    ]);
    const out = await provisionSession({ slots: [slot(1)] }, h.deps);

    expect(out.status).toBe(200);
    expect(h.created).toHaveLength(0);
  });

  it("recovers a lost create response by idempotency key", async () => {
    const lookup = vi.fn(async (key: string) => callerFor(key, "src_aaa111"));
    const h = harness({
      createCaller: async () => ({ ok: false, status: 502, error: "upstream_unreachable" }),
      lookupCaller: lookup,
    });
    const out = await provisionSession({ slots: [slot(1)] }, h.deps);

    expect(out.status).toBe(200);
    expect(lookup).toHaveBeenCalledWith(ROUTE_1);
    expect(h.finalized[0].infra).toBe("src_aaa111");
  });

  it("returns an endpoint conflict when the stored endpoint differs", async () => {
    const h = harness({}, [{ status: "endpoint_conflict", route_id: ROUTE_1 }]);
    const out = await provisionSession({ slots: [slot(1, 8001)] }, h.deps);

    expect(out.status).toBe(409);
    expect(out.body.error).toBe("endpoint_conflict");
    expect(h.created).toHaveLength(0);
  });

  it("surfaces an upstream 409 as an endpoint conflict", async () => {
    const h = harness({
      createCaller: async () => ({ ok: false, status: 409, error: "idempotency_conflict" }),
    });
    const out = await provisionSession({ slots: [slot(1)] }, h.deps);
    expect(out.status).toBe(409);
    expect(out.body.error).toBe("endpoint_conflict");
  });

  it("never recreates infrastructure for a tombstoned route", async () => {
    const h = harness({
      createCaller: async () => ({ ok: false, status: 410, error: "idempotency_tombstoned" }),
    });
    const out = await provisionSession({ slots: [slot(1)] }, h.deps);

    expect(out.status).toBe(409);
    expect(out.body.error).toBe("route_tombstoned");
    expect(h.deleted).toHaveLength(0);
  });

  it("treats a tombstoned recovery lookup as unusable", async () => {
    const h = harness({
      createCaller: async () => ({ ok: false, status: 502, error: "upstream_unreachable" }),
      lookupCaller: async (key) => callerFor(key, "src_aaa111", "tombstoned"),
    });
    const out = await provisionSession({ slots: [slot(1)] }, h.deps);
    expect(out.body.error).toBe("route_tombstoned");
  });

  it("refuses a route that is being torn down", async () => {
    const h = harness({}, [{ status: "route_tearing_down", route_id: ROUTE_1 }]);
    const out = await provisionSession({ slots: [slot(1)] }, h.deps);
    expect(out.body.error).toBe("route_tearing_down");
  });

  it("attaches runtime slots by runtime_route_id, never ingest_source_id", async () => {
    const h = harness();
    await provisionSession({ slots: [slot(1)] }, h.deps);

    expect(h.saved[0]).toEqual([
      { slot: 1, runtime_route_id: ROUTE_1, label: "Camera 1" },
    ]);
    expect(JSON.stringify(h.saved[0])).not.toContain("playback_path");
    expect(JSON.stringify(h.saved[0])).not.toContain("infrastructure");
  });

  it("keeps existing library attachments on the ingest_source_id path", async () => {
    const h = harness();
    await provisionSession(
      {
        slots: [slot(1)],
        libraryAttachments: [{ slot: 2, ingest_source_id: ROUTE_2, label: "Library A" }],
      },
      h.deps,
    );

    expect(h.saved[0]).toContainEqual({
      slot: 2,
      ingest_source_id: ROUTE_2,
      label: "Library A",
    });
  });

  it("keeps our friendly name even when upstream returns name: null", async () => {
    const h = harness({
      createCaller: async (args) => ({
        ok: true,
        status: 200,
        source: {
          source_id: "src_aaa111",
          output_path: "src_aaa111-opus",
          idempotency_key: args.idempotency_key,
          state: null,
        },
      }),
    });
    await provisionSession({ slots: [slot(1)] }, h.deps);
    expect((h.saved[0][0] as { label?: string }).label).toBe("Camera 1");
  });

  it("compensates a partial multi-slot failure", async () => {
    const h = harness(
      {
        createCaller: async (args) => {
          if (args.idempotency_key === ROUTE_2) {
            return { ok: false, status: 502, error: "upstream_unreachable" };
          }
          return callerFor(args.idempotency_key, "src_aaa111");
        },
        lookupCaller: async () => ({ ok: false, status: 404, error: "not_found" }),
      },
      [
        { status: "reserved", route_id: ROUTE_1 },
        { status: "reserved", route_id: ROUTE_2 },
      ],
    );
    const out = await provisionSession({ slots: [slot(1), slot(2, 8001)] }, h.deps);

    expect(out.status).toBe(502);
    expect(h.deleted).toEqual(["src_aaa111"]); // slot 1's caller torn down
    expect(h.archived).toEqual([ROUTE_1]);
    expect(h.failed.map((f) => f.routeId)).toEqual([ROUTE_2]);
    expect(h.saved).toHaveLength(0); // nothing attached
  });

  it("retains recoverable runtime state when teardown cannot be confirmed", async () => {
    const h = harness(
      {
        createCaller: async (args) => {
          if (args.idempotency_key === ROUTE_2) {
            return { ok: false, status: 502, error: "upstream_unreachable" };
          }
          return callerFor(args.idempotency_key, "src_aaa111");
        },
        lookupCaller: async () => ({ ok: false, status: 404, error: "not_found" }),
        deleteCaller: async () => ({ ok: false, error: "upstream_error" }),
      },
      [
        { status: "reserved", route_id: ROUTE_1 },
        { status: "reserved", route_id: ROUTE_2 },
      ],
    );
    const out = await provisionSession({ slots: [slot(1), slot(2, 8001)] }, h.deps);

    expect(out.status).toBe(502);
    expect(h.archived).toHaveLength(0); // row retained, not archived away
    expect(h.teardownFailures.map((t) => t.routeId)).toEqual([ROUTE_1]);
  });

  it("compensates when the session save fails after callers were created", async () => {
    const h = harness({ saveSession: async () => ({ ok: false, error: "save_failed" }) });
    const out = await provisionSession({ slots: [slot(1)] }, h.deps);

    expect(out.status).toBe(500);
    expect(out.body.error).toBe("save_failed");
    expect(h.deleted).toEqual(["src_aaa111"]);
    expect(h.archived).toEqual([ROUTE_1]);
  });

  it("rejects an upstream response whose idempotency key does not match", async () => {
    const h = harness({
      createCaller: async () => callerFor(ROUTE_2, "src_aaa111"),
      lookupCaller: async () => ({ ok: false, status: 404, error: "not_found" }),
    });
    const out = await provisionSession({ slots: [slot(1)] }, h.deps);
    expect(out.status).toBe(502);
    expect(h.finalized).toHaveLength(0);
  });
});

// ─── Playback resolution for runtime-backed slots ───

function record(over: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "sess-TEST",
    name: "Test",
    status: "active",
    createdAt: new Date().toISOString(),
    host: "Op",
    hostUserId: "u1",
    defaultOriginTimeZone: "UTC",
    lines: [],
    notes: [],
    markers: [],
    ...over,
  } as SessionRecord;
}

const line = (over: Record<string, unknown> = {}) => ({
  id: 1,
  enabled: true,
  label: "Camera 1",
  srtAddress: "174.166.29.128:8000",
  passphrase: "",
  bitrate: "",
  mode: "caller" as const,
  notes: "",
  originTimeZone: "UTC",
  ...over,
});

describe("Phase C playback resolution", () => {
  it("uses the attached runtime playback path", () => {
    const rec = record({
      lines: [line({ sourceKind: "runtime", runtimeRouteId: ROUTE_1 })] as never,
      attachmentsLoaded: true,
      attachments: [
        {
          slot: 1,
          label: "Camera 1",
          playbackPath: "src_a241b4-opus",
          ingestSourceId: null,
          runtimeRouteId: ROUTE_1,
          attachedAt: new Date().toISOString(),
        },
      ],
    });
    const inputs = inputsFromRecord(rec, parseSrtInput);
    expect(inputs[0].streamName).toBe("src_a241b4-opus");
  });

  it("never plays camN for a runtime slot while attachments load", () => {
    const rec = record({
      lines: [line({ sourceKind: "runtime", runtimeRouteId: ROUTE_1 })] as never,
      attachmentsLoaded: false,
      attachments: [],
    });
    const inputs = inputsFromRecord(rec, parseSrtInput);
    expect(inputs[0].streamName).toBeUndefined();
  });

  it("keeps legacy slots on their existing camN behaviour", () => {
    const rec = record({ lines: [line()] as never, attachmentsLoaded: true, attachments: [] });
    const inputs = inputsFromRecord(rec, parseSrtInput);
    expect(inputs[0].streamName).toBe("cam1");
  });
});
