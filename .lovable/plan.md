# Phase A.2 Live Test — Create Caller via Deployed Edge Function

Single controlled request through the deployed `mako-ingest` Edge Function (authenticated), proving the Lovable Cloud → DigitalOcean FastAPI → idempotent manager → FFmpeg caller chain.

## Request

```json
{
  "action": "create_pull_source",
  "name": "Phase A.2 Live Test",
  "host": "174.166.29.128",
  "port": 8000,
  "idempotency_key": "bedd1664-1e97-4804-aa7c-e51d88e04e76"
}
```

## Expected result

- Successful response with a new `source_id` (`src_xxxxxx`), `output_path` (`src_xxxxxx-opus`), and `idempotency_key` echoed back as `bedd1664-1e97-4804-aa7c-e51d88e04e76`.
- Accept any successful 2xx (upstream returns 201 even on first create).

## Steps

1. Invoke the deployed `mako-ingest` function with the exact payload above, using the authenticated preview session.
2. Report the exact response (source ID, playback path, echoed key, status).
3. Stop. No retry, no get, no delete — the caller remains running for your verification and later cleanup steps.

## Explicitly not included

- No retry/duplicate test yet (that is the next controlled step).
- No code, database, UI, Phase C, or listener-mode changes.
- No secrets exposed in output.
