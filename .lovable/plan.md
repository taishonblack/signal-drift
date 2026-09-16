# Phase A.2 Live Test — Idempotent Retry

Send the exact same successful create request once more through the deployed `mako-ingest` Edge Function (authenticated), proving upstream idempotency end-to-end.

## Request (byte-identical to the successful create)

```json
{
  "action": "create_pull_source",
  "name": "Phase A2 Live Test",
  "host": "174.166.29.128",
  "port": 8000,
  "idempotency_key": "bedd1664-1e97-4804-aa7c-e51d88e04e76"
}
```

## Expected result

- Successful 2xx response (upstream may return 201 even for a resolved retry — accepted per approved design).
- Same identity returned: `source_id: src_a241b4`, `output_path: src_a241b4-opus`, `idempotency_key: bedd1664-1e97-4804-aa7c-e51d88e04e76`.
- No new `src_` ID appears.

## Steps

1. Invoke the deployed `mako-ingest` function with the exact payload above.
2. Report the actual status code and full response body, noting whether the returned source ID matches `src_a241b4`.
3. Stop. No get, no delete, no further retries.

## Explicitly not included

- No code, database, UI, Phase C, or listener-mode changes.
- No conflict (409), tombstone (410), or lookup tests yet — those are later controlled steps.
