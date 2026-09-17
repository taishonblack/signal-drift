# Phase D Archival Fix — Let a Confirmed-Dead Route Archive

Production proved the dangerous half is correct: the caller was really deleted, and because archival could not be confirmed the route kept the address reserved. The gap is narrow and entirely inside the archive step.

## What the live schema actually says

`session_sources` (inspected live):

- Columns that survive independently of the route: `session_id`, `slot`, `label`, `playback_path`, `attached_at`, `detached_at`.
- FK `runtime_route_id -> session_runtime_routes(id) ON DELETE RESTRICT` — blocks the archive's delete.
- CHECK `session_sources_single_reference: num_nonnulls(ingest_source_id, runtime_route_id) = 1`.
- Partial unique index `session_sources_active_runtime_route_key` applies only where `detached_at IS NULL`.

Two consequences:

1. Nulling `runtime_route_id` on a detached row is blocked today by the XOR check, so the check must be scoped to active attachments before the reference can be cleared.
2. `label` and `playback_path` already preserve the feed's viewer-safe identity, and `session_runtime_route_history` keeps the full route record — so clearing the reference loses no display information.

## Option comparison

- **Global FK change to `ON DELETE SET NULL`** — not recommended. It makes any accidental or unrelated delete of a live route silently succeed and quietly orphan attachments. It also does nothing about the XOR check, so it would still fail. Fail-closed protection is worth keeping.
- **Clear the reference inside the confirmed-delete archival transaction** — recommended. The reference can only be cleared by the archival RPC, which is service-role-only and is called only after upstream deletion is confirmed tombstoned/404. `ON DELETE RESTRICT` stays as the backstop against every other path.

## Recommended change (one migration, no function code)

1. Replace `session_sources_single_reference` with a version that keeps the XOR for live attachments and permits a reference-free historical row:
   `detached_at IS NOT NULL OR num_nonnulls(ingest_source_id, runtime_route_id) = 1`.
2. Inside `archive_session_runtime_route`, in the same transaction, between writing history and deleting the route: set `runtime_route_id = NULL` (and `detached_at = coalesce(detached_at, now())`) on every `session_sources` row pointing at that route. Then the existing delete succeeds.

Nothing else changes: no new tables, no RLS changes, no changes to `begin_session_release`, `provision-session`, `session-lease`, or the reconciliation functions.

## The two already-stuck routes

No manual repair needed. The 15-minute reconciliation pass already selects `tearing_down`/`error` routes with a teardown requested and no completion, looks each caller up by route UUID, treats `tombstoned` as confirmed gone, and archives. Once the RPC can delete the row, `src_3849c9` and `src_8961fc` archive themselves on the next pass and release the endpoint. Reconciliation never creates infrastructure. `sess-M346VEPAMM` / `src_dabec0` is `ready`, not selected, and untouched.

## Verification and tests

Database assertions (transactional, rolled back):

- Archiving a route whose detached attachment still references it now succeeds; the history row exists, the live route is gone, and the attachment keeps `label`, `playback_path`, `slot`, timestamps with a null reference.
- A live (`detached_at IS NULL`) attachment still cannot have both or neither reference — Phase B XOR intact.
- A direct delete of a live route still fails with `ON DELETE RESTRICT`.
- `archive_session_runtime_route` still rejects a final status other than `torn_down`/`error` and a route not owned by the caller.

Existing suite: the release/reconcile unit tests are unaffected (no function code changes) and the full suite plus TypeScript will be run.

## After the fix

Watch the reconciliation pass clear the two stranded routes, confirm the endpoint frees only after both are archived, then end `sess-M346VEPAMM` as the clean end-to-end proof of teardown → archive → endpoint release. No DigitalOcean changes at any point.
