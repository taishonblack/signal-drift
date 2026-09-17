# Phase E.2 — Real Media Telemetry Foundation

Foundation only. No simulated values return, no persistence, no transport statistics, no audio metering, no publish.

## Outcome

MAKO gains one typed telemetry contract keyed to the caller-first runtime route, a defensive FFmpeg media-metadata parser, and a provider boundary the Signal Inspector reads from. Every field that MAKO cannot genuinely observe today stays `—` / "Not measured" — including all of Transport.

## Honest limitation up front

The caller API exposes lifecycle only (create / get / delete / lookup-by-key) and `mako-pull-manager status` reports only SOURCE_ID, HOST, PORT, OUTPUT_PATH, IDEMPOTENCY_KEY, SERVICE, ACTIVE. MediaMTX API and metrics are off. So today there is **no server surface that returns FFmpeg's parsed input metadata**.

Consequence, stated plainly rather than papered over: after E.2, video and audio format fields will render as unavailable in production until an infrastructure change (out of scope here) exposes the caller's captured FFmpeg input banner. E.2 builds and tests everything on the MAKO side so that change is a small, additive step later. `ACTIVE=active` continues to mean "the service is running" and is never treated as proof media is flowing.

## 1. Telemetry identity

Canonical key is `session_runtime_routes.id`. Every snapshot also carries `sessionId`, `slot`, `infrastructureSourceId` (`src_xxxxxx`) and `playbackPath` (`src_xxxxxx-opus`), all read from the existing runtime route / `session_sources` attachment — never from the friendly name, UI line number, component instance or `camN`.

Lookup is by runtime route ID only. Slot number alone never resolves a snapshot, so an ended or replaced route cannot leak telemetry into another session or slot. Legacy `camN` playback compatibility is untouched, and caller-first telemetry never falls back to it.

## 2. Telemetry contract

New `src/lib/telemetry/contract.ts`:

- `MediaTelemetrySnapshot` — identity fields above plus `observedAt`, `source`, and the `video`, `audioSource`, `audioOutput`, `transport`, `receiver` groups.
- `Observed<T>` = `{ value, observedAt, source, status }`.
- `source`: `"ffmpeg" | "srt" | "webrtc" | "mediamtx" | "mako_config"`.
- `status`: `"observed" | "unavailable" | "stale" | "not_measured"`. No `estimated`, ever.
- Helpers `notMeasured()`, `unavailable()`, `observed(value, source, at)` and a `freshness(snapshot, now)` function that downgrades `observed` to `stale` past a single named threshold. No monitoring policy beyond that.

A field with no real observation stays unavailable/not measured; no defaults are substituted anywhere.

## 3. Fields prepared

Video: codec, codecProfile, width, height, frameRate, scanType, colorSpace.
Source audio: codec, sampleRate, channelCount, channelLayout, encodedBitrate (only when the parser explicitly reads one).
MAKO output audio (separate group, provenance `mako_config`): outputAudioCodec, outputAudioSampleRate, outputAudioChannels, configuredOutputAudioBitrate.

Source audio and MAKO output audio never collapse into one value. Configured SRT receiver latency is modelled as configuration only and is structurally unable to appear as RTT or "Latency" — the transport RTT field accepts only `srt`-sourced observations.

## 4. Provider boundary

New `src/lib/telemetry/provider.ts`:

```text
TelemetryProvider
  getMediaMetadata(route)     -> real parse when metadata is available, else unavailable
  getTransportTelemetry(route)-> not_measured (E.4)
  getReceiverTelemetry(route) -> not_measured (E.3+; no getStats added here)
```

Plus a `NullTelemetryProvider` used in the app today, which returns explicitly unavailable groups. No fabricated implementation is written to satisfy the interface. Later phases plug into this same contract instead of adding parallel telemetry.

## 5. FFmpeg metadata parser

New `supabase/functions/_shared/ffmpeg-metadata.ts` (server-side, importable by tests): parses FFmpeg-style `Input #0 ... Stream #0:N: Video/Audio: ...` banner lines into the contract's video/audio groups.

Defensive by construction: tolerates missing fields, either stream order, video-only, audio-only, unknown codecs/profiles, and absent profile/colour/scan information; returns explicit unavailable fields rather than manufacturing anything. It is a pure function over supplied text — the browser never parses FFmpeg logs and nothing scrapes page text.

## 6. Signal Inspector

`src/components/InspectorPanel.tsx` keeps its current three sections and layout, and starts reading a snapshot instead of static labels:

- VIDEO — Codec, Resolution, Frame Rate rendered from observed values; `—` plus the existing quiet "Not measured" caption otherwise.
- TRANSPORT — Bitrate, Packet Loss, RTT all `—` / Not measured in E.2. Nothing derived from resolution, frame rate or configured latency.
- AUDIO — source Codec, Sample Rate, Channels when observed; MAKO output shown as its own labelled values so the two are never confused. No meters, no LUFS, no dBFS, no "audio healthy" inference.

`SessionRoom.tsx` passes the snapshot for the selected source, resolved by runtime route ID from the existing attachments hook. The History line stays as-is.

## 7. Untouched

Genuine pane/connection states (LIVE, CONNECTING, NO VIDEO, RECONNECTING, FAILED, ENDPOINT MISCONFIGURED), Provisioning Failed, provisioning, Phase D leases, teardown, reconciliation, auth, guest identity, ownership, sharing, Quinn, Timeline, Ops, `/explore` demo. Telemetry is supplemental: a source stays LIVE while its telemetry fields read `—`. FFmpeg startup noise (`non-existing PPS 0`, `decode_slice_header error`, `no frame!`) produces no alerts, no incidents, no failure classification. Quinn's truth constraint is unchanged and its behaviour is not expanded.

## 8. No persistence

No telemetry table, no time-series writes, no history, no WebSocket, no schema change. Current-snapshot architecture only. If any narrow metadata persistence turns out to be unavoidable it will be reported before schema is touched, not added silently.

## 9. Tests

New `src/test/telemetry-contract.test.ts` and `src/test/telemetry-inspector.test.tsx` covering all nineteen requested cases: no random/seeded telemetry, runtime-route ID as canonical identity, friendly name and slot number both non-determinative, no `camN` fallback for caller-first telemetry, missing FFmpeg metadata staying unavailable, video-only and audio-only streams not fabricating the other, source vs output audio distinctness, configured SRT latency unable to appear as RTT, transport unavailable in E.2, Inspector rendering supplied metadata and `—` otherwise, ended/replaced routes not leaking, and unchanged WHEP/connection state, guest and signed-in caller-first playback, End Session lifecycle, and `/explore` isolation.

Full suite plus TypeScript at the end. No Edge Function redeploy unless a local test genuinely requires it.

## Technical notes

Files added: `src/lib/telemetry/contract.ts`, `src/lib/telemetry/provider.ts`, `supabase/functions/_shared/ffmpeg-metadata.ts`, two test files.
Files modified: `src/components/InspectorPanel.tsx`, `src/pages/SessionRoom.tsx` (snapshot wiring only).
Database, Edge Functions, DigitalOcean, caller architecture: unchanged. MAKO remains always the SRT caller.
