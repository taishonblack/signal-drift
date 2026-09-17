# Phase D Production Cleanup — End Session `sess-6L845VWF7B` Only

Goal: exercise the Phase D explicit End Session lifecycle against one real stranded caller, and confirm the second one keeps the endpoint reserved.

## Scope

Act on exactly one session:

- Session: `sess-6L845VWF7B` ("Phase C Test", currently `active`)
- Runtime route: `ec1ef3b8-e889-45fb-80ad-6347aced9a78`, slot 1
- Caller: `src_3849c9`, endpoint `174.166.29.128:8000`

Untouched: session `sess-M346VEPAMM`, route `6bd0681c-02cb-40a0-b58c-711e0da3e562`, caller `src_dabec0`.

## What will be done

1. Authenticate as the session owner (`7612b81d-…-64c6563bfad3`) using the existing owner session-minting path — no credentials shown, no code changes.
2. Call the deployed `session-lease` function with the explicit `end` action for `sess-6L845VWF7B` only. This is the same path the End Session button uses, so nothing new is written and DigitalOcean is never called directly.
3. The lifecycle then runs on its own: clear lease holders, complete the session, detach its attachments, mark route `tearing_down`, delete the caller upstream, archive the route into history on confirmed deletion.
4. Read-only verification afterwards, with no further writes:
   - session status and endedAt
   - the route's presence in live routes vs. history, plus teardown timestamps
   - upstream state of `src_3849c9` via the authenticated lookup-by-route-UUID path (expected: gone/tombstoned)
   - `src_dabec0` and its route still live and unchanged
   - endpoint availability check for `174.166.29.128:8000` still reports occupied

## Reporting

Final report will state: session status, caller deletion result, route archival result, endpoint occupancy result, and any errors or uncertain-teardown outcomes. If the upstream delete is not confirmed, the route stays live in `tearing_down` and keeps the endpoint reserved — that is expected behavior, not a failure to force past.

## Technical notes

- No migrations, no function redeploys, no schema or RLS changes.
- No manual DigitalOcean API deletion, no direct SQL writes to `session_runtime_routes`, `session_sources`, or `sessions`.
- Reconciliation jobs stay as scheduled; they are not triggered manually.
- Stop after the report; the second caller is handled in a separate step after you verify DigitalOcean.
