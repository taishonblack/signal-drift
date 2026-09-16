# Phase B — Answer: Session Deletion vs. Runtime-Route History

Approach 2 (`session_runtime_routes`) is settled. This document answers only the deletion/FK conflict. No SQL, no code, no implementation.

You are right, and the original audit was self-contradictory. `ON DELETE RESTRICT` is unconditional: a `torn_down` child row blocks the parent session delete exactly as a `ready` one does. Postgres has no lifecycle-aware RESTRICT. The fix is not a cleverer FK — it is to stop making the FK the safety mechanism, and to stop letting history live in a table that is a child of `sessions`.

## Recommended final model

Two separate concerns, two separate places.

```text
sessions
   |
   |  FK: session_id  ON DELETE RESTRICT   (live routes only)
   v
session_runtime_routes        <- LIVE routes only. A row here means
   (provisioning | ready |       "infrastructure may exist". Rows leave
    tearing_down | error)        this table when definitively torn down.
   |
   |  on successful teardown: move the record
   v
session_runtime_route_history  <- append-only audit. NO FK to sessions.
                                  session_id kept as a plain text column.
```

1. **Exact FK.** `session_id text NOT NULL REFERENCES public.sessions(id) ON DELETE RESTRICT`. Unchanged from the audit — but it now only ever guards rows whose infrastructure might still be alive, so it never blocks a legitimate delete.
2. **After successful teardown.** The row is **moved**: insert the full record into `session_runtime_route_history` (same transaction), then delete it from `session_runtime_routes`. No `torn_down` row is ever left in the live table. That single change removes the contradiction.
3. **Does `session_id` stay populated?** Yes — in history, as a plain `text` column with **no foreign key** and no cascade. It survives the parent session's deletion, so the audit trail still names the session it belonged to. In the live table `session_id` is never nulled; nulling it would be a silent orphan, worse than a block.
4. **When teardown FAILS.** The row stays in `session_runtime_routes` with `lifecycle_status = 'tearing_down'`, incremented `teardown_attempts` and a sanitized `teardown_error`. It is not moved, not deleted, and the RESTRICT FK therefore correctly continues to block session deletion — which is the desired behavior, because infrastructure may still be running and billable. A reconciliation pass retries it. `get_pull_source` returning not-found counts as success and triggers the move.
5. **Preventing deletion while a route is alive.** Two layers, and the guard is the primary one:
   - **Primary — a guarded deletion RPC.** `authenticated` loses its DELETE grant on `sessions`; deletion goes through a `SECURITY DEFINER` RPC (called by a backend function with the caller's verified identity, same identity chain as `save-session`). It verifies ownership, then refuses with a typed error if any row for that session exists in `session_runtime_routes` — regardless of status. It returns a useful reason (`routes_still_provisioning`, `teardown_pending`, `teardown_failed`) so the UI can say "still shutting down a source, try again shortly" instead of surfacing a database error.
   - **Backstop — the RESTRICT FK.** If any future path deletes a session outside the RPC, the FK still refuses. Defense in depth: the guard gives good errors, the FK guarantees correctness.
6. **Permitting deletion once everything is torn down.** No special case needed. Every definitively torn-down route has already left `session_runtime_routes`, so the guard finds zero rows and the FK has zero children. The delete proceeds normally. Note this also means the delete order is fixed and explicit: end session → teardown each route → move to history → then, and only then, delete the session.
7. **History retained after session deletion.** `session_runtime_route_history` keeps `owner_id`, the original `session_id` (as text), slot, name, `infrastructure_source_id`, `playback_path`, lifecycle at time of archival, `teardown_requested_at`, `teardown_completed_at`, `teardown_attempts`, sanitized `teardown_error`, plus original `created_at` and an `archived_at`. Because there is no FK, deleting the session leaves every one of those rows intact. Remote host/port stay owner-only, same privilege posture as the live table: `service_role` writes, `authenticated` SELECT on own rows only, no collaborator or `anon` access.
8. **Guarded RPC vs. FK alone.** The guard belongs in explicit backend orchestration — exactly as you expected. An FK alone cannot distinguish "shutting down cleanly" from "leaked infrastructure", cannot explain itself to the user, and cannot order the teardown steps. The FK's job is narrower and it is good at it: make the invariant "no session disappears while its infrastructure might be alive" impossible to violate by accident.

## Resulting FK / delete behavior, stated plainly

| Route state | Lives in | Session delete |
| --- | --- | --- |
| provisioning / ready / tearing_down / error | `session_runtime_routes` | Refused by the RPC with a reason; FK would also refuse |
| teardown failed, awaiting retry | `session_runtime_routes` | Refused — infrastructure may still be running |
| definitively torn down (incl. upstream not-found) | `session_runtime_route_history` | Allowed; history survives the delete |

`ON DELETE CASCADE` is explicitly rejected: it would let a session delete silently erase the record of infrastructure that may still be running. Nulling `session_id` on the live table is rejected for the same reason.

## One thing worth flagging

No hard session deletion exists in the app today — sessions are ended and moved to `completed`/`archived`, and `sessions` has an owner DELETE policy that nothing currently calls. So this model does not break any existing flow, and the guarded-deletion RPC would be new surface introduced alongside it rather than a retrofit of something in use.

## Change to the approved Phase B plan

Section 4 of the approved audit gains a second table (`session_runtime_route_history`), section 7 gains the move-on-success step, and a guarded session-deletion RPC plus the removal of the `authenticated` DELETE grant on `sessions` are added. Everything else — Approach 2, the XOR on `session_sources`, viewer-safe snapshots, RLS posture, no admin bypass, orchestration outside transactions — stands unchanged.

Awaiting your confirmation of this model before any schema is written.
