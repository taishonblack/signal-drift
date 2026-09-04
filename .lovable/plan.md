# Production WHEP diagnosis — HTML returned instead of SDP

## Confirmed from the code and config

- `.env` contains only the Supabase variables. **`VITE_MEDIAMTX_WHEP_BASE` is not set anywhere in this project.**
- `whepBase()` in `src/lib/stream-paths.ts` therefore falls back to the literal string `/mediamtx` in every environment, including the published site.
- `vite.config.ts` proxies `/mediamtx` -> `http://134.209.119.136:8889` **only in the dev server**. Nothing serves that path on makosrt.com.

So on https://makosrt.com the browser requests `https://makosrt.com/mediamtx/cam1/whep`, the SPA fallback returns `index.html`, and `setRemoteDescription` is handed `<!doctype html>`. That is exactly the Chrome error reported. Your diagnosis is correct.

Test Connection is a **false positive** for the same reason: `probeStream()` classifies any `res.ok` as `"available"` and never inspects the body, so a 200 HTML page reads as "Signal available on cam1."

Both the earlier ICE/persistence theory and this one point at the same first fix: the response is not SDP, so nothing downstream can work. The ICE/persistence work is deferred until a real SDP answer arrives.

## Scope of this change (diagnostics + guards only)

No SRT, Magewell, MediaMTX, ICE, retry, Quinn, Ops, Timeline, or Session Room UI changes.

1. **Environment-aware WHEP base** (`src/lib/stream-paths.ts`)
   - Dev: keep `/mediamtx` (Vite proxy).
   - Production without `VITE_MEDIAMTX_WHEP_BASE`: do not fall back to the SPA origin. Return a configuration error that surfaces as "Production MediaMTX WHEP endpoint is not configured." in the pane and in Test Connection.
   - No hardcoded `http://` production endpoint.

2. **Validate the WHEP answer before using it** (shared by `probeStream` and `LiveCamera`)
   - Require the expected 2xx status.
   - If `Content-Type` is supplied, require it to be SDP-compatible.
   - Require the body to start with `v=`.
   - If the body starts with `<!doctype html` or `<html`, classify as `misconfigured`: "WHEP endpoint misconfigured — received HTML instead of SDP." Never call `setRemoteDescription`, and never retry it as an ICE failure.

3. **Honest Test Connection** — "Signal available" only when a valid SDP answer came back. HTML gives "Playback endpoint misconfigured."

4. **Diagnostics** — log the exact request URL, HTTP status, `Content-Type`, and the first 100 characters of the body, plus the resolved `whepBase()` value and whether it came from the env var or the dev fallback.

## Answers to your questions

- **Exact production request URL:** `https://makosrt.com/mediamtx/cam1/whep`.
- **Why HTML is returned:** SPA fallback on Lovable hosting; the `/mediamtx` proxy exists only in the Vite dev server.
- **Is Test Connection a false positive:** yes, it accepts any 2xx without checking the body.
- **Resolved production env var:** none — `VITE_MEDIAMTX_WHEP_BASE` is unset, so the code uses the `/mediamtx` dev fallback.

## Still needed outside the app

`stream.makosrt.com` must be pointed at the DigitalOcean MediaMTX WebRTC service over HTTPS. Once that exists, set `VITE_MEDIAMTX_WHEP_BASE=https://stream.makosrt.com` and the pane will receive real SDP.

## Follow-ups (tracked, not in this change)

- LiveCamera ICE/persistent-session work (only meaningful once real SDP arrives).
- `session_focus` 401s for guest users (RLS), unrelated to video.

## Files touched

- `src/lib/stream-paths.ts`
- `src/components/LiveCamera.tsx` (validation guard + diagnostics only)
