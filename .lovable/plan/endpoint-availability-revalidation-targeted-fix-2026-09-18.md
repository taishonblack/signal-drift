# Endpoint Availability Revalidation — Targeted Fix

Fix the stale "In use" warning on Create Session: keep the existing debounced check, and revalidate it on a 5s interval plus window focus/visibility, with race protection and honest error behavior.

## What changes

One file of logic: `src/pages/CreateSession.tsx`, replacing the current one-shot effect (lines 184-198) with a small dedicated hook, plus one new test file. Optionally a new `src/hooks/use-endpoint-availability.ts` to keep the page lean — decided at implementation; either way the behavior below is identical.

## Behavior

1. **Existing check preserved** — 500 ms debounce after host/port changes, calling the existing `checkEndpointAvailability(host, port)` in `src/lib/session-lease.ts` (unchanged). Server stays authoritative via the existing `check_endpoint_availability` RPC.

2. **Periodic revalidation** — while the entered host/port is valid (non-empty host, port 1–65535), re-run the same check every **5 seconds** (`ENDPOINT_REVALIDATE_MS = 5000` constant). When invalid, no polling and `endpointBusy = false`.

3. **Focus/visibility revalidation** — the same check fires when:
   - `document.visibilitychange` fires and `document.visibilityState === "visible"`
   - `window` `focus` event fires
   Both listeners removed on unmount or host/port change.

4. **Automatic state transitions** — a single `endpointBusy` boolean driven by the latest completed check:
   - in use → available: warning clears by itself, no retype/refresh needed
   - available → in use: warning appears

5. **Race protection** — a monotonically increasing request id held in a ref. Every check (debounced, interval, focus) captures the current id; on completion the result is applied only if the captured id is still the latest AND the captured host/port still match current values. A response from an older host/port can never overwrite a newer one. The interval/focus callbacks read host/port from a ref so the effect only re-runs on host/port change.

6. **Error behavior preserved** — `checkEndpointAvailability` already returns `reason: "unknown"` on RPC/network failure and the UI only warns on `reason === "in_use"`. A failed check therefore never becomes "In use"; on error the previous state is left untouched (no flicker to clear-then-warn on transient failures). No new error UI introduced.

7. **Cleanup** — effect cleanup clears the debounce timeout, the interval, and both window/document listeners.

## Explicitly NOT changed

- `check_endpoint_availability` SQL semantics, `reserve_session_runtime_route`, exclusivity rules
- `session_runtime_routes` / history schema, Phase D leases, teardown/reconcile, reconciliation window
- caller infrastructure, provisioning, E.5B, Timeline, Quinn, auth, RLS
- No publishing, no deployment, no Edge Function changes.

## Tests

New `src/test/endpoint-availability-revalidation.test.tsx` using `vi.useFakeTimers()` and a mocked `checkEndpointAvailability`:

1. Initial available endpoint → no warning rendered.
2. Initial occupied endpoint → warning rendered.
3. Occupied → later checks report available → warning clears without user input (advance 5s timer).
4. Available → later checks report occupied → warning appears.
5. `visibilitychange` to visible / window focus triggers revalidation and updates stale state.
6. In-flight response for host A cannot overwrite state after user changes to host B (resolve A's promise late; assert B's state wins).
7. RPC error / `reason: "unknown"` never produces the "In use" warning and leaves prior state untouched.
8. Unmount clears interval and listeners (no further RPC calls after unmount; no act warnings).

Then full suite + TypeScript.

## Technical notes

- The check helper lives in `src/lib/session-lease.ts` and is reused as-is — no second endpoint-checking implementation.
- Warning render at `CreateSession.tsx:~795` gated on `endpointBusy` stays as-is; only the freshness of that boolean changes.
- Poll cadence is configuration UX, not telemetry: 5s, no jitter needed at this scale.

## Report on completion

Files modified, revalidation interval, focus/visibility behavior, race-protection method, error behavior, test count/results, TypeScript result, confirmation nothing was published/deployed and no backend/infrastructure changes.
