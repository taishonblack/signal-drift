# Phase 5 — Source-to-Session Integration Audit (read-only)

No code, schema, RLS, or infrastructure was touched. Findings below are backed by the named files/tables.

## 1. Current Create Session source model
`src/pages/CreateSession.tsx` + `src/lib/session-store.ts` (`SrtLine`). Four fixed slots built by `createDefaultLine(1..4)`.

Persisted per slot (`SrtLine`): `id` (slot 1-4), `enabled`, `label`, `srtAddress` (host:port composed by `composeSrt`), `passphrase`, `bitrate`, `mode` (forced `caller` on save), `notes`, `originTimeZone`.

React-state only (never saved): `activeTab`, `advancedOpen`, `tested`, `testResult`, `presetMinutes`.

Not stored anywhere: Stream ID, cam identity, playback path, infrastructure id, per-slot audio settings. `Save Source` writes to the Address Book (`public.address_book`) — it is not a source registry. There is no source type / connection mode beyond `mode`.

## 2. Session save/load path
`Start Monitoring` → `handleStart` → `createAndNavigate`: requires ≥1 slot with host+port; builds a `SessionRecord` (all four `lines`, including disabled ones), `addSession()` to localStorage, then for members `saveSessionRemote()` → edge function `save-session` → `public.sessions` (`id, owner_id, name, status, pin_hash, payload`). Everything except id/name/status/pin goes into `payload` (`sessions-remote.ts: toRemote`), so `payload.lines` is the authoritative saved source config. Slot order = `line.id`. Empty slots are saved. No playback path, no infra id, no stream id. Config is duplicated: localStorage `mako_sessions_v3` + `sessions.payload`, with local terminal status winning during `hydrateMemberSessions`.

Configure/reuse: `/session/:id/configure` and `?reuse=` re-seed `lines` from the stored record (`seedLines`), pad to 4. Code that would break if a slot became a reference: `isConfigured`/`getLineStatus`/`parseSrtInput` (address+port), `inputsFromRecord` (filters on host+port), `diffSessionConfig`, `EditInputModal`, `SessionChangeLogPanel`.

## 3. Runtime source model
`SrtLine` = configuration record. `StreamInput` (`src/lib/mock-data.ts`) = runtime pane object. Conversion happens in one place: `inputsFromRecord()` in `src/lib/stream-paths.ts`, which drops any slot without host+port and stamps `streamName: streamNameForSlot(slot)` → `camN`. SessionRoom only needs `id`, `label`, `streamName`, `slot`, `status`, `metrics`. Smallest conceptual change: `StreamInput.streamName` becomes the resolved playback identity supplied by the resolver rather than always derived from slot — no other runtime field must change.

## 4. cam1-cam4 dependency map
- `src/lib/stream-paths.ts` — `streamNameForSlot` (A ingest identity), `publishIdForSlot` (A), `playbackStreamName`/`playbackStreamNameForSlot`/`whepUrlForSlot` (B playback), `inputsFromRecord` (D legacy assumption).
- `CreateSession.tsx:218,620,622,768` — Test Connection probe (A/D) and encoder-setup copy (C label).
- `SessionRoom.tsx:20,751` — diagnostics line only (B/C); panes get `streamName` from `inputsFromRecord`.
- `SourcePopoutPage.tsx`, `LayoutPopoutPage.tsx` — both call `inputsFromRecord` (D).
- `SignalTile.tsx` → `LiveCamera.tsx` — consume `input.streamName` (B, already dynamic).
- `src/test/mako-ingest-delete-source.test.ts:69` uses "cam1" only as an invalid-id fixture (E).
- No cam references in Ops, Timeline, or any edge function.
Must become dynamic: `inputsFromRecord` and Test Connection. Can stay slot-based: layout/slot-map, labels, legacy fallback.

## 5. Playback resolution chain
slot → `cam{slot}` → `playbackStreamName` → `cam{slot}-opus` → `resolveWhepBase()` (`https://stream.makosrt.com`, `/mediamtx` in dev) → `POST {base}/camN-opus/whep`. Path is always calculated, never stored. SessionRoom derives it; owners and viewers run identical code; audio and video share one PeerConnection/URL (audio differs only by `muted`). Test Connection is the sole consumer of the raw (non-opus) path. Phase 4's `ingest_sources.playback_path` already stores exactly `src_xxxxxx-opus`, i.e. a drop-in replacement for the `camN-opus` segment.

## 6. session_sources live schema
Migration `20260914201118_*`: `id`, `session_id TEXT → sessions(id) ON DELETE CASCADE`, `ingest_source_id UUID → ingest_sources(id) ON DELETE RESTRICT`, `slot SMALLINT CHECK 1..4`, `label` (1-120 chars), `attached_at`, `detached_at`, `created_at`; index on `ingest_source_id`; UNIQUE `(session_id, slot)`, UNIQUE `(session_id, ingest_source_id)`. RLS: participants (owner or `has_session_access`) SELECT; owner-only INSERT/UPDATE/DELETE, INSERT/UPDATE additionally gated by `can_use_ingest_source(ingest_source_id, auth.uid())`.

A) same source in multiple sessions — allowed. B) twice in one session — blocked. C) two sources in one slot — blocked. D) 4 slots — enforced by CHECK. E) more than 4 — impossible. F) detached rows — retained (and, because the unique constraints ignore `detached_at`, a detached row still occupies its slot; re-attaching to the same slot requires UPDATE or DELETE).

## 7. Source reuse across sessions
DB: permitted. Media: MediaMTX fans one path out to many WHEP subscribers; nothing in `stream-paths.ts` is per-session. Ingest: unchanged — one encoder, one dedicated SRT port, one contribution. Playback: both sessions subscribe to the same `src_xxxxxx-opus`. Lifecycle: sessions are independent; ending A only affects A's rows. Security: session B participants gain playback of that path only — but *only if* playback metadata is exposed per session (see §15).
Recommendation: **ALLOW SAME SOURCE IN MULTIPLE ACTIVE SESSIONS.** No schema or media assumption forbids it. One caveat to accept explicitly: the same feed becomes visible to two different viewer groups, so the attach UI should say so.

## 8. Recommended attachment lifecycle
Create rows only when `Start Monitoring` succeeds — a draft has no `sessions` row, so an FK-valid attachment is impossible before save. On session end: **set `detached_at`** (option B), keep the row for history, never delete the `ingest_source`. Reads: on SessionRoom load, by session id where `detached_at IS NULL`.

## 9. Session deletion interaction
There is no code path that DELETEs from `public.sessions` — ending a session only sets `status: "completed"` (`endSession` in `session-store.ts`); `Sessions.tsx` history is local. So the CASCADE is currently theoretical; if deletion is ever added, `session_sources` rows vanish with the session while `ingest_sources` is protected by `ON DELETE RESTRICT` and MAKO infrastructure is only ever touched by `mako-ingest`. Nothing to change in Phase 5.

## 10. Source deletion / "in use"
`supabase/functions/mako-ingest/delete-source.ts:84` — `countActiveAttachments(row.id)` counts `session_sources` rows with `detached_at IS NULL`; any count > 0 returns `source_in_use`. Session status is not consulted. Consequence: if Phase 5 never sets `detached_at`, an ended session would block deletion forever. Recommended definition: *in use = an attachment row with `detached_at IS NULL` on a session whose status is `active` (or `paused`)* — implemented by reliably stamping `detached_at` at session end, so the existing check stays correct without change.

## 11. Create Session UX migration
Keep the four tabs (`activeTab`) and four slots. Per tab, replace Address + Port (and the encoder-setup block at lines 613-630) with a `Choose Source` select over `useMySources()` plus `+ Create New Source`, and show the source's readiness. Unnecessary when a persistent source is chosen: Address, Port, Save Source (Address Book), `mode`, `bitrate`, passphrase, Test Connection in its current form. Stays session-specific: slot label (`SrtLine.label`), `notes`, `originTimeZone`, layout/slot order, audio selection, monitoring prefs.

## 12. Create-New-Source reuse
`src/hooks/use-my-sources.ts` (`createSource`, quota, `refresh`, `atLimit`) and `src/pages/Sources.tsx` UI are already self-contained and reusable from Create Session; provisioning stays in `mako-ingest`. Best reuse shape: extract the existing create dialog from `Sources.tsx` into a shared component and select the returned source into the slot. No provisioning logic duplicated.

## 13. Address Book
`public.address_book` stores `tag`, `session_name`, `purpose`, `address`, `port`, `description`, `last_used`, owner-scoped by RLS. It represents arbitrary external SRT endpoints, so it remains useful for non-MAKO inputs and should not be merged or migrated. `Save Source` today means "Save to Address Book" — rename it in Phase 5 to avoid confusion with My Sources, and present two clearly separated pickers: **My Sources** (MAKO Receive) and **Address Book** (external presets, legacy path).

## 14. Legacy compatibility
Existing sessions have `payload.lines` and no `session_sources` rows. Recommended resolution order inside `inputsFromRecord` (the single conversion point): if the slot has an attached, non-detached `ingest_source` with a `playback_path`, use it; else fall back to `camN`. That is sufficient because every playback consumer (`SessionRoom`, `SourcePopoutPage`, `LayoutPopoutPage`) goes through `inputsFromRecord`; the only extra place needing a branch is Test Connection. `inputsFromRecord` must also stop requiring host+port for source-backed slots. No migration of existing sessions is needed.

## 15. Shared-viewer playback / privacy
Viewers load sessions via `loadAuthorizedSession` / `hydrateMemberSessions` (RLS `has_session_access`). They can SELECT `session_sources`, but **cannot** read `ingest_sources` — its policies are owner/admin only — so today a viewer could not resolve `playback_path`.
Recommendation: **option C — copy the playback path into `session_sources` at attach time** (a `playback_path TEXT` column written by the owner/server), optionally paired with option B (a security-definer function returning only `slot`, `label`, `playback_path`) if a live-updating path is ever needed. C is the least-privilege, least-moving-parts answer: it exposes only the one opaque string needed to watch, never the SRT port, `infrastructure_source_id`, ownership, or library. Do not broaden `ingest_sources` SELECT (option A).

## 16. session_sources exposure
Current columns are safe for participants: `session_id`, `ingest_source_id`, `slot`, `label`, timestamps. `ingest_source_id` is an opaque UUID and grants nothing — every write path is gated by `is_session_owner` + `can_use_ingest_source`, and `ingest_sources` SELECT is owner-only, so knowing the id cannot enumerate or manage the source.

## 17. Test Connection
`CreateSession.testConnection` → `probeStream(camN)` → WHEP negotiation against the **raw** ingest path, then immediate teardown. It tests only "does a publisher exist on this MediaMTX path right now" — not the encoder, not the address/port the user typed (they are ignored), not the opus playback path. It creates only local React state. For a persistent source it should mean "is a publisher present on this source's ingest path", i.e. probe the raw path derived from `playback_path` minus `-opus`. Recommendation: keep the current probe legacy-only in Phase 5 and hide it for source-backed slots, or reuse it with the derived path — do not add monitoring.

## 18. Audio implications
`activeAudioSourceId` (SessionRoom) is nullable and keyed by `StreamInput.id` (`line-<slot>`), passed down through `DraggableSignalTile` → `SignalTile` → `LiveCamera` as `muted`. Identity never depends on `camN`. Changing the playback path alone is sufficient; persistent sources do not break switching, provided `StreamInput.id` stays stable per slot.

## 19. Popout / secondary consumers
Phase 5 must update only what feeds `inputsFromRecord`: `src/pages/SessionRoom.tsx`, `src/pages/SourcePopoutPage.tsx`, `src/pages/LayoutPopoutPage.tsx`. All three already read `input.streamName`, so a resolver change covers them. `SessionRoom.tsx:751` diagnostics text and `CreateSession` encoder copy also mention cam paths. Ops, Timeline, and Explore/demo use synthetic data and need no change.

## 20. Status during session
SessionRoom shows live WHEP-derived state per tile (`SignalTile` live badge), not `lifecycle_status` / `connection_status`. Phase 5 does not need either status to function; they stay informational (useful in the picker as "Ready"/"Provisioning"). `ready` means infrastructure exists, never "encoder connected".

## 21. Rename / history
Recommend **B: snapshot at attach time** into `session_sources.label` (that is the column's purpose; it is otherwise unused), with the persistent source keeping its own current name. Slot display order: session label snapshot, else `SrtLine.label`, else `Source N`.

## 22. Deleted source / history
`ingest_sources` uses soft delete (`lifecycle_status = 'deleted'`, row retained), and with `playback_path` copied into `session_sources` the historical name, slot, and path all resolve. History should show the captured label plus a "source deleted" note and must not offer playback.

## 23. Four sources vs four slots
Keep them independent: `MAX_ACTIVE_SOURCES` in `use-my-sources.ts` / `create-source.ts` (per owner) vs the `slot BETWEEN 1 AND 4` CHECK and `SLOT_IDS` (per session). They are enforced in different layers already; no shared constant.

## 24. Multi-user isolation
- A cannot attach B's source → INSERT policy `can_use_ingest_source`.
- Forged `ingest_source_id` → same policy (server-side, ignores client claims).
- Collaborator cannot attach → INSERT/UPDATE/DELETE require `is_session_owner`.
- Slot collision across users → unique constraint is `(session_id, slot)`, per session.
- Wrong-user playback path → path comes from the owner-validated attachment row, not from client input.
- Legacy `camN` must never be produced for a source-backed slot → resolver order in §14.

## 25. Transaction / failure strategy
Today `Start Monitoring` writes local state, then fires `saveSessionRemote` in the background. Adding up to four attachments client-side would risk exactly the partial state you described. Recommendation: extend `save-session` (or add one edge function) to accept the session plus its intended attachments and write them in a single server call — session upsert, then a full replace of that session's attachment set — so the intended configuration exists or the call fails. Persistent sources are never created or deleted by this path.

## 26. Source created then session cancelled
Confirmed by the architecture: `mako-ingest create_source` provisions and registers a source owned by the user, entirely independent of any session (`create-source.ts`, `ingest_sources.owner_id`). It **stays in My Sources**. No automatic deletion on session-creation failure.

## 27. Session status findings
`SessionStatus = scheduled | active | paused | completed | archived` (`session-store.ts`); `draft` and `ended` are legacy values migrated to `completed` by `migrateStatus`. There is no `deleted` state and no session row deletion. Status is authoritative locally; the DB column mirrors it. Matters for: attachment (only saved sessions), deletion blocking (via `detached_at`), playback (`active`), editing (`isReadOnly` for completed/archived), history.

## 28. Phase 5 test matrix (proposed, not written)
New session attach persists and resolves `playback_path`; empty slots unaffected; two sources stay independent; B cannot attach A's source; collaborator cannot attach; viewer plays without reading `ingest_sources`; legacy `camN`/`camN-opus` sessions still resolve; ending a session detaches but keeps the source; deletion blocked while truly in use and allowed after detach; same source in two sessions; failed session creation leaves no partial attachments; audio switching with dynamic paths; popouts resolve dynamic paths.

## 29. Phase 5 boundary
REQUIRED: source picker in Create Session (4 slots), transactional session+attachments write, `session_sources.playback_path` (or equivalent viewer-safe exposure), resolver change in `inputsFromRecord` with legacy fallback, `detached_at` on session end, label snapshot, tests.
OPTIONAL: `+ Create New Source` inline, Address Book relabel, source readiness in the picker.
LATER HARDENING: connection monitoring, Test Connection for persistent sources, history UI for deleted sources, reconciliation tooling.
OUT OF SCOPE: migrating legacy sessions, merging Address Book, changing ingest/`camN` behavior, sharing/Ops/Timeline changes.

Files/tables Phase 5 would touch: `src/pages/CreateSession.tsx`, `src/lib/stream-paths.ts`, `src/lib/session-store.ts` (types only), `src/hooks/use-my-sources.ts`, `src/pages/Sources.tsx` (extract dialog), `supabase/functions/save-session/index.ts`, one migration on `public.session_sources`; unchanged: `mako-ingest`, `ingest_sources` RLS, playback components, popouts (behaviour flows through the resolver).

## 30. Risks / open product decisions
1. Source reuse across simultaneous sessions — technically safe; confirm the privacy expectation of two viewer groups seeing one feed.
2. Viewer playback exposure — copy-on-attach (C) vs definer function (B).
3. `detached_at` discipline is what keeps source deletion from being blocked forever; ending a session currently only writes local state, so the detach must happen server-side.
4. Test Connection semantics for persistent sources.
5. Local-first session storage means attachments live only in the database while `payload.lines` stays local — the resolver must tolerate a session whose attachments have not yet loaded.
