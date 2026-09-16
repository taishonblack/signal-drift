# Phase A.2 Live Test — Recovery Lookup by Idempotency Key

## Scope
Execute exactly one authenticated request through the deployed `mako-ingest` Edge Function. Nothing else.

## Request
```json
{
  "action": "get_pull_source_by_idempotency_key",
  "idempotency_key": "bedd1664-1e97-4804-aa7c-e51d88e04e76"
}
```

## Expected result
- `source_id`: `src_a241b4`
- `output_path`: `src_a241b4-opus`
- `idempotency_key`: echoed exactly
- `state`: `active` (the lookup endpoint explicitly returns state, unlike create's `state: null`)

This proves the lost-response recovery path: given only the UUID, the Edge Function can rediscover the existing caller.

## Explicitly out of scope
- No code, database, UI, or Phase C changes.
- No retry, no conflict test, no delete — caller `src_a241b4` stays running.

## Deliverable
Report the actual HTTP status and response body, then stop.
