# Phase E.5B.1 — Signal Inspector Deferred-Telemetry Cleanup

## Goal

Remove the visible TRANSPORT section (Bitrate, Packet Loss, RTT, and its "Not measured" caption) from the production Signal Inspector. E.4 SRT transport telemetry is deferred; the panel should show only what MAKO genuinely observes today. No placeholders, dashes-only section, or replacement claims are added.

## Current state (verified)

- `src/components/InspectorPanel.tsx` renders three `Section` blocks: Video, Transport, Audio (lines 194–196). The Transport section is built from a hardcoded `transportFields` array (lines 107–111) with all values `null`, so it always renders three "—" MetricItems plus the "Not measured" caption. Nothing observed ever appears in it.
- The telemetry contract (`src/lib/telemetry/contract.ts`), provider interfaces (`src/lib/telemetry/provider.ts`), `use-media-telemetry`, E.2 metadata, E.3 browser audio, E.5B history, and the F.1 diagnostic card all remain untouched — only the presentation block is removed.

## Changes

### 1. `src/components/InspectorPanel.tsx` (presentation only)

- Delete the `transportFields` array and the `<Section title="Transport" ... />` line.
- Update the component doc comment: note the Transport section is deferred until real SRT transport telemetry (E.4) exists, rather than "carries no measurements in this phase".
- No other section, prop, hook, diagnostic, or history change. Section flow becomes: diagnostic card (when a condition exists) → Video → Audio → Browser Audio Level → History.

### 2. Tests — update counts and assertions affected by the removal

- `src/test/telemetry-inspector.test.tsx`
  - "shows transport as not measured even when media is observed" → repurpose to assert the Transport section is absent: `queryByText("Transport")` is null, no "Bitrate" / "Packet Loss" / "RTT" labels, no RTT/120/Mbps values. The existing `getAllByText("Not measured")` count changes from 1 to 0 for this scenario.
  - "shows every field as unavailable when nothing is observed": count 3 → 2 (Video and Audio sections; Browser Audio Level uses "— Not measured", which does not match the exact-text query).
  - "shows no telemetry at all when no snapshot exists for the route": count 3 → 2.
- `src/test/telemetry-truth-pass.test.tsx`
  - "Signal Inspector shows unavailable states, never fabricated values": `getAllByText("Not measured")` count 3 → 2.
- `src/test/telemetry-e2b-integration.test.tsx`
  - "renders genuine video values plus MAKO's Opus output, and no source audio": with Video + output audio observed, no section shows the "Not measured" caption after removal, so the `toBeGreaterThan(0)` assertion becomes: Transport heading is absent, source-audio fields render "—", and no invented transport values appear.

### 3. New focused test — `src/test/inspector-transport-removal.test.tsx`

Asserts, on a panel rendered with a fully observed E.2 snapshot (existing `parseFfmpegMetadata` banner fixture):

1. No "Transport" heading renders (case-insensitive).
2. No "Bitrate", "Packet Loss", or "RTT" labels, and no "Not measured" caption from a transport block.
3. Genuine Video metadata still renders (codec, resolution, frame rate).
4. Genuine Audio/output metadata still renders (source codec, output codec, "128 kb/s (configured)").
5. The "Browser Audio Level" section heading still renders (unmeasured state shows "— Not measured").
6. A diagnostic card still renders when a playback condition exists (inject `playbackState` via the existing prop).
7. The "History" section heading still renders.

Truthfulness guard: assert the panel text contains no bitrate/RTT/packet-loss/latency claims.

## Boundaries (not touched)

Telemetry contracts, provider interfaces, `getTransportTelemetry`, E.2 media metadata, E.3 browser audio, E.5B detector/history, Signal Diagnostic Card, playback-state registry, connection/no-media diagnostics, WHEP behavior, incident detection, Timeline, Quinn, database schema, RLS, provisioning, session lifecycle.

## Verification

1. `bunx vitest run` — full suite must pass with no weakened assertions.
2. `bunx tsgo --noEmit -p tsconfig.app.json` — clean.
3. Nothing published or deployed.
