# Phase E.5B — Browser Audio Silence Incident Detector

First real detector. It connects the existing E.3 browser audio measurement to the existing incident ledger and proves: real observation → deterministic detector → persisted incident → recovery. No AI, no new tables, no UI redesign.

Confirmed present by inspection, so nothing new is created: `signal_incidents`, `signal_incident_evidence`, `submit_signal_incident`, `recover_signal_incident`, participant RLS via `is_session_owner` / `has_session_access`, server-owned correlation window, and `src/lib/incidents/*` typed contracts.

---

## What gets built

### 1. Pure detector module — `src/lib/incidents/audio-silence-detector.ts` (new)
A framework-free state machine. No React, no timers, no I/O. It is fed one measurement at a time as `(snapshot, observedAtMs)` and returns the state plus any action to take (`submit` / `recover` / nothing).

States: `normal`, `pending_silence`, `silence`, `pending_recovery`.

Transitions:
- `normal` → below `enterDbfs` → `pending_silence`, recording the first qualifying observation time.
- `pending_silence` sustained ≥ `enterMs` → `silence`, emitting exactly one `submit` with `observedStartedAt` = the first qualifying observation, `detectedAt` = the observation that satisfied the duration.
- `pending_silence` rising above `enterDbfs` before `enterMs` → back to `normal`, no incident.
- `silence` → above `exitDbfs` → `pending_recovery`, recording the first qualifying recovery observation.
- `pending_recovery` sustained ≥ `exitMs` → `normal`, emitting exactly one `recover` with `observedEndedAt` = the first qualifying recovery observation.
- `pending_recovery` falling back below `exitDbfs` → `silence`, no recovery.
- Any `not_measured`, `unavailable`, `stale`, absent snapshot, or missing channel: pending timers are discarded and no state is advanced. Never silence, never recovery.

### 2. Named configuration
Exported `AUDIO_SILENCE_DETECTOR_CONFIG` with `enterDbfs`, `enterMs`, `exitDbfs`, `exitMs`, `detectorId`, `detectorVersion`; the detector accepts a config override so nothing is hard-coded in UI.

Proposed conservative defaults, chosen against the existing E.3 behaviour (`DBFS_FLOOR = -60`, `isEffectivelySilent` at the floor, fast attack / 300 ms visual release):
- `enterDbfs: -55` — above the −60 floor so a genuine measurement at or near the floor qualifies, without treating quiet-but-present programme audio as silence.
- `enterMs: 3000` — three seconds of continuously measured floor-level audio; long enough that speech pauses, ad transitions and slates never trigger.
- `exitDbfs: -45` — 10 dB of hysteresis above the enter threshold, so a value hovering near one number cannot flap.
- `exitMs: 1000` — a full second of measured audio before the incident is closed.
Stereo: the loudest of L/R is used, so one live channel prevents a false silence.

### 3. React binding — `src/hooks/use-audio-silence-detection.ts` (new)
Subscribes to the existing E.3 snapshot for one runtime route, feeds the detector, and performs submissions through the existing `submitIncidentCandidate` / `recoverIncident` helpers only. Never writes to the tables directly. It supplies session id, runtime route id, slot, friendly-name snapshot, `observation_point: "browser_webrtc_pcm"`, threshold config and detector id/version; owner identity comes from the server routine, never the browser.

Route scoping: the hook is keyed by `runtimeRouteId`. On route replacement, stream removal, teardown or unmount, detector state and any tracked open incident id are dropped, so an incident opened on Route A can never be recovered by Route B.

Observation gaps: elapsed time is computed from observation timestamps, never from frame counts. A gap longer than a configured `maxObservationGapMs` (default 2000 ms) invalidates the pending window — MAKO records what it observed and refuses to claim what happened while it was not measuring. A hidden/throttled tab therefore produces no fabricated silence or recovery.

Wiring: mounted where the E.3 measurement already runs, with no visual change. Existing meters behave exactly as today.

### 4. Evidence payload (one `event` snapshot per incident, one on recovery)
```json
{
  "observation_point": "browser_webrtc_pcm",
  "status": "observed",
  "unit": "dBFS",
  "channel_mode": "mono | stereo",
  "levels": { "mono": { "rms_dbfs": -60, "peak_dbfs": -60 } },
  "captured_at": "<E.3 observedAt>",
  "detector": { "id": "...", "version": "...", "config": { "enterDbfs": -55, "enterMs": 3000, "exitDbfs": -45, "exitMs": 1000 } }
}
```
Only fields E.3 actually provides. No sample streams are persisted; two evidence rows maximum per incident lifecycle.

### 5. Incident type
`audio_silence`, from the existing `IncidentType` union. No severity is assigned — objective classification and duration only.

### 6. Deduplication
Entirely server-owned: several engineers watching the same slot each submit, and `submit_signal_incident` matches an existing open/recent incident on `session_id` + `runtime_route_id` + `incident_type` inside the correlation window and records corroboration instead of a new row. Nothing is deduplicated in localStorage or React state.

### 7. Tests — `src/test/audio-silence-detector.test.ts` (new)
All 18 required cases: normal audio, brief dip, sustained silence produces one incident, no duplicate submissions, brief recovery keeps the incident open, sustained recovery recovers once, `not_measured` never silence, `unavailable` never silence, gap does not manufacture silence, gap does not manufacture recovery, hysteresis prevents flapping, configuration override honoured, route replacement resets pending state, Route B cannot recover Route A, multiple observers rely on server dedupe, evidence payload carries `browser_webrtc_pcm` provenance and dBFS units, `observedStartedAt` is the qualifying boundary rather than submission time, `observedEndedAt` is the qualifying recovery boundary. Existing tests are not weakened.

Then the full suite and TypeScript check.

---

## Explicitly not in this phase
Black video, freeze, format change, transport/E.4, Quinn, Timeline, workflow ack/assign/resolve, exports, `IncidentList` repointing, any E.2 change, any schema/RLS/Edge Function/auth/session-lifecycle/SRT-caller change. Nothing is published or deployed.
