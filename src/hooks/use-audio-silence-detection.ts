// Phase E.5B — binds the pure audio-silence detector to one runtime route.
//
// It consumes the existing E.3 measurement (no second WHEP, no new receiver),
// drives the deterministic detector, and persists exclusively through the
// existing trusted routines. The browser never writes to the incident tables
// and never supplies owner identity — the server routines own authorization
// and deduplication.

import { useEffect, useRef, useState } from "react";
import { useBrowserAudioLevels } from "@/hooks/use-browser-audio-levels";
import {
  AUDIO_SILENCE_DETECTOR_CONFIG,
  initialAudioSilenceState,
  stepAudioSilenceDetector,
  type AudioSilenceConfig,
  type AudioSilenceDetectorState,
} from "@/lib/incidents/audio-silence-detector";
import {
  AudioSilenceReporter,
  type AudioSilenceReporterDeps,
  type AudioSilenceReporterSnapshot,
} from "@/lib/incidents/audio-silence-reporter";
import { recoverIncident, submitIncidentCandidate } from "@/lib/incidents/incidents-remote";

export interface AudioSilenceTarget {
  sessionId: string;
  /** Canonical runtime identity. Detection is skipped without it. */
  runtimeRouteId: string | null | undefined;
  slot: number | null | undefined;
  sourceName: string;
  /** Playback path used by the existing received-stream registry. */
  streamName: string | null | undefined;
}

const defaultDeps: AudioSilenceReporterDeps = {
  submit: submitIncidentCandidate,
  recover: recoverIncident,
  schedule: (fn, ms) => setTimeout(fn, ms),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function useAudioSilenceDetection(
  target: AudioSilenceTarget,
  options?: { config?: AudioSilenceConfig; deps?: AudioSilenceReporterDeps; enabled?: boolean },
) {
  const config = options?.config ?? AUDIO_SILENCE_DETECTOR_CONFIG;
  const enabled = options?.enabled ?? true;
  const levels = useBrowserAudioLevels(enabled ? target.streamName ?? null : null);

  const [state, setState] = useState<AudioSilenceDetectorState>(initialAudioSilenceState);
  const [persistence, setPersistence] = useState<AudioSilenceReporterSnapshot | null>(null);
  const stateRef = useRef<AudioSilenceDetectorState>(initialAudioSilenceState());
  const reporterRef = useRef<AudioSilenceReporter | null>(null);

  const routeId = target.runtimeRouteId ?? null;

  // Detector state is scoped to the authoritative runtime route: a replacement
  // route never inherits pending state, and an incident opened on route A can
  // never be recovered by observations from route B.
  useEffect(() => {
    stateRef.current = initialAudioSilenceState();
    setState(stateRef.current);
    setPersistence(null);
    if (!enabled || !routeId) {
      reporterRef.current = null;
      return;
    }
    const reporter = new AudioSilenceReporter(
      {
        sessionId: target.sessionId,
        runtimeRouteId: routeId,
        slot: target.slot ?? null,
        sourceName: target.sourceName,
      },
      options?.deps ?? defaultDeps,
      config,
    );
    reporterRef.current = reporter;
    return () => {
      reporter.dispose();
      reporterRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, target.sessionId, enabled, config]);

  useEffect(() => {
    if (!enabled || !routeId) return;
    // Observation time, not frame count: a throttled tab cannot fabricate a
    // duration, and a gap restarts the qualifying window in the detector.
    const observedAtMs = levels.observedAt ? Date.parse(levels.observedAt) : Date.now();
    const { state: next, intent } = stepAudioSilenceDetector(
      stateRef.current,
      levels,
      observedAtMs,
      config,
    );
    stateRef.current = next;
    setState(next);

    const reporter = reporterRef.current;
    if (reporter) {
      if (intent.kind === "open_condition") {
        reporter.observedOpen({
          observedStartedAt: intent.observedStartedAt,
          detectedAt: intent.detectedAt,
          measurement: intent.measurement,
        });
      } else if (intent.kind === "close_condition") {
        reporter.observedClose({
          observedEndedAt: intent.observedEndedAt,
          measurement: intent.measurement,
        });
      }
      setPersistence(reporter.snapshot());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels, enabled, routeId, config]);

  return { condition: state.condition, detectorState: state, persistence };
}
