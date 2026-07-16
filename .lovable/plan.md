
# Simplify MAKO Signal Drift Session Workflow

This is a large, cross-cutting change. Below is the plan grouped by concern. I'll ship it in one pass but wanted to confirm scope first.

## 1. Remove Draft everywhere
- `src/lib/session-store.ts`: drop `"draft"` from `SessionStatus`, remove `saveDraft` / draft grouping, keep only `active` / `completed` (renamed conceptually to "ended" in UI copy).
- `src/pages/CreateSession.tsx`: remove Save Draft button and draft resume via `?draft=` query. Bottom bar becomes **Start Monitoring** + **Cancel** (with confirm dialog when the form is dirty).
- `src/components/RecentSessionsPanel.tsx`, `src/pages/Sessions.tsx`: remove Draft groups, badges, counts, filter chips.
- `src/components/session/SessionStatusBadge.tsx`: drop `draft` (and `scheduled`, `paused`, `archived` if unused) or keep unused entries dormant — will just remove `draft`.
- `SaveSessionPrompt.tsx` and any "recover draft" UI: delete.

## 2. Create Session UX
- New "Cancel Session Setup?" confirm dialog (Keep Editing / Discard) when dirty.
- Primary CTA: **Start Monitoring** — validates sources, creates active session, routes to Session Room, kicks off Quinn.
- Reuse mode: when navigated with `?reuse=<sessionId>`, prefill from the ended session (name, tz, sources, notes, passphrases). Heading becomes "Reconfigure Session", primary CTA "Start New Monitoring Session". Creates a NEW session; original ended session untouched.
- Active edit mode: when navigated with `?configure=<sessionId>` for an active session owned by user, heading "Configure Session", primary CTA "Save Changes", logs a `source_config_changed` event into that session's Quinn timeline and keeps Quinn running.

## 3. Test Connection
- New component `src/components/session/TestConnectionPanel.tsx` used inside CreateSession.
- For each configured line: shows name, address:port, state (`Not Configured | Connecting | Video Available | No Video Streaming | Connection Failed`), plus codec/res/fps/bitrate when available (mocked for now using existing `use-live-metrics` style).
- Never blocks Start — button label switches to **Start Monitoring Anyway** when any source is failing/no-video.

## 4. Monitoring Pane States
- Extend `src/components/SignalTile.tsx` (and `DraggableSignalTile.tsx`) with an explicit state enum: `not_configured | connecting | live | no_video | connection_failed | reconnecting`.
- Replace silent black panes with labeled overlays + Retry button on failed/reconnecting.
- Wire state from `use-live-metrics` (add `hasVideo` / `lastError` fields with mocked plausible behavior).

## 5. Ending a session
- Guest end: hard-delete the session record from local store; wipe its Quinn history.
- Signed-in end: mark `completed`, keep Quinn incidents (`quinn-store` keyed by sessionId — already is).

## 6. Recent Sessions (signed-in)
- Card fields: name, owner, **Owned**/**Shared** badge, start, end, duration, source count, Quinn incident count, last accessed.
- New `EndedSessionDialog` (replacing `ExpiredSessionDialog`) with actions:
  - Owned: View Report, Download Report, **Reconfigure and Start** (→ `/create?reuse=<id>`), Cancel.
  - Shared: View Report, Download Report (if allowed), Cancel.

## 7. Quinn history rules
- `quinn-store`: partition history by `sessionId`. On guest session switch/end/tab close, purge guest sessionIds. For signed-in users, persist to Supabase-backed store (out of scope for this pass — will keep local per-session and note follow-up if you want cloud persistence).
- On source config change during active signed-in session, insert a `Source N configuration changed` timeline event with previous/new values.

## 8. Cleanup
- Remove `SaveSessionPrompt`, draft branches in `session-store`, `?draft=` handling, draft-oriented copy in sidebar and Sessions page.

## Technical notes
- Files touched (approx): `session-store.ts`, `CreateSession.tsx`, `SessionRoom.tsx`, `Sessions.tsx`, `RecentSessionsPanel.tsx`, `SessionStatusBadge.tsx`, `SignalTile.tsx`, `DraggableSignalTile.tsx`, `use-live-metrics.ts`, `quinn-store.ts`, `SaveSessionPrompt.tsx` (delete), `ExpiredSessionDialog.tsx` → `EndedSessionDialog.tsx`, new `TestConnectionPanel.tsx`, new `CancelSetupDialog.tsx`.
- No DB migration required for this pass — sessions in Supabase still use `active`/`ended` states; `draft` rows (if any) will be treated as ended on read.
- Quinn cloud persistence for signed-in users: **not** included unless you want it now; current `quinn-store` is localStorage keyed by sessionId, which satisfies "history remains available" within the same browser.

## Questions before I build

1. **Quinn persistence for signed-in users** — keep local (browser-only) for this pass, or add a `quinn_events` Supabase table now?
2. **Test Connection realism** — mock results (fast, deterministic-random) or attempt a real probe via an edge function? Real SRT probing isn't feasible from the browser; a mock is what I'd ship.
3. **Existing "draft" sessions in the DB** — treat as ended (hide/show under Recent) or delete them?
