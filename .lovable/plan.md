
# Create Session → Mission Control

Reframe Create Session from a form into the entry point of a live monitoring workspace. This plan is scoped to what can be built inside MAKO's current frontend (mock-store based), with hooks in place for the collaboration/ownership features that will later be wired to Lovable Cloud.

## 1. Session Information (top of page)

- **Session Name** — optional. If left blank at submit, auto-generate from first source's friendly name (e.g. "NBC Program — Feb 14").
- **Purpose** (new) — chips: Review, QC, Troubleshooting, Replay Review, Engineering, Custom. Stored on the session for later filtering.
- **Default Event Time Zone** — keep as-is; master clock for the session.
- **Session Duration** (new):
  - Preset chips: 30m, 1h, 2h, 4h, 6h, Custom
  - OR "Ends at" date+time picker (toggle between the two modes)
  - Persist `scheduledEndAt` on the session record.

## 2. Sources (renamed from "SRT Inputs")

Each source card asks only what MAKO cannot discover:

- **Friendly Name** (e.g. "NBC Program", "Camera 3") — used everywhere in the UI; internal `Line N` id retained
- **Address** (host/IP) + **Port** (numeric) as separate fields
- **Smart paste**: pasting `srt://host:port`, `host:port`, or just `host` auto-splits into the two fields
- **Advanced** disclosure → **Passphrase** only
- Removed: Mode selector (always `caller` internally), Bitrate input, per-line timezone

**Source state pill** replaces enable toggle:
`No Source` → `Configured` → `Testing…` → `Connected` / `Failed` / `Disabled`

**Test Connection** button → shows mocked discovery panel (Codec, Resolution, FPS, Bitrate, Latency, Packet Loss, Audio, Loudness, Clock Sync). Already partly in place — will be expanded and moved into the new state model.

**Address Book**
- "+" **Save Source** action beside the Address field saves { name, address, port, passphrase?, description } into the existing address book
- Selecting an entry populates the current source panel (name/address/port/passphrase)

## 3. Lifecycle & rules

- **Session status enum** extended: `draft | scheduled | active | paused | completed | archived` (Recent Sessions renders a colored badge per status; today only draft/active/completed will actually be produced by the UI).
- **Save Draft** → status `draft`, appears in Recent Sessions with a pencil/gray badge.
- **One active session per user** — creating or joining a new active session while one exists shows a confirm dialog:
  > "You already have an active monitoring session. Switching sessions will end your current monitoring session." — [Cancel] [Switch Session]
  Enforced client-side against the mock store; the losing session is marked `completed`.
- **Scheduled end reached** (client timer while a session room is open): modal "This session is scheduled to end. Are you still monitoring?" with [Extend 30 min] [Extend 1 hr] [End Session]. If no response in 15 minutes, auto-end.
- **Ownership transfer** (scaffold only): if the current owner leaves a shared session, remaining participant sees "Become session owner?" prompt. Wired to a placeholder handler; real presence comes with the collaboration backend.

## 4. Recent Sessions badges

Update `RecentSessionsPanel` to render status badges: Draft (gray pencil), Scheduled (amber clock), Active (green radio), Paused (slate), Completed (muted check), Archived (dim box). Uses existing glass styling and cyan/warning tokens — no new palette.

## 5. Account-level retention (Future — scaffolded)

Add a read-only "Session Retention" row on `AccountPage` explaining the policy (30 / 90 / 365 / Indefinite). Selector is present but disabled with a "Team Admin only" hint. Real enforcement is deferred.

---

## Technical notes

**Data model** (`src/lib/session-store.ts`)
- Extend `SessionRecord`:
  - `status: "draft" | "scheduled" | "active" | "paused" | "completed" | "archived"` (replacing `"active" | "expired"`; migrate on read)
  - `purpose?: string`
  - `scheduledEndAt?: string`
  - `ownerUserId: string` (alias of existing `hostUserId`)
- Extend `SrtLine`:
  - `friendlyName?: string`
  - `host?: string`, `port?: string` (kept alongside `srtAddress` — composed on save)
- Extend `AddressBookEntry` with `port`, `passphrase?`, `description?`.
- Helpers: `parseSrtInput(str)` returning `{ host, port }`; `composeSrtAddress({host, port})`; `getActiveSessionForUser()`; `endSession(id)`.

**UI**
- `src/pages/CreateSession.tsx` — reorganize into sections: Session Info, Sources, Actions. Introduce `SourceCard` sub-component for cleanliness.
- New: `src/components/session/DurationPicker.tsx` (preset chips + "Ends at" toggle).
- New: `src/components/session/PurposeSelect.tsx` (chip group).
- Extend `AddressBookModal` save form with the additional fields.
- `RecentSessionsPanel` + `Sessions.tsx` — status badge component `SessionStatusBadge`.
- New: `src/components/session/ScheduledEndDialog.tsx` used inside `SessionRoom` when `scheduledEndAt` passes.
- New confirm dialog `SwitchActiveSessionDialog` triggered from Create Session submit and from `Sessions.tsx` join clicks.

**Out of scope for this pass**
- Real presence / multi-user ownership transfer (needs backend)
- Account-level retention enforcement
- Actual paused/archived transitions (only visualized)

Once approved I'll implement in this order: data model + helpers → CreateSession redesign → duration/purpose components → active-session rule → status badges → scheduled-end dialog wired into SessionRoom → account retention stub.
