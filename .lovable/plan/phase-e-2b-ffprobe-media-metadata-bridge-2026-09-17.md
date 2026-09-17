# Phase E.2B — FFprobe Media Metadata Bridge

First real media metadata in MAKO's Signal Inspector: MAKO's own RTSP publication is probed once per runtime route, server-side, and mapped into the existing E.2 telemetry contract. Nothing is simulated, nothing is persisted, and no infrastructure is touched automatically.

## Outcome

When a caller-first runtime route becomes ready, MAKO asks its own backend for that route's media format. On success the Inspector shows genuine video codec/profile, resolution and frame rate, plus MAKO's published (Opus) output audio. Source audio and everything under Transport stay `—` / "Not measured". On any failure the panes, session lifecycle and Quinn are completely unaffected.

## 1. Provenance rule (non-negotiable)

The probe point is the local RTSP publication produced by MAKO's FFmpeg caller — after FFmpeg, before browser delivery. So:

- Video is `-c:v copy`, so the observed H.264 characteristics are genuine, but they are recorded as an observation of the RTSP publication, not as "original source" metadata.
- The observed Opus audio is MAKO's own output. It populates `audioOutput` only. `audioSource` remains unavailable, because AAC-LC in / Opus out means the RTSP audio says nothing about the source.
- Every mapped field carries `source: "ffmpeg"` plus a new snapshot-level `observationPoint: "rtsp_publication"`.

## 2. DigitalOcean change (proposed only, NOT executed)

A patch for `/opt/mako-ingest-api/app.py` is delivered as a reviewable diff in the report. No other server file changes: `mako-pull@.service` and `mako-pull-manager` stay as they are, MediaMTX API/metrics stay disabled, no packages installed.

New endpoint, behind the existing bearer auth:

```text
GET /pull-sources/{source_id}/telemetry/media
```

- `source_id` is the only input, validated with the API's existing trusted source-ID validation.
- The server looks up the trusted caller config, reads `OUTPUT_PATH`, and builds `rtsp://127.0.0.1:8554/{OUTPUT_PATH}` itself. No client-supplied URL, host, path, slot, friendly name, or extra ffprobe arguments, ever.
- `subprocess.run([...])` with an argv list, no `shell=True`, `timeout=5`, `/usr/bin/ffprobe` by absolute path, with the exact `-show_entries` list already proven in production.
- Response is normalized server-side; raw stdout/stderr, filesystem and process detail never reach the client.
- Unknown source → 404. Caller running but RTSP not published yet, ffprobe timeout, malformed output, or inactive service → controlled `telemetry_unavailable` with a reason code and server-side logging.

## 3. Edge Function bridge

New `supabase/functions/media-telemetry/index.ts` (not deployed in this phase), following the `mako-ingest` pattern:

- Requires a Supabase session (including anonymous Temporary Operator identities).
- Input is `runtime_route_id` — the canonical identity — not `src_xxxxxx`.
- Server-side authorization: load the route with the service-role client, then allow only the session owner, a non-revoked `shared_session_access` grant for that session, or the guest identity that owns the temporary session. Knowing a `src_xxxxxx` grants nothing. No UI-level gating is trusted.
- Only after authorization does it read the route's `infrastructure_source_id` and call the caller API with `MAKO_API_TOKEN`. That token stays in the function; the browser never sees it, and no second credential system is introduced.
- Failures are returned as sanitized typed codes (`unauthorized`, `not_found`, `telemetry_unavailable`, `upstream_error`).

## 4. Client provider and fetching

- New `MediaTelemetryBridgeProvider` in `src/lib/telemetry/provider.ts` implementing the existing `TelemetryProvider` interface: `getMediaMetadata` calls the bridge, `getTransportTelemetry` and `getReceiverTelemetry` keep returning not-measured.
- A new pure mapper turns the server payload into `VideoTelemetry` / `OutputAudioTelemetry`. Missing fields stay `unavailable()` — no defaults. Frame rate is parsed from the rational form: `30/1` → `30`, `30000/1001` keeps its true value (≈29.97) and is never rounded to 30.
- `src/hooks/use-media-telemetry.ts` switches to the bridge provider and fetches once per runtime route when it is ready and has an infrastructure source ID, then caches per runtime-route id. No interval, no continuous polling.
- Bounded retry only for a not-ready publication: attempt, wait ~2s, retry, wait ~4s, final retry, then stop. A new route or manual reconnect starts a fresh sequence.
- Every response is checked against the currently active route set before it is applied; a late response from an ended, replaced, detached or torn-down route is discarded. No slot, label or `camN` fallback anywhere.

## 5. Inspector

`InspectorPanel.tsx` keeps its current three-section layout. Video codec/profile, resolution and frame rate become real when observed. Audio shows source values as `—` / "Not measured" and MAKO output codec/sample rate/channels when observed. Transport stays entirely `—`. Scan and Color Space are added only if they fit the existing two-column Video grid without redesign; otherwise they are carried in the contract and left unrendered this phase.

## 6. Explicitly out of scope

No audio metering, no SRT transport statistics, no history or graphs, no automatic Quinn alerts, no telemetry table or time-series writes, no schema change, no publish, no Edge Function deploy, no DigitalOcean execution. A telemetry failure never becomes FAILED, ENDPOINT MISCONFIGURED, an incident, or a teardown. Nothing about SRT health, loudness, latency or decode health is derived from format metadata.

## 7. Tests

New `src/test/telemetry-ffprobe-bridge.test.ts` and `src/test/telemetry-e2b-integration.test.tsx` covering all thirty requested cases: input hardening (no arbitrary RTSP/host/path, invalid source IDs rejected, trusted OUTPUT_PATH determines the URL, argv not shell, bounded timeout), normalization (valid metadata, `30/1`, `30000/1001` staying 29.97, missing fields unavailable, video-only and audio-only not fabricating the other, Opus into output audio only), failure containment (404/not-ready stays unavailable, no pane-state change, no session end, no Quinn incident), identity (route id canonical, late replaced-route response discarded, no `camN`), authorization (token never in the browser, unauthorized user refused, owner / collaborator / Temporary Operator allowed), rate (no high-frequency polling, retry stops), and unchanged provisioning, Phase D leases/teardown, WHEP playback and `/explore` isolation.

Full suite plus TypeScript at the end.

## Technical notes

Added: `supabase/functions/media-telemetry/index.ts`, `supabase/functions/media-telemetry/authorize.ts`, `src/lib/telemetry/media-metadata.ts` (pure mapper + frame-rate parsing), two test files, and the proposed `app.py` patch delivered in the report.
Modified: `src/lib/telemetry/provider.ts`, `src/hooks/use-media-telemetry.ts`, `src/lib/telemetry/contract.ts` (add `observationPoint`), `src/components/InspectorPanel.tsx` (values only).
Unchanged: database schema, provisioning, leases, teardown, WHEP, caller architecture. MAKO remains always the SRT caller.
