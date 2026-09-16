import { describe, expect, it, vi } from "vitest";
import {
  createPullSource,
  deletePullSource,
  getPullSource,
  isObviouslyPrivate,
  isSyntacticallyValidHost,
  validateCallerSource,
  validateHost,
  validatePort,
  type PullSourceDeps,
} from "../../supabase/functions/mako-ingest/pull-sources";

const GOOD = {
  source: {
    name: "Truck A",
    source_id: "src_6343ce",
    host: "203.0.113.10",
    port: 9000,
    output_path: "src_6343ce-opus",
    service: "mako-pull-src_6343ce",
    state: "active",
  },
};

function deps(overrides: Partial<PullSourceDeps> = {}): PullSourceDeps {
  return {
    createUpstream: vi.fn(async () => ({ ok: true, raw: GOOD })),
    getUpstream: vi.fn(async () => ({ ok: true, raw: GOOD })),
    deleteUpstream: vi.fn(async () => ({ ok: true, raw: { deleted: true } })),
    logError: vi.fn(),
    ...overrides,
  };
}

const VALID = { name: "Truck A", host: "203.0.113.10", port: 9000 };

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
    });
    expect(d.createUpstream).toHaveBeenCalledWith({
      name: "Truck A",
      host: "203.0.113.10",
      port: 9000,
    });
  });

  it("rejects a malformed upstream source id without claiming success", async () => {
    const d = deps({
      createUpstream: async () => ({
        ok: true,
        raw: { source: { ...GOOD.source, source_id: "src_XYZ", output_path: "src_XYZ-opus" } },
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
        raw: { source: { ...GOOD.source, output_path: "src_000000-opus" } },
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
      createUpstream: async () => ({ ok: true, raw: { source: { ...GOOD.source, port: 0 } } }),
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
      createUpstream: async () => ({ ok: true, raw: { source: { ...GOOD.source, host: "a b" } } }),
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
        raw: { source: { ...GOOD.source, source_id: "src_111111", output_path: "src_111111-opus" } },
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

  it("validates ports and full payloads", () => {
    expect(validatePort(1)).toBe(1);
    expect(validatePort(65535)).toBe(65535);
    expect(validatePort(65536)).toBeNull();
    expect(validatePort(1.5)).toBeNull();
    expect(validateCallerSource(GOOD)?.source_id).toBe("src_6343ce");
    expect(validateCallerSource({})).toBeNull();
  });
});
