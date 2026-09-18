// Phase E.5B — pure audio-silence detector.
//
// Deterministic state machine over genuine Phase E.3 browser audio
// measurements (`browser_webrtc_pcm`). It contains no I/O, no timers, no React
// and no knowledge of persistence. It reports what was OBSERVED; whether an
// incident was written is a separate concern owned by the reporter.
//
// Truth rules enforced here:
//   - Only `status === "observed"` measurements can ever indicate silence.
//     not_measured / unavailable / missing snapshots are never silence.
//   - Elapsed time comes from observation timestamps, never frame counts.
//   - An observation gap restarts the qualifying window; the unseen interval is
//     never counted toward a duration threshold.

import type {
  BrowserAudioChannelLevel,
  BrowserAudioLevelSnapshot,
} from "@/lib/telemetry/browser-audio-contract";
import { hasAudioMeasurement } from "@/lib/telemetry/browser-audio-contract";

export interface AudioSilenceConfig {
  /** Measured level must fall below this to begin a silence window. */
  enterDbfs: number;
  /** Sustained duration below `enterDbfs` before a condition is declared. */
  enterMs: number;
  /** Measured level must rise above this to begin a recovery window. */
  exitDbfs: number;
  /** Sustained duration above `exitDbfs` before recovery is declared. */
  exitMs: number;
  /** Longer than this between two valid observations restarts the window. */
  maxObservationGapMs: number;
  detectorId: string;
  detectorVersion: string;
}

/**
 * Initial conservative engineering defaults, intended to reduce nuisance
 * detections while still recognising sustained near-floor audio. They are
 * chosen relative to the existing E.3 floor of -60 dBFS, with 10 dB of
 * hysteresis between enter and exit so a value near one threshold cannot flap.
 * They make no claim about any particular programme material and are expected
 * to be tuned from real MAKO production observations.
 */
export const AUDIO_SILENCE_DETECTOR_CONFIG: AudioSilenceConfig = {
  enterDbfs: -55,
  enterMs: 3000,
  exitDbfs: -45,
  exitMs: 1000,
  maxObservationGapMs: 2000,
  detectorId: "mako.audio_silence.browser_pcm",
  detectorVersion: "1.0.0",
};

export type SilenceConditionState =
  | "normal"
  | "pending_silence"
  | "silence"
  | "pending_recovery";

export interface AudioSilenceDetectorState {
  condition: SilenceConditionState;
  /** Start of the current qualifying window, in observation time. */
  pendingSinceMs: number | null;
  pendingSinceIso: string | null;
  /** Time of the last VALID observation. Null after a gap or invalid sample. */
  lastObservationMs: number | null;
  /** Observed start of the condition currently held open. */
  observedStartedAt: string | null;
}

export type AudioSilenceIntent =
  | { kind: "none" }
  | {
      kind: "open_condition";
      observedStartedAt: string;
      detectedAt: string;
      measurement: BrowserAudioLevelSnapshot;
    }
  | {
      kind: "close_condition";
      observedEndedAt: string;
      measurement: BrowserAudioLevelSnapshot;
    };

export function initialAudioSilenceState(): AudioSilenceDetectorState {
  return {
    condition: "normal",
    pendingSinceMs: null,
    pendingSinceIso: null,
    lastObservationMs: null,
    observedStartedAt: null,
  };
}

/**
 * Decision level for TOTAL audio silence: the loudest measured channel, so one
 * live channel prevents an `audio_silence` incident. Returns null whenever
 * there is no genuine measurement — which is never treated as silence.
 * Single-channel loss is a separate future detector.
 */
export function decisionLevelDbfs(
  snapshot: BrowserAudioLevelSnapshot | null | undefined,
): number | null {
  if (!snapshot || snapshot.status !== "observed") return null;
  if (!hasAudioMeasurement(snapshot)) return null;
  const channels = [snapshot.mono, snapshot.left, snapshot.right].filter(
    Boolean,
  ) as BrowserAudioChannelLevel[];
  if (channels.length === 0) return null;
  let max = -Infinity;
  for (const c of channels) {
    if (Number.isFinite(c.rmsDbfs) && c.rmsDbfs > max) max = c.rmsDbfs;
  }
  return Number.isFinite(max) ? max : null;
}

/** Advance the machine by exactly one observation. */
export function stepAudioSilenceDetector(
  prev: AudioSilenceDetectorState,
  snapshot: BrowserAudioLevelSnapshot | null | undefined,
  observedAtMs: number,
  config: AudioSilenceConfig = AUDIO_SILENCE_DETECTOR_CONFIG,
): { state: AudioSilenceDetectorState; intent: AudioSilenceIntent } {
  const level = decisionLevelDbfs(snapshot);

  // No genuine measurement: pending windows are discarded and nothing is
  // inferred about the unobserved interval. A held condition is retained as
  // observed, but it can neither progress nor recover on missing data.
  if (level === null) {
    const condition: SilenceConditionState =
      prev.condition === "pending_silence"
        ? "normal"
        : prev.condition === "pending_recovery"
          ? "silence"
          : prev.condition;
    return {
      state: {
        ...prev,
        condition,
        pendingSinceMs: null,
        pendingSinceIso: null,
        lastObservationMs: null,
        observedStartedAt: condition === "normal" ? null : prev.observedStartedAt,
      },
      intent: { kind: "none" },
    };
  }

  const iso = new Date(observedAtMs).toISOString();
  const continuous =
    prev.lastObservationMs !== null &&
    observedAtMs - prev.lastObservationMs <= config.maxObservationGapMs;

  const base: AudioSilenceDetectorState = { ...prev, lastObservationMs: observedAtMs };
  const silent = level < config.enterDbfs;
  const recovered = level > config.exitDbfs;

  switch (prev.condition) {
    case "normal": {
      if (!silent) {
        return {
          state: { ...base, pendingSinceMs: null, pendingSinceIso: null },
          intent: { kind: "none" },
        };
      }
      return {
        state: {
          ...base,
          condition: "pending_silence",
          pendingSinceMs: observedAtMs,
          pendingSinceIso: iso,
        },
        intent: { kind: "none" },
      };
    }

    case "pending_silence": {
      if (!silent) {
        return {
          state: {
            ...base,
            condition: "normal",
            pendingSinceMs: null,
            pendingSinceIso: null,
          },
          intent: { kind: "none" },
        };
      }
      // A gap means MAKO did not observe the interval: restart the window.
      if (!continuous || prev.pendingSinceMs === null) {
        return {
          state: { ...base, pendingSinceMs: observedAtMs, pendingSinceIso: iso },
          intent: { kind: "none" },
        };
      }
      if (observedAtMs - prev.pendingSinceMs >= config.enterMs) {
        const observedStartedAt = prev.pendingSinceIso ?? iso;
        return {
          state: {
            ...base,
            condition: "silence",
            pendingSinceMs: null,
            pendingSinceIso: null,
            observedStartedAt,
          },
          intent: {
            kind: "open_condition",
            observedStartedAt,
            detectedAt: iso,
            measurement: snapshot as BrowserAudioLevelSnapshot,
          },
        };
      }
      return { state: base, intent: { kind: "none" } };
    }

    case "silence": {
      if (!recovered) {
        return {
          state: { ...base, pendingSinceMs: null, pendingSinceIso: null },
          intent: { kind: "none" },
        };
      }
      return {
        state: {
          ...base,
          condition: "pending_recovery",
          pendingSinceMs: observedAtMs,
          pendingSinceIso: iso,
        },
        intent: { kind: "none" },
      };
    }

    case "pending_recovery": {
      if (!recovered) {
        return {
          state: {
            ...base,
            condition: "silence",
            pendingSinceMs: null,
            pendingSinceIso: null,
          },
          intent: { kind: "none" },
        };
      }
      if (!continuous || prev.pendingSinceMs === null) {
        return {
          state: { ...base, pendingSinceMs: observedAtMs, pendingSinceIso: iso },
          intent: { kind: "none" },
        };
      }
      if (observedAtMs - prev.pendingSinceMs >= config.exitMs) {
        return {
          state: {
            ...base,
            condition: "normal",
            pendingSinceMs: null,
            pendingSinceIso: null,
            observedStartedAt: null,
          },
          intent: {
            kind: "close_condition",
            observedEndedAt: prev.pendingSinceIso ?? iso,
            measurement: snapshot as BrowserAudioLevelSnapshot,
          },
        };
      }
      return { state: base, intent: { kind: "none" } };
    }
  }
}
