# Phase E.5 — Engineering Incident Detection & Evidence Foundation (audit + plan)

Audit only. No application code, schema, migration, Edge Function, infrastructure or publish action was changed while producing this.

## What MAKO can honestly observe today (verified)

- E.2 media metadata: server-observed, route-keyed, provenance `rtsp_publication` / `ffmpeg_input`, fetched **once per route** with bounded retries and cached (`src/hooks/use-media-telemetry.ts`). No polling, so it is a single point observation, not a change stream.
- E.3 browser audio: real decoded PCM RMS/peak dBFS per received stream, passive analyser graph, honest mono/stereo test (`src/hooks/use-browser-audio-levels.ts`, `browser-audio-contract.ts`).
- Playback/connection state: `LiveCameraState` (connecting / live / no_video / reconnecting / misconfigured / failed).
- Runtime identity: `session_runtime_routes.id` is the canonical key; history in `session_runtime_route_history`.
- Transport (RTT, loss, bitrate) is genuinely not measured and stays that way.

Finding worth flagging: `src/lib/quinn-store.ts` still holds seeded mock incidents, fabricated events (packet loss %, freeze ms, bitrate drops) in localStorage, consumed by `IncidentList`, `IncidentDetailDrawer`, `quinn-pdf.ts`, `session-report-pdf.ts`. This survived the E.1A purge and must be retired by E.5, not extended.

## 1. Reusable

`session_runtime_routes` / `_history` (identity + lifecycle), `session_timeline_entries` (collaboration, replies, resolve, RLS already correct via `is_session_owner` / `has_session_access`), `use-session-timeline`, `use-quinn-incidents` (aggregation shape, to be repointed at real incidents), `browser-audio-registry` (already the right way to get at received media without a second WHEP), E.2/E.3 contracts, `InspectorPanel`, `session-report-pdf`.

## 2. Untouched

LiveCamera WHEP negotiation/reconnect logic (read-only additions only via the registry), provisioning, leases, teardown/reconciliation, auth/guest ownership/claim, sharing, Ops, MediaMTX/FFmpeg/DigitalOcean, E.2 and E.3 contracts.

## 3. Incident data model (recommended: dedicated tables)

Timeline entries cannot carry detector version, thresholds, start/end/duration, evidence snapshots or investigation state without abusing `metadata`. Recommend two new tables (created in a later phase, not now):

- `signal_incidents` — id, session_id, runtime_route_id, slot, source_name, incident_type, detector_id, detector_version, threshold jsonb, observation_point, state (`open|recovered`), workflow_status (`new|acknowledged|investigating|resolved`), observed_started_at / observed_ended_at (browser-measured), detected_at, server_received_at / server_persisted_at, duration_ms, recovery_note, acked_by/at, assigned_to, resolution_note, created_at.
- No detector-chosen severity. Detectors record objective classification and duration only; severity becomes workflow/configuration logic in a later phase, never inferred inside the detector.
- Deduplication identity: `(session_id, runtime_route_id, incident_type, observed_started_at window)`. The first detector client to satisfy the threshold establishes the incident via an idempotent server write (e.g. an upsert keyed on that identity); other engineers' clients corroborate the same incident (corroboration count) rather than creating duplicates.
- `signal_incident_evidence` — id, incident_id, phase (`pre|event|post`), captured_at, observation_point, payload jsonb (telemetry snapshot only), optional still_image_path.

One Timeline entry is written per incident as a cross-reference so engineers see incidents in the collaboration stream; the incident row stays the source of truth. Types: `black_video`, `frozen_video`, `audio_silence`, `signal_loss`, `format_change`. `video_corruption` deferred.

## 4. Evidence model (smallest defensible package)

Per incident: pre-event snapshot (last known good), event snapshot, post/recovery snapshot. Each is a structured JSON capture of E.2 video/output-audio fields, E.3 audio level state, playback state, and the detector measurements that crossed threshold — with `status`/provenance preserved, absent values staying unavailable. Optional single JPEG still frame from the existing `<video>` element via canvas, capped and only for video incidents. No continuous recording, no clips in phase one, no cloud DVR.

## 5. Detector architecture

Deterministic detector layer, entirely separate from Quinn:

```text
observation source (E.2 snapshot | E.3 PCM levels | playback state | video frames)
  -> detector (pure state machine: enter/sustain/exit, hysteresis)
  -> incident candidate (route-keyed, timestamped)
  -> persistence (server-authoritative) -> Timeline cross-reference
  -> Quinn reads persisted incidents only
```

Each detector: id, version, config `{ enterThresholdMs, exitThresholdMs, ...typed params }`, pure `evaluate(sample, state)`. Thresholds live in a typed per-detector config module (defaults, overridable per session later) — never hard-coded inside detector logic, never shared between detector types.

## 6. Black video

Sample the existing received video element into a small offscreen canvas (e.g. 32×18) at a low rate (2–4 Hz) via the same registry pattern used for audio — no second WHEP, no second receiver. Compute mean/max luma. Enter only when: a video track exists and is `live`, playback state is `live`, decoded frames are advancing (`framesDecoded` via `pc.getStats` or `requestVideoFrameCallback` ticks), and luma stays below threshold for the sustained duration. Disconnected playback, no video track, canvas/readback failure (tainted or zero-sized) and hidden tabs all yield `unavailable`, never black. Document that a hidden tab throttles rAF — measurement pauses honestly rather than reporting black.

## 7. Freeze

Same sampled-frame pipeline; compare consecutive downscaled luma grids (mean absolute difference plus a coarse perceptual hash). Freeze requires MAD below a small tolerance for the sustained window **and** confirmation that frames are still being decoded — connection state alone is never freeze. False-positive safeguards: static-content tolerance (require a prior period of genuine change before arming), noise-floor tolerance so encoder-quiet slates don't trip instantly, per-source enable/disable so legitimately static cameras, scoreboards and test patterns can be exempted, and clear labelling that this is a browser-decoded observation.

## 8. Audio silence (E.3)

State machine over the existing measured PCM snapshot: enter when the measured level (mono, or both channels for genuine stereo) stays at/below a configurable dBFS threshold for a configurable duration; exit with hysteresis (higher recovery threshold + shorter confirm window). Status `not_measured`/`unavailable` never counts as silence. Never labelled source/SRT audio, never LUFS.

## 9. Format change (E.2)

Requires two trusted observations. E.2 currently probes once per route, so E.5 must add explicit re-observation (operator-triggered refresh, plus a low-frequency bounded re-probe) before change detection is meaningful. Compare only `observed` fields: resolution, frame rate, codec, profile, scan/field order, output audio format. First observation establishes a baseline and never emits an incident; a transition from observed → unavailable is a measurement gap, not a change.

## 10. Video corruption / breakup — defer

Not currently defensible. Browser pixels cannot distinguish compression artifacts from legitimate content, and MAKO has no transport telemetry to corroborate. Recommend deferring until E.4 network telemetry exists; if a visual anomaly model is added later it must be labelled advisory inference, never deterministic transport evidence.

## 11. Timestamps

Persist server-authoritative UTC (`now()` at write time) as the record's canonical persistence time — but server write time is NOT the incident time. Detection happens in the browser and may be submitted only after the sustained threshold is met, so the record keeps both, each with provenance: `observed_started_at` / `observed_ended_at` (browser-measured wall-clock UTC, anchored with `performance.now()` and a client/server clock offset), and `server_received_at` / `server_persisted_at` (server UTC). A 1.2-second black incident therefore shows its true observed start, not a submission-delayed one. Precision claim: tens of milliseconds for audio, sampling-interval bounded (~250–500 ms) for video detectors. Explicitly not frame-accurate. UI shows UTC plus operator-local time.

## 12. Persistence lifecycle

Incidents persist independently of the live condition: recovery sets `ended_at`/`state=recovered` and never deletes. They survive session completion, refresh, logout and route teardown (route id retained as a plain reference, with source name/slot snapshotted so archival cannot erase context). No cascade delete from route teardown.

## 13. Collaboration / RLS

Reuse exactly the timeline model: SELECT for `is_session_owner(...) OR has_session_access(...)`; workflow writes (ack, notes, assign, resolve) for participants; detector-produced rows written server-side. Explicit GRANTs for `authenticated` + `service_role` on both new tables. No access to other sessions, Sources or another owner's library. Guest (anonymous) identities behave as today. No authorization change in this phase.

## 14. Export / report

Extend the existing PDF/JSON utilities into an incident report: identity, source/session, UTC + local timestamps, duration, detector id/version/threshold, observation point, triggering measurements, pre/event/post snapshots, engineer notes and resolution, plus a mandatory "Observed facts" vs "Cause: not established by MAKO" separation. JSON export for machine correlation by a networking team. Retire `quinn-store` seeds as part of this.

## 15. Quinn

Quinn reads persisted incidents and evidence only, and may summarize, correlate, group and answer questions while citing incident ids and measured values. It cannot create, modify or infer incidents, and cannot claim unmeasured telemetry or cause. The existing truth constraint in `quinn-chat` is tightened to "cite incident ids and measured evidence or say it is not measured".

## 16. Sequence

- E.5-Truth (this build, first): remove all synthetic Quinn incident/event/alert seed data and fabrication paths from `quinn-store.ts`; IncidentList/DetailDrawer kept and repointable; honest empty state "No signal incidents observed."; incident PDFs / session reports produce truthful zero-incident output; Quinn receives empty incident data, not mock events; any demo data stays isolated in `/explore` and clearly labelled. New truth-cleanup tests proving zero synthetic incidents, no fabricated packet loss/bitrate/freeze values, honest empty state, and demo isolation. Full suite + TypeScript. No publish, deploy, or schema change.
- E.5A: incident + evidence tables (with dedupe identity, dual observed/server timestamps, no detector severity), RLS/GRANTs, typed contracts, no detectors.
- E.5B: audio silence detector (E.3) end to end, first real incident (proves the full lifecycle before video analysis).
- E.5C: black video detector + frame sampler.
- E.5D: freeze detector + false-positive safeguards + per-source exemption.
- E.5E: E.2 re-observation + format-change detector.
- E.5F: workflow (ack, notes, assign, resolve) + Timeline cross-reference.
- E.5G: export/report against real incidents.
- E.5H: Quinn consumption, read-only.
- Deferred: corruption detection, evidence clips, E.4 transport.

## 17. Risks / limitations

Hidden-tab throttling pauses browser detectors; canvas readback cost on 4-up layouts; multiple engineers viewing the same session would each detect the same condition (needs server-side dedupe by route + type + time window); guest sessions have no long-lived identity for follow-up; E.2's single probe limits format-change fidelity until re-observation exists; browser stereo is often upmixed; no transport corroboration for any video detector.

## 18. Tests per phase

Schema/RLS: owner sees, collaborator sees, outsider denied, GRANTs present, incident survives teardown/session completion. Detectors: pure state-machine unit tests for enter/sustain/exit/hysteresis, threshold configurability, `unavailable`/`not_measured` never triggering, disconnected playback never black, static-content tolerance, first observation never a format change. Integration: incident persists after recovery and refresh, evidence snapshots carry provenance, no synthetic values anywhere. Export: report contains observed-vs-unconfirmed-cause separation. Quinn: cannot emit an incident, cannot cite unmeasured telemetry.

## 19. Confirmation

No application code, database schema, migration, Edge Function, DigitalOcean, FFmpeg, MediaMTX, auth, RLS or published artifact was modified during this audit. Reads and one read-only policy query only.
