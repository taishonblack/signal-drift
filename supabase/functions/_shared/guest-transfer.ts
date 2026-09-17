// Pure guest -> account ownership transfer logic, so the authorization rules
// are testable without a running Deno server.
//
// Invariant: this module only moves owner references. It never provisions,
// deletes or re-dials a caller, and never touches runtime route ids,
// infrastructure source ids or playback paths.

export interface TransferUser {
  id: string;
  is_anonymous?: boolean;
}

export interface TransferDeps {
  /** Verify the caller's own JWT (from the Authorization header). */
  getDestinationUser: () => Promise<TransferUser | null>;
  /** Verify the anonymous access token the browser is transferring from. */
  getAnonymousUser: (token: string) => Promise<TransferUser | null>;
  /** Idempotent database routine. Rejects when the session isn't owned by `from`. */
  transfer: (sessionId: string, from: string, to: string) => Promise<{ transferred: boolean } | null>;
  logError?: (message: string) => void;
}

export interface TransferInput {
  anonymousAccessToken: string;
  sessionIds: string[];
}

export type TransferOutcome =
  | { ok: true; status: 200; transferred: string[]; skipped: string[]; sameIdentity?: boolean }
  | { ok: false; status: number; error: string };

export async function transferGuestSessions(
  input: TransferInput,
  deps: TransferDeps,
): Promise<TransferOutcome> {
  const dest = await deps.getDestinationUser();
  if (!dest) return { ok: false, status: 401, error: "unauthorized" };
  if (dest.is_anonymous) return { ok: false, status: 400, error: "destination_anonymous" };

  const src = await deps.getAnonymousUser(input.anonymousAccessToken);
  if (!src) return { ok: false, status: 401, error: "invalid_anonymous_token" };
  if (!src.is_anonymous) return { ok: false, status: 400, error: "source_not_anonymous" };
  if (src.id === dest.id) {
    return { ok: true, status: 200, transferred: [], skipped: input.sessionIds, sameIdentity: true };
  }

  const transferred: string[] = [];
  const skipped: string[] = [];
  for (const sessionId of input.sessionIds) {
    try {
      const result = await deps.transfer(sessionId, src.id, dest.id);
      if (result?.transferred) transferred.push(sessionId);
      else skipped.push(sessionId);
    } catch (e) {
      // forbidden / session_not_found are expected for anything this anonymous
      // identity does not own. Never leak details about another owner's session.
      deps.logError?.(`transfer-guest-session: ${sessionId} — ${e instanceof Error ? e.message : "failed"}`);
      skipped.push(sessionId);
    }
  }
  return { ok: true, status: 200, transferred, skipped };
}
