# Guest-First Identity Redesign

Shift MAKO from "log in to use" to "monitor first, identify later." Sign-in becomes about **persistence**, not access.

## Philosophy

Every screen reinforces: *Monitoring comes first. Identity comes second.* Guests get the full live experience — create, join, share, transfer, note-take. Sign-in earns history, drafts, address book, teams, templates, saved layouts.

## Identity States

| State | Trigger | Header (upper-right) |
|---|---|---|
| **Anonymous Visitor** | Landed, no session | `Sign In` · `Create Account` |
| **Temporary Operator** | Created/joined a session without auth | `Operator (Temporary)` chip with menu |
| **Authenticated User** | Signed in | Name + Settings / Team / Sign Out |

Temporary identity auto-generated on first session action (e.g. `Operator-4H2K`), persisted to `localStorage` so it survives reloads. The chip menu offers Sign In · Create Account · "What changes when I sign in?". On sign-in the temporary operator's participation in the current session rebinds to the real user.

## Guest capabilities

**Can:** create session · configure SRT sources · monitor · share · invite · join · view diagnostics · chat · notes · transfer ownership
**Cannot:** save history · save drafts across devices · address book · teams · archives · saved layouts · templates

## Navigation

Never blur. Use **educational empty states** in place of gated panels:

- Recent Sessions → "No saved sessions yet. Sign in to keep your monitoring history."
- Address Book → "Available after signing in."
- Teams → "Join or create a team after creating an account."

Sidebar for guests: Sessions · Create · Join · Ops (Account item hidden; identity lives in header chip).
Sidebar for members: same + name/Settings/Sign Out in the identity chip.

## Home / Landing

Rename primary CTA to **Start Monitoring**. No auth wall.

## Sessions / Create / Join

- `/create` and `/join` fully guest-accessible.
- `/sessions` for guests shows the current session + empty-state cards for Recent / Drafts / Archive.
- Join flow: enter Session ID + PIN, land in room as Temporary Operator.

## Session Ownership & Lifecycle for Guests

Guest who creates a session = Session Owner. Existing ownership/request/transfer flow already works.

**Close-tab warning** (`beforeunload`) for owner with viewers:
> "Leaving this page will end your monitoring session. If another viewer accepts ownership, monitoring will continue. Otherwise this session will end."
> `Cancel` · `Leave Session`

**Owner-left dialog** for every remaining viewer:
> "The session owner has disconnected. Would you like to become the new owner?"
> `Become Owner` · `Leave Session`
First accept wins.

**No-owner countdown** (30s): "No owner assigned. This monitoring session will end in 30… 29…" → terminate at zero.

## Save-on-End prompt

When a guest ends their session:
> "Save this monitoring session? Create a free account to keep session history, incident timeline, notes, stream diagnostics, layout."
> `Create Account` · `Continue as Guest` · `Discard Session`

Choosing Create Account stashes the session payload in `localStorage` under a claim key; after sign-up the stored session is claimed onto the new user.

---

## Technical plan

**New: `src/lib/identity.ts`**
- `useIdentity()` → `{ kind: 'anon' | 'guest' | 'member', id, name }`
- Guest id/name generated + stored in `localStorage['mako_guest_identity']` on first session touch
- On auth: migrate ownership refs in `session-store` from guest id → user id
- Replaces `getCurrentUserRef()` in `session-store.ts`

**New: `src/components/IdentityChip.tsx`**
- Renders in `AppLayout` header (desktop) and `MobileNav` top-right
- Three variants matching identity states; popover menu per spec
- Members get link to `/account`

**Edited: `AppLayout.tsx` / `MobileNav.tsx`**
- Mount IdentityChip in header, drop Account item from sidebar/tab bar for guests (still routable directly for members)

**Edited: `RecentSessionsPanel.tsx`**
- Guest: hide session groups, show educational empty state block

**Edited: `Landing.tsx`**
- Primary CTA → "Start Monitoring"

**New: `src/components/session/OwnerLeftDialog.tsx`**
- Subscribes to session store; opens when `ownerUserId` transitions to `null` while viewers > 0
- Countdown driven by a `noOwnerSince` timestamp on the session record

**Edited: `session-store.ts`**
- Add `noOwnerSince: number | null` on `SessionRecord`
- On owner leave: set timestamp; on claim: clear
- New helpers: `claimOwnership(sessionId, actor)`, `orphanSweep()` invoked from the existing poller

**Edited: `SessionRoom.tsx`**
- Mount `OwnerLeftDialog`
- `beforeunload` handler for owner with active viewers
- Custom Leave button opens confirm dialog with the specified copy

**New: `src/components/session/SaveSessionPrompt.tsx`**
- Shown when a guest owner ends a session
- "Create Account" stashes snapshot in `localStorage['mako_pending_save']` and routes to `/account?claim=1`

**Edited: `AccountPage.tsx`**
- On sign-in/up, if `mako_pending_save` exists, claim it and toast "Session saved"
- Rebind guest identity → member for any live sessions

**New: `src/components/GatedEmptyState.tsx`** — reusable for Recent / Address Book / Teams

## Explicitly out of scope
- Server-side persistence of guest sessions (all guest state stays in `localStorage` / in-memory `session-store`)
- Address Book / Teams / Templates gating logic beyond the empty-state copy (features not yet built)
- 40-min soft prompt banner
- Any auth provider changes (email/password only)

## Acceptance
1. Fresh browser → `/` → Start Monitoring → configure → land in `/session/:id` as `Operator (Temporary)`, no auth prompts.
2. Share PIN → second browser joins via `/join` → Temporary Operator, sees stream immediately.
3. Owner closes tab → viewers see Owner-Left dialog → Become Owner → owns session.
4. No one claims → 30s countdown → session terminates.
5. Guest ends session → Save prompt → Create Account → after sign-in, session appears in Recent.
6. Signed-in user sees name in chip; Recent populated.
7. Guest on `/sessions` sees educational empty states, never a blurred panel.
