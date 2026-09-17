// Phase D — runtime-route release behaviour.
//
// The rule under test throughout: a caller's endpoint is freed ONLY when its
// upstream teardown is CONFIRMED. Anything uncertain must retain the route, and
// therefore its endpoint, for reconciliation.

import { describe, it, expect, vi } from "vitest";
import {
  releaseRoute,
  releaseRoutes,
  releaseSession,
  type ReleaseDeps,
  type ReleaseRoute,
} from "../../supabase/functions/_shared/route-release";

const route = (over: Partial<ReleaseRoute> = {}): ReleaseRoute => ({
  route_id: "11111111-1111-4111-8111-111111111111",
  owner_id: "22222222-2222-4222-8222-222222222222",
  infrastructure_source_id: "src_abc123",
  lifecycle_status: "tearing_down",
  ...over,
});

function deps(over: Partial<ReleaseDeps> = {}): ReleaseDeps {
  return {
    beginRelease: vi.fn(async () => ({ ok: true, routes: [route()] })),
    lookupCaller: vi.fn(async () => ({ ok: false, status: 404 })),
    deleteCaller: vi.fn(async () => ({ ok: true })),
    archiveRoute: vi.fn(async () => true),
    recordTeardownFailure: vi.fn(async () => {}),
    logError: vi.fn(),
    ...over,
  };
}

describe("releaseRoute", () => {
  it("archives the route once upstream teardown is confirmed", async () => {
    const d = deps();
    await expect(releaseRoute(route(), d)).resolves.toBe("released");
    expect(d.deleteCaller).toHaveBeenCalledWith("src_abc123");
    expect(d.archiveRoute).toHaveBeenCalledWith(
      route().owner_id,
      route().route_id,
      "torn_down",
    );
    expect(d.recordTeardownFailure).not.toHaveBeenCalled();
  });

  it("retains the route and its endpoint when teardown is not confirmed", async () => {
    const d = deps({ deleteCaller: vi.fn(async () => ({ ok: false, error: "upstream_error" })) });
    await expect(releaseRoute(route(), d)).resolves.toBe("retained");
    expect(d.archiveRoute).not.toHaveBeenCalled();
    expect(d.recordTeardownFailure).toHaveBeenCalledWith(
      route().owner_id,
      route().route_id,
      "upstream_error",
    );
  });

  it("recovers a lost identity by idempotency key and then deletes it", async () => {
    const d = deps({
      lookupCaller: vi.fn(async () => ({
        ok: true,
        status: 200,
        source: { source_id: "src_ffeedd", state: "active" },
      })),
    });
    await expect(
      releaseRoute(route({ infrastructure_source_id: null }), d),
    ).resolves.toBe("released");
    expect(d.lookupCaller).toHaveBeenCalledWith(route().route_id);
    expect(d.deleteCaller).toHaveBeenCalledWith("src_ffeedd");
  });

  it("treats an already-tombstoned caller as confirmed gone", async () => {
    const d = deps({
      lookupCaller: vi.fn(async () => ({
        ok: true,
        status: 200,
        source: { source_id: "src_ffeedd", state: "tombstoned" },
      })),
    });
    await expect(
      releaseRoute(route({ infrastructure_source_id: null }), d),
    ).resolves.toBe("released");
    expect(d.deleteCaller).not.toHaveBeenCalled();
  });

  it("treats an unknown idempotency key as nothing ever created", async () => {
    const d = deps({ lookupCaller: vi.fn(async () => ({ ok: false, status: 404 })) });
    await expect(
      releaseRoute(route({ infrastructure_source_id: null }), d),
    ).resolves.toBe("released");
    expect(d.deleteCaller).not.toHaveBeenCalled();
  });

  it("retains the endpoint when upstream is unreachable and identity is unknown", async () => {
    const d = deps({ lookupCaller: vi.fn(async () => ({ ok: false, status: 502 })) });
    await expect(
      releaseRoute(route({ infrastructure_source_id: null }), d),
    ).resolves.toBe("retained");
    expect(d.deleteCaller).not.toHaveBeenCalled();
    expect(d.recordTeardownFailure).toHaveBeenCalledWith(
      route().owner_id,
      route().route_id,
      "identity_unresolved",
    );
  });

  it("retains the route when archiving fails after a confirmed delete", async () => {
    const d = deps({ archiveRoute: vi.fn(async () => false) });
    await expect(releaseRoute(route(), d)).resolves.toBe("retained");
    expect(d.recordTeardownFailure).toHaveBeenCalledWith(
      route().owner_id,
      route().route_id,
      "archive_failed",
    );
  });

  it("never creates infrastructure — only lookup and delete are available", async () => {
    const d = deps();
    await releaseRoute(route({ infrastructure_source_id: null }), d);
    expect(Object.keys(d)).not.toContain("createCaller");
  });

  it("is idempotent across repeated passes", async () => {
    const d = deps();
    await releaseRoute(route(), d);
    await releaseRoute(route(), d);
    expect(d.archiveRoute).toHaveBeenCalledTimes(2);
    expect(d.recordTeardownFailure).not.toHaveBeenCalled();
  });
});

describe("releaseRoutes", () => {
  it("reports released and retained counts independently", async () => {
    const failing = "33333333-3333-4333-8333-333333333333";
    const d = deps({
      deleteCaller: vi.fn(async (sourceId: string) =>
        sourceId === "src_bad999" ? { ok: false, error: "upstream_error" } : { ok: true },
      ),
    });
    const summary = await releaseRoutes(
      [route(), route({ route_id: failing, infrastructure_source_id: "src_bad999" })],
      d,
    );
    expect(summary).toEqual({ released: 1, retained: 1 });
  });
});

describe("releaseSession", () => {
  it("detaches and flags in the database BEFORE touching upstream", async () => {
    const order: string[] = [];
    const d = deps({
      beginRelease: vi.fn(async () => {
        order.push("begin");
        return { ok: true, routes: [route()] };
      }),
      deleteCaller: vi.fn(async () => {
        order.push("delete");
        return { ok: true };
      }),
    });
    await releaseSession("sess-1", "owner_ended", d);
    expect(order).toEqual(["begin", "delete"]);
  });

  it("passes the release reason through unchanged", async () => {
    const d = deps();
    await releaseSession("sess-1", "lease_expired", d);
    expect(d.beginRelease).toHaveBeenCalledWith("sess-1", "lease_expired");
  });

  it("does not tear anything down when the transactional step fails", async () => {
    const d = deps({
      beginRelease: vi.fn(async () => ({ ok: false, routes: [], error: "release_failed" })),
    });
    await expect(releaseSession("sess-1", "owner_ended", d)).resolves.toEqual({
      ok: false,
      error: "release_failed",
    });
    expect(d.deleteCaller).not.toHaveBeenCalled();
  });

  it("succeeds with nothing to do for a session that has no runtime routes", async () => {
    const d = deps({ beginRelease: vi.fn(async () => ({ ok: true, routes: [] })) });
    await expect(releaseSession("sess-legacy", "owner_ended", d)).resolves.toEqual({
      ok: true,
      released: 0,
      retained: 0,
    });
  });
});
