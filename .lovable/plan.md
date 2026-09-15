# Phase 5 — Attach My Sources to Sessions + Dynamic Playback

Adds the persistent-Source path alongside the legacy cam1-cam4 path. Legacy sessions keep working with no migration and no resave.

## What the operator will see

- Each of the four Create Session slots gets a **My Source** picker listing only that operator's own non-deleted, ready Sources. Selecting one is enough to configure the slot — no address, no port.
- A clearly separated **External / legacy** section per slot keeps today's Address + Port, Address Book and Test Connection for manual inputs. The `Save Source` button becomes `Save to Address Book`.
- Start Monitoring saves the session and its chosen Sources together: either the whole configuration exists, or nothing is saved and an error is shown.
- Session Room and both popout windows play the attached Source's own feed. Invited collaborators can watch it, but never see the Source library, its SRT destination, or its port.
- Ending a session releases its Sources; the Sources themselves stay in My Sources and can be reused, including in two sessions at once.
- No `+ Create New Source` inside Create Session yet — the picker links to My Sources when empty.

## Database changes

Live state confirmed: `session_sources` has no `playback_path`, and `session_sources_unique_slot (session_id, slot)` / `session_sources_unique_source (session_id, ingest_source_id)` are plain unique indexes that do not ignore `detached_at` — they would block reattachment after history exists.

One migration:

1. `ALTER TABLE public.session_sources ADD COLUMN playback_path TEXT` (nullable; viewer-safe snapshot). Nothing else from `ingest_sources` is copied.
2. Drop the two table constraints and replace them with partial unique indexes limited to `detached_at IS NULL`, preserving the active-state invariants while allowing detached history and later reattachment:
   - `UNIQUE (session_id, slot) WHERE detached_at IS NULL`
   - `UNIQUE (session_id, ingest_source_id) WHERE detached_at IS NULL`
3. `public.save_session_with_sources(_owner uuid, _session jsonb, _attachments jsonb)` — `SECURITY DEFINER`, `SET search_path = public`, `REVOKE` from `PUBLIC`/`anon`/`authenticated`, `GRANT EXECUTE` to `service_role` only. `_owner` is the JWT-verified user id passed by the edge function; it is never read from request JSON. The whole body runs as one transaction:
   - upsert `public.sessions` after verifying any existing row's `owner_id` matches `_owner`;
   - for each intended attachment: validate `slot BETWEEN 1 AND 4`, reject duplicate slots and duplicate source ids in the payload, then look up `ingest_sources` by id requiring strictly `owner_id = _owner` — **no admin bypass**; `has_role(...,'admin')` plays no part in normal attachment, so an admin using Create Session can only attach their own Sources — plus `lifecycle_status <> 'deleted'` and a non-null `playback_path`. Any failure raises, rolling back the session write too;
   - synchronize the active set: stamp `detached_at = now()` on active rows no longer intended or whose source changed, then insert the intended ones with the trusted `playback_path` and the label snapshot (`ingest_sources.name` unless a session label was supplied);
   - when the incoming status is `completed` or `archived`, stamp `detached_at = now()` on every remaining active row for that session.

`ingest_sources` policies, quota, `mako-ingest`, and Phase 4 lifecycle are untouched.

## Backend

`supabase/functions/save-session/index.ts`: the identity chain is browser JWT → `auth.getUser()` → verified `user.id` → service-role RPC `_owner`. The request schema gains only `attachments: [{ slot, ingest_source_id, label? }]`; `owner_id`/`_owner`/`playback_path`/`infrastructure_source_id`/`srt_port` are not accepted from the browser (rejected by the schema, never forwarded). The current sequential upserts are replaced by one service-role `rpc("save_session_with_sources", { _owner: user.id, … })`. The function keeps refusing to modify a session whose stored `owner_id` differs from the verified `user.id`, and the `shared_session_access` owner upsert stays. Validation failures return a 4xx with the reason (`source_not_found`, `source_forbidden`, `duplicate_slot`, …).

## Frontend

- `src/lib/session-store.ts` — additive only: `SrtLine.ingestSourceId?: string` and `SrtLine.sourceKind?: "mako" | "legacy"`; a new `SessionRecord.attachments?: SessionAttachment[]` (`{ slot, label, playbackPath, ingestSourceId, attachedAt }`) plus an `attachmentsLoaded?: boolean` marker. Legacy records without these fields keep working everywhere.
- `src/lib/session-attachments.ts` (new) — `loadSessionAttachments(sessionId)` selects `slot, label, playback_path, ingest_source_id, attached_at` from `session_sources` where `detached_at IS NULL` (existing participant RLS covers owners and collaborators; no `ingest_sources` read).
- `src/lib/stream-paths.ts` — single resolver: `inputsFromRecord` prefers an active attachment for the slot and uses its `playback_path` verbatim as `streamName`; `playbackStreamName` already no-ops on a `-opus` suffix, so nothing is double-suffixed. Source-backed slots no longer require host+port; legacy slots keep the existing host+port filter and `camN` mapping. A source-backed slot with attachments still loading renders as connecting rather than falling back to `camN`.
- `src/pages/SessionRoom.tsx`, `SourcePopoutPage.tsx`, `LayoutPopoutPage.tsx` — load attachments alongside the session record and pass them into the resolver; no per-page path logic. Fix the Session Room diagnostics line so it prints the resolved path instead of asserting `camN`. Audio (`activeAudioSourceId` keyed on the stable `line-<slot>` id) is unchanged.
- `src/pages/CreateSession.tsx` — per-slot My Source picker built on `useMySources()`, showing `MAKO Receive • Ready` and disabling provisioning/error/deleted Sources; legacy fields grouped under an External / legacy heading; `isConfigured` / `getLineStatus` treat a chosen Source as configured without fake address values; Test Connection hidden for source-backed slots; `Save to Address Book` relabel; Start Monitoring and configure-save both send the attachment intent. Configure mode preselects each slot from the loaded attachments and lets the owner replace or clear them.

## Tests

Security tests: User A can attach their own Source; User A cannot attach User B's Source; an admin account using normal Create Session cannot attach User B's Source; a browser-supplied `owner_id`/`_owner` is rejected/ignored; a forged `ingest_source_id` cannot bypass ownership; a collaborator cannot create or change attachments. Plus fake-dependency unit tests for the attachment synchronization and validation rules (duplicate slot/source, rollback on a mid-set failure), resolver tests (dynamic path, no double `-opus`, exact `https://stream.makosrt.com/src_xxxxxx-opus/whep`, legacy `camN-opus` for all four slots, no fallback while loading), lifecycle tests (scheduled/active/paused keep attachments, completed/archived detach, source survives), reuse tests (same Source in two sessions, ending one leaves the other), and Create Session picker tests. Then the full suite plus typecheck.

## Live verification

One Source, one session: attach to slot 1, Start Monitoring, then report the real `session_sources` row verbatim — Source UUID, slot, snapshotted label, `src_xxxxxx-opus`. Confirm Session Room and a popout request that path (not `cam1-opus`), confirm a legacy session still resolves `cam1-opus`, complete the session and report the same row again showing `detached_at` populated while the underlying Source is intact and reusable in My Sources. Second-user viewer check if an authorized account is available. Only deliberately created test sessions are cleaned up.

## Later hardening (recorded, not built)

Connection-state polling, redesigned Test Connection, inline Source creation, deleted-Source history UI, reconciliation tooling, `mako_sessions_v3` cross-account hardening, TURN, legacy cam retirement.
