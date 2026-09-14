# Phase 1 — Source Registry Foundation (tables + security only)

Creates the permanent data model for dynamically provisioned MAKO Receive sources. Nothing else changes: Create Session, playback, existing sessions, and the ingest bridge Edge Function are untouched in this phase.

## Why this shape

The audit confirmed there is no persistent source entity today — a "source" is only configuration inside `sessions.payload.lines`, and playback is hardcoded `slot -> cam<slot> -> cam<slot>-opus`. So there is no existing source table to extend, and a persistent leased port/path needs its own row.

```text
AUTH USER
   |
   +--------------+
   |              |
   v              v
INGEST SOURCE    SESSION
   |              |
   |       SESSION_SOURCES
   |              |
   +--------------+
          |
          v
      Slot 1-4
```

A source can be reused across many sessions, so the session link lives in a join table, not as `session_id` on the source.

## Table 1: `public.ingest_sources` (the persistent resource)

- `id` uuid primary key
- `owner_id` uuid, not null — the signed-in user (`auth.users.id`). No organizations in v1; an org column can be added later without redesigning this.
- `name` text, not null — friendly name, e.g. "MSG Truck Feed"
- `connection_mode` text, not null, default `receive` — `receive` today, `connect` later
- `infrastructure_source_id` text, not null, **unique** — e.g. `src_ab652c`. Uniqueness prevents one user claiming another user's infrastructure.
- `srt_port` integer — allocated port, e.g. `10021`
- `playback_path` text — e.g. `src_ab652c-opus`
- `lifecycle_status` text, not null, default `provisioning` — `provisioning | ready | error | deleting | deleted`
- `connection_status` text, not null, default `unknown` — `unknown | offline | connecting | connected`
- `connection_checked_at` timestamptz — when connection state was last observed
- `last_error` text — sanitized, human-readable only
- `created_at`, `updated_at` (with the existing update trigger)

Two separate status fields, as you specified, so the UI can say "Ready / Encoder Offline" instead of overloading "active".

## Table 2: `public.session_sources` (where the resource is being used)

- `id` uuid primary key
- `session_id` text -> `sessions.id`, deleted with the session
- `ingest_source_id` uuid -> `ingest_sources.id`, **restricted** — a source in use cannot be silently removed by a cascade
- `slot` smallint, not null, 1-4
- `label` text — optional per-session name override
- `attached_at`, `detached_at` timestamptz — ending a session detaches the relationship; the source itself is never touched
- `created_at`
- One source per slot per session, and the same source cannot occupy two slots in one session

## Access rules

`ingest_sources`
- A user can see and rename only their own sources.
- Admins retain full access through the existing secure role check.
- Users cannot set or change `infrastructure_source_id`, `srt_port`, or `playback_path` themselves — those are written only by the server-side ingest bridge in a later phase. A database rule blocks client-side changes to them, and the unique constraint is the backstop.
- No anonymous access.

`session_sources`
- Readable by anyone with access to that session (owner or shared viewer), so viewers can watch a feed without seeing SRT credentials.
- Writable only by the session owner, and only for a source that owner actually owns — enforced with a security-definer helper.

## The rule we are locking in

Ending a session detaches its `session_sources` rows. It never deletes an `ingest_source` and never releases a port. Releasing port `10021` happens only when the user explicitly deletes "MSG Truck Feed" from their Sources area. This phase encodes that by keeping the two lifecycles fully separate and blocking cascade deletes from sessions to sources.

## Backward compatibility

Nothing reads these tables yet, so existing sessions keep working exactly as they do. When playback becomes dynamic (a later phase) the resolution rule will be: use `playback_path` when the source has one, otherwise fall back to legacy `cam<slot>-opus`.

## Out of scope for Phase 1

Create Session, `stream-paths.ts`, `SessionRoom`, playback, the `mako-ingest` Edge Function, the dev panel, existing session data, and any UI. No data is migrated or backfilled.

## Verification

- Confirm both tables exist with the intended columns, constraints, and access rules.
- Confirm the app still typechecks and the test suite passes.
- Confirm existing sessions and live playback are unaffected (no code path reads the new tables yet).

## Then, in order

1. Source registry tables + security (this phase)
2. Teach source creation to persist a row
3. Teach source deletion to update/delete it safely
4. Build the My Sources / MAKO Receive screen
5. Attach sources to sessions
6. Dynamic playback path with legacy fallback
7. Retire the legacy cam1-cam4 mapping
