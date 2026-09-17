# Audit — Signed-out (guest) caller-first monitoring

## Verdict

Your read is correct, and it is not a viewing bug. A signed-out guest never reaches provisioning at all: MAKO creates a purely local temporary session, marks no slot as caller-backed, and the player is pointed at the legacy `cam1` path, which has no publisher. The external listener therefore stays Idle because no SRT caller was ever dialled.

## What the code actually does today

1. **Create Session blocks provisioning for guests by design.** The caller-backed test is `!isGuest && ... hasManualEndpoint(line)`. For a guest this is always false, so no slot gets `sourceKind: "runtime"`, `runtimeSlots` is empty, and the awaited provisioning branch (`!isGuest && runtimeSlots.length > 0`) is skipped. The session is saved to browser storage only and it navigates straight to the room.
2. **No server-side representation exists for a guest session.** No `sessions` row, no `session_runtime_routes` row, no `session_sources` attachment. There is nothing for playback or the lease to resolve against.
3. **Why `cam1` / `cam1-opus` appears.** Playback resolution falls back to the legacy slot mapping (`cam1`…`cam4`) whenever a slot is neither attachment-backed nor marked `runtime`. Guest slots are exactly that case. This fallback is not itself broken — it is the pre-caller manual/legacy path — but for a caller-first session it produces a confident-looking player aimed at an unrelated, empty path. It should be suppressed for endpoint-entered slots.
4. **Where the 401s come from.** `provision-session` and `session-lease` both require `Authorization: Bearer <user JWT>` and then `auth.getUser()`. With no session, the browser client still sends the publishable key as the bearer, so `getUser()` fails and the function returns 401. The presence hook also short-circuits: it explicitly skips lease renewal when there is no authenticated user ("guest sessions hold no lease").
5. **Leases and End Session are owner-only.** `session-lease` looks up `sessions.owner_id` and requires it to equal the verified user id for both `renew` and `end`. A guest has no owner id, so a guest session can hold no lease and can never be explicitly ended server-side. Endpoint exclusivity (normalized `host:port`, advisory-locked) is enforced inside `reserve_session_runtime_route` and is unaffected by who calls it — it just never gets called for guests.

So the promise in the Temporary Session banner is real for *notes and layout*, and empty for *monitoring*.

## Recommended model — guest = real but anonymous identity

The cheapest secure way to close this gap is to give the guest a genuine backend identity instead of inventing a parallel capability system:

- On the guest's first monitoring action, sign them in anonymously. They receive a normal JWT with a real user id.
- Every existing check — `provision-session`, `reserve_session_runtime_route`, `renew_session_lease`, `begin_session_release`, RLS on sessions/routes/attachments, endpoint exclusivity, Phase D teardown — then applies unchanged, scoped to that id.
- No function becomes anonymous or unprotected. No new token format, no new authorization surface, no way to enumerate or touch anyone else's sessions, routes or sources.
- Guest → sign-in becomes an **ownership transfer** of the existing session and its already-running route (reassign `owner_id` on the session, route and access rows), so the running caller is preserved and never duplicated.
- Persistence stays the differentiator: an anonymous identity is not durable across browsers/devices, gets no Sources library, no history, no sharing beyond the live link.

Rejected alternative: a bespoke signed session-capability token. It would require parallel authorization logic in three edge functions plus new RLS paths for a non-`auth.uid()` principal — significantly more code and more attack surface for the same behavior.

## Smallest secure implementation plan (for a later turn)

1. **Enable anonymous sign-in** on the backend auth config, and mint an anonymous identity in the identity layer at the moment a guest presses Start Monitoring (not on page load).
2. **Remove the guest gate in Create Session** so `callerBacked` depends only on "endpoint entered", and let the existing awaited provisioning transaction run for guests exactly as for members.
3. **Keep the temporary-session semantics local**: still mark the record `guestOwned`, still show the banner, still exclude it from saved history.
4. **Presence**: drop the "no user → no lease" short-circuit, since an anonymous guest now has a user. Lease renew/expiry/teardown then work unchanged.
5. **End Session** works with no change once the guest owns the session row.
6. **Suppress the legacy `camN` fallback for endpoint-entered slots** so a caller-first slot can only ever render its provisioned `src_xxxxxx-opus` path or a connecting/failed state — never a misleading unrelated stream.
7. **Ownership transfer on sign-in**: reassign the session, runtime routes and access rows from the anonymous id to the authenticated id in one server-side step; never re-provision.
8. **Abuse containment**: reuse the existing per-owner route quota and endpoint exclusivity; anonymous identities get the same (or a tighter) ceiling.
9. **Tests**: guest provisioning succeeds and yields a dynamic playback path; no `camN` fallback for endpoint slots; guest lease renews and expires into teardown; guest explicit End Session tears down; guest cannot renew/end another owner's session; endpoint already occupied returns the typed in-use conflict for a guest too; sign-in transfer keeps the same route id.

Untouched throughout: provisioning idempotency, caller infrastructure, reconciliation, Quinn, Timeline, Ops, sharing, and the Friendly Name punctuation issue (still staged separately).

## Notes

Enabling anonymous sign-in is a deliberate policy change — it means anyone can obtain a backend identity without email. It is contained by the per-owner quota, endpoint exclusivity and lease-expiry teardown, but it is the one security-relevant decision in this plan and should be an explicit approval.
