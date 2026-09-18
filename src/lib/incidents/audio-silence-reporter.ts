// Phase E.5B — persistence layer for the audio-silence detector.
//
// The detector says what was OBSERVED. This reporter tracks what was actually
// WRITTEN. The two are separate facts and are never conflated:
//
//   - a failed submit never marks a condition persisted;
//   - retry is bounded and scheduled on a timer, never per observation frame;
//   - every retry re-sends the SAME logical identity (session + runtime route +
//     incident type + observedStartedAt), so the server's create-or-corroborate
//     path makes it idempotent and cannot produce duplicate rows;
//   - recovery is only attempted once an incident id exists. Observed recovery
//     without a persisted incident is reported truthfully, never faked.

import type { BrowserAudioLevelSnapshot } from "@/lib/telemetry/browser-audio-contract";
import { buildAudioLevelEvidence } from "./audio-silence-evidence";
import {
  AUDIO_SILENCE_DETECTOR_CONFIG,
  type AudioSilenceConfig,
} from "./audio-silence-detector";
import type {
  IncidentRecoveryResult,
  IncidentSubmission,
  IncidentSubmissionResult,
} from "./contract";

export const AUDIO_SILENCE_RETRY_DELAYS_MS = [2000, 8000, 30000];

/** Errors that will never succeed on retry. */
const TERMINAL_ERRORS = new Set(["unauthenticated", "not_authorized", "not_found"]);

export type PersistenceState =
  | "idle"
  | "unpersisted"
  | "persisting"
  | "persisted"
  | "failed";

export interface AudioSilenceIdentity {
  sessionId: string;
  runtimeRouteId: string | null;
  slot: number | null;
  sourceName: string;
}

export interface AudioSilenceReporterDeps {
  submit: (input: IncidentSubmission) => Promise<IncidentSubmissionResult>;
  recover: (args: {
    incidentId: string;
    observedEndedAt: string;
    recoveryNote?: string | null;
    evidence?: IncidentSubmission["evidence"];
  }) => Promise<IncidentRecoveryResult>;
  /** Injected so retries are testable and never tied to animation frames. */
  schedule: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

interface OpenTask {
  observedStartedAt: string;
  detectedAt: string;
  measurement: BrowserAudioLevelSnapshot;
  attempts: number;
  state: PersistenceState;
}

interface CloseTask {
  observedEndedAt: string;
  measurement: BrowserAudioLevelSnapshot;
  attempts: number;
  state: PersistenceState;
}

export interface AudioSilenceReporterSnapshot {
  openState: PersistenceState;
  closeState: PersistenceState;
  incidentId: string | null;
  observedStartedAt: string | null;
  observedEndedAt: string | null;
  submitCalls: number;
  recoverCalls: number;
}

export class AudioSilenceReporter {
  private open: OpenTask | null = null;
  private close: CloseTask | null = null;
  private incidentId: string | null = null;
  private timer: unknown = null;
  private disposed = false;
  private submitCalls = 0;
  private recoverCalls = 0;

  constructor(
    private readonly identity: AudioSilenceIdentity,
    private readonly deps: AudioSilenceReporterDeps,
    private readonly config: AudioSilenceConfig = AUDIO_SILENCE_DETECTOR_CONFIG,
  ) {}

  /** The detector observed a sustained condition. At most one open per lifecycle. */
  observedOpen(input: {
    observedStartedAt: string;
    detectedAt: string;
    measurement: BrowserAudioLevelSnapshot;
  }): void {
    if (this.disposed || this.open) return;
    this.open = {
      observedStartedAt: input.observedStartedAt,
      detectedAt: input.detectedAt,
      measurement: input.measurement,
      attempts: 0,
      state: "unpersisted",
    };
    void this.runOpen();
  }

  /** The detector observed sustained recovery of the open condition. */
  observedClose(input: {
    observedEndedAt: string;
    measurement: BrowserAudioLevelSnapshot;
  }): void {
    if (this.disposed || !this.open || this.close) return;
    this.close = {
      observedEndedAt: input.observedEndedAt,
      measurement: input.measurement,
      attempts: 0,
      state: "unpersisted",
    };
    void this.runClose();
  }

  snapshot(): AudioSilenceReporterSnapshot {
    return {
      openState: this.open?.state ?? "idle",
      closeState: this.close?.state ?? "idle",
      incidentId: this.incidentId,
      observedStartedAt: this.open?.observedStartedAt ?? null,
      observedEndedAt: this.close?.observedEndedAt ?? null,
      submitCalls: this.submitCalls,
      recoverCalls: this.recoverCalls,
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) this.deps.cancel?.(this.timer);
    this.timer = null;
  }

  private submission(task: OpenTask): IncidentSubmission {
    return {
      sessionId: this.identity.sessionId,
      runtimeRouteId: this.identity.runtimeRouteId,
      slot: this.identity.slot,
      sourceName: this.identity.sourceName,
      incidentType: "audio_silence",
      detectorId: this.config.detectorId,
      detectorVersion: this.config.detectorVersion,
      threshold: {
        enterDbfs: this.config.enterDbfs,
        enterMs: this.config.enterMs,
        exitDbfs: this.config.exitDbfs,
        exitMs: this.config.exitMs,
        maxObservationGapMs: this.config.maxObservationGapMs,
        unit: "dBFS",
      },
      observationPoint: "browser_webrtc_pcm",
      observedStartedAt: task.observedStartedAt,
      detectedAt: task.detectedAt,
      // Existing contract: the condition snapshot is the `event` phase.
      evidence: {
        phase: "event",
        capturedAt: task.measurement.observedAt ?? task.detectedAt,
        observationPoint: "browser_webrtc_pcm",
        payload: buildAudioLevelEvidence(task.measurement, this.config, task.detectedAt),
      },
    };
  }

  private async runOpen(): Promise<void> {
    const task = this.open;
    if (!task || this.disposed || task.state === "persisted") return;
    task.state = "persisting";
    task.attempts += 1;
    this.submitCalls += 1;

    let result: IncidentSubmissionResult;
    try {
      result = await this.deps.submit(this.submission(task));
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : "submit_failed" };
    }
    if (this.disposed) return;

    if (result.ok) {
      task.state = "persisted";
      this.incidentId = result.incidentId;
      // A recovery observed while the open write was in flight runs now.
      if (this.close && this.close.state !== "persisted") void this.runClose();
      return;
    }
    this.retryOrFail(task, result.error, () => void this.runOpen());
  }

  private async runClose(): Promise<void> {
    const task = this.close;
    if (!task || this.disposed || task.state === "persisted") return;
    // Observed recovery is not persisted recovery: with no incident id there is
    // nothing to recover, and nothing is claimed.
    if (!this.incidentId) {
      task.state = "unpersisted";
      return;
    }
    task.state = "persisting";
    task.attempts += 1;
    this.recoverCalls += 1;

    let result: IncidentRecoveryResult;
    try {
      result = await this.deps.recover({
        incidentId: this.incidentId,
        observedEndedAt: task.observedEndedAt,
        // Existing contract: post-condition snapshot is the `post` phase.
        evidence: {
          phase: "post",
          capturedAt: task.measurement.observedAt ?? task.observedEndedAt,
          observationPoint: "browser_webrtc_pcm",
          payload: buildAudioLevelEvidence(
            task.measurement,
            this.config,
            task.observedEndedAt,
          ),
        },
      });
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : "recover_failed" };
    }
    if (this.disposed) return;

    if (result.ok) {
      task.state = "persisted";
      return;
    }
    this.retryOrFail(task, result.error, () => void this.runClose());
  }

  private retryOrFail(
    task: OpenTask | CloseTask,
    error: string,
    again: () => void,
  ): void {
    if (TERMINAL_ERRORS.has(error) || task.attempts >= AUDIO_SILENCE_RETRY_DELAYS_MS.length) {
      task.state = "failed";
      return;
    }
    task.state = "unpersisted";
    const delay = AUDIO_SILENCE_RETRY_DELAYS_MS[task.attempts - 1] ?? 30000;
    this.timer = this.deps.schedule(() => {
      if (!this.disposed) again();
    }, delay);
  }
}
