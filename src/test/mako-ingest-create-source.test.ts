import { describe, expect, it, vi } from "vitest";
import {
  createSource,
  validateProvisionedSource,
  type CreateSourceDeps,
  type InsertResult,
  type ProvisionResult,
} from "../../supabase/functions/mako-ingest/create-source";

const GOOD = {
  source: { name: "Registry Persistence Test", source_id: "src_abc123", port: 10025, output_path: "src_abc123-opus", state: "active" },
};

function deps(overrides: Partial<CreateSourceDeps> = {}) {
  const base: CreateSourceDeps = {
    provision: vi.fn(async (): Promise<ProvisionResult> => ({ ok: true, raw: GOOD })),
    insertRegistryRow: vi.fn(async (): Promise<InsertResult> => ({ ok: true, id: "uuid-1" })),
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
  it("persists the registry row and returns the existing browser contract", async () => {
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
    expect(d.insertRegistryRow).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: "owner-1",
        connection_mode: "receive",
        infrastructure_source_id: "src_abc123",
        srt_port: 10025,
        playback_path: "src_abc123-opus",
        lifecycle_status: "ready",
        connection_status: "unknown",
        connection_checked_at: null,
        last_error: null,
      }),
    );
    expect(d.deleteUpstream).not.toHaveBeenCalled();
  });

  it("never inserts when provisioning fails", async () => {
    const d = deps({ provision: vi.fn(async () => ({ ok: false, error: "upstream_error", status: 502 }) as ProvisionResult) });
    const out = await createSource({ ownerId: "owner-1", name: "X" }, d);

    expect(out.status).toBe(502);
    expect(d.insertRegistryRow).not.toHaveBeenCalled();
    expect(d.deleteUpstream).not.toHaveBeenCalled();
  });

  it("rolls back the provisioned source when the response is malformed", async () => {
    const bad = { source: { ...GOOD.source, port: 12345 } };
    const d = deps({ provision: vi.fn(async () => ({ ok: true, raw: bad }) as ProvisionResult) });
    const out = await createSource({ ownerId: "owner-1", name: "X" }, d);

    expect(out.status).toBe(502);
    expect(out.body).toEqual({ error: "create_failed" });
    expect(d.insertRegistryRow).not.toHaveBeenCalled();
    expect(d.deleteUpstream).toHaveBeenCalledWith("src_abc123");
  });

  it("does not attempt cleanup when there is no valid source id to target", async () => {
    const d = deps({ provision: vi.fn(async () => ({ ok: true, raw: { source: { name: "X" } } }) as ProvisionResult) });
    const out = await createSource({ ownerId: "owner-1", name: "X" }, d);

    expect(out.status).toBe(502);
    expect(d.deleteUpstream).not.toHaveBeenCalled();
    expect(d.logError).toHaveBeenCalled();
  });

  it("rolls back when persistence fails", async () => {
    const d = deps({ insertRegistryRow: vi.fn(async () => ({ ok: false }) as InsertResult) });
    const out = await createSource({ ownerId: "owner-1", name: "X" }, d);

    expect(out.status).toBe(500);
    expect(out.body).toEqual({ error: "create_failed" });
    expect(d.deleteUpstream).toHaveBeenCalledWith("src_abc123");
  });

  it("rolls back on a duplicate infrastructure source id instead of taking ownership", async () => {
    const d = deps({ insertRegistryRow: vi.fn(async () => ({ ok: false, duplicate: true }) as InsertResult) });
    const out = await createSource({ ownerId: "owner-1", name: "X" }, d);

    expect(out.status).toBe(500);
    expect(d.deleteUpstream).toHaveBeenCalledWith("src_abc123");
    expect((d.logError as ReturnType<typeof vi.fn>).mock.calls.join(" ")).toContain("duplicate");
  });

  it("still fails cleanly and logs the orphan when compensating deletion fails", async () => {
    const d = deps({
      insertRegistryRow: vi.fn(async () => ({ ok: false }) as InsertResult),
      deleteUpstream: vi.fn(async () => false),
    });
    const out = await createSource({ ownerId: "owner-1", name: "X" }, d);

    expect(out.status).toBe(500);
    expect(out.body).toEqual({ error: "create_failed" });
    const logged = (d.logError as ReturnType<typeof vi.fn>).mock.calls.join(" ");
    expect(logged).toContain("compensating delete FAILED");
    expect(logged).toContain("src_abc123");
  });

  it("treats a thrown compensating delete as a failed cleanup", async () => {
    const d = deps({
      insertRegistryRow: vi.fn(async () => ({ ok: false }) as InsertResult),
      deleteUpstream: vi.fn(async () => {
        throw new Error("network down");
      }),
    });
    const out = await createSource({ ownerId: "owner-1", name: "X" }, d);

    expect(out.status).toBe(500);
    expect((d.logError as ReturnType<typeof vi.fn>).mock.calls.join(" ")).toContain("compensating delete FAILED");
  });
});
