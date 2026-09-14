# MAKO Sessions & Sources — Architecture Audit (no changes made)

Read-only audit. No code, schema, UI, or Edge Function was modified.

## 1. Existing session tables

`public.sessions` — the only session table.

- Primary key: `id text` (client-generated, `sess-` + 10 random chars, `session-store.ts:1081-1089`).
- Owner: `owner_id uuid -> auth.users.id`. No account/organization/workspace table exists anywhere.
- Columns: `name`, `status`, `pin_hash`, `payload jsonb`, `created_at`, `updated_at`.
- Only `id, name, status, pin` are treated as top-level; everything else is packed into `payload` (`sessions-remote.ts:16-30`). Verified live rows: `payload` holds `lines[]`, `viewers`, `changeLog`, `purpose`, `createdAt`, `endedAt`, `scheduledEndAt`, `endReason`, `idleStartedAt`, `idleDeadline`, `ownerUserId`, `hostUserId`, `guestOwned`.
- Status values: `scheduled | active | paused | completed | archived`. Expiry/end fields (`scheduledEndAt`, `endedAt`, `idleDeadline`) live only inside `payload`, so the database cannot query or enforce them.
- Related tables: `shared_session_access` (per-session grants, role `owner|viewer`, `revoked_at`), `session_timeline_entries`, `session_focus`, `address_book`, `ui_preferences`, `profiles`, `user_roles`.
- RLS: owner-only read/write on `sessions` via `owner_id = auth.uid()`, plus a shared-viewer read via `has_session_access(id, auth.uid())`. Participant access elsewhere is checked with `is_session_owner()` / `has_session_access()`.

Ownership today: `sessions.owner_id` server-side (also enforced in the `save-session` function), mirrored client-side by `payload.ownerUserId` / `hostUserId`.

## 2. Existing source structures

There is **no source table**. Two client-side shapes only:

- `SrtLine` (`session-store.ts:20-30`) — config-time "line": `id` (1–4 slot number), `enabled`, `label`, `srtAddress`, `passphrase`, `bitrate`, `mode`, `notes`, `originTimeZone`. Persisted only as `sessions.payload.lines`.
- `StreamInput` (`mock-data.ts`) — runtime pane object built on the fly by `inputsFromRecord()` (`stream-paths.ts:371-393`): `id: "line-<slot>"`, label, `srtAddress`, `streamName: cam<slot>`, `status: "connecting"`, empty metrics.

No infrastructure source ID, no allocated port, no playback path, no lifecycle status, no ownership, and no RLS — because none of it is persisted as rows.

Named "source"-like things that are **not** ingest sources:

- `address_book` — personal SRT connection presets (tag/address/port), reusable across sessions, owned by `user_id`.
- `slot-map` (`mako-slotmap-<id>` in localStorage) — pane layout only.
- The `mako-ingest` dev panel's "sources" — the external infrastructure sources, currently not persisted anywhere in MAKO.

## 3. Current Create Session data flow

`/create` → `src/pages/CreateSession.tsx` (+ `AddressBookModal`, `MakoIngestTestPanel`, `probeStream`).

1. Operator fills up to 4 `SrtLine`s inline; sources do **not** exist before the session.
2. "Test Connection" probes MediaMTX WHEP for `cam<slot>` — pure diagnostics, persists nothing.
3. Submit builds one `SessionRecord` (`generateSessionId()`, 4-digit `pin`, `status: "active"`), calls `addSession()` (localStorage `mako_sessions_v3`) then best-effort `saveSessionRemote()` → `save-session` function → `sessions` row (PIN hashed via `hash_session_pin`).
4. Navigates to `/session/:id`.

Source config is stored only as `payload.lines`. Sources are not reusable between sessions; only address-book presets are (copy-in, not reference).

## 4. Current live-session source data flow

- Which sources belong to the session: **B/D** — `record.lines` from local store, hydrated from `sessions.payload`.
- Names/labels: **B** — `SrtLine.label`.
- Slots: **C/B** — `SrtLine.id` 1–4; pane placement from localStorage slot map.
- WHEP/WebRTC path: **C** — hardcoded `slot → cam<slot>`, playback `cam<slot>-opus`; base from env → dev proxy → built-in `https://stream.makosrt.com`.
- SRT connection info: **B** — user-typed, shown for guidance, never used to build playback URLs.
- Source status: **E** — derived live from WHEP negotiation responses, never from the database.

The hardcoded `camN` mapping is the central conflict with the new infrastructure model, which issues `src_ab652c` / `src_ab652c-opus` and a dynamic port.

## 5. Account / user ownership model

- User-level ownership only (`auth.users` + `profiles`).
- No accounts, organizations, workspaces, or account members.
- Roles: secure `user_roles` + `app_role` enum (`admin|moderator|user`) with `has_role()`; only the `mako-ingest` function actually uses it. `profiles.role` is a display label (`root@makosrt.com` = `account_owner`) with no enforcement. Client `isAdmin()` in `session-store.ts` is a stub returning `false`.
- Per-session sharing is `shared_session_access` (`owner`/`viewer`, revocable).

Logical owner of a persistent ingest source today: **the authenticated user (`auth.users.id`)**, with a nullable account/org column deliberately deferred. Sessions are per-user, so a per-user source registry matches the existing model exactly.

## 6. Current session cleanup behavior

- Created: local record + remote upsert.
- Expired / idle: client-side only — `scheduledEndAt`, `idleDeadline`, orphan sweep; no cron, trigger, or scheduled function.
- Manually ended: `endSession()` sets `status: "completed"` locally; remote status follows on the next save.
- Deleted: no session delete path exists in the app; sessions are only completed/archived.
- **No external resource cleanup exists.** Nothing in create/end/expire calls `mako-ingest`, so infrastructure sources and their SRT ports are never released by the app.

## 7. Recommended ownership model

Owner = `auth.users.id` via `owner_id uuid not null`. Add nothing account-shaped yet; add `is_admin` access through the existing `has_role(auth.uid(), 'admin')`. Infrastructure mutations stay behind the Edge Function so `MAKO_API_TOKEN` never reaches a browser.

## 8. Recommended source/session relationship

**Option B — a dedicated `ingest_sources` table, plus a separate `session_sources` join table.**

Why B over extending an existing source table: no source table exists. `sessions.payload.lines` is per-session denormalized JSON with slot ids 1–4 and no stable identity — it cannot represent a resource that outlives a session, cannot be uniquely constrained on `infrastructure_source_id`, and cannot carry RLS.

Why a join table over `ingest_sources.session_id`: an ingest source is a long-lived leased port/path. A truck feed will be monitored in many sessions over its life, and MAKO already ends sessions rather than deleting them, so a single `session_id` column would either be overwritten on reuse or force duplicate infrastructure. `session_sources` also carries per-session facts (slot, per-session label) that do not belong on the source.

## 9. Exact minimal schema changes recommended (not applied)

`public.ingest_sources`
- `id uuid pk default gen_random_uuid()`
- `owner_id uuid not null` (auth user)
- `name text not null`
- `connection_mode text not null default 'receive'` (`receive` | `connect`)
- `infrastructure_source_id text not null unique` (e.g. `src_ab652c`)
- `srt_port integer` , `playback_path text` (e.g. `src_ab652c-opus`)
- `status text not null default 'provisioning'` (`provisioning|active|error|deleting|deleted`)
- `last_seen_state text`, `created_at`, `updated_at` (+ `set_updated_at` trigger)

`public.session_sources`
- `id uuid pk`, `session_id text -> sessions.id on delete cascade`, `ingest_source_id uuid -> ingest_sources.id on delete restrict`
- `slot smallint not null` (1–4), `label text`, `created_at`
- `unique (session_id, slot)`, `unique (session_id, ingest_source_id)`

Plus GRANTs to `authenticated` and `service_role` in the same migration, per project rules. No change to existing tables or to `sessions.payload` in this step.

## 10. Recommended RLS model

- `ingest_sources`: owner full access (`owner_id = auth.uid()`); admin full access via `has_role(auth.uid(),'admin')`; no `anon` grant.
- Insert/update must be server-side only for `infrastructure_source_id`, `srt_port`, `playback_path` — write them from the Edge Function with the service role so a user cannot claim another user's `src_*`. The `unique` constraint is the second line of defence.
- `session_sources`: readable by session participants (`is_session_owner` OR `has_session_access`); writable by the session owner, and only when the owner also owns (or is granted) the referenced ingest source — enforced with a security-definer helper such as `can_use_ingest_source(source_id, user_id)`.
- Session viewers get read-only visibility of the source's playback path, never its SRT credentials.
- Keep every `create/delete_source` call inside `mako-ingest`; browsers keep receiving only sanitized `{name, source_id, port, output_path, state}`.

## 11. Files that would eventually need modification

- `supabase/functions/mako-ingest/index.ts` — persist on create, mark deleted on delete, own the privileged columns.
- New migration for the two tables + policies.
- `src/lib/stream-paths.ts` — allow a per-source playback path instead of the hardcoded `cam<slot>` mapping.
- `src/pages/CreateSession.tsx` — select persisted ingest sources instead of typing SRT lines.
- `src/lib/session-store.ts` / `src/lib/sessions-remote.ts` — carry source references alongside `lines`.
- `src/pages/SessionRoom.tsx`, `src/components/LiveCamera.tsx`, `SignalTile.tsx`, popout pages — consume the resolved path.
- `src/components/dev/MakoIngestTestPanel.tsx` — eventually replaced by a real Sources page.

## 12. Architectural risks and conflicts

1. **Hardcoded `cam1..cam4`** is incompatible with `src_*` paths; both must be supported during transition or existing sessions break.
2. **localStorage is the source of truth**; Supabase is best-effort sync. A persistent, billable infrastructure resource must not depend on that path — writes must be server-authoritative.
3. **Guest-owned sessions** have no `auth.uid()`, so guests cannot own ingest sources; the product must decide whether guests may use one.
4. **No cleanup anywhere** — ports leak today. Session end must not auto-delete a shared source; deletion belongs to the source's own lifecycle.
5. **Only 4 slots** are assumed throughout the UI, while infrastructure allocates unbounded sources.
6. **Role model is half-wired**: real checks only exist in the Edge Function; the client `isAdmin()` stub means UI gating cannot be trusted.
7. `sessions.payload` being opaque JSON means no database-level integrity between a session and its sources until `session_sources` exists.
