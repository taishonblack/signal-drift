# Plan: Add `mako-ingest` Supabase Edge Function

## Goal
Create a read-only, authenticated Edge Function that proxies selected requests from the MAKO web app to the private MAKO ingest API at `https://api.makosrt.com`, keeping `MAKO_API_TOKEN` server-side only.

## What will be built
- New Edge Function: `supabase/functions/mako-ingest/index.ts`
- Supports `POST { action: "list_sources" }`
- Verifies the caller is a signed-in Supabase user before forwarding the request.
- Forwards to `GET ${MAKO_API_BASE_URL}/sources` with server-side `Authorization: Bearer ${MAKO_API_TOKEN}`.
- Returns upstream JSON/status or a sanitized error.
- Responds to CORS OPTIONS preflight.

## Authentication
- Read the `Authorization` header from the incoming request.
- Create a Supabase client initialized with the anon key and the caller's `Authorization` header.
- Call `supabase.auth.getUser()` to verify the JWT server-side.
- If verification fails or no user is returned, respond with HTTP 401.
- This mirrors the pattern already used in `supabase/functions/join-session/index.ts`.

## Request/response contract
- Expected body: `{ "action": "list_sources" }`
- Unknown actions: HTTP 400 `{ "error": "Unsupported action" }`
- Upstream success: return the MAKO API JSON body with the upstream status code.
- Upstream failure: return a sanitized JSON error without exposing the token or raw upstream body details.

## CORS
- Import `corsHeaders` from `npm:@supabase/supabase-js@2/cors`.
- Handle `OPTIONS` by returning `ok` with `corsHeaders`.
- Include `corsHeaders` in every response, including errors.
- Do not use `Access-Control-Allow-Origin: *` for credentialed requests; the imported `corsHeaders` reflect the Supabase defaults suitable for the MAKO web app.

## Security constraints
- `MAKO_API_TOKEN` is read only via `Deno.env.get()` inside the Edge Function.
- The browser never receives, logs, or supplies the token.
- No token values are logged.
- Only `list_sources` is supported in this first version.

## Out of scope
- No create/delete source operations.
- No changes to app pages, auth flows, database schema, media playback, Quinn, Timeline, Ops, Sharing, or existing Edge Functions.

## Verification
- Run typecheck/tests to ensure no regressions.
- Deploy the function via Lovable-managed Edge Function deployment.
- Test by invoking from the authenticated app using `supabase.functions.invoke('mako-ingest', { body: { action: 'list_sources' } })`.

## Files changed
- `supabase/functions/mako-ingest/index.ts` (new)

## Answers to post-implementation questions
1. File created: `supabase/functions/mako-ingest/index.ts`.
2. Auth verified by forwarding the caller's `Authorization` header to `supabase.auth.getUser()` inside the Edge Function.
3. Request body: `{ "action": "list_sources" }`.
4. Deployment status reported after implementation.
5. Safest test: call `supabase.functions.invoke('mako-ingest', { body: { action: 'list_sources' } })` from a signed-in app page; the token stays server-side.
