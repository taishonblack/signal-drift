# Phase A.2 Deployment — mako-ingest Edge Function

## Scope
Deploy the already-implemented and approved Phase A.2 changes to the `mako-ingest` Supabase Edge Function. Nothing else.

## What will happen
1. Deploy the updated `mako-ingest` Edge Function (includes the rewritten `pull-sources.ts` with:
   - idempotent create via canonical UUID key (any 2xx counts as success),
   - lookup-by-key (active / tombstoned / unknown / mismatched-key),
   - 409 → `idempotency_conflict`, 410 → `idempotency_tombstoned`,
   - sanitized 404 lookup, no raw upstream errors,
   - unchanged get/delete source actions).
2. Verify deployment succeeded.

## Explicitly out of scope
- No code, database, UI, or Phase C changes.
- No test caller creation.
- No changes to listener-mode ingest.

## Deliverable
Report deployment status only, then stop. Live-testing against DigitalOcean (one fresh UUID, one caller, no leftover infrastructure) happens only after your review of the deployment result.
