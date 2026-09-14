# Phase 3 — Registry-Aware Source Deletion

Deleting a MAKO Receive source becomes a coordinated operation: the saved source record decides whether deletion is allowed, the outside ingest system is asked to remove the feed, and the record is kept as history rather than erased.

## Behavior

- The saved record is the authority. The browser still sends only the `src_xxxxxx` ID; that ID is used to find the record, and every value used afterward (the real infrastructure ID) comes from the record.
- Sources created before the registry existed have no record. Those are refused with a "not registered" conflict, and the outside system is never called — this protects the two older live sources during the transition.
- A source that is attached to a session (relationship still active) is refused as "in use". Nothing is auto-detached.
- Lifecycle: mark `deleting` → call the outside delete → on success `deleted` + `offline` + checked-at timestamp + cleared error; on failure `error` with a short operator-safe message, previous connection status preserved, record kept.
- Repeat calls are safe: already `deleted` returns a success-style already-deleted result without calling the outside system; `deleting` returns an in-progress conflict.
- The record is never physically removed. Name, owner, infrastructure ID, port, and playback path stay as historical metadata. Port release is the infrastructure manager's job.
- Sign-in plus the secure admin role stay required; the API token stays server-side; nothing is logged beyond sanitized messages.

## Technical detail

New `supabase/functions/mako-ingest/delete-source.ts` holding a dependency-injected `deleteSource()` — same pattern as Phase 2's `create-source.ts`. Injected side effects: `loadRegistryRow(sourceId)`, `countActiveAttachments(ingestSourceId)`, `updateRegistryRow(id, patch)`, `deleteUpstream(infrastructureSourceId)`, `logError`. Returns `{ status, body }`.

`supabase/functions/mako-ingest/index.ts` — the `delete_source` branch keeps its auth, admin check, and strict `^src_[a-f0-9]{6}$` validation, then delegates to `deleteSource()`, supplying the side effects via the service-role client (`ingest_sources` select/update, `session_sources` count with `detached_at is null`) and the existing authenticated upstream DELETE. `list_sources` and `create_source` untouched.

Response: success keeps `{ source_id, deleted: true }` and adds `ingest_source_id`. Refusals return generic codes (`not_registered`, `source_in_use`, `delete_in_progress`, `delete_failed`) with no ownership or infrastructure details.

No schema or migration changes. Phase 1 grants, triggers, and RLS unchanged; all status writes go through the service-role path.

New `src/test/mako-ingest-delete-source.test.ts` with fakes only, covering: malformed ID, no registry row, row owned by another user, active attachment, already deleted, deletion in progress, successful delete, upstream failure, the `deleting` transition, the `deleted`/`offline` transition, the `error` transition, and that the upstream target comes from the stored infrastructure ID rather than the port or arbitrary input.

## Live verification

Delete `Registry Persistence Test` (`src_250420`, port 10022) through the existing dev panel, then confirm: infrastructure source gone, port 10022 absent from the source listing, record still present with `deleted` / `offline` / timestamp set / no error, and `src_250420` / `10022` / `src_250420-opus` preserved. Confirm the two unrelated sources and existing sessions and playback are untouched. Run typecheck and the full test suite. No new real source is created.

Stops here — no My Sources UI, no session attachment.
