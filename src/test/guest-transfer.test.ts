import { describe, expect, it, vi } from "vitest";
import {
  transferGuestSessions,
  type TransferDeps,
} from "../../supabase/functions/_shared/guest-transfer";

const deps = (over: Partial<TransferDeps> = {}): TransferDeps => ({
  getDestinationUser: async () => ({ id: "member-1", is_anonymous: false }),
  getAnonymousUser: async () => ({ id: "anon-1", is_anonymous: true }),
  transfer: async () => ({ transferred: true }),
  logError: () => undefined,
  ...over,
});

describe("guest → account ownership transfer (server rules)", () => {
  it("transfers the anonymous identity's sessions to the signed-in account", async () => {
    const calls: Array<[string, string, string]> = [];
    const out = await transferGuestSessions(
      { anonymousAccessToken: "a".repeat(30), sessionIds: ["sess-1", "sess-2"] },
      deps({
        transfer: async (id, from, to) => {
          calls.push([id, from, to]);
          return { transferred: true };
        },
      }),
    );
    expect(out).toMatchObject({ ok: true, transferred: ["sess-1", "sess-2"], skipped: [] });
    expect(calls).toEqual([
      ["sess-1", "anon-1", "member-1"],
      ["sess-2", "anon-1", "member-1"],
    ]);
  });

  it("rejects an unauthenticated caller", async () => {
    const out = await transferGuestSessions(
      { anonymousAccessToken: "a".repeat(30), sessionIds: ["sess-1"] },
      deps({ getDestinationUser: async () => null }),
    );
    expect(out).toMatchObject({ ok: false, status: 401, error: "unauthorized" });
  });

  it("refuses an anonymous destination — a guest cannot claim into another guest", async () => {
    const out = await transferGuestSessions(
      { anonymousAccessToken: "a".repeat(30), sessionIds: ["sess-1"] },
      deps({ getDestinationUser: async () => ({ id: "anon-2", is_anonymous: true }) }),
    );
    expect(out).toMatchObject({ ok: false, status: 400, error: "destination_anonymous" });
  });

  it("rejects an invalid anonymous proof token", async () => {
    const out = await transferGuestSessions(
      { anonymousAccessToken: "a".repeat(30), sessionIds: ["sess-1"] },
      deps({ getAnonymousUser: async () => null }),
    );
    expect(out).toMatchObject({ ok: false, status: 401, error: "invalid_anonymous_token" });
  });

  it("refuses a non-anonymous source token — no stealing another account's session", async () => {
    const out = await transferGuestSessions(
      { anonymousAccessToken: "a".repeat(30), sessionIds: ["sess-1"] },
      deps({ getAnonymousUser: async () => ({ id: "member-9", is_anonymous: false }) }),
    );
    expect(out).toMatchObject({ ok: false, status: 400, error: "source_not_anonymous" });
  });

  it("skips a session the anonymous identity does not own instead of leaking why", async () => {
    const out = await transferGuestSessions(
      { anonymousAccessToken: "a".repeat(30), sessionIds: ["someone-elses"] },
      deps({
        transfer: async () => {
          throw new Error("forbidden");
        },
      }),
    );
    expect(out).toMatchObject({ ok: true, transferred: [], skipped: ["someone-elses"] });
  });

  it("is idempotent: an already-owned session is reported as skipped", async () => {
    const out = await transferGuestSessions(
      { anonymousAccessToken: "a".repeat(30), sessionIds: ["sess-1"] },
      deps({ transfer: async () => ({ transferred: false }) }),
    );
    expect(out).toMatchObject({ ok: true, transferred: [], skipped: ["sess-1"] });
  });

  it("does nothing when the identity did not change (claim in place)", async () => {
    const transfer = vi.fn();
    const out = await transferGuestSessions(
      { anonymousAccessToken: "a".repeat(30), sessionIds: ["sess-1"] },
      deps({
        getDestinationUser: async () => ({ id: "same-1", is_anonymous: false }),
        getAnonymousUser: async () => ({ id: "same-1", is_anonymous: true }),
        transfer,
      }),
    );
    expect(out).toMatchObject({ ok: true, sameIdentity: true, transferred: [] });
    expect(transfer).not.toHaveBeenCalled();
  });
});
