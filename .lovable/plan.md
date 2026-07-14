# Sessions Page & Recent Sessions Redesign

Turn `/sessions` from a flat list into a live operations board that separates active work from history, encourages team joins, and enforces "one active session at a time" per user.

## 1. Data model extensions (`src/lib/session-store.ts`)

Extend `SessionRecord`:
- `team?: string` — team label ("Broadcast Ops" default on seeds)
- `viewers: SessionViewer[]` — live participants (owner is always the first entry while present)

New `SessionViewer` type:
```
{ userId: string; name: string; isOwner: boolean; joinedAt: string; focus?: string }
```

Helpers:
- `getCurrentUser()` — returns mock user (id `u1`, name "You") from existing auth stub.
- `getActiveSessionForUser(userId)` — already exists; extend to also match sessions where the user is in `viewers`.
- `joinSession(sessionId, user)` / `leaveSession(sessionId, userId)` — mutate `viewers`, persist.
- `transferOwnership(sessionId, newOwnerId)` — flips `ownerUserId`/`hostUserId` and viewer `isOwner` flags.
- `groupSessions(sessions)` → `{ yourActive, teamActive, drafts, completed, archived }`.

Seed sessions: add 2–3 "team" active sessions owned by other mock users ("Quinn Roberts", "Stephanie Black") with 2–4 viewers each, so the operations board has content.

## 2. Sessions page (`src/pages/Sessions.tsx`)

Replace the flat grid with grouped sections rendered in this order (hide empty groups except "Your Active Session" which shows a subtle empty state):

```text
┌─────────────────────────────────────────────┐
│ Your Active Session         [End Session]   │
│ ── large hero card ──                       │
├─────────────────────────────────────────────┤
│ Team Active Sessions           N sessions   │
│ ── card grid, 1–2 cols ──                   │
├─────────────────────────────────────────────┤
│ Drafts                                      │
│ Completed (recent)                          │
│ Archived (collapsed by default)             │
└─────────────────────────────────────────────┘
```

New `SessionCard` component displays:
- Name, `SessionStatusBadge`
- Owner name (avatar circle with initials)
- Team
- Created/started time (relative), duration for active
- Source count
- Viewer count (only when active) — clickable, opens `ViewersPanel`

Behavior:
- Click a **team active** card → `JoinActiveSessionDialog`
- Click **your active** card → navigate straight into `/session/:id`
- Click a **completed** card → existing `ExpiredSessionDialog`
- Click a **draft** card → resume in `/create?draft=…` (stub link; existing draft flow)

## 3. New components (all under `src/components/session/`)

- `SessionCard.tsx` — reusable card used across groups (variant: `hero | grid | compact`).
- `JoinActiveSessionDialog.tsx` — matches spec: session, owner, viewer count, started, duration; `Cancel` / `Join Session`.
- `SwitchMonitoringSessionDialog.tsx` — shown when user tries to join while already monitoring another session; `Stay Here` / `Join New Session`. Reuses `SwitchActiveSessionDialog` visuals but with dual-session content.
- `ViewersPanel.tsx` — popover/sheet listing viewers with owner tag; live-updates via store subscription.
- `OwnershipTransferDialog.tsx` — appears in `SessionRoom` when owner leaves; `Become Owner` / `Leave Session`. First accept wins (client-side race via localStorage timestamp).

## 4. Sessions page join flow

```text
click team card
   ├─ user has NO active session      → JoinActiveSessionDialog → confirm → joinSession + navigate
   └─ user IS in another active session → SwitchMonitoringSessionDialog
                                          └─ confirm → leaveSession(current) + joinSession(new) + navigate
```

## 5. Session room updates (`src/pages/SessionRoom.tsx`)

- On mount: `joinSession(id, currentUser)`; on unmount: `leaveSession`.
- Poll viewers from store every 2s (localStorage-backed pseudo-realtime, matches existing patterns).
- Header: show viewer count chip that opens `ViewersPanel`.
- If `ownerUserId` changes to `null` (owner left) and current user is a remaining viewer → show `OwnershipTransferDialog`.

## 6. Recent Sessions sidebar (`src/components/RecentSessionsPanel.tsx`)

Group items by status with small headers (Active, Draft, Completed, Archived) instead of a single mixed list. Keep the collapse behavior.

## 7. Presence indicator (lightweight, in-scope teaser of the "future enhancement")

Each active-session card and viewer row shows a small line like "focused on Program" when `viewer.focus` is set. Wire to the existing `use-session-focus` hook so owner's focus writes into the viewer entry. No cursors, no per-action broadcast.

## Out of scope
- Real multi-user realtime (still localStorage-based mock; groundwork only).
- Team management CRUD — "team" is a display string.
- Draft resume flow beyond linking to `/create`.

## Files touched
- Edit: `src/lib/session-store.ts`, `src/pages/Sessions.tsx`, `src/pages/SessionRoom.tsx`, `src/components/RecentSessionsPanel.tsx`, `src/hooks/use-session-focus.ts` (write focus into viewer entry).
- New: `src/components/session/SessionCard.tsx`, `JoinActiveSessionDialog.tsx`, `SwitchMonitoringSessionDialog.tsx`, `ViewersPanel.tsx`, `OwnershipTransferDialog.tsx`.
