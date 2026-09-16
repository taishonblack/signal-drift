# Live End-to-End Test: `create_pull_source` (No Code Changes)

## Goal

Prove the authenticated path — MAKO app session → Supabase Edge Function `mako-ingest` → DigitalOcean API → SRT Caller → MediaMTX — works end-to-end using the deployed Phase A actions, without touching any code, database, or UI.

## How the invocation happens (no browser console needed)

A browser-console snippet would require the functions URL and your session token to be pasted into chat/devtools — both of which we keep out of view by policy. Instead, Lovable invokes the deployed edge function through its built-in test channel, which:

- Automatically attaches your current signed-in MAKO preview session (the same authenticated user the app uses).
- Never prints or exposes `MAKO_API_TOKEN`, service-role keys, or backend URLs.
- Goes through the exact same JWT verification path a browser `supabase.functions.invoke` call would.

## Test steps

1. **Create** — POST to `mako-ingest` with:
   ```json
   { "action": "create_pull_source", "name": "Edge Caller Test", "host": "174.166.29.128", "port": 8000 }
   ```
   Prerequisite on your side: Magewell SRT Listener running on port 8000, same as the proven direct test.
2. **Verify the response** — expect HTTP 200 with `source_id` matching `src_[a-f0-9]{6}` and `output_path` equal to `<source_id>-opus`. (The edge function already rejects anything else.)
3. **Get** — call `get_pull_source` with the returned `source_id` to confirm the read path works through the Edge Function.
4. **Clean up** — call `delete_pull_source` with the same `source_id` so no test caller route or port is left running on DigitalOcean.
5. **Report** — the returned `source_id`, `output_path`, and each step's status. Optional follow-up (only if you want it): confirm video/audio in a browser at `https://stream.makosrt.com/<output_path>/whep` before step 4 cleanup.

## What will NOT happen

- No code, schema, RLS, Edge Function, UI, or session changes.
- No `ingest_sources` / `session_sources` rows created.
- No secrets shown or copied anywhere.
- No Phase B work started.
