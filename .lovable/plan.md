# Phase E.3 — Real Browser Audio Metering

Add genuine, measured audio levels taken from the WebRTC audio MAKO already receives in the browser. Nothing is simulated, seeded, or estimated, and no infrastructure, backend, or session behaviour changes.

## Outcome

The Signal Inspector gains a compact **Browser Audio Level** section under the existing Audio fields. When a real audio track is being received it shows moving L/R (or M) meters with live dBFS readouts on a -60 to 0 scale. When no measurement is possible it shows "Not measured". The existing E.2 audio fields stay exactly as they are.

Measurement keeps running whether or not the operator is listening to that source: muting a pane, choosing a different listening source, or Mute All never stops the meter.

## Measurement path

```text
MediaMTX WHEP -> existing RTCPeerConnection (LiveCamera)
   -> received MediaStream audio track
   -> Web Audio API AnalyserNode(s) (passive, no destination)
   -> decoded PCM samples -> RMS / Peak -> dBFS
```

No second WHEP session, no second receiver: the stream already received by `LiveCamera` is reused. The analyser graph is never connected to the audio output, so it can never cause a second audible playback.

## Technical plan

**1. Stream publication (`src/components/LiveCamera.tsx`)**
- Keep one long-lived `MediaStream` per connection and add each `pc.ontrack` track to it instead of replacing `video.srcObject` when a later track event fires (fixes audio/video arriving as separate events).
- Publish/clear the received stream through a small module registry keyed by `streamName` (`src/lib/telemetry/browser-audio-registry.ts`), on track arrival, reconnect, and unmount. Existing mute/reconnect behaviour is untouched.

**2. Pure math (`src/lib/telemetry/browser-audio-levels.ts`)**
- `amplitudeToDbfs` (`20*log10`), clamped to a -60 floor and a 0 ceiling (never positive).
- `rmsFromSamples`, `peakFromSamples` over `Float32Array` PCM.
- `SILENCE_FLOOR_DBFS = -60`; a sustained floor reading is reported as silence from real samples only.

**3. Typed contract (`src/lib/telemetry/browser-audio-contract.ts`)**
- `BrowserAudioLevelSnapshot` with `observationPoint: "browser_webrtc_pcm"`, `observedAt`, `status` (`observed` | `unavailable` | `not_measured`), `channelMode: "mono" | "stereo" | "unknown"`, and optional `mono` / `left` / `right` `{ rmsDbfs, peakDbfs }`.
- Kept separate from the E.2 `MediaTelemetrySnapshot` — different provenance, no field mixing.

**4. Hook (`src/hooks/use-browser-audio-levels.ts`)**
- Subscribes to the registry for a stream name; starts an `AudioContext` + `MediaStreamAudioSourceNode` only when a live audio track exists.
- Stereo when the source node reports 2 channels and a `ChannelSplitterNode` yields two independent analysers; otherwise mono. One mono reading is never duplicated as L and R.
- Ballistics (display only): fast attack, ~300 ms release, ~1.5 s peak hold then release, driven by `requestAnimationFrame`.
- Cleanup on track end, stream change, reconnect, and unmount: cancel the frame loop, disconnect splitter/analysers/source, close the `AudioContext`. Suspended/unavailable `AudioContext` yields `status: "not_measured"` — never fake values.

**5. UI (`src/components/InspectorPanel.tsx`)**
- New `BROWSER AUDIO LEVEL` block: per-channel row `L | meter | -18.4 dBFS` with a compact peak value, scale ticks at -60/-48/-36/-24/-18/-12/-6/0, existing glass/cyan tokens only.
- No measurement -> "— Not measured". Real floor -> "Silence". No Quinn/warning event for silence.
- `SessionRoom.tsx` passes the selected source's stream name to the Inspector so the hook resolves the right stream.

**6. Tiles**
- SignalTile, fullscreen, and popouts currently contain no synthetic meters (verified); nothing synthetic is added and the Session Room layout is not redesigned.

## Tests

Unit (pure math): 1.0 -> 0 dBFS; 0.5 -> ~-6.02; silence -> -60 floor; RMS and peak from known PCM arrays; never above 0 dBFS; mono never presented as stereo.

Component/integration: unavailable analysis renders "Not measured"; a supplied real snapshot renders its dBFS values; muted playback keeps measurement state active; reconnect/unmount runs full cleanup (no leaked AudioContext); a grep-style assertion that no random/synthetic audio values exist.

Then the full suite plus TypeScript typecheck.

## Explicitly not touched

Supabase schema, Edge Functions, DigitalOcean, FFmpeg, MediaMTX, caller provisioning, session lifecycle, auth/guest ownership, Quinn, Timeline, Ops, Sharing, E.2 media telemetry. Nothing is published or deployed.
