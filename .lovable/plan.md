# Phase E.1 — Telemetry Audit & Truth Pass (findings only)

Read-only audit. No code, migrations, deployments, infrastructure or UI changes were made.

## 1. Executive summary

Almost none of the technical numbers in the Session Room are measurements.

Exactly two things are real today:

- **Connection/pane state** — genuinely derived from the WebRTC peer connection and the WHEP negotiation result (`LiveCamera`): connecting, live, no video, reconnecting, endpoint misconfigured, failed.
- **Provisioning/lifecycle state** — whether a caller route exists, is ready, or failed (session runtime routes).

Everything else operators read as engineering data — bitrate, packet loss, RTT, codec, resolution, frame rate, audio channels, sample rate, loudness, the audio meters, all three sparklines, and every automatic Quinn signal alert — is generated in the browser from static seed values plus randomness. The pipeline (SRT caller → FFmpeg → MediaMTX → WHEP) currently reports nothing back to MAKO except "the route exists" and "the upstream says the service state is active".

The player is honest. The instrumentation around it is not.

## 2. Metric provenance and trust table

| Metric | Current display | Actual source | Classification | Trustworthy today | Recommended phase |
|---|---|---|---|---|---|
| Video codec | "H.264 High" | hardcoded seed in `makeMetrics()` | HARDCODED | No | E.2 |
| Resolution | "1920×1080" | same hardcoded seed | HARDCODED | No | E.2 |
| Frame rate | "29.97 fps" | same hardcoded seed | HARDCODED | No | E.2 |
| Bitrate (inspector, tile overlay, tile footer, fullscreen bar) | e.g. "8.5 Mbps" | seed 8.5 ± random jitter, retimed every 800 ms | MOCKED | No | E.2 / E.4 |
| Packet loss | e.g. "0.02%" | seed + random jitter | MOCKED | No | E.4 |
| RTT | e.g. "24 ms" | seed + random jitter | MOCKED | No | E.4 |
| Audio channels | "2ch" | hardcoded seed | HARDCODED | No | E.2 |
| Audio sample rate | "48kHz" | hardcoded seed | HARDCODED | No | E.2 |
| Loudness (LUFS) | e.g. "-23.0 LUFS" | seed -23 + random jitter; not a loudness algorithm | MOCKED | No | E.3 |
| Audio meters (L/R bars) | bars moving continuously | two independent random values per 800 ms tick | MOCKED | No | E.3 |
| Bitrate sparkline | 60-point moving line | random array generated **once at module load**, shared by every source | MOCKED | No | E.5 |
| Packet-loss sparkline | same | same shared random array | MOCKED | No | E.5 |
| RTT sparkline | same | same shared random array | MOCKED | No | E.5 |
| Latency | not displayed | no measurement exists | UNAVAILABLE | — | E.4 |
| Retransmits / dropped packets | not displayed | no measurement exists | UNAVAILABLE | — | E.4 |
| Connection / pane state | LIVE, CONNECTING, NO VIDEO, RECONNECTING, FAILED, ENDPOINT MISCONFIGURED | WebRTC `connectionState` + WHEP negotiation outcome | REAL (browser transport) | Yes | keep |
| Route/provisioning state | NOT CONNECTED / Provisioning Failed pane | runtime route rows and attachment resolution | REAL (control plane) | Yes | keep |
| Source connection status (library rows) | connected / offline / unknown | written by create/delete code paths, never probed continuously | DERIVED from lifecycle events, not live | Partly | E.4 |
| Quinn signal alerts (all types) | precise messages with numbers | random templates on a 35–75 s timer | SIMULATED | No | E.7 |

## 3. Audio metering findings

The vertical meter beside each video is decorative. It reads two numbers produced by the same random tick that feeds the inspector; there is no Web Audio API graph, no `AnalyserNode`, no access to audio samples, no peak/RMS/LUFS computation, and no dB value underneath the bars. Left and right are two separate random values, not two measured channels, so apparent stereo behaviour is coincidental. Muting a source, muting all, or changing browser volume has no effect on the meter — it keeps moving on a source that is silent, and moves identically on a source with no audio track at all. Interval is 800 ms.

The inspector's loudness figure is the same fiction expressed in LUFS, which is the most misleading value in the product because LUFS implies a standardised measurement.

## 4. Quinn alert provenance

Every automatic technical alert Quinn produces comes from one of two randomised template banks (one writing into the shared Timeline, one into browser-local incident storage). Each template invents its own numbers at emit time and picks a random source. No template reads a measurement; there are no thresholds, no windows, no durations, no hysteresis, and no recovery detection.

The specific observed alert — *"PTS discontinuity on Source 1 — Phase Test — timestamp jumped 173 ms"* — is fully synthetic: the template generates a random integer between 80 and 500 ms and formats it into the sentence. MAKO has no access to media timestamps at any layer today, so no PTS value of any kind exists in the system. The precision of the number is what makes it dangerous.

Quinn's chat prompt instructs it to always cite exact loss/bitrate figures, which means it will confidently narrate mock telemetry as fact.

## 5. Media pipeline telemetry availability

| Stage | What MAKO extracts today | What is being ignored |
|---|---|---|
| External SRT listener | nothing | its own stats |
| MAKO caller / FFmpeg on DigitalOcean | only whether the service exists and a coarse `state` string returned by the caller API | codecs, resolution, frame rate, bitrate, audio format, timestamps, errors, and all SRT transport counters |
| RTSP publication → MediaMTX | nothing | publish state, track descriptions |
| MediaMTX | nothing | its metrics/API surface, per-path reader and publisher stats |
| WHEP negotiation | negotiation outcome only (this is used, and is real) | — |
| Browser player | connection state only | `RTCPeerConnection.getStats()` is never called, so real browser-side bitrate, jitter, packet loss, frames decoded, freeze count, resolution and frame rate are all available but unused |

The largest immediately available win is `getStats()` in the browser: it would give genuine BROWSER-ONLY delivery metrics with no server work at all. It must be labelled as playback measurement, not contribution.

## 6. Runtime-route identity findings

Playback identity is correct for caller-first sessions: session → runtime route → `src_xxxxxx` → `src_xxxxxx-opus`, with no legacy fallback for runtime slots, and unresolved runtime slots now surface a failure pane instead of borrowing `cam1`.

Telemetry identity is wrong everywhere. Simulated metrics are keyed by UI input id (`line-N` / slot), not by runtime route or infrastructure source. The legacy slot→`camN` mapping still exists for manual/legacy slots (intentionally retained). The simulated Quinn incident bank is hardcoded to `line-1`…`line-3` and to two fictional session ids, so its alerts are not attributable to any real route.

## 7. Telemetry persistence findings

There is no telemetry storage of any kind. No database table holds samples (the schema has sessions, routes, attachments, timeline, leases, roles — nothing time-series). No Edge Function ingests or serves samples. Nothing polls the caller service or MediaMTX for stats. Graph data is regenerated at module load, so it is identical for every source and resets on refresh; nothing survives a reload, and there is no server-side history at all. Quinn's simulated incidents persist only in browser local storage.

## 8. Misleading production displays (for the Truth Pass)

These currently read as engineering measurements and are not:

1. Bitrate on the tile overlay, the tile footer, the fullscreen bar and the inspector.
2. Packet loss on the tile overlay and the inspector — a steady "0.02%" reads as a verified clean line.
3. RTT in the inspector.
4. Codec, resolution and frame rate in the inspector — all identical for every source regardless of the actual feed.
5. Audio channels and sample rate in the inspector.
6. Loudness in LUFS.
7. The vertical audio meters — moving on muted and audio-less sources.
8. All three sparklines — visually convincing history that is one shared random array.
9. Every automatic Quinn signal alert, especially PTS discontinuity, freeze, black frames, audio clipping and bitrate drop.

The Truth Pass should replace each with an honest unavailable state (`—` / "Not measured") until real telemetry exists, keep the genuinely real connection/pane state as-is, and stop Quinn from emitting synthetic technical alerts in production sessions.

## 9. Recommended Phase E sequence

The proposed order holds, with one ordering note.

- **E.1 Truth Pass** — remove/neutralise mock telemetry and simulated alerts; show honest unavailable states. Independent of infrastructure, so it can ship immediately and stops the product asserting false engineering data.
- **E.2 Media telemetry foundation** — server-side collection (codec, resolution, frame rate, bitrate, audio format) plus the transport/collection contract and the telemetry identity keyed on runtime route + infrastructure source. Because E.2 defines that contract, it must precede E.3–E.5.
- **E.3 Real audio metering** — real audio measurement. This is largely browser-side (Web Audio on the playback stream) and therefore only loosely depends on E.2; it can run in parallel if convenient, but must be labelled as playback-side.
- **E.4 SRT transport telemetry** — RTT, loss, retransmits, latency from the caller. This is the item most exposed to unknowns on the server (see below).
- **E.5 Historical graphs & inspector** — needs a persistence layer, so it depends on E.2/E.4.
- **E.6 Right-rail UX**, **E.7 monitoring intelligence and real alerts** — last; real alerts require real thresholds over real series.

Optional insertion worth considering: a small **E.2a browser playback stats** step using `getStats()`. It delivers genuine (if playback-side) numbers quickly and gives the UI a real data shape to build against while server telemetry is designed.

## 10. What cannot be verified from this repository

I can prove the frontend and the backend code behaviour. I cannot prove anything about the server, and I am not going to guess:

- What the FFmpeg/caller service on DigitalOcean actually logs or exposes (codecs, resolution, frame rate, bitrate, audio format, timestamps, errors).
- Whether the caller uses a build/flags that expose SRT transport statistics at all, and in what form (stderr text, `-stats`, `-progress`, JSON, none).
- What the caller API on the server can return beyond the coarse `state` string MAKO already reads.
- Whether MediaMTX has its API/metrics endpoint enabled, and what per-path stats it would report.
- Whether the servers retain any logs or metrics history today.

E.2 and E.4 depend entirely on those answers, so a small read-only inspection of the caller service, the FFmpeg command line and the MediaMTX configuration should come before designing either. Any telemetry architecture written before that inspection would be invention, not engineering.
