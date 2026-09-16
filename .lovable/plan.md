# Phase C — Pre-Implementation Corrections (design only)

Nothing implemented. No migrations, no code, no UI changes. This revises the earlier Phase C design with the three requested corrections.

## 1. Verified session statuses

- Live database constraint `sessions_status_check` allows exactly: `draft`, `scheduled`, `active`, `paused`, `completed`, `archived`. So `draft` **is** valid in the database, and `save-session`'s schema already accepts it. No session schema migration is needed.
- However the frontend disagrees: `SessionStatus` in `src/lib/session-store.ts` is `scheduled | active | paused | completed | archived`, and `migrateStatus()` (line 406) explicitly maps an incoming `"draft"` to `"completed"`. `hydrateMemberSessions()` pulls every owned session row, so a provisioning `draft` row would hydrate into the operator's history as a **completed session**. That is a real defect my previous plan would have shipped.

Recommendation (least invasive, no schema change): keep `draft` as the server-side pre-provisioning status, and make session hydration/listing ignore `draft` rows entirely rather than coercing them. A `draft` row is a reservation, not a session the UI ever shows. `SessionStatus` gains no new member; only the hydration filter changes.

## 2. The orphan-caller failure window (critical)

Confirmed from the live code: `pull-sources.ts` sends `POST /pull-sources` with exactly `{ name, host, port }` and the upstream generates `source_id` (`src_[a-f0-9]{6}`). There is **no idempotency key, no client-supplied identity, and no user-facing caller listing**. So the window you identified is real and currently unrecoverable: if the upstream creates a caller and the Edge Function dies before persisting `infrastructure_source_id`, MAKO holds a `provisioning` row that cannot be matched to any caller.

### Options compared

**A — Extend `create_pull_source` with an idempotency key (recommended).**
MAKO sends the `session_runtime_routes.id` (a UUID created *before* the external side effect) as `idempotency_key`. `mako-pull-manager` stores it, and a repeat create with the same key returns the **existing** caller (same `source_id`, `output_path`) instead of creating a second one. Requires an upstream change but gives the invariant directly and needs no MAKO-side guessing.

**B — Upstream lookup by key or endpoint.**
Add `GET /pull-sources?idempotency_key=…` (or an authenticated lookup by host/port) so a retry can resolve whether a caller already exists for a reservation. Weaker than A on its own — between "create" and "lookup" a concurrent retry can still double-create unless the manager also dedupes — but it is the right companion for reconciliation and orphan sweeping.

**C — MAKO-only mitigation (rejected as a primary).**
Persist intent, then treat any `provisioning` row older than N seconds as suspect. Without an upstream key or listing there is no way to identify or delete the orphan, so this leaks callers. Acceptable only as an alerting fallback.

**Recommendation: A as the required capability, plus B for reconciliation.** A is a blocking prerequisite: Phase C should not create real callers from Start Monitoring until `create_pull_source` is idempotent on a MAKO-supplied key.

### Caller identity lifecycle

```text
1. INSERT session_runtime_routes  -> route.id (UUID)   [MAKO-owned key, exists pre-side-effect]
2. create_pull_source { name, host, port, idempotency_key: route.id }
3. upstream: key seen before? -> return existing caller
                       else   -> create caller, bind key -> src_xxxxxx
4. persist src_xxxxxx + output_path on route.id, flip to ready
5. teardown: delete_pull_source(src_xxxxxx); if src unknown, resolve via key lookup (B)
```

### How the invariant survives each failure

Invariant: for one `session_runtime_routes.id`, retries produce **at most one** live caller.

- **Edge Function timeout after upstream creation** — the key is already bound upstream; the retry's create returns the same caller and step 4 records it.
- **Browser disconnect** — same: the route row and key persist; nothing is lost.
- **Repeated request** — key match upstream; no second caller regardless of MAKO state.
- **Concurrent requests** — `UNIQUE (session_id, slot)` gives one route row, so one key; the upstream dedupes on that key. Enforcement is in the database and the manager, never in React.
- **Lost HTTP response after successful creation** — indistinguishable from a timeout, handled identically by the key.

### Phase B schema

No change required. `session_runtime_routes.id` is the idempotency key. (An optional `provisioning_key` column is unnecessary and would add a second source of truth.)

## 3. Endpoint replacement deferred

Confirmed: dropping teardown/replacement makes Phase C smaller and safer — it keeps Phase C to "create infrastructure once, idempotently" and leaves lifecycle mutation to the later phase.

Retry behavior by route state:

| Existing route state | Behavior |
| --- | --- |
| none | reserve, provision |
| `provisioning`, same endpoint | idempotent resume via the key; may finish and become `ready` |
| `ready`, same endpoint | reuse; no upstream call |
| `ready` or `provisioning`, **different** endpoint | typed conflict `endpoint_conflict`; no teardown, no replacement, plain-language message to the operator |
| `error` | surface the error; retry only re-issues the same-key create (never a second caller). Cleanup of a failed route is the lifecycle phase's job |
| `tearing_down` | typed conflict; wait |

## 4. Revised Start Monitoring sequence

Browser: validate form → generate session id → one authenticated call to a new `provision-runtime-routes` Edge Function → only on success write local session state, then navigate.

Edge Function (service role, owner from verified JWT):
1. `auth.getUser()` → `owner_id`.
2. Upsert the `sessions` row as `draft` (hydration ignores drafts).
3. Per enabled slot: `INSERT ... ON CONFLICT (session_id, slot) DO NOTHING`, then select the row → route id.
4. Per route, sequentially: `create_pull_source` with `idempotency_key = route.id`.
5. Validate `source_id` + `output_path`; persist; flip to `ready`.
6. `save_session_with_sources` with `status: 'active'` and one `runtime_route_id` attachment per slot.
7. Return `{ ok, session_id }`.

All-or-nothing, sequential, max four slots. The browser is authoritative for none of: owner, infrastructure id, playback path, lifecycle state.

## 5. Revised failure behavior

| Failure | Behavior |
| --- | --- |
| Slot 2 create fails | Tear down slots already `ready` (known `source_id`), archive to history, session stays `draft`, no navigation |
| Timeout/disconnect immediately after caller creation | Key-bound caller is recoverable: the retry's same-key create returns it and finalization completes. No orphan, no duplicate |
| Finalization (step 5) fails | Retry resolves via the key; if teardown is chosen instead, `delete_pull_source` uses the id returned by the same-key create |
| `save_session_with_sources` fails | Compensate every route; report a save failure |
| Compensation itself fails | Row stays `error`/`tearing_down` with `teardown_attempts` and `teardown_error` recorded — never silently dropped |
| Navigation fails after successful persistence | Nothing to compensate; session is genuinely started |

## 6. Required changes outside MAKO

- `mako-pull-manager` / DigitalOcean API: accept and persist `idempotency_key` on `POST /pull-sources`, return the existing caller on a repeat key (option A), and ideally expose a key lookup (option B).
- `mako-ingest` `create_pull_source`: forward a validated UUID `idempostency_key` (strict UUID check, never interpolated into a URL). Listener actions unchanged.

**Blocking flag:** until the upstream idempotency key exists, Start Monitoring cannot safely create callers. If that upstream change is not available, Phase C implementation should stop at the database/UI layer and not fire `create_pull_source`.

## 7. Unchanged from the approved design

Three-field slot UI (Friendly Name, SRT Address/IP, Port); removal of listener/MAKO-Receive/Stream-ID/camN terminology from the primary path; My Sources and Address Book as optional prefills only; attachment-first playback with `camN` retained for legacy sessions; no navigation before persistence; Phase B tables, FK semantics and sessions DELETE grant untouched; Test Connection audited but not redesigned; no reconciliation worker in this phase; no new role, no admin bypass; remote host/port stay owner/backend-only.
