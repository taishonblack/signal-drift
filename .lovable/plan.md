# Phase 4 — My Sources + User-Owned MAKO Receive

## Audit conclusions this plan is built on

- `user_roles` + `has_role()` is the only authoritative role store; `profiles.role` is a display label only (no policy or function reads it). No new role or capability is needed — "Operator" = any authenticated user, scoped by `owner_id = auth.uid()` in RLS.
- `ingest_sources` RLS already scopes owners correctly and a trigger blocks non-service writes to port/playback/lifecycle fields, so no schema or migration work is required.
- The one real leak today: the `list_sources` action returns the global upstream source list to any signed-in caller, and `MakoIngestTestPanel` renders on `/create` for everyone, including signed-out visitors.

## What gets built

### Security fixes first
- `list_sources` becomes admin-only (`has_role(admin)`), staying an internal troubleshooting operation. It is never used by the Sources product.
- `MakoIngestTestPanel` stops rendering on `/create`. The component file stays in the repo, unrendered, for development. No Ops changes in this phase.

### Server actions (`supabase/functions/mako-ingest/`)
- `create_source`: admin gate removed, authentication still required. `owner_id` always from the verified token, never the request. All Phase 2 protections (name validation, upstream response validation, service-role persistence, compensating delete, sanitized errors) unchanged. The limit lives in one exported constant (`MAX_ACTIVE_SOURCES = 4`).

### Quota with concurrency protection
A plain count-then-provision check races across tabs, so the slot is reserved atomically before any external call:

- One small database function (security definer, service-role only) takes a per-owner transaction advisory lock keyed on the owner ID, counts that owner's non-deleted rows, and — only if under the limit — inserts a placeholder `provisioning` row and returns its ID. Two simultaneous requests from an owner with three sources therefore serialize, and the second is refused with `source_limit_reached` before any infrastructure is touched.
- Provisioning then fills that reserved row in place. Any failure — upstream error, invalid response, persistence failure — deletes the reservation row so the slot is released, and the existing compensating upstream delete still runs unchanged.
- Deleted rows never hold a reservation and never count toward the limit.
- No organizations, billing, or generalized quota system.
- `delete_source`: admin gate removed; the loaded registry row's `owner_id` must equal the caller. Admin no longer bypasses ownership on this product action. All Phase 3 behaviour (in-use protection, `deleting` mark, authoritative stored ID, `deleted`/`offline` finalization, idempotency, error state, preserved history) unchanged.
- New `rename_source`: authenticated, owner-only, `name` only, same validation as creation, refused on deleted rows. Implemented as a direct client update through existing RLS if that is sufficient — the trigger already blocks infrastructure columns — otherwise as a thin function action. The report will state which was used and why.

### My Sources data path
Read `public.ingest_sources` directly from the client with RLS as the boundary, filtered to non-deleted rows. No new list action, since RLS already restricts rows to the owner and no secret is involved.

### New `/sources` page
- Route `/sources` inside the existing app shell; sidebar order Sessions, Create, Sources, Join, Ops, Account.
- Header "Sources" with "Reusable contribution feeds for your MAKO sessions.", an `X of 4 sources` counter, and a `+ New Source` action disabled at the limit.
- Signed-out visitors see the project's existing sign-in prompt pattern, never source data.
- Each card: friendly name, MAKO Receive, lifecycle state and connection state shown separately (Ready / Connected, Ready / Encoder Offline, Provisioning, Error, Deleting, and "Connection not checked" when unknown), destination `stream.makosrt.com`, allocated port, SRT Caller, Stream ID Not Required. No owner IDs, no `src_` prominence, no API terminology.
- New Source flow: name + fixed MAKO Receive connection, then a success step showing Encoder Setup with copyable destination and port.
- Detail view: rename, status, encoder setup, created date, and Delete Source behind a confirmation that states the MAKO Receive destination will be removed.

### Untouched
Create Session's four-source workflow, `stream-paths.ts`, `cam1..cam4`, Address Book, session ownership/sharing, and session storage. The only `/create` change is dropping the developer panel. The `mako_sessions_v3` localStorage cross-account risk is recorded as a Phase 5+ hardening item and is not copied into Sources.

## Tests
Fake-based unit tests extending the existing `src/test/mako-ingest-*.test.ts` pattern: creation without admin, owner from identity, quota checked before provisioning, fifth source refused, deleted rows not counted, compensation intact; rename by owner, refusal for non-owner, infrastructure fields unchanged; delete by owner, refusal for non-owner, in-use/idempotency/error paths intact; admin requirement on global `list_sources`. Plus UI tests that `/sources` shows nothing signed out and that the developer panel is gone from `/create`.

## Live verification
Two normal (non-admin) accounts: A creates and renames a source and sees its port; B cannot see, rename, or delete A's source and can create its own; global `list_sources` is refused for both and still works for admin. Existing sessions and playback checked unaffected. Typecheck and full suite run. Quota exhaustion stays in tests only — no port burning.

## Files this touches
`supabase/functions/mako-ingest/index.ts`, `create-source.ts`, `delete-source.ts`, new `rename-source.ts`; `src/App.tsx`, `src/components/AppSidebar.tsx`, `src/pages/CreateSession.tsx` (panel removal only), new `src/pages/Sources.tsx` plus small source components and a sources hook; new and extended test files. No migrations.
