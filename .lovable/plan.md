# Phase E.1A — Truth Pass: Remove All Mock Telemetry

Removal only. No replacement telemetry, no infrastructure work, no publish.

## Outcome

After this pass, every technical value MAKO shows an operator is something it actually knows. Anything it does not measure reads `—` with a quiet "Not measured", and the simulation machinery is deleted from the codebase rather than left dormant.

## What gets deleted

**Simulated metric engine**
- `src/hooks/use-live-metrics.ts` — deleted outright. This is the 800 ms random tick behind bitrate, packet loss, RTT, loudness and both audio-meter values. Remove its use in `SessionRoom.tsx`, `SourcePopoutPage.tsx`, `LayoutPopoutPage.tsx`, and the `liveMetrics` prop from `SignalTile`, `InspectorPanel`, `FullscreenOverlay`.

**Hardcoded engineering seeds**
- `src/lib/mock-data.ts` — delete `makeMetrics`, `generateMetricHistory`, `mockInputs`, `mockMarkers`, and the mock feed video imports. `StreamMetrics` becomes an all-optional shape (or is removed from `StreamInput` entirely) so no code path can hand back H.264 High / 1920×1080 / 29.97 / 8.5 Mbps / 0.02% / 24 ms / 2ch / 48 kHz / −23 LUFS.
- `src/pages/SessionRoom.tsx` — QC markers no longer seed from `mockMarkers`; the list starts empty.
- `mockSessions` is retained only as the expired-session name/PIN fallback in `Sessions.tsx` and `RecentSessionsPanel.tsx`, stripped of its fabricated per-input metrics. It is session metadata, not telemetry.

**Synthetic Quinn signal generators**
- `src/hooks/use-quinn-simulator.ts` — deleted. Randomised incident/event/alert bank writing to browser storage, hardcoded to `line-1..3` and fictional `sess-001/002`. Currently unreferenced, so it must not survive as dormant machinery.
- `src/hooks/use-quinn-timeline-bridge.ts` — deleted, along with its call in `SessionRoom.tsx`. This is the live path that produced "PTS discontinuity … jumped 173ms" and every other fabricated packet-loss / bitrate / freeze / black-frame / clipping / resolution-change entry.

**Fake history**
- The three sparklines in `InspectorPanel.tsx` (one shared random 60-point array, generated once at module load) are removed together with the `recharts` usage in that panel.

## What the UI shows instead

**Signal Inspector** — structure preserved for later phases. Video (codec, resolution, frame rate, bitrate), Transport (packet loss, RTT), Audio (channels, sample rate, loudness) each render `—` with "Not measured" as a single quiet caption per section. No zeros, no "Unknown", no invented values. In place of the three charts, one honest line: "No telemetry history available." The existing source selector and panel layout stay as they are.

**Video tiles** — the animated L/R meter is removed entirely; that yields the cleanest layout and frees the pane corner. No static meter, no replacement animation. The per-source Listen/mute control is unaffected. The bitrate/loss overlay strip and the `8.5M` footer figure are removed. The fullscreen bar drops its metrics line and keeps the source label.

**What stays exactly as-is** — WebRTC/WHEP pane states (LIVE, CONNECTING, NO VIDEO, RECONNECTING, FAILED, ENDPOINT MISCONFIGURED), Provisioning Failed / NOT CONNECTED, runtime-route lifecycle, session status, and all caller/session lifecycle information. These were proven real in E.1.

## Quinn

`supabase/functions/quinn-chat/index.ts` — remove the rule requiring exact loss/bitrate/timestamp citation and replace it with an instruction to state plainly that a measurement is not currently available when asked, and never to estimate one. Quinn keeps discussing genuine session and lifecycle information. No other Quinn redesign. Function is redeployed since its prompt changed.

Operator-authored Timeline notes, incident review UI and the PDF/report paths are untouched; they simply have no synthetic entries to display.

## Source identity

Deleting the simulation removes the `line-N` / slot-keyed telemetry identity assumptions along with it. No replacement identity system is built here. Legacy `camN` playback compatibility for manual/legacy slots is deliberately left intact — this is not a legacy-retirement pass.

## Tests

New/updated tests covering: inspector renders no fabricated codec/resolution/bitrate/loss/RTT/LUFS and shows unavailable states instead of zeros; no audio meter element renders; no sparkline data renders; the Quinn timeline bridge and simulator no longer exist as importable emitters; a dedicated regression test proving no code path can produce a PTS-discontinuity entry without a real telemetry input; and unchanged behaviour for pane states, Provisioning Failed, caller-first dynamic playback, guest monitoring, and Phase D End Session. Full suite plus TypeScript run at the end.

## Out of scope

FFmpeg/SRT/MediaMTX telemetry, `getStats()`, real bitrate/loss/RTT, real audio metering, LUFS, telemetry persistence or tables, new graphs, new alerts or thresholds, right-rail redesign. Untouched: provisioning, caller infrastructure, Phase D leases, teardown/reconciliation, anonymous guest architecture, auth/RLS, sharing, Ops, Friendly Name punctuation, My Sources. The sealed `/explore` demo keeps its clearly-labelled demo data. No publish.
