// Phase E.5B — bounded evidence payload for browser-observed audio silence.
//
// Only fields the E.3 contract genuinely provides are included, and the
// provenance stays `browser_webrtc_pcm`. A browser observation is never
// converted into an `rtsp_publication` observation. No audio samples are
// persisted — one snapshot on open, one on recovery.

import type { BrowserAudioLevelSnapshot } from "@/lib/telemetry/browser-audio-contract";
import { isStereo } from "@/lib/telemetry/browser-audio-contract";
import type { AudioSilenceConfig } from "./audio-silence-detector";

export interface AudioLevelEvidencePayload extends Record<string, unknown> {
  observation_point: "browser_webrtc_pcm";
  status: "observed";
  unit: "dBFS";
  channel_mode: "mono" | "stereo";
  levels: Record<string, { rms_dbfs: number; peak_dbfs: number }>;
  captured_at: string | null;
  detector: {
    id: string;
    version: string;
    config: {
      enterDbfs: number;
      enterMs: number;
      exitDbfs: number;
      exitMs: number;
      maxObservationGapMs: number;
    };
  };
}

/**
 * Genuine per-channel values are retained even though the detector decision
 * uses the loudest channel: the evidence must show what actually supported it.
 */
export function buildAudioLevelEvidence(
  measurement: BrowserAudioLevelSnapshot,
  config: AudioSilenceConfig,
  capturedAtFallback: string,
): AudioLevelEvidencePayload {
  const levels: AudioLevelEvidencePayload["levels"] = {};
  if (isStereo(measurement)) {
    levels.left = {
      rms_dbfs: measurement.left!.rmsDbfs,
      peak_dbfs: measurement.left!.peakDbfs,
    };
    levels.right = {
      rms_dbfs: measurement.right!.rmsDbfs,
      peak_dbfs: measurement.right!.peakDbfs,
    };
  } else if (measurement.mono) {
    levels.mono = {
      rms_dbfs: measurement.mono.rmsDbfs,
      peak_dbfs: measurement.mono.peakDbfs,
    };
  }

  return {
    observation_point: "browser_webrtc_pcm",
    status: "observed",
    unit: "dBFS",
    channel_mode: isStereo(measurement) ? "stereo" : "mono",
    levels,
    captured_at: measurement.observedAt ?? capturedAtFallback,
    detector: {
      id: config.detectorId,
      version: config.detectorVersion,
      config: {
        enterDbfs: config.enterDbfs,
        enterMs: config.enterMs,
        exitDbfs: config.exitDbfs,
        exitMs: config.exitMs,
        maxObservationGapMs: config.maxObservationGapMs,
      },
    },
  };
}
