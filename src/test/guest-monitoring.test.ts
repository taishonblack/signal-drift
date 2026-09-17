import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionRecord, SrtLine } from "@/lib/session-store";

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInAnonymously: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(),
  signUp: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: authMocks.getUser,
      signInAnonymously: authMocks.signInAnonymously,
      getSession: authMocks.getSession,
      updateUser: authMocks.updateUser,
      signUp: authMocks.signUp,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    functions: { invoke: authMocks.invoke },
  },
}));

const line = (over: Partial<SrtLine> = {}): SrtLine =>
  ({
    id: 1,
    label: "Truck A",
    enabled: true,
    srtAddress: "srt://174.166.29.128:8000",
    mode: "caller",
    ...over,
  }) as SrtLine;

const record = (over: Partial<SessionRecord> = {}): SessionRecord =>
  ({
    id: "sess-guest",
    name: "Temporary Session",
    status: "active",
    createdAt: new Date().toISOString(),
    host: "Operator-AB12",
    lines: [line({ sourceKind: "runtime" })],
    attachments: [],
    attachmentsLoaded: true,
    notes: [],
    markers: [],
    viewers: [],
    ...over,
  }) as SessionRecord;

const parse = (v: string) => {
  const m = /srt:\/\/([^:]+):(\d+)/.exec(v ?? "");
  return { host: m?.[1] ?? "", port: m?.[2] ?? "" };
};

describe("guest caller-first monitoring", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("mints an anonymous backend identity at Start Monitoring and adopts its id", async () => {
    const { ensureBackendIdentity, getIdentity } = await import("@/lib/identity");
    authMocks.getUser.mockResolvedValue({ data: { user: null } });
    authMocks.signInAnonymously.mockResolvedValue({
      data: { user: { id: "anon-uuid-1", is_anonymous: true } },
      error: null,
    });

    const result = await ensureBackendIdentity();

    expect(result).toMatchObject({ ok: true, userId: "anon-uuid-1" });
    // The guest's local id IS the backend user id, so ownership, leases and RLS
    // all line up with an authenticated operator.
    expect(getIdentity()).toMatchObject({ kind: "guest", id: "anon-uuid-1" });
  });

  it("reports a failure instead of starting a session when identity creation fails", async () => {
    const { ensureBackendIdentity, getIdentity } = await import("@/lib/identity");
    authMocks.getUser.mockResolvedValue({ data: { user: null } });
    authMocks.signInAnonymously.mockResolvedValue({ data: {}, error: { message: "network" } });

    const result = await ensureBackendIdentity();

    expect(result.ok).toBe(false);
    expect(getIdentity().kind).toBe("anon");
  });

  it("keeps an anonymous backend user a Temporary Operator, not a member", async () => {
    const { adoptAnonymousIdentity, getIdentity } = await import("@/lib/identity");
    adoptAnonymousIdentity("anon-uuid-2");
    expect(getIdentity().kind).toBe("guest");
  });

  it("plays a guest caller-first slot from the provisioned dynamic path", async () => {
    const { inputsFromRecord } = await import("@/lib/stream-paths");
    const inputs = inputsFromRecord(
      record({
        attachments: [{ slot: 1, playbackPath: "src_a241b4-opus", label: "Truck A" }] as any,
      }),
      parse,
    );
    expect(inputs[0].streamName).toBe("src_a241b4-opus");
  });

  it("never falls back to camN for a caller-first slot — shows Provisioning Failed", async () => {
    const { inputsFromRecord } = await import("@/lib/stream-paths");
    const inputs = inputsFromRecord(record({ attachments: [], attachmentsLoaded: true }), parse);
    expect(inputs).toHaveLength(1);
    expect(inputs[0].status).toBe("provisioning_failed");
    expect(inputs[0].streamName).toBeUndefined();
  });

  it("shows Connecting while attachments are still loading", async () => {
    const { inputsFromRecord } = await import("@/lib/stream-paths");
    const inputs = inputsFromRecord(record({ attachments: [], attachmentsLoaded: false }), parse);
    expect(inputs[0].status).toBe("connecting");
    expect(inputs[0].streamName).toBeUndefined();
  });

  it("leaves legacy manual slots on the camN mapping", async () => {
    const { inputsFromRecord } = await import("@/lib/stream-paths");
    const inputs = inputsFromRecord(record({ lines: [line()], attachmentsLoaded: true }), parse);
    expect(inputs[0].streamName).toBe("cam1");
  });
});

describe("authentication transitions never touch the caller", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("claims the anonymous identity in place, keeping the same auth id", async () => {
    const { claimAnonymousIdentity } = await import("@/lib/guest-transfer");
    authMocks.getUser.mockResolvedValue({ data: { user: { id: "anon-1", is_anonymous: true } } });
    authMocks.updateUser.mockResolvedValue({ error: null });

    const out = await claimAnonymousIdentity("op@example.com", "sup3r-secret-pw");

    expect(out.ok).toBe(true);
    expect(authMocks.updateUser).toHaveBeenCalledWith({
      email: "op@example.com",
      password: "sup3r-secret-pw",
    });
    // No new user, no re-provisioning.
    expect(authMocks.signUp).not.toHaveBeenCalled();
    expect(authMocks.invoke).not.toHaveBeenCalled();
  });

  it("transfers ownership without invoking provisioning, preserving the runtime route", async () => {
    const { addSession, getSessionById } = await import("@/lib/session-store");
    const { transferGuestSessions } = await import("@/lib/guest-transfer");
    addSession(
      record({
        id: "sess-transfer",
        ownerUserId: "anon-1",
        hostUserId: "anon-1",
        guestOwned: true,
        lines: [line({ sourceKind: "runtime", runtimeRouteId: "route-uuid-1" })],
      }),
    );
    authMocks.getUser.mockResolvedValue({ data: { user: { id: "member-1", is_anonymous: false } } });
    authMocks.invoke.mockResolvedValue({
      data: { ok: true, transferred: ["sess-transfer"], skipped: [] },
      error: null,
    });

    const out = await transferGuestSessions(
      { token: "anon-token", userId: "anon-1" },
      ["sess-transfer"],
    );

    expect(out).toMatchObject({ ok: true, transferred: ["sess-transfer"] });
    expect(authMocks.invoke).toHaveBeenCalledTimes(1);
    expect(authMocks.invoke.mock.calls[0][0]).toBe("transfer-guest-session");
    const after = getSessionById("sess-transfer");
    expect(after?.ownerUserId).toBe("member-1");
    expect(after?.guestOwned).toBe(false);
    // The caller is untouched: same runtime route id, same lines.
    expect(after?.lines[0].runtimeRouteId).toBe("route-uuid-1");
    expect(after?.lines[0].sourceKind).toBe("runtime");
  });

  it("refuses to transfer when the browser is not signed into a real account", async () => {
    const { transferGuestSessions } = await import("@/lib/guest-transfer");
    authMocks.getUser.mockResolvedValue({ data: { user: { id: "anon-1", is_anonymous: true } } });

    const out = await transferGuestSessions({ token: "t", userId: "anon-1" }, ["sess-x"]);

    expect(out).toMatchObject({ ok: false, error: "not_signed_in" });
    expect(authMocks.invoke).not.toHaveBeenCalled();
  });

  it("captures the anonymous proof token only for an anonymous session", async () => {
    const { captureAnonymousToken } = await import("@/lib/guest-transfer");
    authMocks.getSession.mockResolvedValueOnce({
      data: { session: { access_token: "tok", user: { id: "anon-1", is_anonymous: true } } },
    });
    expect(await captureAnonymousToken()).toEqual({ token: "tok", userId: "anon-1" });

    authMocks.getSession.mockResolvedValueOnce({
      data: { session: { access_token: "tok", user: { id: "member-1", is_anonymous: false } } },
    });
    expect(await captureAnonymousToken()).toBeNull();
  });
});
