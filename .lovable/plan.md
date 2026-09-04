# Core MAKO Live SRT Milestone — Real Source Pipeline

Goal: Create a session, configure Source 1–4 with a real SRT input, start monitoring, and see the real incoming feed in the exact configured pane. No mock sessions, no mock video, no demo feeds in this path.

## What changes

### 1. Source slot → MediaMTX path
A single helper (`src/lib/stream-paths.ts`) becomes the one place that maps a source slot to its stream name and WHEP URL:

- Source 1 → `cam1`, Source 2 → `cam2`, Source 3 → `cam3`, Source 4 → `cam4`
- WHEP URL: `<base>/cam<N>/whep` where base is `/mediamtx` in development (existing Vite proxy to the MediaMTX WebRTC port) and comes from `VITE_MEDIAMTX_WHEP_BASE` when set, so the published app can point at a public MediaMTX endpoint.

Encoder side stays as documented: publish `publish:cam1` … `publish:cam4` over SRT into MediaMTX; the browser only ever consumes WebRTC/WHEP.

### 2. Create page — real source configuration
Keeps the existing four Source tabs and layout. Behaviour tightened:

- Address field accepts `134.209.119.136`, `srt://134.209.119.136`, or a full SRT URL; a pasted `srt://host:port` auto-fills address and port (the existing parser already does this — it will be applied to the port field too).
- A source counts as configured only when address + port are both valid.
- Each source tab shows its assigned stream name (e.g. "Publishes to `cam1`") plus the exact stream ID the encoder should send (`publish:cam1`), so the operator never needs to know MediaMTX path syntax.
- Test Connection stops being a no-op: it queries the real MediaMTX path for that slot and reports either "Signal available" with whatever real metadata is returned, or "No active signal detected on Source N". It never blocks saving.

### 3. Session data model
On Start Monitoring, the saved session carries the real configured sources only. Each line keeps its slot, enabled flag, friendly name, parsed address, port, and derived `streamName` (`cam<slot>`). Sources that were never configured are saved disabled and are not rendered.

### 4. Session Room uses the real session
- Remove the `mockSessions.find(...) ?? mockSessions[0]` fallback in `SessionRoom`.
- Panes are built from the stored session record: enabled + valid sources only, mapped into the existing tile model with `streamName = cam<slot>` and no `videoSrc`.
- Configure only Source 2 → exactly one pane labelled "Source 2 — <name>", requesting `cam2`. No empty panes for unconfigured slots.
- If the session id is unknown, show a clear "Session not found" state instead of silently loading mock data.

### 5. Real WebRTC playback and pane states
`LiveCamera` becomes the only video path for configured sources, driven by the tile's stream name (the current hardcoded `cam1` is removed).

Per-pane states derived from the real WHEP/peer-connection lifecycle:

- `CONNECTING` — negotiating
- `LIVE` — media flowing
- `NO VIDEO STREAMING` — MediaMTX reachable but no publisher on that path
- `RECONNECTING` — retrying with backoff after a drop
- `CONNECTION FAILED` — repeated failures / MediaMTX unreachable

When the publisher returns, the pane retries automatically and goes LIVE without recreating the session.

### 6. Debug visibility (development only)
A dev-only diagnostics strip (and matching console logging) listing per source: session id, slot, friendly name, stream name, WHEP URL, connection state. No passphrases or credentials are ever printed. Hidden in production builds.

## Out of scope this change set
Quinn, Timeline behaviour, Ops, Sharing, Join, Explore, Account, Popouts, workspace presets, incident correlation — untouched except for the minimum compile fixes needed once the Session Room stops importing mock data. Popout pages currently also read `mockSessions`; they will be pointed at the real record with no behaviour redesign.

## Technical notes
- New: `src/lib/stream-paths.ts` (slot → `camN`, WHEP URL builder, session-record → pane adapter).
- Edited: `src/components/LiveCamera.tsx` (state machine, retry/backoff, no-publisher detection), `src/components/SignalTile.tsx` (use per-source stream name, drop mock video branch), `src/pages/SessionRoom.tsx` (real record, real pane list), `src/pages/CreateSession.tsx` (real Test Connection, slot/stream hints), `src/pages/SourcePopoutPage.tsx` and `src/pages/LayoutPopoutPage.tsx` (drop mock fallback).
- `vite.config.ts` proxy stays as-is for local development.

## Verification
1. Publish `publish:cam1` → Source 1 pane shows real video.
2. Stop publisher → pane shows NO VIDEO STREAMING.
3. Restart publisher → pane reconnects, same session.
4. Configure Source 2 only → single pane, requests `cam2`.
5. Refresh Session Room → same session, same real source configuration.
6. No `mockSessions` reference remains in the create/monitor path.

## Open item
Production WHEP endpoint: development uses the `/mediamtx` proxy. For the published app I will read `VITE_MEDIAMTX_WHEP_BASE`; if you want a specific public URL baked in instead, tell me and I will use it.
