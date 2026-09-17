# Guest caller-first monitoring via anonymous identity

Approved direction: a signed-out operator gets a real anonymous backend identity, so guest monitoring runs through exactly the same provisioning, playback, lease and teardown machinery as an authenticated operator. No second authorization system, no unauthenticated functions.

## Verified authentication facts for this project

- Anonymous sign-in is currently **off** and unused anywhere in the code. It must be switched on in the backend auth configuration.
- Anonymous users are real rows in the users table with role `authenticated`, so every existing grant, RLS policy, ownership check and RPC works for them unchanged. Nothing in the schema needs to learn about "guests".
- The existing new-user trigger will also create a profile row for an anonymous user. Its email is null, so the display name falls through to the generic operator default — acceptable, but worth confirming during validation.
- Upgrade behaviour splits in two, and the plan must handle both:
  - **Upgrade in place (preferred).** Adding email/password to the *current* anonymous user, or linking a social identity to it, keeps the **same** user id; the account simply stops being anonymous once verified. Nothing needs to move — session, route, caller, lease and access rows already point at the right id.
  - **Sign-in to a different existing account.** If the person signs into an account that already exists, the browser ends up with a **different** user id and the anonymous session is abandoned. Only this path needs an ownership transfer.
- Consequence: the UI must distinguish "claim this temporary session" (upgrade in place) from "sign in to my existing account" (transfer), because they are different backend operations.

## Invariant

Signing in during live guest monitoring must never stop, delete, duplicate or re-provision the caller. The same runtime route id, infrastructure source id, playback path and SRT connection survive. Provisioning is never re-run as part of authentication.

## Plan

### 1. Auth configuration
Enable anonymous sign-in. No other auth setting changes.

### 2. Anonymous identity, created late
Mint the anonymous identity **only** when a signed-out user presses Start Monitoring — never on page visit. The identity layer keeps its current guest naming for display, but now carries a real backend user id underneath. If minting fails, provisioning is not attempted: the operator stays on Create Session with a clear "MAKO couldn't start a temporary session — check your connection and retry" message, and no local session is created.

### 3. One provisioning path
Remove the signed-in-only gate in Create Session so a slot with an address and port is caller-backed for everyone. The awaited provisioning transaction, typed failure messages, endpoint-in-use conflict and route-id write-back all apply to guests as-is. Guest sessions keep their temporary marker locally so they still show the Temporary Session banner and stay out of saved history.

### 4. Playback: never legacy fallback
For an endpoint-entered caller-first slot, playback resolves only to the provisioned dynamic path. If there is no attachment yet the tile shows **Connecting**; if provisioning failed it shows **Provisioning Failed** with the reason. The legacy slot-mapped path is no longer reachable for these slots, which removes the misleading black player entirely. Legacy/manual sessions created before this change keep working.

### 5. Phase D leases
Drop the "no authenticated user, no lease" short-circuit in the presence hook — a guest now has a user, so per-tab leases renew normally, multiple tabs of the same anonymous identity are independent holders, refresh keeps the same tab id, and closing the last tab expires the lease into normal server teardown. End Session works with no change because the guest genuinely owns the session row.

### 6. Guest → signed-in conversion
- **Claim/keep this session:** upgrade the current anonymous user in place (add email/password, or link a social identity). Same user id, so nothing is reassigned and monitoring is untouched. This is the path the Temporary Session banner and the save prompt should offer.
- **Sign in to an existing account:** one server-side transfer transaction, executed only for the anonymous id the browser can prove it holds, moving session ownership, runtime routes, session access rows and lease holders to the new id in a single step, without touching infrastructure. It must be idempotent and must refuse if the target session is already owned by someone else.
- If the upgrade or sign-in fails, monitoring continues untouched under the anonymous identity and the operator sees a non-destructive error. Authentication failure never ends a session.

### 7. Limits, cleanup, restrictions
- Anonymous identities get the same per-owner runtime-route ceiling and the same endpoint exclusivity (normalized host:port, advisory-locked) as everyone else; no guest can take an occupied endpoint.
- No source library capability for anonymous users.
- Share Session for a guest session stays limited to the live link and PIN — no persistent collaborator grants.
- Abandoned anonymous identities: their sessions self-clean through lease expiry and reconciliation. The leftover auth rows are inert and can be pruned later by a scheduled cleanup of anonymous users with no live session; not part of this change.

### 8. Validation matrix (production)
Guest provisioning succeeds and shows video and audio on a dynamic path; endpoint stays exclusive against a second guest and against an authenticated operator; guest lease renews, and closing every tab tears the caller down; guest End Session tears down immediately; guest cannot renew, end or read another owner's session; claim-in-place keeps the same user id and the same running caller; sign-in to an existing account transfers ownership with the same route id and no re-provision; provisioning failure shows Provisioning Failed and leaves no orphan caller; refresh and multi-tab behave.

## Technical surface

- Auth config: anonymous sign-in enabled.
- Migration/RPC: one new server-side ownership-transfer routine (security definer, verified caller, idempotent). No schema change to routes, sessions or attachments; no RLS relaxation — anonymous users already satisfy the existing `auth.uid()` policies.
- Edge functions: no authorization model change. Provisioning and lease functions continue to require a real user JWT; the publishable key is never treated as authorization. A small transfer endpoint (or an action on the existing session function) exposes the transfer routine.
- Frontend: identity layer (late anonymous minting), Create Session (single provisioning path), playback resolution (no legacy fallback for caller slots), presence hook (guest leases), Temporary Session banner and save prompt (claim vs sign-in), tile states for Connecting / Provisioning Failed.
- Rollback: the guest path is gated by the anonymous-auth setting plus the Create Session gate. Turning anonymous sign-in off restores today's behaviour; the transfer routine and playback strictness are independently revertible and harmless on their own.

## Out of scope

Provisioning idempotency, caller infrastructure, reconciliation, RLS redesign, Quinn, Timeline, Ops, and the Friendly Name punctuation fix (still staged, deliberately after this).
