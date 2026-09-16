import { describe, expect, it, vi } from "vitest";
import {
  createPullSource,
  deletePullSource,
  getPullSource,
  getPullSourceByIdempotencyKey,
  isObviouslyPrivate,
  isSyntacticallyValidHost,
  validateCallerSource,
  validateHost,
  validateIdempotencyKey,
  validatePort,
  type PullSourceDeps,
} from "../../supabase/functions/mako-ingest/pull-sources";

const KEY = "3f6b1c2d-4e5a-4b6c-8d9e-0f1a2b3c4d5e";
const OTHER_KEY = "9a8b7c6d-5e4f-4a3b-9c8d-7e6f5a4b3c2d";

const GOOD_SOURCE = {
  name: "Truck A",
  source_id: "src_6343ce",
  host: "203.0.113.10",
  port: 9000,
  output_path: "src_6343ce-opus",
  idempotency_key: KEY,
  service: "mako-pull@src_6343ce.service",
  state: "active",
};

const GOOD = { source: GOOD_SOURCE };

function deps(overrides: Partial<PullSourceDeps> = {}): PullSourceDeps {
  return {
    createUpstream: vi.fn(async () => ({ ok: true, raw: GOOD })),
    getUpstream: vi.fn(async () => ({ ok: true, raw: GOOD })),
    lookupUpstream: vi.fn(async () => ({ ok: true, raw: GOOD })),
    deleteUpstream: vi.fn(async () => ({ ok: true, raw: { deleted: true } })),
    logError: vi.fn(),
    ...overrides,
  };
}

const VALID = { name: "Truck A", host: "203.0.113.10", port: 9000, idempotency_key: KEY };

describe("create_pull_source", () => {
  it("creates a caller route and returns the validated identity", async () => {
    const d = deps();
    const out = await createPullSource(VALID, d);
    expect(out.status).toBe(200);
    expect(out.body.source).toMatchObject({
      source_id: "src_6343ce",
      output_path: "src_6343ce-opus",
      host: "203.0.113.10",
      port: 9000,
      idempotency_key: KEY,
    });
    expect(d.createUpstream).toHaveBeenCalledWith({
      name: "Truck A",
      host: "203.0.113.10",
      port: 9000,
      idempotency_key: KEY,
    });
  });

  it("requires an idempotency key", async () => {
    const d = deps();
    const out = await createPullSource(
      { name: "Truck A", host: "203.0.113.10", port: 9000, idempotency_key: undefined },
      d,
    );
    expect(out.status).toBe(400);
    expect(out.body.error).toBe("invalid_idempotency_key");
    expect(d.createUpstream).not.toHaveBeenCalled();
  });

  it("rejects a malformed UUID before any upstream call", async () => {
    const d = deps();
    for (const key of ["not-a-uuid", "../x", "3f6b1c2d4e5a", "https://evil.com/x", ""]) {
      const out = await createPullSource({ ...VALID, idempotency_key: key }, d);
      expect(out.status).toBe(400);
      expect(out.body.error).toBe("invalid_idempotency_key");
    }
    expect(d.createUpstream).not.toHaveBeenCalled();
  });

  it("forwards a valid uppercase UUID unchanged in lowercase-canonical form", async () => {
    const d = deps();
    await createPullSource({ ...VALID, idempotency_key: KEY.toUpperCase() }, d);
    expect(d.createUpstream).toHaveBeenCalledWith(expect.objectContaining({ idempotency_key: KEY }));
  });

  it("rejects a create response whose idempotency key differs from the request", async () => {
    const d = deps({
      createUpstream: async () => ({
        ok: true,
        raw: {
          source: { ...GOOD_SOURCE, idempotency_key: OTHER_KEY, source_id: "src_111111", output_path: "src_111111-opus" },
        },
      }),
    });
    const out = await createPullSource(VALID, d);
    expect(out.status).toBe(502);
    expect(out.body.error).toBe("invalid_upstream_response");
    expect(d.logError).toHaveBeenCalled();
  });

  it("returns the existing caller normally on a same-key retry", async () => {
    const d = deps();
    const first = await createPullSource(VALID, d);
    const retry = await createPullSource(VALID, d);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect((retry.body.source as { source_id: string }).source_id).toBe("src_6343ce");
  });

  it("maps an upstream 409 to a typed idempotency conflict", async () => {
    const d = deps({
      createUpstream: async () => ({ ok: false, error: "idempotency_conflict", status: 409 }),
    });
    const out = await createPullSource(VALID, d);
    expect(out).toEqual({ status: 409, body: { error: "idempotency_conflict" } });
    expect(JSON.stringify(out)).not.toMatch(/token|bearer|detail/i);
  });

  it("maps an upstream 410 to a typed tombstoned key", async () => {
    const d = deps({
      createUpstream: async () => ({ ok: false, error: "idempotency_tombstoned", status: 410 }),
    });
    const out = await createPullSource(VALID, d);
    expect(out).toEqual({ status: 410, body: { error: "idempotency_tombstoned" } });
  });

  it("rejects a malformed upstream source id without claiming success", async () => {
    const d = deps({
      createUpstream: async () => ({
        ok: true,
        raw: {
          source: { ...GOOD_SOURCE, source_id: "src_XYZ", output_path: "src_XYZ-opus" },
        },
      }),
    });
    const out = await createPullSource(VALID, d);
    expect(out.status).toBe(502);
    expect(out.body.error).toBe("invalid_upstream_response");
    expect(d.logError).toHaveBeenCalled();
  });

  it("rejects a mismatched playback output path", async () => {
    const d = deps({
      createUpstream: async () => ({
        ok: true,
        raw: { source: { ...GOOD_SOURCE, output_path: "src_000000-opus" } },
      }),
    });
    expect((await createPullSource(VALID, d)).status).toBe(502);
  });

  it("rejects an out-of-range port in the request", async () => {
    const d = deps();
    const out = await createPullSource({ ...VALID, port: 70000 }, d);
    expect(out.status).toBe(400);
    expect(out.body.error).toBe("invalid_port");
    expect(d.createUpstream).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range port in the upstream response", async () => {
    const d = deps({
      createUpstream: async () => ({ ok: true, raw: { source: { ...GOOD_SOURCE, port: 0 } } }),
    });
    expect((await createPullSource(VALID, d)).status).toBe(502);
  });

  it("rejects an invalid or non-public host before forwarding", async () => {
    const d = deps();
    expect((await createPullSource({ ...VALID, host: "http://1.2.3.4/x" }, d)).body.error).toBe(
      "invalid_host",
    );
    expect((await createPullSource({ ...VALID, host: "192.168.1.20" }, d)).body.error).toBe(
      "host_not_public",
    );
    expect((await createPullSource({ ...VALID, host: "" }, d)).body.error).toBe("invalid_host");
    expect(d.createUpstream).not.toHaveBeenCalled();
  });

  it("rejects an invalid host in the upstream response", async () => {
    const d = deps({
      createUpstream: async () => ({ ok: true, raw: { source: { ...GOOD_SOURCE, host: "a b" } } }),
    });
    expect((await createPullSource(VALID, d)).status).toBe(502);
  });

  it("rejects an invalid friendly name", async () => {
    const d = deps();
    expect((await createPullSource({ ...VALID, name: "  " }, d)).body.error).toBe("invalid_name");
    expect((await createPullSource({ ...VALID, name: "bad;name" }, d)).body.error).toBe(
      "invalid_name",
    );
  });

  it("returns a sanitized upstream failure", async () => {
    const d = deps({
      createUpstream: async () => ({ ok: false, error: "upstream_error", status: 502 }),
    });
    const out = await createPullSource(VALID, d);
    expect(out).toEqual({ status: 502, body: { error: "upstream_error" } });
    expect(JSON.stringify(out)).not.toMatch(/token|bearer/i);
  });
});

describe("get_pull_source_by_idempotency_key", () => {
  it("returns the active caller for a known key", async () => {
    const d = deps();
    const out = await getPullSourceByIdempotencyKey({ idempotency_key: KEY }, d);
    expect(out.status).toBe(200);
    expect(out.body.source).toMatchObject({
      source_id: "src_6343ce",
      idempotency_key: KEY,
      state: "active",
    });
    expect(d.lookupUpstream).toHaveBeenCalledWith(KEY);
  });

  it("rejects a malformed UUID before any upstream call", async () => {
    const d = deps();
    for (const key of ["not-a-uuid", "../src_6343ce", "https://evil.com", ""]) {
      const out = await getPullSourceByIdempotencyKey({ idempotency_key: key }, d);
      expect(out.status).toBe(400);
      expect(out.body.error).toBe("invalid_idempotency_key");
    }
    expect(d.lookupUpstream).not.toHaveBeenCalled();
  });

  it("passes only the validated UUID to the lookup dependency", async () => {
    const d = deps();
    await getPullSourceByIdempotencyKey({ idempotency_key: `  ${KEY.toUpperCase()}  ` }, d);
    expect(d.lookupUpstream).toHaveBeenCalledWith(KEY);
  });

  it("validates a tombstoned lookup response", async () => {
    const d = deps({
      lookupUpstream: async () => ({
        ok: true,
        raw: {
          source_id: "src_6343ce",
          host: "203.0.113.10",
          port: 9000,
          output_path: "src_6343ce-opus",
          idempotency_key: KEY,
          deleted_at: "2026-09-16T00:00:00Z",
          state: "tombstoned",
        },
      }),
    });
    const out = await getPullSourceByIdempotencyKey({ idempotency_key: KEY }, d);
    expect(out.status).toBe(200);
    expect(out.body.source).toMatchObject({ state: "tombstoned", deleted_at: "2026-09-16T00:00:00Z" });
  });

  it("rejects a lookup response whose key differs from the request", async () => {
    const d = deps({
      lookupUpstream: async () => ({
        ok: true,
        raw: { source: { ...GOOD_SOURCE, idempotency_key: OTHER_KEY } },
      }),
    });
    const out = await getPullSourceByIdempotencyKey({ idempotency_key: KEY }, d);
    expect(out.status).toBe(502);
    expect(out.body.error).toBe("invalid_upstream_response");
  });

  it("returns a deterministic sanitized not-found for an unknown key", async () => {
    const d = deps({
      lookupUpstream: async () => ({ ok: false, error: "not_found", status: 404 }),
    });
    const out = await getPullSourceByIdempotencyKey({ idempotency_key: KEY }, d);
    expect(out).toEqual({ status: 404, body: { error: "not_found" } });
    expect(JSON.stringify(out)).not.toMatch(/token|bearer|detail/i);
  });
});

describe("get_pull_source", () => {
  it("returns the live caller route", async () => {
    const d = deps();
    const out = await getPullSource({ source_id: "src_6343ce" }, d);
    expect(out.status).toBe(200);
    expect(out.body.source).toMatchObject({ source_id: "src_6343ce", state: "active" });
    expect(d.getUpstream).toHaveBeenCalledWith("src_6343ce");
  });

  it("rejects a malformed source id before touching the upstream URL", async () => {
    const d = deps();
    for (const id of ["src_ABC123", "../sources", "src_6343c", ""]) {
      const out = await getPullSource({ source_id: id }, d);
      expect(out.status).toBe(400);
      expect(out.body.error).toBe("invalid_source_id");
    }
    expect(d.getUpstream).not.toHaveBeenCalled();
  });

  it("rejects an upstream identity mismatch", async () => {
    const d = deps({
      getUpstream: async () => ({
        ok: true,
        raw: {
          source: { ...GOOD_SOURCE, source_id: "src_111111", output_path: "src_111111-opus" },
        },
      }),
    });
    expect((await getPullSource({ source_id: "src_6343ce" }, d)).status).toBe(502);
  });
});

describe("delete_pull_source", () => {
  it("deletes a caller route", async () => {
    const d = deps();
    const out = await deletePullSource({ source_id: "src_6343ce" }, d);
    expect(out).toEqual({ status: 200, body: { deleted: true, source_id: "src_6343ce" } });
    expect(d.deleteUpstream).toHaveBeenCalledWith("src_6343ce");
  });

  it("rejects a malformed source id", async () => {
    const d = deps();
    const out = await deletePullSource({ source_id: "src_zzzzzz" }, d);
    expect(out.status).toBe(400);
    expect(d.deleteUpstream).not.toHaveBeenCalled();
  });

  it("surfaces a sanitized upstream failure", async () => {
    const d = deps({
      deleteUpstream: async () => ({ ok: false, error: "upstream_unreachable", status: 502 }),
    });
    expect((await deletePullSource({ source_id: "src_6343ce" }, d)).body.error).toBe(
      "upstream_unreachable",
    );
  });
});

describe("validators", () => {
  it("accepts public hostnames and rejects private/malformed ones", () => {
    for (const h of ["encoder.example.com", "203.0.113.10", "2001:db8::1"]) {
      expect(isSyntacticallyValidHost(h)).toBe(true);
      expect(isObviouslyPrivate(h)).toBe(false);
    }
    for (const h of ["localhost", "127.0.0.1", "10.0.0.4", "172.16.5.9", "169.254.1.1", "::1"]) {
      expect(isObviouslyPrivate(h)).toBe(true);
    }
    for (const h of ["host:9000", "srt://x.com", " x.com", "x .com", "a/b", ""]) {
      expect(isSyntacticallyValidHost(h)).toBe(false);
    }
    expect(validateHost("example.com")).toEqual({ ok: true, host: "example.com" });
  });

  it("validates ports, UUIDs and full payloads", () => {
    expect(validatePort(1)).toBe(1);
    expect(validatePort(65535)).toBe(65535);
    expect(validatePort(65536)).toBeNull();
    expect(validatePort(1.5)).toBeNull();

    expect(validateIdempotencyKey(KEY)).toBe(KEY);
    expect(validateIdempotencyKey(KEY.toUpperCase())).toBe(KEY);
    expect(validateIdempotencyKey("not-a-uuid")).toBeNull();

    expect(validateCallerSource(GOOD)?.source_id).toBe("src_6343ce");
    expect(validateCallerSource({})).toBeNull();
    expect(validateCallerSource(GOOD, KEY)).not.toBeNull();
    expect(validateCallerSource(GOOD, OTHER_KEY)).toBeNull();
  });
});
