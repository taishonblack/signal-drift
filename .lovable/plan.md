# Phase E.5A — Signal Evidence & History Architecture Audit

Audit only. Nothing was implemented, deployed, published, or migrated in this turn.

Important correction up front: the persistent incident/evidence foundation you asked me to audit **already exists in this project** (built in the previous E.5A build). This audit therefore reports what is actually present, what is genuinely missing, and where the first detector should attach.

---

## 1. Existing telemetry architecture

### E.2 — server media metadata (`rtsp_publication`)
Path, as implemented:

```text
MAKO caller API  GET /pull-sources/{src_id}/telemetry/media
  -> supabase/functions/media-telemetry/index.ts   (JWT required; authorize.ts checks
     route owner OR non-revoked shared access; MAKO_API_TOKEN stays server-side;
     returns only {source_id, playback_path, observed_at, observation_point, video, audio_output})
  -> src/lib/telemetry/media-metadata.ts           (defensive parse, rational frame rate)
  -> src/lib/telemetry/provider.ts                 (MediaTelemetryBridgeProvider, typed failures)
  -> src/hooks/use-media-telemetry.ts              (keyed by session_runtime_routes.id,
     fetch ONCE per route + bounded retries [2000,4000], cached per route id, no polling,
     late responses from replaced routes discarded)
  -> src/components/InspectorPanel.tsx
```

Contract: `src/lib/telemetry/contract.ts` — `Observed<T>` = `{value, observedAt, source, status}`; status `observed | unavailable | stale | not_measured`; observation point `ffmpeg_input | rtsp_publication`; `freshness()` downgrades to `stale` after 30 s; `snapshotForRoute()` resolves strictly by route id. Transport and receiver groups are all `not_measured` (E.4 deferred). Source audio stays `unavailable`.

**Where it disappears:** entirely. It lives in a React `useRef` cache inside the hook. Unmounting the Session Room, refreshing, or route teardown erases every observation. There is exactly one probe per route, so there is currently no second observation to compare against — this is the gating gap for format-change detection.

### E.3 — browser audio level (`browser_webrtc_pcm`)
```text
LiveCamera WHEP RTCPeerConnection (one per playback path; long-lived MediaStream)
  -> src/lib/telemetry/browser-audio-registry.ts (publish/clear/subscribe by playback path)
  -> src/hooks/use-browser-audio-levels.ts (AudioContext -> MediaStreamAudioSourceNode ->
     splitter + 2 analysers; passive, never connected to destination; stereo claimed only
     when the two PCM blocks actually differ; rAF tick)
  -> src/components/InspectorPanel.tsx (BROWSER AUDIO LEVEL meters)
```
Contract: `src/lib/telemetry/browser-audio-contract.ts` (separate from E.2, correctly). Math: `src/lib/telemetry/browser-audio-levels.ts` (RMS/peak, dBFS floor −60, ceiling 0).

**Where it disappears:** every frame. Nothing is retained beyond the current React state; the Inspector must be mounted for the measurement to exist at all.

---

## 2. Existing database/history systems

| TABLE | PURPOSE / KEY COLUMNS | RLS | WRITERS | READERS / UI | E.5 REUSE |
|---|---|---|---|---|---|
| `signal_incidents` | the incident ledger: type, detector id/version, threshold jsonb, observation_point, state, workflow_status, `observed_started_at/ended_at`, `detected_at`, `server_received_at/persisted_at`, duration_ms, corroboration_count, workflow fields | SELECT only for participants; no client INSERT/UPDATE/DELETE | `submit_signal_incident`, `recover_signal_incident` (SECURITY DEFINER) | `use-signal-incidents.ts` (not yet mounted in any screen) | **primary target** |
| `signal_incident_evidence` | pre/event/post snapshots: phase, captured_at, observation_point, payload jsonb, still_image_path | SELECT follows parent incident | same two routines | `fetchIncidentEvidence` | **primary target** |
| `session_timeline_entries` | human/Quinn narrative: author, source_id/name, entry_type, message, severity, parent_id, status, resolved_*, metadata | participant SELECT; participant INSERT; author/owner UPDATE/DELETE | client + Quinn | `use-session-timeline`, `TimelinePanel` | cross-reference only |
| `session_runtime_routes` / `_history` | live vs archived caller identity, lifecycle/connection status | owner-scoped, service-role writes | provisioning / teardown | Session Room | identity anchor |
| `session_sources`, `sessions`, `shared_session_access`, `session_lease_holders` | attachment snapshots, session state, collaboration grants, per-tab leases | owner/participant | existing flows | existing UI | unchanged |

No table stores raw telemetry samples, and none should.

---

## 3. Timeline audit

Timeline today is **narrative**: manually authored operator notes plus Quinn commentary, persisted per session for signed-in users, ephemeral (BroadcastChannel) for guests. It has severity, threading, resolution, and source name/id, but no observation point, no detector identity, no threshold, no dual observed/server timestamps, and no evidence rows.

Recommendation: **D (combination), weighted to C.** Incidents stay in `signal_incidents` as the engineering system of record; one Timeline entry per incident acts as a human-visible cross-reference so engineers keep a single conversational thread. Reusing Timeline as the ledger would lose provenance and re-open the fabricated-metric risk; ignoring Timeline entirely would split collaboration into two feeds.

---

## 4. Collaboration architecture

Reuse as-is: `is_session_owner()`, `has_session_access()`, `shared_session_access` (with `revoked_at`), `sessions.pin_hash` + `verify_session_pin`, anonymous Supabase identities for Temporary Operators, and the Timeline RLS pattern. The incident policies already follow exactly this model, so authorized participants see that session's incidents and nothing else — no Sources library, no other sessions, no infrastructure controls (those remain service-role only).

Gap: incident **workflow** writes (acknowledge/assign/resolve) have no path yet — SELECT is the only client privilege. That belongs in E.5F via a definer routine, not a broadened policy.

---

## 5. Session / source / slot identity

- PERMANENT: `owner_id`, `sessions.id`, incident/evidence ids.
- SESSION-SCOPED: slot, `session_sources` attachment.
- RUNTIME-ONLY: `session_runtime_routes.id`, `playback_path` (`src_xxxxxx-opus`), `infrastructure_source_id`. Routes are archived and deleted on teardown; `session_sources.runtime_route_id` is nulled for detached historical rows.
- HISTORICAL: `session_runtime_route_history`.
- USER-EDITABLE: friendly name.

Consequence, already handled correctly in the ledger: `runtime_route_id` is a **plain nullable reference with no FK cascade**, and `source_name` + `slot` are **snapshotted onto the incident row**. Evidence therefore survives teardown, session completion, refresh, and logout.

---

## 6. Evidence provenance

Already represented: `observed_at`, observation point, source/provider, status (`observed|unavailable|stale|not_measured`), value, unavailable/not-measured semantics, staleness. `IncidentObservationPoint` deliberately keeps `browser_webrtc_pcm`, `browser_decoded_video`, `rtsp_publication`, `ffmpeg_input`, `playback_state` distinct and never merges them.

Missing for a truthful persisted record: **units are implicit** (dBFS, Hz, px, ms live only in field names), and evidence payloads are free-form `jsonb` with no schema enforcement. A small documented payload shape per observation point is the only provenance work E.5 needs.

---

## 7. Change-detection layers (feasibility only)

| Observation | Correct layer |
|---|---|
| audio floor reached / recovered / material level change | pure state machine over the existing E.3 hook output — thresholds and durations configurable, `not_measured` never counts as silence |
| black video, freeze | sampled canvas reads of the existing received video (2–4 Hz), gated on a live track and advancing frames |
| resolution / frame rate / codec change | comparison of two trusted E.2 observations — **blocked today**: only one probe per route exists, so E.2 needs bounded re-observation first; a first observation is a baseline, never a change |
| video/audio metadata disappeared | E.2 `observed -> unavailable` transition = a gap, not a change |
| signal unavailable / recovered | existing `LiveCameraState` playback state |

Only transitions are persisted; sample streams never are.

---

## 8. Browser telemetry trust boundary

Every writer must be an authenticated Supabase identity (including anonymous Temporary Operators), and `submit_signal_incident` already re-checks `is_session_owner OR has_session_access` inside the definer routine and ignores any client-claimed identity. Browser observations are **trusted as browser observations only** — persisted with `browser_webrtc_pcm` / `browser_decoded_video` provenance, plus separate `server_received_at` / `server_persisted_at`, so a submitted value can never be presented as a server measurement. Server-owned dedupe (same `session_id` + `runtime_route_id` + `incident_type` within the correlation window) means four engineers watching Camera 3 corroborate one incident instead of creating four.

---

## 9. Engineering annotation capability

`session_timeline_entries` already supports threaded, authored, resolvable notes and is the right home for free-text engineering commentary. Incident-bound outcomes (`recovery_note`, `resolution_note`, `acked_by`, `assigned_to`) already exist on the incident row. No new annotation model is needed; the missing piece is a link field or Timeline `metadata.incident_id` cross-reference.

---

## 10. Quinn boundary

Today `supabase/functions/quinn-chat/index.ts` accepts an incident/event `context` **from the client** and only forbids invention by prompt. The needed boundary: Quinn reads persisted incidents and evidence server-side by session id, under the same authorization, and receives no client-supplied telemetry at all. Not part of E.5B.

---

## 11. Persistence strategy

- **A raw samples** — rejected: unbounded growth, no engineering benefit.
- **B transitions only** — safe and cheap, but reconstruction is thin.
- **C transitions + bounded pre/event/post snapshots** — **recommended**; already what the schema expresses.
- **D reuse Timeline** — rejected as the ledger for the provenance reasons in §3.

## Recommended E.5 architecture

Keep exactly what exists: detector (pure state machine) → trusted definer submit/recover with server dedupe → `signal_incidents` + up to three `signal_incident_evidence` rows → Timeline cross-reference → Quinn last. Add nothing structural.

## Confirmed gaps

1. No detector exists — the ledger is unreachable in normal operation.
2. `use-signal-incidents` is not mounted in any screen; `IncidentList` still reads the emptied `quinn-store`.
3. No client path for workflow transitions (ack/assign/resolve).
4. E.2 observes each route once, so format change is not yet possible.
5. Evidence payload shapes and units are undocumented.
6. Quinn context still arrives from the client.

## Risks

Fabrication regression, write storms from an unbounded detector, hidden-tab rAF throttling producing false recovery, teardown identity loss (mitigated by snapshotted name/slot), guest identity lifespan, duplicate event systems, provenance flattening in reports.

---

## Proposed E.5B scope (small, next build)

1. Pure, unit-tested audio-silence state machine over existing E.3 output: configurable `enterDbfs`, `enterMs`, `exitDbfs`, `exitMs`; `not_measured`/`unavailable` never counts as silence.
2. One submission on threshold satisfaction with `observedStartedAt` + `detectedAt` and a single `event` evidence snapshot; one `recover_signal_incident` call on exit with `observedEndedAt`.
3. Documented evidence payload shape for `browser_webrtc_pcm` (dBFS values with units, channel mode).
4. Repoint `IncidentList` at `useSignalIncidents`, keeping "No signal incidents observed." when empty.
5. Tests: state machine, threshold configurability, unavailable-never-triggers, one incident from multiple observers, survival across refresh.

Out of scope for E.5B: black/freeze detection, format change, workflow writes, export, Quinn, E.4 transport.
