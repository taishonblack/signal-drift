# Phase E.5B — Browser Audio Silence Incident Detector (revised)

First real detector. It connects the existing E.3 browser audio measurement to the existing incident ledger and proves: real observation → deterministic detector → persisted incident → recovery. No AI, no new tables, no UI redesign.

Confirmed present by inspection, so nothing new is created: `signal_incidents`, `signal_incident_evidence`, `submit_signal_incident` (defaults evidence phase `event`), `recover_signal_incident` (defaults evidence phase `post`), participant authorization inside both routines, 90-second server correlation window with advisory locking, and the typed contracts in `src/lib/incidents/*`.

---

## 1. Pure detector — `src/lib/incidents/audio-silence-detector.ts` (new)

Framework-free state machine, fed one measurement at a time as `(snapshot, observedAtMs)`, returning the new state plus an intent (`open_condition`, `close_condition`, or nothing). It knows nothing about Supabase.

Condition states: `normal`, `pending_silence`, `silence`, `pending_recovery`.

- `normal` → measured level below `enterDbfs` → `pending_silence`, recording the first qualifying observation time.
- `pending_silence` sustained ≥ `enterMs` → `silence`, emitting one `open_condition` carrying `observedStartedAt` (first qualifying observation) and `detectedAt` (the observation that satisfied the duration).
- `pending_silence` rising above `enterDbfs` before `enterMs` → `normal`, no condition.
- `silence` → above `exitDbfs` → `pending_recovery`, recording the first qualifying recovery observation.
- `pending_recovery` sustained ≥ `exitMs` → `normal`, emitting one `close_condition` carrying `observedEndedAt` (that first qualifying recovery observation).
- `pending_recovery` falling back below `exitDbfs` → `silence`, no recovery.
- Any `not_measured`, `unavailable`, `stale`, absent snapshot or missing channel: pending windows are discarded, no state advances. Never silence, never recovery.

Decision input is `max(left, right)` for stereo so one live channel prevents an `audio_silence` incident. This phase detects total audio silence only; single-channel loss is a separate future detector.

## 2. Detector condition vs persistence state — separate concerns

The detector reports what was **observed**. A separate persistence layer in the binding hook tracks what was actually **written**:

`unpersisted → persisting → persisted` for the open condition, and the same for the close.

- A failed submit never marks the incident persisted; the condition stays observed and unpersisted.
- Retry is bounded (fixed small attempt budget with backoff, e.g. ~2 s / 8 s / 30 s), scheduled on a timer — never per audio frame, never per animation frame.
- Every retry re-sends the **same logical identity**: same session, runtime route, incident type, and the same `observedStartedAt`. The server's create-or-corroborate path plus the 90-second correlation window makes that idempotent from the product's point of view, so retries cannot create duplicate rows.
- Recovery follows the same rule: observed recovery and persisted recovery are separate facts. Recovery is only attempted once an incident id is known; if the open write never succeeded there is nothing to recover, and that is reported truthfully rather than faked.
- If the attempt budget is exhausted, local state honestly records "observed, not persisted"; nothing is fabricated, and the limitation is stated in the implementation report.

## 3. Named configuration

Exported `AUDIO_SILENCE_DETECTOR_CONFIG` with `enterDbfs`, `enterMs`, `exitDbfs`, `exitMs`, `maxObservationGapMs`, `detectorId`, `detectorVersion`; the detector accepts an override, so no threshold appears in UI code. No settings screen in E.5B.

Initial values for implementation review:

| Setting | Value |
|---|---|
| `enterDbfs` | −55 |
| `enterMs` | 3000 |
| `exitDbfs` | −45 |
| `exitMs` | 1000 |
| `maxObservationGapMs` | 2000 |

Rationale: these are initial conservative engineering defaults intended to reduce nuisance detections while still recognising sustained near-floor audio, chosen relative to the existing E.3 floor of −60 dBFS and its 10 dB of hysteresis between enter and exit. They are not a claim about any particular programme material, and they stay named and configurable so they can be tuned from real MAKO production observations.

## 4. Observation gaps

Elapsed time comes from observation timestamps, never from frame counts. When the interval between two valid observations exceeds `maxObservationGapMs`, the pending window **restarts from the new observation** — the unseen interval is never counted toward `enterMs` or `exitMs`, in either direction. Silence at T0 and silence again at T+5s with nothing in between is two seconds of nothing plus a fresh boundary, not five continuous seconds. A hidden or throttled tab therefore cannot manufacture silence duration or recovery duration.

## 5. React binding — `src/hooks/use-audio-silence-detection.ts` (new)

Consumes the existing E.3 snapshot for one runtime route, drives the detector, owns the persistence state machine above, and writes exclusively through the existing `submitIncidentCandidate` / `recoverIncident` helpers — never directly to the tables. It supplies session id, runtime route id, slot, friendly-name snapshot, `observation_point: "browser_webrtc_pcm"`, threshold config and detector id/version. Owner identity comes from the server routine; the browser cannot supply or override it.

Route scoping: keyed by `runtimeRouteId`. On route replacement, stream removal, teardown or unmount, detector state, pending windows, retry timers and any tracked incident id are all dropped — so an incident opened on Route A can never be recovered by observations from Route B.

Mounted where the E.3 measurement already runs, with no visual change; existing meters behave exactly as today.

## 6. Evidence, using the existing phase contract

- **Incident open → phase `event`**, matching `submit_signal_incident`'s own default: the snapshot describes the measured condition at the moment the threshold was satisfied.
- **Incident recovery → phase `post`**, matching `recover_signal_incident`'s default: the snapshot describes the measured state after the condition ended.

No `pre` snapshot in E.5B (no retained buffer exists). Two evidence rows maximum per incident lifecycle; no sample streams are persisted.

Payload, using only real E.3 contract fields, with genuine per-channel values retained even though the decision uses the loudest channel:

```json
{
  "observation_point": "browser_webrtc_pcm",
  "status": "observed",
  "unit": "dBFS",
  "channel_mode": "stereo",
  "levels": {
    "left":  { "rms_dbfs": -59.8, "peak_dbfs": -58.1 },
    "right": { "rms_dbfs": -60.0, "peak_dbfs": -59.4 }
  },
  "captured_at": "<E.3 observedAt>",
  "detector": { "id": "...", "version": "...", "config": { "enterDbfs": -55, "enterMs": 3000, "exitDbfs": -45, "exitMs": 1000 } }
}
```
A mono observation carries `channel_mode: "mono"` with a single `mono` entry. Nothing is converted into an `rtsp_publication` observation.

## 7. Incident type and deduplication

Type `audio_silence` from the existing union. No severity — objective classification and duration only.

Deduplication stays entirely server-owned: multiple engineers each submit, and the routine matches an existing open/recent incident on session + runtime route + type under an advisory lock, recording corroboration instead of a new row. Nothing is deduplicated in localStorage or React state.

## 8. Tests — `src/test/audio-silence-detector.test.ts` (new)

All 18 required cases, plus persistence-separation cases: failed submit does not mark persisted; bounded retry re-sends the same logical identity and does not duplicate; retry is not per-frame; observed recovery without a persisted incident does not claim recovery. Existing tests are not weakened. Then the full suite and the TypeScript check.

---

## Explicitly not in this phase
Black video, freeze, format change, transport/E.4, Quinn, Timeline, workflow ack/assign/resolve, exports, `IncidentList` repointing, any E.2 change, any schema/RLS/Edge Function/auth/session-lifecycle/SRT-caller change. Nothing published or deployed.
