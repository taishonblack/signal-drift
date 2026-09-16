# Phase C Design Audit — Create Session → Automatic SRT Caller

Design and audit only. Nothing implemented, no migrations, no code or UI changes.

## 1. Verified current Create Session flow (post-Phase B)

Confirmed by reading the live code:

- `CreateSession.tsx` → `createAndNavigate()` (lines 279-329) builds the `SessionRecord` in the browser, calls `addSession()` (local storage), then fires `saveSessionRemote(session)` **without awaiting it** and immediately calls `navigate('/session/:id')`. The local-storage-before-persistence race the earlier audit found is still present.
- Slot model: `SrtLine` stores an opaque `srtAddress` string (`srt://host:port?mode=caller`), plus `passphrase`, `bitrate`, `notes`, and the Phase 5 additive fields `ingestSourceId` / `sourceKind`. `parseSrtInput()` / `composeSrt()` (session-store 1033-1049) convert between the URL and host/port on every keystroke; the UI has no separate host/port state.
- `isConfigured()` treats a slot as ready when either a My Source is selected or host+port parse out. There is no requirement to pick a My Source.
- My Sources picker sets `srtAddress` to `RECEIVE_DESTINATION:srtPort` — the listener/MAKO-Receive model. Address Book only fills host/port.
- `Test Connection` calls `probeStream(streamNameForSlot(slot))` — purely legacy `camN`; it never touches the entered endpoint.
- `saveSessionRemote()` sends `attachmentIntents(lines)`, which emits **only** `{ slot, ingest_source_id, label? }`. `save-session`'s `AttachmentSchema` is `.strict()` and accepts only `ingest_source_id` (uuid).
- `save_session_with_sources` already has the Phase B runtime-route branch (validates owner, session, `ready`, playback path), but no caller in the app reaches it.
- `session_runtime_routes` grants: `authenticated` has SELECT only; all writes are `service_role`. The browser therefore **cannot** reserve or finalize a route directly — an Edge Function is mandatory.
- `inputsFromRecord()` resolves playback from `record.attachments` when present, else legacy `camN`; it keys "source-backed" off `sourceKind === "mako" && ingestSourceId`. A runtime-route slot needs an equivalent marker or it will fall back to `camN` while attachments load.
- `mako-ingest` exposes `create_pull_source` / `get_pull_source` / `delete_pull_source`, returning `source_id`, `output_path`, `host`, `port`, `state`, `service`. No database row is written by it today.

## 2. Blocking gaps found

1. **No write path for runtime routes.** New service-role orchestration is required (recommended: one new Edge Function `provision-runtime-routes`).
2. **Session row must exist first.** `session_runtime_routes.session_id` is `NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT`, so the session row must be inserted before any reservation. Today the session row is only created by `save-session` at the very end.
3. **`save-session` cannot express a runtime attachment.** Its strict schema needs an XOR variant accepting `runtime_route_id`.
4. **No media-readiness signal exists.** `get_pull_source` returns a process `state`, not proof that the remote listener is reachable or media is flowing. Phase C therefore cannot promise "media confirmed" (see §8).
5. **No reconciliation worker.** If compensation fails, rows must be left in a recoverable state; the sweeper itself is Phase D.

## 3. Proposed Start Monitoring orchestration

All infrastructure and database work happens inside one authenticated Edge Function call, so a dropped browser cannot leave the sequence half-done in an unknown state.

Browser:
1. Validate the form (name, host, port per enabled slot).
2. Generate the session id client-side (as today) and POST it with the enabled slots to `provision-runtime-routes`.
3. On success: write local session state, then navigate to Session Room.
4. On failure: stay on the form, show a plain-language error; no local session, no navigation.

Edge Function (service role, identity from verified JWT):
1. `auth.getUser()` → `owner_id`. Reject anything else.
2. Upsert the `sessions` row with status `draft` (existing enum value — no new status) and the payload, owner from the JWT.
3. For each enabled slot, `INSERT ... ON CONFLICT (session_id, slot)` a `provisioning` route row carrying friendly name, remote host, remote port. Conflict handling is the idempotency boundary (§4).
4. For each reserved route, call `create_pull_source` with that route's host/port.
5. Validate the returned `source_id` (`src_[a-f0-9]{6}`) and `output_path`; write them onto the route and flip it to `ready`.
6. Call `save_session_with_sources` with `status: 'active'` and one `runtime_route_id` attachment per slot.
7. Return `{ ok, session_id }`.

The browser is authoritative for none of: `owner_id`, infrastructure source id, playback path, lifecycle state.

## 4. Idempotency and duplicate callers

`UNIQUE (session_id, slot)` on live routes is the enforcement point, not the React button.

- Reservation uses `INSERT ... ON CONFLICT (session_id, slot) DO NOTHING` followed by a `SELECT ... FOR UPDATE` of the existing row, so two concurrent requests cannot both provision.
- Existing row `ready` **with the same host/port** → reuse it, no new caller.
- Existing row `provisioning` → return `provisioning_in_progress`; the second request never calls the API.
- Existing row `error` → tear down any recorded infrastructure id first, then re-provision into the same row.
- Existing row `ready` with a **different** host/port → intentional endpoint change: tear down the old caller, archive to history, then provision the new one.

## 5. Multi-slot strategy

Sequential provisioning, up to four slots. Reasoning: rollback is deterministic (only the slots before the failure need teardown), upstream load stays predictable, and worst-case operator wait is a few seconds. All-or-nothing for Phase C — the Session Room is never entered with a partial attachment set.

## 6. Failure / compensation matrix

| Failure | Behavior |
| --- | --- |
| Route 1 ok, route 2 fails | Delete route 1's caller upstream, archive to history, delete live rows, session stays `draft`, no navigation |
| All callers created, route finalization fails | Same compensation; the failing row keeps `error` + `last_error` if its teardown also fails |
| All routes `ready`, `save_session_with_sources` fails | Compensate every caller; report save failure |
| Compensation itself fails | Live row stays with `lifecycle_status='error'` (or `tearing_down`), `teardown_attempts` incremented and `teardown_error` recorded — never silently dropped |
| Connection drops mid-request / browser closes | Rows remain `provisioning`; retry reuses them; a possibly-orphaned caller is detectable by the recorded `infrastructure_source_id` |
| Request times out but infrastructure was created | The route row already holds the id after step 5, or the retry's conflict path tears down and re-provisions |
| Double-click | Second request hits the conflict path; no second caller |
| Navigation fails after successful persistence | Nothing to compensate — the session is genuinely started and reachable from Sessions/return bar |

Rule: never knowingly leak a caller because session creation failed; never mark cleanup successful when it wasn't.

## 7. Create Session UI

Per enabled runtime slot the primary fields become exactly:

- Friendly Name
- SRT Address / IP
- Port

Removed from the primary new-session path: MAKO Receive destination text, `stream.makosrt.com`, allocated listener port, Stream ID guidance, `camN` guidance, and any implication that a My Source must be picked first. Session-level fields (Name, Purpose, Time Zone, Duration) stay. Passphrase/bitrate/notes move under Advanced. My Sources and Address Book remain as optional prefills for name/host/port only. My Sources is not removed.

## 8. Connection readiness for Phase C

Start Monitoring requires **infrastructure creation confirmed** (valid `source_id` + `output_path`) only. The Session Room then shows the normal connecting → live tile behavior as WHEP resolves. Actual SRT/media confirmation is explicitly **not** promised in Phase C: the upstream API exposes no media-flow signal, and the caller process keeps retrying against an unreachable listener. A future backend addition (e.g. an upstream endpoint reporting SRT link/bitrate state) is required before a real readiness gate is possible.

## 9. Test Connection

Audited, not redesigned here. It probes `camN` and is meaningless for a caller route. It should not gate Start Monitoring in Phase C. Eventually it needs to either probe the route's real `output_path` after provisioning, or use a genuine endpoint-reachability check from the infrastructure side.

## 10. Legacy compatibility and data model

- New slots gain explicit `remoteHost` / `remotePort` fields plus `sourceKind: 'runtime'` and `runtimeRouteId`. `srtAddress` is still written via `composeSrt()` for backward display, but host/port become the authoritative UI model. `parseSrtInput()` stays for hydrating old sessions.
- `inputsFromRecord()` extends its source-backed test to include runtime slots so a runtime slot never falls back to `camN` while attachments load. Legacy `camN` fallback is retained for historical sessions only. No global `camN` removal.

## 11. Security

Owner comes from the verified JWT; the browser cannot set `owner_id`, infrastructure id, playback path, or lifecycle state. Remote host/port stay owner/backend-only; collaborators and PIN guests keep reading only viewer-safe `session_sources`. No admin bypass, no new role. Service-role/RPC required for: session upsert, route reservation/finalization, teardown, and `save_session_with_sources`. Safe from the browser: form state, reading own routes, reading viewer-safe attachments.

## 12. Tests required before deployment

Fake-dependency Edge Function tests: happy path 1-4 slots; failure at slot 2 compensates slot 1; finalization failure compensates; save failure compensates; compensation failure leaves recoverable `error` state; duplicate/concurrent request creates no second caller; reuse of matching `ready` route; endpoint change tears down and re-provisions; invalid host/port/name rejected; unauthenticated rejected; forged playback/infrastructure fields ignored.

Database/RPC: runtime attachment succeeds only for same-owner/same-session/`ready`; XOR still enforced; existing library attachments unaffected; existing Phase 5 rows valid.

Frontend: runtime slot resolves to the attachment playback path and never to `camN`; legacy sessions unchanged; no navigation before persistence. Plus full existing suite and typecheck.

## 13. Change surface

Would change: `src/pages/CreateSession.tsx`, `src/lib/session-store.ts` (`SrtLine` fields), `src/lib/session-attachments.ts` (runtime intents), `src/lib/sessions-remote.ts`, `src/lib/stream-paths.ts` (`inputsFromRecord`), `supabase/functions/save-session/index.ts` (XOR attachment schema), new `supabase/functions/provision-runtime-routes/`, and rows in `session_runtime_routes` / `session_runtime_route_history` / `session_sources` (no schema change expected beyond none — Phase B schema is sufficient).

Would NOT change: `ingest_sources` / My Sources model, Phase A caller API contract, Phase B tables and FK semantics, sessions DELETE grant, `camN` fallback, Test Connection behavior, Sources page, collaborator/guest access model, Session Room layout/audio/focus behavior, reconciliation worker (Phase D).
