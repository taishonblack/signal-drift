# Caller-First Session Sources — Audit and Phased Plan

Audit only; nothing was changed. Findings below are from the current code.

## 1. How Create Session stores Name / Address / Port

- Each of the four slots is an `SrtLine` (`src/lib/session-store.ts:23`): `id`, `enabled`, `label`, `srtAddress`, `passphrase`, `bitrate`, `mode`, `notes`, `originTimeZone`, plus the Phase 5 additions `ingestSourceId` and `sourceKind`.
- There are no separate host/port fields. The page keeps a single `srtAddress` string and splits/joins it with `parseSrtInput` / `composeSrt` (`session-store.ts:1033`, `:1043`). Friendly name is `label`.
- `mode` exists and is forced to `"caller"` everywhere (`createDefaultLine`, and `createAndNavigate` normalizes every enabled line to `caller`), so no mode selector needs removing — only the wording and semantics.
- Picking a My Source overwrites `srtAddress` with `stream.makosrt.com:<srtPort>` (`CreateSession.tsx:239`) — i.e. today the address field is the *encoder's* destination, the opposite of caller semantics.

## 2. What Start Monitoring does today

`handleStart` (`CreateSession.tsx:368`) → `createAndNavigate`: builds a `SessionRecord` with `status: "active"`, writes it to localStorage/sessionStorage through the session store, then navigates to the Session Room. For members, `saveSessionRemote` posts `{ session, attachments }` to `save-session`, which hashes the PIN and calls `save_session_with_sources`. **No infrastructure is provisioned at start** — a source must already exist in My Sources.

## 3. Extending `mako-ingest` for `/pull-sources`

`supabase/functions/mako-ingest/index.ts` already has the right shape: JWT verify → validated action → server-only `MAKO_API_BASE_URL` / `MAKO_API_TOKEN` → sanitized upstream errors. Add actions `create_pull_source` / `delete_pull_source` that accept only `{ name, host, port }` / `{ source_id }`, validate host as a public hostname/IP and port range in the function, and reuse the existing injected-dependency pattern of `create-source.ts` (`validateProvisionedSource` already enforces `src_[a-f0-9]{6}`, port range, and `output_path === "<id>-opus"` — reusable almost verbatim for the caller response). The token stays server-side; the browser never sees host/port of anyone else's route.

## 4. Should `ingest_sources` still model caller routes?

No — not as *library* rows, but reuse the table rather than adding a parallel one. Reasons from the live schema: `ingest_sources` carries owner-scoped RLS, the infra-column guard trigger, the provisioning invariant trigger, and the quota RPC `reserve_ingest_source_slot` which counts every non-deleted row per owner. If session-scoped caller routes land in that table unchanged, a 3-slot session immediately eats the 4-source quota and the routes appear in My Sources.

Recommended direction: add `origin` (`'library' | 'session'`), `session_id`, `remote_host`, `remote_port` to `ingest_sources`; exclude `origin = 'session'` from the quota count and from the My Sources query; keep everything else (RLS, triggers, `save_session_with_sources`, `session_sources`) intact. This preserves Phase 5 wholesale and keeps one reconciliation surface for orphaned infrastructure.

## 5. How `session_sources` snapshots the playback path

Unchanged. `save_session_with_sources` already copies `ingest_sources.playback_path` into `session_sources.playback_path` server-side and refuses a source with a null path (`source_not_ready`). Caller provisioning fills `playback_path` with the returned `src_xxxxxx-opus` before the save runs, so the existing viewer-safe snapshot and the active-only partial unique indexes need no change.

## 6. Safe provision → save sequence

```text
validate form (name, public host, port, no duplicates)
  -> per slot: reserve session-scoped ingest_sources row (provisioning)
  -> POST /pull-sources { name, host, port }; validate response
  -> finalize row (source_id, port, playback_path, ready)
  -> save-session (session + attachments) in ONE transaction
  -> only on success: write local record + navigate to Session Room
compensation, in reverse: DELETE /pull-sources/{id} for every route created
by THIS attempt, then delete its reservation row; log any failure for
reconciliation.
```
This mirrors the proven `createSource` reserve/provision/finalize/release/compensate flow.

## 7. Ending a session

Terminal statuses (`completed`, `archived`) already stamp `detached_at` server-side. Add a teardown step in `save-session` (or a dedicated action) that, for that session's `origin = 'session'` routes, calls `DELETE /pull-sources/{id}` and marks the row `deleted`. Session deletion cascades `session_sources`, so teardown must run before/with the delete. Library sources keep today's behaviour: never deleted by a session ending.

## 8. Reopening / editing an active session

Provision only for slots that changed. Key an existing route by `(session_id, slot)`; if the row exists, is `ready`, and `remote_host`/`remote_port` still match the form, reuse it. If host/port changed, provision the new route, re-save attachments, then delete the old route. Guard the double-submit path in the UI too.

## 9. Collaborators

Unchanged and already correct: collaborators read only `session_sources` (slot, label, `playback_path`, attach time) under the participant policy, never `ingest_sources`. Caller host/port live only on the owner-scoped row, so no RLS change is needed or wanted.

## 10. Remaining cam1–cam4 / My-Sources-first assumptions

- `src/lib/stream-paths.ts`: header comment, `streamNameForSlot`, `publishIdForSlot`, `playbackStreamNameForSlot`, `whepUrlForSlot`, and the legacy branch of `inputsFromRecord` (`:441`).
- `src/pages/CreateSession.tsx`: `probeStream(streamNameForSlot(slot))` (`:268`), the encoder-instructions block showing `camN` / `publish:camN` (`:722`-`:730`), diagnostics text (`:883`), the My Source picker as the configured path (`:695`, `attachMySource` at `:228`).
- `src/lib/mock-data.ts:12` comment; `src/hooks/use-my-sources.ts` `RECEIVE_DESTINATION` used as the address for a slot.
- `src/pages/Sources.tsx` stays as the optional library.

The legacy `camN` branch should remain for already-saved sessions but must no longer be reachable for new ones.

## 11. Test Connection

Today it probes `camN` on MediaMTX — meaningless for a caller. Target behaviour: after a caller route exists, ask the backend for `GET /pull-sources/{source_id}` and report the real service state; before provisioning, do a form-level validation only (public host, resolvable, port range). Both go through `mako-ingest`, never the browser.

## 12. localStorage-first risk

Real risk today. `createAndNavigate` writes the local record and navigates immediately; the remote save is fire-and-forget. With caller provisioning, the Session Room could open with a slot that has no attachment yet — `inputsFromRecord` shows "connecting" while `attachmentsLoaded` is false, so there is no *wrong* playback, but a failed provision would leave a locally-active session with no route. Fix: await provisioning + `save-session` before the local write and navigation, and show a provisioning state on the button.

## Proposed phases

- **Phase A** — Backend caller support: `mako-ingest` gains validated `create_pull_source` / `delete_pull_source` / `get_pull_source` with server-side public-host and port validation, plus fake-dependency tests. No UI, no schema.
- **Phase B** — Schema: `origin`, `session_id`, `remote_host`, `remote_port` on `ingest_sources`; quota RPC and My Sources query exclude session-scoped rows; triggers/RLS otherwise untouched.
- **Phase C** — Create Session workflow: Name → Address/IP → Port → Start Monitoring, with the provision→save→navigate sequence and full compensation; My Source picker demoted to optional.
- **Phase D** — Lifecycle: teardown of session-scoped routes on complete/archive/delete, and reuse-not-duplicate on reconfigure of an active session.
- **Phase E** — Test Connection against the real route, plus removal of `camN` guidance from new-session UI (legacy playback fallback kept).

Nothing is implemented until you approve.
