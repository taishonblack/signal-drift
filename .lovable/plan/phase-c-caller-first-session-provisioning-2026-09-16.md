# Phase C — Caller-First Session Provisioning

Create Session becomes: Friendly Name + SRT Address + Port → Start Monitoring → MAKO provisions a caller to that external listener → the session opens on that live feed. My Sources, Address Book, and legacy sessions keep working exactly as they do today.

## What the operator sees

1. Each enabled slot asks only for Friendly Name, SRT Address / IP, Port, with the line "MAKO will connect to this SRT listener."
2. Start Monitoring shows a per-slot progress state and stays on the page until every enabled slot is ready.
3. On success the Session Room opens already showing the provisioned feed.
4. On failure nothing navigates; the operator gets a plain message (address conflict, listener unreachable, this line was previously deleted and needs a new line, etc.) and the session is not started.
5. Test Connection is disabled for caller-first slots with the note that a real caller test is coming later — it no longer probes a legacy path and claims success.

## Server-side provisioning (new Edge Function `provision-session`)

Browser sends only: session record, library-source attachment intents, and per-slot `{ slot, name, host, port }`. Owner is always taken from the verified JWT.

Sequence per request:

```text
verify JWT -> reserve session row as draft (owner = verified user)
for each enabled caller slot, in slot order:
    reserve or resolve session_runtime_routes row (state rules below)
    call mako-ingest create_pull_source with idempotency_key = route.id
    on success: persist infrastructure_source_id + playback_path, lifecycle = ready
attach all routes + library sources via save_session_with_sources, status = active
return ok -> browser updates local state -> navigate
```

`provision-session` calls the existing `mako-ingest` function over HTTP with the operator's own token. Phase A.2 code is not modified.

### Runtime-route state rules (per session + slot)

| Current row | Behaviour |
| --- | --- |
| none | reserve new row, provision with its UUID |
| `provisioning`, same endpoint | resume with the same UUID; `get_pull_source_by_idempotency_key` first to recover a lost create response |
| `ready`, same endpoint | reuse, no new caller |
| `ready`/`provisioning`, different endpoint | typed `endpoint_conflict`, no teardown |
| `error`, same endpoint | retry with the same UUID only |
| `tearing_down` | typed `route_tearing_down` |
| upstream 409 | `endpoint_conflict` |
| upstream 410 | `route_tombstoned` — never recreated |

### Failure and compensation

- Callers created during a failed attempt are torn down through `delete_pull_source`; confirmed teardown archives the row into `session_runtime_route_history`.
- Teardown that cannot be confirmed leaves the row in `error`/`tearing_down` with `teardown_attempts`, `teardown_error`, and full identity retained. No row is hard-deleted.
- The session stays `draft` (invisible) when provisioning does not complete.

## Draft hiding (narrow)

Invariant: draft = hidden from normal operator UI, NOT nonexistent to provisioning/recovery.

- `draft` is not added to the frontend `SessionStatus`.
- `hydrateMemberSessions` skips `draft` rows, so provisioning attempts never appear in the session list.
- Operator-facing session loading refuses to open an incomplete `draft` session.
- `migrateStatus()` must never convert `draft` into `completed`; a draft row is simply ignored by the operator UI.
- The authenticated server side always resolves the owner's existing `draft` session and its `session_runtime_routes` rows, so a retry of `provision-session` for the same session ID reuses the existing route UUIDs instead of creating replacement infrastructure.

## Playback

`session_sources.runtime_route_id` carries caller-backed slots; the trusted `playback_path` and label come from the database. `loadSessionAttachments` also selects `runtime_route_id`, and `inputsFromRecord` treats a runtime-backed slot exactly like a source-backed one — connecting while attachments load, never a temporary `camN`. Legacy sessions keep the `camN` fallback. Friendly Name always comes from our own data, never from the upstream caller record (which may return `name: null`).

## Technical details

**Database migration (no table or constraint changes):**
- `reserve_session_runtime_route(_owner, _session_id, _slot, _name, _host, _port)` — security definer; creates the `draft` session row if absent (owner enforced), then returns the existing route for that session+slot or inserts a new `provisioning` row, and returns a typed conflict marker for a changed endpoint or a `tearing_down` row.
- `archive_runtime_route(_owner, _route_id, _final_status)` — security definer; copies the row into `session_runtime_route_history` and removes the live row in one transaction, used only after confirmed teardown.
- `save_session_with_sources`, the XOR constraint, RLS, grants, and the sessions DELETE policy are untouched.

**Files expected to change:**
- new `supabase/functions/provision-session/index.ts` plus a pure `provisioning.ts` module in that folder (dependency-injected, unit-testable)
- `src/lib/sessions-remote.ts` — new awaited `provisionSessionRemote()`; draft filtering in hydration/load
- `src/lib/session-attachments.ts`, `src/lib/session-store.ts` (add `runtimeRouteId` to `SessionAttachment`, runtime fields on `SrtLine`), `src/lib/stream-paths.ts` (runtime-backed slot resolution)
- `src/pages/CreateSession.tsx` — caller-first inputs, awaited Start Monitoring with progress + typed error messages, Test Connection gating

**Tests** (new `src/test/session-provisioning.test.ts` plus additions to the stream-path/session tests) cover all 18 required cases: single- and multi-slot provisioning, route UUID used as idempotency key, same-endpoint reuse, lost-response recovery, endpoint conflict, tombstone rejection, `runtime_route_id` attachment, DB-derived playback path, our Friendly Name with upstream `name: null`, draft hidden from hydration, navigation only after success, no navigation on failure, partial-failure compensation, failed compensation retaining state, collaborator cannot read runtime endpoint config, legacy playback unchanged, library attachments unchanged. Full suite and TypeScript check run afterwards.

**Security:** runtime endpoint configuration stays owner-only (existing `session_runtime_routes` RLS); collaborators and PIN guests still see only viewer-safe `session_sources` data. No new roles, no admin bypass, no browser-supplied owner, playback path, or infrastructure ID.

## Out of scope

Phase D reconciliation, endpoint replacement, My Sources/Address Book redesign, Test Connection rebuild, broad status refactor, and any infrastructure/API changes.
