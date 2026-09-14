# Phase 2 — Persist Successfully Provisioned MAKO Receive Sources

When an admin provisions a MAKO Receive source, the ingest bridge now also records it permanently in the source registry created in Phase 1. Nothing else changes: Create Session, playback, stream paths, Session Room, session/slot assignments, existing sessions, and the deletion behavior are untouched.

## Order of operations

```text
signed-in user  ->  admin check  ->  name validation
      ->  provision on the MAKO ingest API
      ->  validate what the API returned
      ->  save the registry row
      ->  return the same sanitized source info as today
```

The registry row is never written before provisioning succeeds. Authorization stays exactly as it is today: signed in, secure `admin` role, existing name rules, token server-side only. Source creation is not opened up to ordinary users in this phase.

## What gets saved

One row in the source registry per successful creation:

- owner: the signed-in admin's user id
- name: the validated friendly name
- connection mode: `receive`
- infrastructure source id, SRT port, playback path: exactly what the ingest API returned, after validation
- lifecycle status: `ready`
- connection status: `unknown`
- last checked / last error: empty

The write uses a service-role database client inside the function, which is the only path allowed to set the infrastructure-controlled fields. The Phase 1 protections stay exactly as they are — no policy, grant, or trigger is loosened, and no schema change is needed.

## Validating the ingest API response

The upstream response is not trusted. Before anything is saved:

- source id must match `src_` followed by six lowercase hex characters
- port must be a whole number within the supported allocation range 10020–10999
- playback path must be exactly `<source_id>-opus`, matching the identity that was returned

Anything else counts as a failed provision and triggers the cleanup below.

## Cleanup so infrastructure and database cannot drift

If provisioning succeeds but the response fails validation, or the registry row fails to save (including a duplicate infrastructure id, where the unique constraint stays the authority — never take over an existing row):

1. Immediately delete, through the existing authenticated ingest API, only the source this request just created.
2. Return a generic creation failure and no connection details.

If that compensating delete also fails, the function still reports failure, writes no row, and logs a sanitized operational line noting the orphan and its validated source id so an operator can reconcile. Tokens, authorization headers, raw upstream bodies, and SRT credentials are never logged. Cleanup only ever targets the source created inside the current request.

## Success response

Unchanged browser contract: `name`, `source_id`, `port`, `output_path`, `state`. The registry row's internal id is added as an additional `ingest_source_id` field, which the existing dev panel ignores. Owner id, database internals, and credentials are never returned.

No session/slot rows are created — a source exists independently of sessions.

## Technical notes

- `supabase/functions/mako-ingest/index.ts` — `create_source` gains response validation, the service-role insert, and the compensating delete. `list_sources` and `delete_source` are left as they are.
- New `supabase/functions/mako-ingest/create-source.ts` — the provision/validate/persist/compensate flow as a dependency-injected helper (upstream fetch, insert, and delete passed in) with no runtime-specific imports, so it can be unit tested directly. `index.ts` wires the real dependencies.
- New `supabase/functions/mako-ingest/create-source.test.ts` — failure-path tests using fakes only, never touching real sources: malformed response (bad id, out-of-range port, mismatched playback path), insert failure, duplicate infrastructure id, that the compensating delete is called with the right id, and that a failed compensating delete still fails cleanly and logs.

## Verification

One new source named `Registry Persistence Test`, created from the existing dev panel while signed in as the admin account, then checked in the database: exactly one row, correct owner, `receive`, matching source id / port / `-opus` path, `ready`, `unknown`. Existing listing and deletion behavior confirmed unchanged, typecheck and the full test suite run. This test source is left provisioned and persisted for Phase 3.

## Out of scope

Deletion persistence and the My Sources screen. Work stops after Phase 2.
