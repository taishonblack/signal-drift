# Phase B Design Audit — Session-Scoped Caller Routes

Design report only. No migration, no code changes.

## 1. Current-state findings (verified live)

**`ingest_sources`** — owner-scoped library row.
- Columns: `id`, `owner_id`, `name`, `connection_mode` (default `receive`), `infrastructure_source_id` (nullable, **globally UNIQUE**), `srt_port`, `playback_path`, `lifecycle_status` (default `provisioning`), `connection_status`, `connection_checked_at`, `last_error`, `created_at`, `updated_at`.
- Indexes: pkey, unique `infrastructure_source_id`, `owner_id`.
- Privileges are the real security boundary here, and they are tight: `authenticated` has only **SELECT + DELETE** at table level, plus **column-level** INSERT on (`owner_id`, `name`, `connection_mode`) and UPDATE on (`name`, `connection_mode`). Every infrastructure field is unwritable by any browser role.
- Two triggers reinforce it: `guard_ingest_source_infra_columns` (rejects non-service writes to infra/status columns) and `enforce_ingest_source_invariants` (non-`provisioning` rows must have `infrastructure_source_id`, `srt_port`, `playback_path`).
- RLS: owner reads/updates/deletes own; admin reads/updates all.
- No column exists for a remote SRT host, and none can be added without also opening a write surface that the library shares.

**`session_sources`** — the collaborator-safe join.
- `session_id` (text, FK→`sessions`, cascade), `ingest_source_id` (uuid, **NOT NULL**, FK→`ingest_sources`, restrict), `slot` (smallint), `label`, `playback_path`, `attached_at`, `detached_at`.
- Partial unique indexes on `(session_id, slot)` and `(session_id, ingest_source_id)` **where `detached_at IS NULL`** — detached history is preserved and slots are reusable.
- RLS: participants (owner or `has_session_access`) read; owner writes, gated by `can_use_ingest_source`.
- `authenticated` has full table DML grants; RLS is what constrains it.

**`reserve_ingest_source_slot(owner, name, max)`** — advisory-lock + `count(*) where lifecycle_status <> 'deleted'` for the owner, then inserts a `provisioning` row. It counts **every** non-deleted row of that owner.

**`save_session_with_sources(_owner, _session, _attachments)`** — validates each intent against `ingest_sources` (`owner_id = _owner`, not deleted, non-empty `playback_path`), upserts the session, detaches un-intended active rows, inserts intended ones deriving `label`/`playback_path` from the source row, and force-detaches everything for `completed`/`archived`. `save-session` supplies `_owner` from `auth.getUser()` only.

**Frontend.** `useMySources` lists `ingest_sources` filtered solely by `lifecycle_status <> 'deleted'` — an allow-by-default query. `inputsFromRecord()` prefers the active attachment's `playback_path` and falls back to `camN` only for non-source-backed slots. `SrtLine` already carries `ingestSourceId` / `sourceKind`. `probeStream()` still probes `camN` raw ingest paths.

## 2. Approach 1 vs Approach 2

**Approach 1 — extend `ingest_sources` with `origin = library | session`.**
- Cheap for `session_sources` (FK unchanged) and for `save_session_with_sources`.
- But it damages three things that are currently correct by construction:
  - *Privileges.* Session routes need `remote_host`/`remote_port` written by the backend. Adding those columns to this table means the library table now carries sensitive runtime config; any future column grant slip exposes it on both row kinds.
  - *Quota.* `reserve_ingest_source_slot` counts all non-deleted owner rows, so session routes would consume the 4-item My Sources quota until the security-definer function is rewritten — editing a function the library depends on.
  - *Listing.* `useMySources` and any future query are allow-by-default; forgetting `origin = 'library'` silently leaks ephemeral routes into the library UI and makes them renameable/reusable. Fail-open.
- Teardown/retry/reconcile columns would sit permanently null on every library row, and the invariant trigger would need `origin`-conditional branches.

**Approach 2 — separate runtime-route table.**
- `ingest_sources` is untouched: privileges, triggers, quota function, RLS and My Sources queries all keep their current meaning. Isolation is structural, not predicate-based — fail-closed.
- Runtime table gets its own privilege model: `authenticated` needs **no** write grant at all, and no read grant on `remote_host`/`remote_port` beyond the owner.
- Real FK to `sessions`, lifecycle and teardown/reconcile columns belong naturally.
- Cost: `session_sources.ingest_source_id` is NOT NULL and FK'd to `ingest_sources`, so it must become nullable with a second nullable FK and an XOR check; `save_session_with_sources` gains a runtime-route branch. That is a contained, testable change.

## 3. Recommendation

**Approach 2.** The deciding factors are the two fail-open surfaces in Approach 1 (quota counting and library listing) and the privilege blast radius of putting remote host/port on the library table — not the amount of code involved.

## 4. Proposed schema

```text
public.session_runtime_routes
  id                      uuid pk default gen_random_uuid()
  owner_id                uuid not null  -> auth.users
  session_id              text not null  -> public.sessions(id) ON DELETE RESTRICT
  slot                    smallint not null check (slot between 1 and 4)
  name                    text not null                  -- Friendly Name (MAKO-side label)
  remote_host             text not null                  -- external SRT listener  [sensitive]
  remote_port             integer not null check (1..65535)  --                     [sensitive]
  infrastructure_source_id text unique                   -- src_xxxxxx, null while provisioning
  playback_path           text                           -- src_xxxxxx-opus
  lifecycle_status        text not null default 'provisioning'
                          -- provisioning | ready | tearing_down | torn_down | error
  connection_status       text not null default 'unknown'
  connection_checked_at   timestamptz
  last_error              text                           -- sanitized only
  teardown_requested_at   timestamptz
  teardown_completed_at   timestamptz
  teardown_attempts       integer not null default 0
  teardown_error          text                           -- sanitized only
  created_at / updated_at timestamptz not null default now()   -- set_updated_at trigger
```

Indexes / uniqueness:
- unique `(session_id, slot)` **where `lifecycle_status not in ('torn_down')`** — one live route per slot, reconfiguration allowed.
- unique `infrastructure_source_id` (global; the infra ID is globally unique upstream).
- unique `playback_path` where not null (derived from the infra ID, so this is a consistency assertion).
- btree `(owner_id)`, `(session_id)`, and a partial index on rows needing reconciliation (`teardown_requested_at is not null and teardown_completed_at is null`).
- Invariant trigger: `lifecycle_status in ('ready','tearing_down')` requires `infrastructure_source_id` and `playback_path`.

`session_id` is `ON DELETE RESTRICT`, not cascade: a session must not be deletable while infrastructure may still exist. Session delete becomes end → teardown → reconcile → delete.

**`session_sources` changes.** `ingest_source_id` becomes nullable; add `runtime_route_id uuid REFERENCES session_runtime_routes(id) ON DELETE RESTRICT`; add `CHECK (num_nonnulls(ingest_source_id, runtime_route_id) = 1)`. Add a partial unique `(session_id, runtime_route_id) where detached_at is null` mirroring the existing source one. `slot`, `label`, `playback_path`, `attached_at`, `detached_at` and both existing partial uniques stay exactly as they are.

**Field split.** Authoritative runtime config (owner, session, slot, name, remote host/port, infra ID, lifecycle, connection state, teardown state) lives on `session_runtime_routes`. `session_sources` keeps only the viewer-safe snapshot: `slot`, `label`, `playback_path` — which is already what collaborators read.

## 5. RLS

`session_runtime_routes`: RLS on. Grants — `service_role` ALL; `authenticated` **SELECT only**, no INSERT/UPDATE/DELETE grant at all (all writes flow through the backend orchestrator). `anon` no grants.
- Policy: SELECT `to authenticated using (owner_id = auth.uid())`. Nothing else.
- Collaborators are deliberately *not* in that policy, so they cannot read `remote_host`/`remote_port` or infra IDs; they continue reading `session_sources` under the existing participants policy and get slot + label + playback path only.
- Signed-out PIN guests have no JWT and no `anon` grant → no access. They receive playback metadata through the existing guest path, unchanged.
- Backend orchestration uses `service_role`. No new role, no change to `has_role`, no change to any existing policy.

## 6. Existing Phase 5 work

Unchanged: `session_sources.playback_path` semantics, the participants/owner RLS on `session_sources`, `inputsFromRecord()` attachment preference and `camN` legacy fallback, Session Room and popout attachment loading, active attachment uniqueness, `ingest_sources` and its triggers/quota/privileges, `useMySources`, Address Book, sharing, Timeline, Quinn, Ops, auth.

Existing Phase 5 data: untouched. Every current `session_sources` row keeps a non-null `ingest_source_id`, satisfying the new XOR check with no backfill. Legacy sessions with no attachments keep resolving to `camN`.

**`save_session_with_sources` must change**, minimally, because it validates only against `ingest_sources`:
- `_attachments` entries gain an alternative shape `{ slot, runtime_route_id }` (still exactly one of route/source per entry, still ≤4, still no browser-supplied label authority beyond an optional display label).
- Route validation mirrors the source validation: route must exist, `owner_id = _owner`, `session_id` equal to the session being saved, lifecycle `ready`, non-empty `playback_path`. No admin bypass — same as the corrected Phase 5 rule.
- Insert derives `label` from the route's `name` (or the caller's display label) and `playback_path` from the route row — never from the browser.
- Detach logic, terminal-status force-detach and transactional behavior stay as written; the detach comparison simply keys on whichever of the two references the row carries.
- Still `SECURITY DEFINER`, fixed `search_path`, service-role-only execute, `_owner` from `auth.getUser()`.

## 7. Provisioning compensation and teardown reconciliation

No external API call ever happens inside a transaction or a database function.

Provisioning (application-orchestrated):
1. Validate the session and slot intents.
2. Insert one `provisioning` route row per slot (service role) — this reserves the slot uniquely before any infrastructure exists.
3. Call `create_pull_source` per route; on success update the row to `ready` with `infrastructure_source_id` + `playback_path`; on failure mark `error` with a sanitized message.
4. If any route fails, or the subsequent save fails, compensate: `delete_pull_source` for exactly the infra IDs this attempt created, then mark those rows `torn_down`/`error`. A row whose compensation delete fails stays flagged for reconciliation rather than being erased.
5. Only then call `save_session_with_sources` with the route-backed attachment intents, then open the Session Room.

Teardown (session completed / archived / deleted):
1. Set `lifecycle_status = 'tearing_down'`, `teardown_requested_at = now()`.
2. Call `delete_pull_source`.
3. Success → `torn_down`, `teardown_completed_at`; failure → increment `teardown_attempts`, record sanitized `teardown_error`, stay `tearing_down`.
4. A reconciliation pass (later phase) picks up `tearing_down` rows via the partial index and retries; `get_pull_source` returning "not found" is treated as success.

Rows are soft-deleted (`torn_down`) and never hard-deleted, so MAKO can never forget that infrastructure may still exist. Session deletion is blocked by the RESTRICT FK until routes are `torn_down`.

## 8. Quota / library isolation

Structural: session routes live in a different table, so they cannot be counted by `reserve_ingest_source_slot`, cannot appear in `useMySources`, cannot be renamed into the library, and cannot be attached as library sources. A separate, independent cap on live routes per owner (advisory-lock + count of non-`torn_down` rows) is proposed for the implementation phase.

## 9. Migration and rollback

One additive migration: create the table, indexes, trigger, grants and policy; alter `session_sources` (drop NOT NULL, add nullable FK column, add XOR check, add partial unique); replace `save_session_with_sources` with the route-aware version. Nothing is dropped, nothing is backfilled.

Rollback: restore the previous `save_session_with_sources` body, drop the check/index/column on `session_sources` and re-add NOT NULL (safe while no route-backed rows exist), drop the new table. Because the change is additive, Phase 5 behavior is the rollback target and remains functional throughout.

## 10. Tests required

Database/RPC: same-owner route attach succeeds; cross-owner route rejected; route belonging to a different session rejected; non-`ready` route rejected; forged `playback_path`/`owner`/infra field in the body ignored; both-references and neither-reference attachment rejected; duplicate slot and duplicate route rejected; reconfiguring a slot detaches the old row and preserves history; terminal status detaches all.

RLS: owner reads own routes; collaborator with `shared_session_access` cannot read any route row (and still reads `session_sources`); `anon` denied; `authenticated` write attempt denied by missing grant.

Orchestration (fake-dependency, like the Phase A tests): provision success; provision failure compensates only IDs created in that attempt; save failure compensates; teardown success; teardown API failure leaves a reconcilable row and increments attempts; "not found" on teardown treated as success; idempotent repeat teardown.

Playback: route-backed slot resolves to `src_xxxxxx-opus`; legacy slot still resolves to `camN`; loading state before attachments arrive; popouts unchanged.

Plus the existing full suite and typecheck.

## 11. Note for a later phase (not Phase B)

Test Connection still probes `camN`. Once routes exist, it should verify the entered host/port through the backend (e.g. `get_pull_source` connection state on a provisioned route), not a MediaMTX `camN` probe. Also worth noting: the localStorage-first session flow currently navigates to the Session Room before remote persistence completes; with provisioning added, the room must not open until routes are `ready` and attachments saved, or a slot can briefly resolve to the wrong path.
