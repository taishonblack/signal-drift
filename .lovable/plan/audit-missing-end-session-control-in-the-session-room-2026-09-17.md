# Audit — Missing End Session control in the Session Room

## Was it removed, or never exposed?

Never exposed. The Phase D explicit end lifecycle exists and is reachable from other places, but the Session Room has no button for it:

- `SessionRoom.tsx` already contains a working `handleEndSession` handler, but it is only reachable two ways: the automatic scheduled-end countdown dialog, and the guest "save your session" prompt. No control in the room's toolbar or header calls it.
- The Sessions list page (`Sessions.tsx`) and the recent-sessions panel do have an End Session button, so the ability exists elsewhere in the app — just not while you are inside the room.
- The idle warning dialog also offers End Session, but only after an inactivity prompt.

So this is a missing surface, not a removed one. Nothing about the backend lifecycle needs to change.

## How ending currently works (unchanged by this plan)

Ending calls the local session record end plus `syncEndedSessionRemote`, which invokes the Phase D `session-lease` "end" action: it completes the session, invalidates every tab's lease, detaches sources and tears down each runtime caller. Browser-close and lease-expiry behaviour is separate and stays untouched.

One gap for the requested UX: `syncEndedSessionRemote` is fire-and-forget and silent, so today there is nothing to wait on and nothing to report if teardown fails.

## Proposed change (smallest viable)

1. **Owner-only control in the existing toolbar.** Add a small End Session action to `SessionToolbar` — inline on desktop next to Share Session, and as an entry in the existing mobile overflow menu. Rendered only when the viewer is the session owner (the room already computes `isOwner`). No layout redesign.

2. **New confirmation dialog** (`EndSessionDialog`) using the existing MAKO glass dialog style: explains that all active source connections will be disconnected and monitoring ends for everyone in the session. Cancel closes and does nothing.

3. **Confirm reuses the existing Phase D end path.** Add an awaited wrapper alongside `syncEndedSessionRemote` that calls the same `session-lease` end action and returns its result; the existing fire-and-forget function delegates to it so there is exactly one teardown mechanism.

4. **Double-submit protection.** The confirm button enters an "Ending…" state, is disabled, and the dialog cannot be dismissed while the request is in flight.

5. **Server confirms first, then the UI follows.** Nothing is marked ended locally and no navigation happens until the server end request returns successfully. Only then: update local state via the existing completed-session behaviour, close the dialog, navigate to Sessions, and show the existing completion confirmation. Guest owners continue to get the existing save prompt instead.

6. **Failure keeps the operator in place.** If the request fails, the operator stays in the Session Room with the dialog still visible, explaining that MAKO could not confirm the end request and the source connection may still be held, with a Retry option. The session is never shown as ended locally on failure.

7. **Phase D fail-safe preserved.** If the server accepts the end lifecycle but upstream teardown is uncertain, the runtime route stays retained for reconciliation. No client-side teardown logic is added.

## Scope guard

Touched: `SessionToolbar.tsx`, `SessionRoom.tsx`, a new `EndSessionDialog.tsx`, and a small awaited addition in `sessions-remote.ts`. Tests cover owner-only visibility, cancel doing nothing, single submission, the error path, and — explicitly — that no local completion or navigation happens before the awaited server end request succeeds. Full test suite and TypeScript checks run; no publish.

Untouched: provisioning, caller infrastructure, reconciliation, lease renewal/expiry, browser-close behaviour, RLS, sharing, Quinn, Timeline, Ops. No `beforeunload` teardown.
