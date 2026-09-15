import { describe, expect, it, vi } from "vitest";
import {
  createSource,
  validateProvisionedSource,
  MAX_ACTIVE_SOURCES,
  type CreateSourceDeps,
  type ProvisionResult,
  type ReserveResult,
} from "../../supabase/functions/mako-ingest/create-source";

const GOOD = {
  source: {
    name: "Registry Persistence Test",
    source_id: "src_abc123",
    port: 10025,
    output_path: "src_abc123-opus",
    state: "active",
  },
};

function deps(overrides: Partial<CreateSourceDeps> = {}) {
  const base: CreateSourceDeps = {
    reserveSlot: vi.fn(async (): Promise<ReserveResult> => ({ ok: true, id: "uuid-1" })),
    provision: vi.fn(async (): Promise<ProvisionResult> => ({ ok: true, raw: GOOD })),
    finalizeRegistryRow: vi.fn(async () => true),
    releaseReservation: vi.fn(async () => true),
    deleteUpstream: vi.fn(async () => true),
    logError: vi.fn(),
  };
  return { ...base, ...overrides };
}

describe("validateProvisionedSource", () => {
  it("accepts a well-formed response", () => {
    expect(validateProvisionedSource(GOOD)?.source_id).toBe("src_abc123");
  });

  it("rejects a bad source id", () => {
    expect(validateProvisionedSource({ source: { ...GOOD.source, source_id: "srcABC" } })).toBeNull();
  });

  it("rejects an out-of-range port", () => {
    expect(validateProvisionedSource({ source: { ...GOOD.source, port: 9999 } })).toBeNull();
    expect(validateProvisionedSource({ source: { ...GOOD.source, port: 11000 } })).toBeNull();
  });

  it("rejects a playback path that does not match the source identity", () => {
    expect(validateProvisionedSource({ source: { ...GOOD.source, output_path: "src_zzzzzz-opus" } })).toBeNull();
    expect(validateProvisionedSource({ source: { ...GOOD.source, output_path: "src_abc123" } })).toBeNull();
  });
});

describe("createSource", () => {
  it("reserves, provisions, finalizes and returns the existing browser contract", async () => {
    const d = deps();
    const out = await createSource({ ownerId: "owner-1", name: "Registry Persistence Test" }, d);

    expect(out.status).toBe(200);
    expect(out.body.source).toEqual({
      name: "Registry Persistence Test",
      source_id: "src_abc123",
      port: 10025,
      output_path: "src_abc123-opus",
      state: "active",
    });
    expect(out.body.ingest_source_id).toBe("uuid-1");
    expect(d.finalizeRegistryRow).toHaveBeenCalledWith(
      "uuid-1",
      expect.objectContaining({
        infrastructure_source_id: "src_abc123",
        srt_port: 10025,
        playback_path: "src_abc123-opus",
        lifecycle_status: "ready",
        connection_status: "unknown",
        connection_checked_at: null,
        last_error: null,
      }),
    );
    expect(d.releaseReservation).not.toHaveBeenCalled();
    expect(d.deleteUpstream).not.toHaveBeenCalled();
  });

  it("reserves the quota slot BEFORE any infrastructure is provisioned", async () => {
    const order: string[] = [];
    const d = deps({
      reserveSlot: vi.fn(async (): Promise<ReserveResult> => {
        order.push("reserve");
        return { ok: true, id: "uuid-1" };
      }),
      provision: vi.fn(async (): Promise<ProvisionResult> => {
        order.push("provision");
        return { ok: true, raw: GOOD };
      }),
    });
    await createSource({ ownerId: "owner-1", name: "X" }, d);
    expect(order).toEqual(["reserve", "provision"]);
  });

  it("refuses over the quota and never touches infrastructure", async () => {
    const d = deps({
      reserveSlot: vi.fn(async (): Promise<ReserveResult> => ({ ok: false, reason: "limit_reached" })),
    });
    const out = await createSource({ ownerId: "owner-1", name: "X" }, d);

    expect(out.status).toBe(409);
    expect(out.body).toEqual({ error: "source_limit_reached", limit: MAX_ACTIVE_SOURCES });
    expect(d.provision).not.toHaveBeenCalled();
    expect(d.deleteUpstream).not.toHaveBeenCalled();
  });

  it("serializes concurrent creates so a fifth source can never be provisioned", async () => {
    // The database reservation is the arbiter: it hands out at most `max` slots
    // across concurrent requests, so only those requests reach provisioning.
    let granted = 0;
    const shared: Partial<CreateSourceDeps> = {
      reserveSlot: vi.fn(async (params): Promise<ReserveResult> => {
        if (granted >= params.max) return { ok: false, reason: "limit_reached" };
        granted += 1;
        return { ok: true, id: `uuid-${granted}` };
      }),
    };
    const provision = vi.fn(async (): Promise<ProvisionResult> => ({ ok: true, raw: GOOD }));
    const d = deps({ ...shared, provision });

    const results = await Promise.all(
      Array.from({ length: 8 }, () => createSource({ ownerId: "owner-1", name: "X" }, d)),
    );

    expect(results.filter((r) => r.status === 200)).toHaveLength(MAX_ACTIVE_SOURCES);
    expect(results.filter((r) => r.status === 409)).toHaveLength(8 - MAX_ACTIVE_SOURCES);
    expect(provision).toHaveBeenCalledTimes(MAX_ACTIVE_SOURCES);
  });

  it("releases the reservation when provisioning fails", async () => {
    const d = deps({
      provision: vi.fn(async () => ({ ok: false, error: "upstream_error", status: 502 }) as ProvisionResult),
    });
    const out = await createSource({ ownerId: "owner-1", name: "X" }, d);

    expect(out.status).toBe(502);
    expect(d.finalizeRegistryRow).not.toHaveBeenCalled();
    expect(d.releaseReservation).toHaveBeenCalledWith("uuid-1");
    expect(d.deleteUpstream).not.toHaveBeenCalled();
  });

  it("rolls back infrastructure and the reservation when the response is malformed", async () => {
    const bad = { source: { ...GOOD.source, port: 12345 } };
    const d = deps({ provision: vi.fn(async () => ({ ok: true, raw: bad }) as ProvisionResult) });
    const out = await createSource({ ownerId: "owner-1", name: "X" }, d);

    expect(out.status).toBe(502);
    expect(out.body).toEqual({ error: "create_failed" });
    expect(d.finalizeRegistryRow).not.toHaveBeenCalled();
    expect(d.deleteUpstream).toHaveBeenCalledWith("src_abc123");
    expect(d.releaseReservation).toHaveBeenCalledWith("uuid-1");
  });

  it("does not attempt cleanup when there is no valid source id to target", async () => {
    const d = deps({ provision: vi.fn(async () => ({ ok: true, raw: { source: { name: "X" } } }) as ProvisionResult) });
    const out = await createSource({ ownerId: "owner-1", name: "X" }, d);

    expect(out.status).toBe(502);
    expect(d.deleteUpstream).not.toHaveBeenCalled();
    expect(d.releaseReservation).toHaveBeenCalledWith("uuid-1");
    expect(d.logError).toHaveBeenCalled();
  });

  it("rolls back when finalizing the registry row fails", async () => {
    const d = deps({ finalizeRegistryRow: vi.fn(async () => false) });
    const out = await createSource({ ownerId: "owner-1", name: "X" }, d);

    expect(out.status).toBe(500);
    expect(out.body).toEqual({ error: "create_failed" });
    expect(d.deleteUpstream).toHaveBeenCalledWith("src_abc123");
    expect(d.releaseReservation).toHaveBeenCalledWith("uuid-1");
  });

  it("still fails cleanly and logs the orphan when compensating deletion fails", async () => {
    const d = deps({
      finalizeRegistryRow: vi.fn(async () => false),
      deleteUpstream: vi.fn(async () => false),
    });
    const out = await createSource({ ownerId: "owner-1", name: "X" }, d);

    expect(out.status).toBe(500);
    const logged = (d.logError as ReturnType<typeof vi.fn>).mock.calls.join(" ");
    expect(logged).toContain("compensating delete FAILED");
    expect(logged).toContain("src_abc123");
  });

  it("treats a thrown compensating delete as a failed cleanup", async () => {
    const d = deps({
      finalizeRegistryRow: vi.fn(async () => false),
      deleteUpstream: vi.fn(async () => {
        throw new Error("network down");
      }),
    });
    const out = await createSource({ ownerId: "owner-1", name: "X" }, d);

    expect(out.status).toBe(500);
    expect((d.logError as ReturnType<typeof vi.fn>).mock.calls.join(" ")).toContain("compensating delete FAILED");
  });

  it("logs a stale provisioning row when the reservation cannot be released", async () => {
    const d = deps({
      provision: vi.fn(async () => ({ ok: false, error: "upstream_error", status: 502 }) as ProvisionResult),
      releaseReservation: vi.fn(async () => false),
    });
    await createSource({ ownerId: "owner-1", name: "X" }, d);
    expect((d.logError as ReturnType<typeof vi.fn>).mock.calls.join(" ")).toContain("quota slot");
  });
});
