# Audit — Session Room shows ENDED on a live Phase C session

## 1. Actual database state

`Phase C Test` (`sess-6L845VWF7B`), created 2026-09-17 01:04:48 UTC:

- `status = active`
- `endedAt` = empty, `endReason` = empty
- scheduled end = 2026-09-17T02:04:45Z (one hour after creation, not reached)

So persistence is correct. Provisioning saved `active`, nothing overwrote it, and no end-time or draft logic touched it.

## 2. Exact cause

The Session Room header badge in `src/components/session/SessionToolbar.tsx` (line 85) reads:

```tsx
{sessionStatus === "live" ? "LIVE" : "ENDED"}
```

`SessionRoom.tsx` (line 821) passes `session.status`, which is `"active"` — the current status vocabulary is `scheduled | active | paused | completed | archived`. `"live"` is a legacy alias that no longer exists in stored data, so every live session falls through to the `ENDED` branch.

This is a pure display bug: one badge with two hard-coded outcomes and no handling for `paused`, `scheduled`, or `archived` either.

## 3. Everything else in the chain checks out

- `provision-session` sends `status: "active"` into `save_session_with_sources`; the row confirms it.
- Local record created in `CreateSession.tsx` is also `status: "active"`, matching the database.
- `hydrateMemberSessions()` maps the row through `fromRemote()` and only preserves a locally terminal status; it never invents one.
- `migrateStatus()` maps `"ended"`/`"expired"` to `completed` but passes `active` through unchanged.
- Draft filtering only skips rows; it performs no conversion.
- The scheduled-end helpers drive `SessionEndIndicator` only ("time remaining"); they do not change status.
- `orphanSweep`/`leaveSession` can end a session, but both require an owner-absent condition that did not occur here (`endedAt` is empty).

## 4. Smallest safe fix

Replace the two-outcome string in the toolbar with the existing shared status component, so session state is rendered from one place:

- Render `SessionStatusBadge` (already handles `active`, `paused`, `scheduled`, `completed`, `archived`, plus legacy `live`/`ended`) instead of the inline ternary.
- Keep the feed's LIVE/connecting/offline indicator exactly as it is — session state and feed state stay separate.

No provisioning, runtime-route, database, MediaMTX, SRT, or Phase A.2 change. No Session Room redesign.

## 5. Files that would change

- `src/components/session/SessionToolbar.tsx` — swap the hard-coded badge for `SessionStatusBadge`.
- `src/pages/SessionRoom.tsx` — only if the prop type/name needs adjusting to pass the typed status.

## 6. Tests to add

New focused test (e.g. `src/test/session-status-badge.test.tsx`):

- Session Room header shows `Active` for `status: "active"` and never `ENDED`.
- Shows `Paused` for `paused`, `Ended` for `completed`, `Archived` for `archived`.
- Legacy `"live"` still renders as active.
- A live feed with a `completed` session still shows `Ended` (session state is not masked by playback).

Existing Phase C provisioning tests stay unchanged and must keep passing.
