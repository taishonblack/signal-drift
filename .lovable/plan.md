# Wire the production WHEP base to https://stream.makosrt.com

## How env vars work in this project (verified)

- `.env` at the project root is checked into the repo and is auto-generated/managed by Lovable Cloud. It currently holds only `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`. That file is owned by the platform, so it is not a safe place to add app config by hand.
- There is no other `.env*` file, and no Lovable UI for adding custom `VITE_*` build variables. Backend secrets (the Secrets panel you are looking at) are injected into edge functions at runtime only — they are **never** available to the Vite browser build.
- `VITE_MEDIAMTX_WHEP_BASE` is currently read in exactly one place: `resolveWhepBase()` in `src/lib/stream-paths.ts`. It is unset everywhere today, so production resolves to `{ ok: false, reason: "missing-production-whep-base" }`.

Because the WHEP base is a public HTTPS URL (not a credential), the correct and reliable place for it is a checked-in constant in the source, with the env var kept as an override for anyone building elsewhere.

## Change

Single file: `src/lib/stream-paths.ts`.

1. Add an exported constant:
   `export const PRODUCTION_WHEP_BASE = "https://stream.makosrt.com";`
2. Update `resolveWhepBase()` resolution order:
   - `VITE_MEDIAMTX_WHEP_BASE` if set (trimmed, trailing slashes stripped) → `source: "env"`
   - else if `import.meta.env.DEV` → `/mediamtx` → `source: "dev-proxy"` (unchanged local behavior via the existing Vite proxy)
   - else → `PRODUCTION_WHEP_BASE` → new `source: "built-in"`
   - The `missing-production-whep-base` failure branch stays in the type and in the code path for the case where the constant is ever blanked, so the typed error handling in `LiveCamera`, `probeStream`, and the Session Room diagnostics strip keeps compiling and behaving as-is.
3. Widen the `WhepBaseResult["source"]` union to include `"built-in"` and refresh the doc comment at the top of the file.

Nothing else changes: MediaMTX paths (`cam1..cam4`), SRT/publish IDs, slot mapping, WHEP negotiation, Supabase, and auth are untouched. The `/mediamtx` dev proxy in `vite.config.ts` stays exactly as it is.

## Answers you asked for

- **Where the production WHEP base is configured:** the `PRODUCTION_WHEP_BASE` constant in `src/lib/stream-paths.ts`, overridable by `VITE_MEDIAMTX_WHEP_BASE` at build time.
- **Present in the published browser bundle:** yes — it is a source constant, so it is inlined into the JS bundle at build time. (A Supabase secret would not be, which is why that route is being avoided.)
- **Exact URL Source 1 requests in production:** `https://stream.makosrt.com/cam1/whep` (POST with the SDP offer; the `Location` returned by MediaMTX is resolved against that base for the follow-up PATCH/DELETE).
- **Manual configuration needed in Lovable before publishing:** none. No secret, no env entry, no dashboard setting. Just publish once the change is in.

## Verification after the change

- Dev preview still resolves to `/mediamtx` (proxy path unchanged).
- Session Room diagnostics strip shows `https://stream.makosrt.com` as the base instead of `(unset — missing-production-whep-base)`.
- Create page "Test Connection" targets `https://stream.makosrt.com/cam1/whep`.
- Typecheck passes.
