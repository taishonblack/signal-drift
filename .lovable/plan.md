
# Session Configuration Workflow + Change Log

Reframe sessions as live productions with **one** configuration surface (no separate "edit" page), enforce owner/admin-only configuration, broadcast configuration changes to viewers in real time, and record every change to an auditable Session Change Log.

## 1. Lifecycle & terminology

States remain: `draft → scheduled → active → completed` (`paused`, `archived` still supported internally). All operator-facing language moves from "Edit" to **"Configure"**.

- "Create Session" screen is reused for both new and existing sessions.
- Header title:
  - No `id` in route → **"New Session"**, primary button **"Start Monitoring"**.
  - `id` in route, session is `draft`/`scheduled` → **"Configure Session"**, primary button **"Start Monitoring"**.
  - `id` in route, session is `active` → **"Configure Session"** with a live badge, primary button **"Save Changes"**.
  - `id` in route, session is `completed`/`archived` → **"Session Configuration"** (read-only), no primary button.

## 2. Card action dialog

Clicking any session card opens a new `SessionActionsDialog` (replaces today's direct navigation / JoinActiveSessionDialog for owned sessions):

```text
Super Bowl LIX
Owner   Quinn Roberts
Started 1:12 PM
Watching 4 Operators

[ Join Live Session ]   ← primary, active sessions only
[ Configure Session ]   ← owner/admin only, else shown as locked row
[ Cancel ]
```

- Team active + user not joined → also surfaces the existing `SwitchMonitoringSessionDialog` check.
- Completed/archived → `Join Live Session` becomes `Open Report` (existing `ExpiredSessionDialog`).
- Drafts → single `Configure Session` button.
- If viewer lacks permission: `Configure Session` row is replaced by
  ```
  🔒 Only the session owner or team administrators can modify this session.
  ```

## 3. Routing

- Keep `/create` (New Session flow).
- Add `/session/:id/configure` → renders the same `CreateSession.tsx` component in **configure mode**, prefilled from `getSessionById(id)`.
- `SessionRoom` header gains a **Configure** button (owner/admin only) that navigates to `/session/:id/configure`.

## 4. CreateSession refactor (`src/pages/CreateSession.tsx`)

Introduce a `mode: "create" | "configure"` derived from `useParams()`.

- Prefill all fields from the existing `SessionRecord` when configuring.
- Rename primary button + toast copy per mode.
- On save in configure mode:
  - Diff previous vs. new record (name, purpose, duration, timezone, source list — add/remove/rename/address/port change, notes).
  - `updateSession(id, patch)`.
  - Emit one change-log entry per meaningful diff (see §6).
  - If session is `active`, stay on configure page and show "Changes saved" toast; else route back to `/sessions`.
- Show a small banner in configure mode when session is `active`:
  > "This session is live — changes broadcast to 4 operators."

## 5. Permission helper

Add `canConfigureSession(session, userId)` in `session-store.ts`:
- `true` if `ownerUserId === userId`, or user has `admin` role (stub: read from `mem`/mock auth — for now expose `isAdmin()` returning `false`; owner path is the working case).
- Used by the dialog, the SessionRoom Configure button, and a guard inside `CreateSession` (redirects viewers to `/session/:id` with a toast).

## 6. Session Change Log

Extend `SessionRecord` with:

```ts
changeLog: SessionChangeEntry[]

interface SessionChangeEntry {
  id: string;
  at: string;              // ISO
  userId: string;
  userName: string;
  kind:
    | "session_renamed"
    | "purpose_changed"
    | "duration_changed"
    | "timezone_changed"
    | "source_added"
    | "source_removed"
    | "source_renamed"
    | "source_address_changed"
    | "source_notes_changed"
    | "config_saved";
  summary: string;         // human-readable one-liner
  before?: string;
  after?: string;
  target?: string;         // e.g. "Source 2"
}
```

Helpers in `session-store.ts`:
- `appendChangeLog(sessionId, entry)`
- `diffSessionConfig(prev, next, actor)` → returns `SessionChangeEntry[]`

Seed a couple of entries on existing seeded active sessions so the UI has content.

## 7. Live sync of configuration changes

Reuse the existing 2.5s localStorage polling already added for viewers.

- `SessionRoom` tracks `lastSeenChangeLogId`. When new entries appear authored by someone **other** than current user, show a `sonner` toast:
  ```
  Quinn updated Source 2 → "Truck B Program"
  ```
  Batched: if >1 new entry in a poll, single toast "Quinn made 3 configuration changes".
- Same polling updates the live source list / names shown in the room, since `SessionRoom` already reads from the store.

## 8. Change Log UI

New `src/components/session/SessionChangeLogPanel.tsx`:

- Reverse-chronological list, grouped by short relative time header.
- Row: timestamp · actor · summary (with before → after chips when applicable).
- Accessible from two places:
  1. **SessionRoom** — new "Activity" tab / drawer trigger in the toolbar next to Viewers.
  2. **Configure page** — collapsible "Recent changes" section under the source list.
- Completed session report (`ExpiredSessionDialog` / report PDF) includes the change log.

## 9. Files touched

Edit:
- `src/lib/session-store.ts` — `changeLog`, diff/append helpers, `canConfigureSession`, seed entries.
- `src/App.tsx` — add `/session/:id/configure` route.
- `src/pages/CreateSession.tsx` — configure mode, prefill, diff-on-save, permission guard.
- `src/pages/Sessions.tsx` — route card clicks through `SessionActionsDialog`.
- `src/pages/SessionRoom.tsx` — Configure button, change-log toasts, Activity drawer trigger.
- `src/components/session/JoinActiveSessionDialog.tsx` — repurposed/wrapped by `SessionActionsDialog` (kept for join confirmation content).
- `src/lib/session-report-pdf.ts` — include change log in report.

New:
- `src/components/session/SessionActionsDialog.tsx`
- `src/components/session/SessionChangeLogPanel.tsx`

## Out of scope

- Real backend realtime (still localStorage polling).
- Full admin role management — `isAdmin()` returns `false`; owner is the working permission path. Hook is in place for later.
- Removing `/create` entirely — keep it; both routes render the same component so consolidation later is a one-line change.
