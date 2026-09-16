# Phase A.2 — Idempotent Caller Routes (Edge Function only)

Isolated upgrade to the existing caller ("pull") support in `mako-ingest`. No database rows, no UI, no Phase C provisioning.

## 1. What the current code does

`supabase/functions/mako-ingest/pull-sources.ts`
- Pure, dependency-injected module. Validators: `validateName`, `validatePort`, `validateHost` (syntactic + obvious-private rejection, no DNS), `SOURCE_ID_PATTERN` = `^src_[a-f0-9]{6}$`.
- `validateCallerSource` requires `source_id`, `output_path === "<source_id>-opus"`, valid `host`, integer `port`. No idempotency key exists anywhere.
- `createPullSource({name, host, port})` validates, calls `deps.createUpstream`, revalidates the response, returns `{status, body}`.
- `getPullSource({source_id})` and `deletePullSource({source_id})` regex-validate the id before it reaches any upstream path.
- Upstream failures are returned as `{error}` with the status the dependency reports.

`supabase/functions/mako-ingest/index.ts`
- Requires a verified Supabase user for every action; `MAKO_API_TOKEN` / `MAKO_API_BASE_URL` are read only in the function and never returned.
- `CALLER_ACTIONS` = `create_pull_source`, `get_pull_source`, `delete_pull_source`. Listener actions (`list_sources`, `create_source`, `delete_source`) are separate and untouched.
- A shared `request()` helper flattens **every** non-OK upstream status to `502 upstream_error`, so a 409 or 410 is currently indistinguishable. `DELETE` + 404 is already treated as a successful teardown.
- `BodySchema` accepts `action`, `name`, `source_id`, `host`, `port` — no `idempotency_key`.

Conclusion: the code cannot express idempotent creation, cannot recover a caller by key, and cannot report conflict/tombstone distinctly.

## 2. Files that would change

| File | Change |
| --- | --- |
| `supabase/functions/mako-ingest/pull-sources.ts` | UUID validation, required `idempotency_key` on create and in `CallerSource`, new `getPullSourceByIdempotencyKey`, tombstoned-state support, typed conflict/tombstone/not-found outcomes |
| `supabase/functions/mako-ingest/index.ts` | `idempotency_key` in `BodySchema`, new `get_pull_source_by_idempotency_key` action, caller-side status mapping (409/410/404-on-lookup), new `lookupUpstream` dependency |
| `src/test/mako-ingest-pull-sources.test.ts` | Expanded coverage (section 4) |

Nothing else is touched. `create-source.ts`, `delete-source.ts`, the listener branches, `save-session`, `session_runtime_routes`, migrations, and all frontend code stay exactly as they are.

### Design detail

- `UUID_PATTERN` = `^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, lowercase-canonical, matched **before** interpolation into `/pull-sources/by-idempotency-key/{uuid}`.
- `createUpstream` signature widens to `{ name, host, port, idempotency_key }` and forwards all four verbatim.
- `CallerSource` gains `idempotency_key: string` (required, UUID-valid) and `deleted_at: string | null`; `state` may be `active` or `tombstoned`.
- `validateCallerSource` gains an optional `expectedKey`: when supplied and the returned key differs, the response is rejected as `invalid_upstream_response` (502).
- Lookup accepts both active and tombstoned payloads and returns the state to the caller so future orchestration can tell "reuse" from "never recreate".
- The browser supplies only a UUID and, on create, name/host/port. It never supplies a path, URL, source id, or playback path.

## 3. Behavior for the four new cases

| Case | Result to the authenticated MAKO client |
| --- | --- |
| Malformed / missing UUID (create, lookup) | `400 { "error": "invalid_idempotency_key" }`, no upstream call at all |
| Upstream `409` on create | `409 { "error": "idempotency_conflict" }` — same key, different host/port |
| Upstream `410` on create | `410 { "error": "idempotency_tombstoned" }` — deleted key, caller must never be recreated |
| Lookup of unknown key (upstream `404`) | `404 { "error": "not_found" }`, deterministic and detail-free |
| Same key + same host/port retry | `200` with the existing caller — the upstream returns it, and the response key must equal the requested key |
| Any other upstream / network failure | Unchanged sanitized `502 upstream_error`, `upstream_unreachable`, or `invalid_upstream_response`; status codes logged, bodies never forwarded |
| `DELETE` + upstream `404` | Unchanged: successful already-gone teardown |

Raw upstream detail/error bodies are never parsed into a client response.

## 4. Tests to add

Extends `src/test/mako-ingest-pull-sources.test.ts`, all with fake injected dependencies — no network, no Deno, no real infrastructure:

1. create rejects a missing `idempotency_key` before any upstream call
2. create rejects a malformed UUID before any upstream call
3. valid UUID forwarded unchanged in the create body alongside name/host/port
4. create response key must equal the requested key (happy path asserts equality)
5. mismatched response key rejected as `invalid_upstream_response` (502)
6. same-key retry returns the existing source normally (200)
7. upstream 409 maps to `409 idempotency_conflict`
8. upstream 410 maps to `410 idempotency_tombstoned`
9. lookup rejects a malformed UUID before any upstream call
10. lookup calls the dependency with only the validated UUID (path-traversal and URL attempts rejected)
11. active lookup response validates and returns `state: "active"`
12. tombstoned lookup response validates, returns `state: "tombstoned"` and `deleted_at`
13. lookup response with a mismatched key rejected (502)
14. unknown key lookup returns `404 not_found` with no upstream detail
15. existing `get_pull_source` by source id still works, including malformed-id rejection
16. existing delete semantics still work, including 404-as-success and sanitized failure
17. listener-mode suites (`mako-ingest-create-source`, `mako-ingest-delete-source`) still pass unchanged

Then the full Vitest suite and a TypeScript check.

## 5. Scope confirmation

Not included: Phase C provisioning or Start Monitoring, Create Session UI, `session_runtime_routes`, `session_runtime_route_history`, `session_sources`, `save_session_with_sources`, `save-session`, migrations, My Sources, Session Room, playback, `stream-paths.ts`, Quinn, Timeline, Ops, sharing, auth, RLS, roles, and listener-mode ingest. No database rows are created or modified. No global caller listing is exposed to the browser. `MAKO_API_TOKEN` remains server-side only.

I report the changed files, test results, and any deviation, then stop.
