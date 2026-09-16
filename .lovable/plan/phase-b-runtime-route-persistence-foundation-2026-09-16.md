# Phase B — Runtime Route Persistence Foundation

Database and security foundation only. No provisioning, no teardown orchestration, no UI.

## Scope

In: two new tables, the dual-reference change to `session_sources`, the route-aware `save_session_with_sources`, RLS/grants, and tests.

Out: caller provisioning from Create Session, teardown orchestration, reconciliation worker, UI changes, Test Connection changes, My Sources changes, `camN` removal, Phase C onward.

Explicitly out by amendment: no guarded hard-delete RPC, and no change to the existing `sessions` DELETE grant or policy. The app performs no hard session deletion today; the new `ON DELETE RESTRICT` FK is the database backstop while live infrastructure exists.

`ingest_sources` is untouched — privileges, triggers, quota function, RLS and My Sources queries keep their current meaning.

## Model

```text
sessions
   |  session_id NOT NULL, ON DELETE RESTRICT
   v
session_runtime_routes          live / potentially-live caller infrastructure
   provisioning | ready | tearing_down | error
   |
   |  (Phase C) archive + delete, one transaction, after the
   |            external delete_pull_source has already succeeded
   v
session_runtime_route_history   append-only; session_id is plain text, no FK
```

A row in the live table means infrastructure may still exist. `torn_down` is not a live state and is never retained there. History outlives its session.

## Technical detail

### `session_runtime_routes`

`id`, `owner_id` (→ `auth.users`), `session_id text NOT NULL REFERENCES public.sessions(id) ON DELETE RESTRICT`, `slot smallint` (1–4), `name`, `remote_host`, `remote_port` (1–65535), `infrastructure_source_id` (nullable, globally unique), `playback_path` (nullable, unique when set), `lifecycle_status` default `provisioning` constrained to `provisioning | ready | tearing_down | error`, `connection_status` default `unknown`, `connection_checked_at`, `last_error`, `teardown_requested_at`, `teardown_completed_at`, `teardown_attempts` default 0, `teardown_error`, `created_at`, `updated_at` with the existing `set_updated_at` trigger.

Indexes: unique `(session_id, slot)`; unique `infrastructure_source_id`; unique `playback_path` where not null; btree on `owner_id` and `session_id`; partial index on rows awaiting reconciliation (`teardown_requested_at is not null and teardown_completed_at is null`). Invariant trigger: `ready` and `tearing_down` require both `infrastructure_source_id` and `playback_path`.

### `session_runtime_route_history`

`id`, `owner_id`, `session_id text` (plain, no FK), `slot`, `name`, `remote_host`, `remote_port`, `infrastructure_source_id`, `playback_path`, `final_lifecycle_status`, `connection_status`, `teardown_requested_at`, `teardown_completed_at`, `teardown_attempts`, `teardown_error`, `route_created_at`, `archived_at` default `now()`. Append-only: no update or delete grant to any browser role.

### `session_sources`

`ingest_source_id` drops `NOT NULL`; add `runtime_route_id uuid REFERENCES session_runtime_routes(id) ON DELETE RESTRICT`; add `CHECK (num_nonnulls(ingest_source_id, runtime_route_id) = 1)`; add partial unique `(session_id, runtime_route_id) where detached_at is null`, mirroring the existing source one. `slot`, `label`, `playback_path`, `attached_at`, `detached_at` and both existing partial uniques are unchanged. Existing rows satisfy the XOR via their non-null `ingest_source_id` — no backfill.

### `save_session_with_sources`

Adds a runtime-route branch alongside the existing library-source branch. An attachment entry carries exactly one of `ingest_source_id` or `runtime_route_id`; both or neither is rejected. Route validation: the route exists, `owner_id = _owner`, `session_id` equals the session being saved, `lifecycle_status = 'ready'`, `playback_path` non-empty. No admin bypass. `label` and `playback_path` are derived from the route row, never from the request. Existing detach synchronisation, terminal force-detach, `SECURITY DEFINER`, fixed `search_path` and service-role-only execute are preserved; the detach comparison keys on whichever reference the row carries.

### RLS and grants

Both new tables: RLS on. `service_role` ALL. `authenticated` SELECT only, policy `using (owner_id = auth.uid())` — no INSERT, UPDATE or DELETE grant at all, so browser roles cannot write infrastructure fields. `anon` no grants. Collaborators and PIN guests are deliberately absent from these policies and continue reading viewer-safe `slot`/`label`/`playback_path` through the unchanged `session_sources` participants policy. No new role.

## Verification

Migration applied, then: existing library attachment still succeeds; same-owner same-session `ready` route succeeds; cross-owner route rejected; wrong-session route rejected; non-`ready` route rejected; forged playback/infrastructure metadata in the request cannot become authoritative; both-references and neither-reference rejected; duplicate active slot and duplicate active route rejected; collaborator cannot read either runtime table; `anon` cannot read them; `authenticated` cannot write runtime infrastructure; existing Phase 5 rows remain valid; hard-deleting a session that has a live runtime route is rejected by the FK.

Plus the full existing suite and typecheck. Report changes, migration result, test results and any deviations, then stop.
