# Phase D — Own, Observe, Reconcile and Tear Down Caller Lifecycle

Phase C safely *creates* an SRT caller. Phase D makes MAKO responsible for it: the server knows whether any real client is still monitoring a session, releases callers when none is, and refuses to let two sessions dial the same external listener.

## Audit findings this plan is built on

- Presence is entirely client-side. `heartbeat` (25s), `sweepPresence` (15s), `orphanSweep` (30s ownerless) and the 15-minute `IdleSessionWarning` only mutate browser storage. No server heartbeat, no realtime presence, no unload handler — closing a tab just stops a timer.
- End Session never releases infrastructure. `endSession` → `save_session_with_sources` only flips `sessions.status` and detaches `session_sources`; it never touches `session_runtime_routes`.
- Teardown RPCs (`delete_pull_source`, `archive_session_runtime_route`, `record_runtime_route_teardown_failure`, `fail_session_runtime_route`) are called from exactly one place: `provision-session`'s in-request compensation. Nothing else has ever released a caller.
- Signed-out guests cannot provision — `CreateSession` skips both remote calls for non-members and both edge functions require a JWT. The stranded Magewell connection came from a signed-in run.
- No endpoint exclusivity. Uniqueness is `(session_id, slot)`, `infrastructure_source_id`, `playback_path`. `remote_host`/`remote_port` is unconstrained; `endpoint_conflict` compares only the same slot's prior endpoint.
- `session_sources.runtime_route_id` is `ON DELETE RESTRICT`, so attachments must be detached before a route can be archived.
- `session_runtime_routes_reconcile_idx` exists but has never had a job behind it.

## Core principle

**Presence, not human activity, decides whether a caller lives.**

An operator staring at a feed without touching the keyboard is a working operator. The only abandonment signal is the absence of a renewing client.

## What the operator experiences

1. Ending a session actually frees the encoder — the Magewell returns to Idle within seconds.
2. A browser that disappears stops holding the caller within about a minute, without anyone doing anything.
3. Watching a feed for an hour without touching anything never releases the caller.
4. A refresh, a brief Wi-Fi drop, or closing one of several open tabs never releases the caller.
5. An address and port already held by a live MAKO caller shows `In use — this SRT listener is connected to another MAKO session.` No session name or owner is revealed.
6. Two operators pressing Start Monitoring at the same instant: exactly one wins, the other gets a clear message, nothing is half-provisioned.
7. A release MAKO could not confirm is retried automatically, and the endpoint stays reserved until it is confirmed gone.

## 1. Lease expiry detected within ~45–60 seconds

Presence lives in a `session_lease_holders` table, one row per **client instance** (not per session).

- Each open Session Room client renews its own row about every 15 seconds through a `session-lease` edge function.
- A holder row is valid for 45 seconds after its last renewal.
- A **dedicated lease-expiry job runs every minute** (`pg_cron`, 1440 runs/day). It finds sessions with zero valid holders, ends them and releases their callers. Combined with the 45s TTL, a disappeared browser is cleaned up roughly 45–105 seconds after its last renewal, typically inside a minute.
- One minute is the finest cadence the platform's scheduler supports, so this is the tightest honest window; the plan does not claim sharper than that. A frequent job keeps the database awake even when there is no work, which is a real recurring cost — one minute is chosen because it is the smallest cadence that satisfies the required window, and the job's query is a narrow indexed lookup that does nothing when no lease has expired.
- Lease expiry and reconciliation are separate concerns: expiry is the fast, normal path; reconciliation (below) is the slow safety net for uncertain infrastructure.
- Guest sessions take no lease — they own no infrastructure.

## 2. Multiple tabs and devices

`session_lease_holders` is keyed on `(session_id, client_instance_id)`, where the client instance ID is a per-tab UUID generated on Session Room mount and kept in that tab's own storage.

The invariant: **a session is alive while at least one holder row for it is unexpired.**

- Opening a second tab or a phone adds a second holder row.
- Closing one tab lets only that tab's row expire; the session keeps running while any other row renews.
- A page refresh either reuses the same instance ID or simply lets one row lapse while a new one renews — either way at least one holder is present, so nothing is torn down.
- There is no session-level "release the lease" call that one closing tab can fire. Tab close is passive: it stops renewing, nothing more.

## 3. Tab disappearance vs explicit End Session

| | Tab disappearance | Explicit End Session |
| --- | --- | --- |
| Trigger | One client stops renewing | Owner action in the UI |
| Effect on other tabs | None — they keep the session alive | Overrides them; the session ends regardless |
| Detection | Lease-expiry job, once *no* holder is valid | Immediate, in-request |
| Result | Session ends and callers release only if it was the last client | Session completed, all holder rows invalidated, attachments detached, all callers torn down, confirmed routes archived |

Human inactivity is **not** a teardown trigger. `IdleSessionWarning` may remain as a UX nudge, but confirming it performs the ordinary explicit End Session action the operator already had — it does not gain any independent power over infrastructure, and an ignored idle warning never releases a caller on its own.

## 4. Teardown orchestration sequence

Every release path — explicit End Session, scheduled end, lease expiry, reconciliation — goes through one trusted server routine, in this exact order per session:

```text
1. invalidate lease holders for the session          (transactional)
2. set sessions.status = completed                    (transactional)
3. detach session_sources rows                        (transactional)
   -- required first: runtime_route_id is ON DELETE RESTRICT
4. mark each route tearing_down + teardown_requested_at (transactional)
   -- from here the endpoint stays occupied until step 6
5. for each route: delete_pull_source upstream        (network, per route)
6. on CONFIRMED delete: archive to
      session_runtime_route_history and remove the
      live row                                       (transactional, per route)
   on UNCONFIRMED: record_runtime_route_teardown_failure,
      row retained with attempts + error, endpoint still occupied
```

Steps 1–4 commit before any network call, so a crash mid-teardown leaves a row that reconciliation can finish rather than an untracked caller. Step 6 is per-route, so a partial success is durable. No step ever creates infrastructure.

## 5. Endpoint occupancy stays locked while teardown is uncertain

One live runtime caller per normalized `host:port`, globally across all owners.

- Normalization (trim, lowercase host, numeric port) happens in the database; a partial unique index enforces one route per normalized endpoint across all **non-terminal** lifecycle statuses — which explicitly includes `tearing_down` and `error`.
- Occupancy is a property of the **route row**, never of `sessions.status`. A completed session whose route is still `tearing_down` continues to hold the endpoint. The endpoint is freed only when the row leaves the live table — that is, only after MAKO confirms the upstream caller is gone and the row is archived.
- `reserve_session_runtime_route` gains the occupancy check inside its existing advisory-lock/`FOR UPDATE` discipline, so simultaneous Start Monitoring cannot both pass. The loser gets typed `endpoint_in_use`.
- `check_endpoint_availability(host, port)` returns only `available` / `in_use` — never session, owner, or route identity. Create Session calls it as a hint while typing; the reservation is the real gate.
- Same-session/same-slot idempotent resume is unchanged: an owner resuming their own route is never blocked by their own occupancy.

## 6. Reconciliation

A separate, slower job — **every 15 minutes, 96 runs/day** — is responsible only for uncertainty, never for normal expiry:

- routes with `teardown_requested_at` set and `teardown_completed_at` null: retry `delete_pull_source`, archive on confirmation.
- routes stuck in `tearing_down`.
- routes in `error` where upstream infrastructure may still exist: look up by idempotency key first, then release.
- safety net: any expired-lease session the one-minute job missed.

It is fully idempotent — every action is "confirm gone, then archive", safe to run repeatedly — and it never creates replacement infrastructure. It uses the existing `session_runtime_routes_reconcile_idx`.

## 7. Supabase platform constraints affecting this design

- The scheduler's finest granularity is one minute, which is why ~45–105s is the honest cleanup window rather than exactly 45s.
- Scheduled jobs that must call an edge function go through `pg_net` and carry the project URL and key, so they are applied as data operations rather than schema migrations.
- Edge functions have no long-lived process, so presence cannot be held in memory — hence the table.
- `saveSessionRemote` overwrites `sessions.payload` wholesale, so lease state must live in its own table, never in the payload.
- `session_sources.runtime_route_id` is `ON DELETE RESTRICT`, which fixes the detach-before-archive ordering above.
- The teardown RPCs are `service_role`-only, so all release paths run server-side; nothing client-side can release infrastructure directly.

## Production caller safety

The currently running `Phase C Test` caller is left completely alone by this work. No migration, deployment, job, or backfill touches existing routes. It will be cleaned up and verified deliberately during Phase D production testing.

## Technical details

**Database migration:**
- `session_lease_holders` (session_id → sessions, client_instance_id, holder_user_id, renewed_at, expires_at) keyed `(session_id, client_instance_id)`, owner-scoped RLS, grants, service_role full access.
- `renew_session_lease(_owner, _session_id, _client_instance_id)`.
- `expire_session_leases()` — ends sessions with zero valid holders and hands them to the release routine.
- Generated normalized endpoint columns on `session_runtime_routes` plus a partial unique index over non-terminal statuses.
- `reserve_session_runtime_route` extended with the occupancy check and `endpoint_in_use`.
- `check_endpoint_availability(_host, _port)` — boolean only.
- `release_session_routes(_owner, _session_id)` implementing steps 1–4 and 6 of the sequence above.
- Two scheduled jobs: one-minute lease expiry, fifteen-minute reconciliation.
- No table dropped, no existing RLS relaxed, `save_session_with_sources` unchanged.

**Edge functions:**
- New `session-lease` (renew, JWT-verified in code; no destructive release action).
- New `reconcile-runtime-routes` (service-role, invoked by schedule) sharing a pure dependency-injected teardown module with `provision-session`, so there is one teardown implementation.
- `provision-session` gains `endpoint_in_use` mapping and creates the first holder row on success. Phase A.2 `mako-ingest` is not modified.

**Frontend:**
- `src/lib/sessions-remote.ts` — lease renewal wrapper, `endpoint_in_use` message, availability check.
- `src/hooks/use-presence-lifecycle.ts` — replaced by per-instance server lease renewal, active while a Session Room is open.
- `src/lib/session-store.ts` — `heartbeat`/`sweepPresence`/`orphanSweep`/`noOwnerSince` and the dead idle fields stop deciding session life.
- `src/components/IdleSessionWarning.tsx`, `src/components/ActiveSessionReturnBar.tsx`, `src/hooks/use-current-session.ts` — display from lease state; idle confirm performs the ordinary End Session action.
- `src/pages/CreateSession.tsx` — debounced availability hint, `In use` state; End Session paths call the release routine.

**Tests:** lease renewal and expiry; two tabs where one closes and the session survives; refresh causing no teardown; last client disappearing causing release; idle warning ignored causing no release; explicit End Session ending a session with another tab open; full release ordering (detach before archive); unconfirmed teardown retained, endpoint still occupied, and completed-session-plus-`tearing_down`-route still blocking a new reservation; concurrent Start Monitoring with exactly one winner; availability check leaking no identity; same-session/same-slot resume unaffected; reconciliation idempotent and never creating infrastructure; guest sessions taking no lease; legacy sessions unaffected. Full suite and TypeScript run afterwards.

## Out of scope

Endpoint replacement within a live session, shared/multi-caller endpoints, media-readiness detection, My Sources redesign, Test Connection rebuild, automatic cleanup of the existing production caller, and any DigitalOcean/`mako-pull-manager` API change.
