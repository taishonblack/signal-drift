# Phase A — Backend Caller Support (approved scope only)

Only the `mako-ingest` Edge Function and its tests change. No database, no session lifecycle, no UI. Phases B–E stay unbuilt; the audit findings behind them are archived below for later.

## What gets built

Three new authenticated actions on `supabase/functions/mako-ingest/index.ts`, alongside the existing `list_sources` / `create_source` / `delete_source`, which are untouched.

- `create_pull_source` — accepts exactly `{ name, host, port }` and calls `POST {MAKO_API_BASE_URL}/pull-sources` with that body.
- `get_pull_source` — accepts `{ source_id }` and calls `GET /pull-sources/{source_id}`.
- `delete_pull_source` — accepts `{ source_id }` and calls `DELETE /pull-sources/{source_id}`.

There is no `list_pull_sources` action: global caller listing is not exposed in this phase.

## Validation

Request side (defense in depth only — the infrastructure API remains the authoritative security boundary for public-address validation, and no DNS resolution happens in the Edge Function):

- `name`: trimmed, 1–64 chars, `[A-Za-z0-9 _-]` — a human label, never used in a URL or transport decision.
- `host`: non-empty, max 253 chars, syntactically a hostname or IPv4/IPv6 literal, no scheme, no path, no credentials, no whitespace. Obvious private/loopback/link-local literals are rejected early with a clear reason.
- `port`: integer 1–65535.
- `source_id`: must match `^src_[a-f0-9]{6}$` **before** it is interpolated into any upstream URL, for both get and delete.

Response side, before any success is returned (reusing the shape of the existing `validateProvisionedSource`):

- required fields present;
- `source_id` matches `^src_[a-f0-9]{6}$`;
- `output_path` equals exactly `<source_id>-opus`;
- returned `host` syntactically valid;
- returned `port` an integer 1–65535.

A response failing any check is treated as an upstream failure and returns a sanitized error — never a partial success.

## Security

- `MAKO_API_TOKEN` and `MAKO_API_BASE_URL` are read only inside the function; neither is logged or returned.
- Every action requires a verified Supabase user, exactly as today (`auth.getUser()` on the caller's JWT).
- Upstream URLs are built from the server-side base plus a regex-validated `source_id`; no browser-supplied path or URL is ever forwarded.
- Upstream errors are logged as status codes only and returned as sanitized codes (`upstream_error`, `upstream_unreachable`, `invalid_upstream_response`).
- No RLS, role, or authorization change.

## Explicitly out of scope in this phase

No `ingest_sources` rows are created; `session_sources`, `save-session`, `save_session_with_sources`, Create Session, My Sources, Session Room, `stream-paths.ts`, and session lifecycle are all left alone.

## Technical notes

The three caller actions land in a new `supabase/functions/mako-ingest/pull-sources.ts` with the same injected-dependency style as `create-source.ts` / `delete-source.ts`, so every path is unit-testable without Deno, network access, or real infrastructure. `index.ts` gains the schema branches and the injected fetch/log dependencies; `BodySchema` widens to accept `host` and `port`.

## Tests

New fake-dependency tests covering: valid caller creation; malformed upstream `source_id`; mismatched `output_path`; invalid port (request and response); invalid host (request and response); unauthenticated request; valid get; invalid get `source_id`; valid delete; invalid delete `source_id`; sanitized upstream failure. Then the full existing Vitest suite and typecheck.

## Report and stop

I report exactly which files changed and the test results, then stop for your approval before Phase B.

---

## Archived audit (Phases B–E, not approved)

Findings retained for the next decision, including your two corrections:

- **Phase B (schema)** — reuse `ingest_sources` to preserve the Phase 5 RPC, RLS, triggers, `session_sources`, and playback snapshots. `remote_host` / `remote_port` must be treated as sensitive runtime configuration, owner/backend-only, not ordinary library data. `session_id` should be a real foreign-key relationship to `public.sessions` where practical, not an informational text column. Session-scoped rows must be excluded from the quota count and from My Sources.
- **Phase C** — Create Session becomes Name → Address/IP → Port → Start Monitoring, with provision → save → navigate and full compensation; My Sources demoted to optional.
- **Phase D (lifecycle)** — external infrastructure deletion must **not** sit inside a database transaction or database function; Supabase cannot make an external call atomic. Instead an explicit application-level orchestration: update/end session → tear down caller routes → record the teardown result → retain enough state to retry and reconcile when the infrastructure delete fails, so a transient API failure never leaves the database ambiguous.
- **Phase E** — Test Connection targets the real caller route via `GET /pull-sources/{source_id}`; `camN` guidance is removed from new-session UI while legacy playback fallback stays for already-saved sessions.
