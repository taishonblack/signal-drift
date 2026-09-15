import { describe, expect, it } from "vitest";
import {
  deleteSource,
  type DeleteSourceDeps,
  type RegistryPatch,
  type RegistrySourceRow,
} from "../../supabase/functions/mako-ingest/delete-source";

const OWNER = "7612b81d-6b3c-4bf5-97e4-64c6563bfad3";
const OTHER = "00000000-0000-0000-0000-000000000999";
const ROW_ID = "54a6ed21-09ba-4788-a231-87430bcce166";

function row(overrides: Partial<RegistrySourceRow> = {}): RegistrySourceRow {
  return {
    id: ROW_ID,
    owner_id: OWNER,
    infrastructure_source_id: "src_250420",
    lifecycle_status: "ready",
    connection_status: "connected",
    ...overrides,
  };
}

type Harness = {
  deps: DeleteSourceDeps;
  patches: Array<{ id: string; patch: RegistryPatch }>;
  deleted: string[];
  logs: string[];
};

function harness(opts: {
  registry?: RegistrySourceRow | null;
  attachments?: number;
  upstreamOk?: boolean;
  upstreamThrows?: boolean;
  updateOk?: boolean | boolean[];
} = {}): Harness {
  const patches: Array<{ id: string; patch: RegistryPatch }> = [];
  const deleted: string[] = [];
  const logs: string[] = [];
  const updateResults = Array.isArray(opts.updateOk) ? [...opts.updateOk] : null;

  const deps: DeleteSourceDeps = {
    loadRegistryRow: async () =>
      opts.registry === undefined ? row() : opts.registry,
    countActiveAttachments: async () => opts.attachments ?? 0,
    updateRegistryRow: async (id, patch) => {
      patches.push({ id, patch });
      if (updateResults) return updateResults.shift() ?? true;
      return typeof opts.updateOk === "boolean" ? opts.updateOk : true;
    },
    deleteUpstream: async (id) => {
      if (opts.upstreamThrows) throw new Error("network");
      deleted.push(id);
      return opts.upstreamOk ?? true;
    },
    logError: (m) => logs.push(m),
    now: () => "2026-09-15T00:00:00.000Z",
  };

  return { deps, patches, deleted, logs };
}

const admin = { sourceId: "src_250420", userId: OWNER, isAdmin: true };

describe("deleteSource", () => {
  it("rejects a malformed source id without touching anything", async () => {
    const h = harness();
    const out = await deleteSource({ ...admin, sourceId: "cam1" }, h.deps);
    expect(out.status).toBe(400);
    expect(out.body.error).toBe("invalid_source_id");
    expect(h.deleted).toEqual([]);
    expect(h.patches).toEqual([]);
  });

  it("refuses unregistered (legacy) infrastructure sources", async () => {
    const h = harness({ registry: null });
    const out = await deleteSource(admin, h.deps);
    expect(out.status).toBe(409);
    expect(out.body.error).toBe("not_registered");
    expect(h.deleted).toEqual([]);
    expect(h.patches).toEqual([]);
  });

  it("refuses a source owned by another user when not admin", async () => {
    const h = harness({ registry: row({ owner_id: OTHER }) });
    const out = await deleteSource(
      { sourceId: "src_250420", userId: OWNER, isAdmin: false },
      h.deps,
    );
    expect(out.status).toBe(403);
    expect(h.deleted).toEqual([]);
    expect(h.patches).toEqual([]);
  });

  it("refuses a source with an active session attachment", async () => {
    const h = harness({ attachments: 1 });
    const out = await deleteSource(admin, h.deps);
    expect(out.status).toBe(409);
    expect(out.body.error).toBe("source_in_use");
    expect(h.deleted).toEqual([]);
    expect(h.patches).toEqual([]);
  });

  it("is idempotent for an already deleted source", async () => {
    const h = harness({ registry: row({ lifecycle_status: "deleted" }) });
    const out = await deleteSource(admin, h.deps);
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({
      source_id: "src_250420",
      deleted: true,
      already_deleted: true,
      ingest_source_id: ROW_ID,
    });
    expect(h.deleted).toEqual([]);
    expect(h.patches).toEqual([]);
  });

  it("returns an in-progress conflict while a deletion is running", async () => {
    const h = harness({ registry: row({ lifecycle_status: "deleting" }) });
    const out = await deleteSource(admin, h.deps);
    expect(out.status).toBe(409);
    expect(out.body.error).toBe("delete_in_progress");
    expect(h.deleted).toEqual([]);
  });

  it("marks deleting, deletes upstream, then finalizes deleted/offline", async () => {
    const h = harness();
    const out = await deleteSource(admin, h.deps);

    expect(h.patches[0]).toEqual({ id: ROW_ID, patch: { lifecycle_status: "deleting" } });
    expect(h.deleted).toEqual(["src_250420"]);
    expect(h.patches[1]).toEqual({
      id: ROW_ID,
      patch: {
        lifecycle_status: "deleted",
        connection_status: "offline",
        connection_checked_at: "2026-09-15T00:00:00.000Z",
        last_error: null,
      },
    });
    expect(out.status).toBe(200);
    expect(out.body).toEqual({
      source_id: "src_250420",
      deleted: true,
      ingest_source_id: ROW_ID,
    });
  });

  it("uses the stored infrastructure id, not browser input or the port", async () => {
    const h = harness({ registry: row({ infrastructure_source_id: "src_aaaaaa" }) });
    await deleteSource({ ...admin, sourceId: "src_250420" }, h.deps);
    expect(h.deleted).toEqual(["src_aaaaaa"]);
  });

  it("moves to error and preserves the row when upstream deletion fails", async () => {
    const h = harness({ upstreamOk: false });
    const out = await deleteSource(admin, h.deps);

    expect(out.status).toBe(502);
    expect(out.body.error).toBe("delete_failed");
    expect(h.patches[1].patch.lifecycle_status).toBe("error");
    expect(typeof h.patches[1].patch.last_error).toBe("string");
    expect(h.patches[1].patch.connection_status).toBeUndefined();
    expect(h.logs.join(" ")).toContain("src_250420");
  });

  it("treats a thrown upstream call as failure", async () => {
    const h = harness({ upstreamThrows: true });
    const out = await deleteSource(admin, h.deps);
    expect(out.status).toBe(502);
    expect(h.patches[1].patch.lifecycle_status).toBe("error");
  });

  it("aborts before upstream when the deleting mark cannot be written", async () => {
    const h = harness({ updateOk: false });
    const out = await deleteSource(admin, h.deps);
    expect(out.status).toBe(500);
    expect(out.body.error).toBe("delete_failed");
    expect(h.deleted).toEqual([]);
  });

  it("still reports success but logs when finalization fails after upstream delete", async () => {
    const h = harness({ updateOk: [true, false] });
    const out = await deleteSource(admin, h.deps);
    expect(out.status).toBe(200);
    expect(h.deleted).toEqual(["src_250420"]);
    expect(h.logs.join(" ")).toContain("reconciliation");
  });
});
