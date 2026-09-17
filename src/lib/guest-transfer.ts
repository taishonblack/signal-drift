// Guest -> account conversion, client side.
//
// Two distinct operations, deliberately kept apart so authentication can never
// hang up and redial a running SRT caller:
//
//   claimAnonymousIdentity  — adds credentials to the CURRENT anonymous user.
//                             Same auth id, so nothing moves at all.
//   transferGuestSessions   — used only when the operator signs into an account
//                             that already exists (different auth id). One
//                             trusted server transaction moves ownership.
//
// Neither path ever calls provisioning.

import { supabase } from "@/integrations/supabase/client";
import { getSessions, updateSession } from "@/lib/session-store";
import { clearGuestIdentity } from "@/lib/identity";

/** Access token of the current session when it is anonymous, else null. */
export async function captureAnonymousToken(): Promise<{ token: string; userId: string } | null> {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  const user = session?.user as { id: string; is_anonymous?: boolean } | undefined;
  if (!session?.access_token || !user?.is_anonymous) return null;
  return { token: session.access_token, userId: user.id };
}

/** Live (non-terminal) local sessions owned by this anonymous identity. */
export function guestSessionIdsFor(userId: string): string[] {
  return getSessions()
    .filter(
      (s) =>
        (s.ownerUserId ?? s.hostUserId) === userId &&
        s.status !== "completed" &&
        s.status !== "archived",
    )
    .map((s) => s.id);
}

export interface TransferResult {
  ok: boolean;
  transferred: string[];
  skipped: string[];
  error?: string;
}

/**
 * Move a temporary operator's sessions to the account that is now signed in.
 * Idempotent: re-running reports the sessions as skipped.
 */
export async function transferGuestSessions(
  anonymous: { token: string; userId: string },
  sessionIds: string[],
): Promise<TransferResult> {
  if (sessionIds.length === 0) return { ok: true, transferred: [], skipped: [] };

  const { data: authData } = await supabase.auth.getUser();
  const newUser = authData?.user;
  if (!newUser || (newUser as { is_anonymous?: boolean }).is_anonymous) {
    return { ok: false, transferred: [], skipped: sessionIds, error: "not_signed_in" };
  }

  const { data, error } = await supabase.functions.invoke("transfer-guest-session", {
    body: { anonymous_access_token: anonymous.token, session_ids: sessionIds },
  });
  if (error) {
    return { ok: false, transferred: [], skipped: sessionIds, error: error.message };
  }
  const result = data as { transferred?: string[]; skipped?: string[] } | null;
  const transferred = result?.transferred ?? [];

  // Local records follow the server: same lines, same runtime route ids.
  for (const id of transferred) {
    updateSession(id, {
      ownerUserId: newUser.id,
      hostUserId: newUser.id,
      guestOwned: false,
    });
  }
  if (transferred.length > 0) clearGuestIdentity();

  return { ok: true, transferred, skipped: result?.skipped ?? [] };
}

/**
 * Claim the temporary session in place: attach email/password to the CURRENT
 * anonymous user. The auth id does not change, so every session, runtime route,
 * lease and attachment already points at the right owner.
 */
export async function claimAnonymousIdentity(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase.auth.getUser();
  const user = data?.user as { is_anonymous?: boolean } | undefined;
  if (!user?.is_anonymous) return { ok: false, error: "not_anonymous" };

  const { error } = await supabase.auth.updateUser({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
