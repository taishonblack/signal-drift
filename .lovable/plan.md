# Phase D — Own, Observe, Reconcile and Tear Down Caller Lifecycle

Phase C safely *creates* an SRT caller. Phase D makes MAKO responsible for it: the server knows which operator still holds a session, releases callers when they no longer do, and refuses to let two sessions dial the same external listener.

## Audit findings this plan is built on

- Presence is entirely client-side. `heartbeat` (25s), `sweepPresence` (15s), `orphanSweep` (30s ownerless) and the 15-minute `IdleSessionWarning` only mutate browser storage. There is no server heartbeat, no realtime presence, and no unload handler — closing a tab just stops an interval.
- End Session never releases infrastructure. `endSession` → `save_session_with_sources` only flips `sessions.status` and detaches `session_sources`. It never touches `session_runtime_routes`.
- Teardown RPCs (`delete_pull_source`, `archive_session_runtime_route`, `record_runtime_route_teardown_failure`, `fail_session_runtime_route`) are called from exactly one place: `provision-session`'s in-request compensation. Nothing else in the product has ever torn down a caller.
- Signed-out guests cannot provision at all — `CreateSession` skips both remote calls for non-members and both edge functions require a JWT. So the stranded Magewell connection came from a signed-in provisioning run, not a guest.
- No endpoint exclusivity exists. Uniqueness on `session_runtime_routes` is `(session_id, slot)`, `infrastructure_source_id`, `playback_path`. `remote_host`/`remote_port` is unconstrained, and `reserve_session_runtime_route`'s `endpoint_conflict` compares only the *same slot's* prior endpoint — an idempotency check, not occupancy.
- `session_sources.runtime_route_id` is `ON DELETE RESTRICT`, so attachments must be detached before a route can be archived.
- A reconcile index (`session_runtime_routes_reconcile_idx`) already exists but has never had a job behind it.

## What the operator experiences

1. **Ending a session actually frees the encoder.** End Session, scheduled end, and idle timeout all release the callers; the Magewell returns to Idle within seconds.
2. **A lost browser no longer strands a caller.** While a session is open the browser renews a server-side lease. After 45 seconds without renewal the server considers the operator gone, ends the session and tears the callers down. A page refresh, brief Wi-Fi drop or navigating between MAKO pages renews well inside that window.
3. **Occupied listeners are visible before starting.** On Create Session, an address and port already held by a live MAKO caller shows `In use — this SRT listener is connected to another MAKO session.` No session name, owner or any other detail is revealed.
4. **Two operators can't collide.** If both press Start Monitoring at the same instant for the same listener, exactly one wins; the other gets a clear "already in use" message and nothing is left half-provisioned.
5. **Stuck releases heal themselves.** A caller whose teardown could not be confirmed is retried automatically instead of blocking the endpoint forever.

## Server becomes the authority on presence

Presence moves out of the browser. A new `session_leases` table holds one row per session with the holder, the last renewal time and the expiry.

- The browser renews through a `session-lease` edge function while a session is open, roughly every 15 seconds.
- Lease TTL is 45 seconds. Expiry is evaluated server-side, so every tab and the server agree.
- Client-side timers become *display only*: the return bar and idle warning read lease state instead of computing their own truth. `heartbeat`, `sweepPresence`, `orphanSweep` and `noOwnerSince` stop deciding whether a session lives.
- The dead `idleStartedAt`/`idleDeadline`/`isIdle` fields are retired rather than carried forward.
- Lease state lives in its own table, never in `sessions.payload`, because a stale `saveSessionRemote` overwrites that blob wholesale.
- Guest sessions stay purely local and take no lease — they own no infrastructure.

## Hard endpoint exclusivity

One live runtime caller per normalized `host:port`, globally across all owners.

- Normalization (trim, lowercase host, numeric port) happens in the database, and a partial unique index enforces one non-terminal route per normalized endpoint.
- `reserve_session_runtime_route` gains an occupancy check under the existing advisory-lock/`FOR UPDATE` discipline, so simultaneous Start Monitoring cannot both pass. The loser gets a typed `endpoint_in_use`.
- A privacy-safe `check_endpoint_availability(host, port)` function returns only `available` / `in_use` — never session, owner or route identity. Create Session calls it as the operator types, purely as a hint; the reservation is the real gate.
- Same-session, same-slot retries keep working exactly as Phase C defined them — occupancy never blocks an owner's own resume of their own route.

## Teardown paths

A single trusted `release-session-routes` server routine performs every release, in this order: detach `session_sources` → `delete_pull_source` upstream → archive to `session_runtime_route_history` on confirmation. Unconfirmed teardown keeps the row with `teardown_requested_at`, attempts and error, exactly as Phase C's compensation does.

It is invoked from:
- End Session (owner action)
- Scheduled end reached
- Idle timeout confirmed
- Lease expiry detected server-side
- Reconciliation for routes with an unfinished teardown

## Reconciliation

A single low-frequency job handles both expired leases and unfinished teardowns, using the existing reconcile index. Cadence: **every 5 minutes — 288 runs per day.** A frequent check keeps the database awake even when there is no work, which increases Cloud cost; the trade-off is that a stuck teardown or an expired lease that the browser never reported is resolved within about five minutes rather than an hour. Normal cases don't wait for it: lease expiry and End Session release callers immediately through the live path.

## Technical details

**Database migration:**
- New `session_leases` (session_id PK → sessions, holder_user_id, renewed_at, expires_at) with owner-scoped RLS and grants; service_role full access.
- `renew_session_lease(_owner, _session_id)` and `expire_stale_leases()` security-definer functions.
- Generated normalized endpoint columns on `session_runtime_routes` plus a partial unique index over non-terminal lifecycle statuses.
- `reserve_session_runtime_route` extended with the occupancy check and an `endpoint_in_use` status.
- `check_endpoint_availability(_host, _port)` — returns a boolean only, no identity.
- `release_session_routes(_owner, _session_id)` orchestration helper for the detach-then-archive ordering.
- `pg_cron` job calling the reconciliation function.
- No existing table dropped, no existing RLS relaxed, `save_session_with_sources` untouched apart from being called in the established way.

**Edge functions:**
- New `session-lease` (renew / release, JWT-verified in code).
- New `reconcile-runtime-routes` (service-role, invoked by cron) sharing a pure, dependency-injected module with `provision-session`'s existing teardown logic so there is one teardown implementation, not two.
- `provision-session` gains `endpoint_in_use` mapping and takes the initial lease on success. Phase A.2 `mako-ingest` is not modified.

**Frontend:**
- `src/lib/sessions-remote.ts` — lease renew/release wrappers, `endpoint_in_use` message, availability check.
- `src/hooks/use-presence-lifecycle.ts` — replaced by server lease renewal.
- `src/lib/session-store.ts` — retire `heartbeat`/`sweepPresence`/`orphanSweep`/`noOwnerSince`/idle fields as decision-makers.
- `src/components/IdleSessionWarning.tsx`, `src/components/ActiveSessionReturnBar.tsx`, `src/hooks/use-current-session.ts` — read lease state instead of local timers.
- `src/pages/CreateSession.tsx` — debounced availability hint and the `In use` state; End Session paths call the release routine.

**Tests:** lease renewal/expiry, release-on-end, release-on-scheduled-end, release-on-idle, concurrent Start Monitoring against one endpoint (exactly one winner), availability check leaking no identity, same-session/same-slot resume unaffected, detach-before-archive ordering, unconfirmed teardown retained and retried, reconciliation idempotency, guest sessions taking no lease, legacy sessions unaffected. Full suite and TypeScript run afterwards.

## Out of scope

Endpoint replacement within a live session, shared/multi-caller endpoints, media-readiness detection, My Sources redesign, Test Connection rebuild, and any DigitalOcean/`mako-pull-manager` API change.
