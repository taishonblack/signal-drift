/**
 * Shared Session Room types.
 *
 * Phase E.1A (Truth Pass) removed every simulated, seeded and randomised
 * engineering metric from this module. MAKO does not measure bitrate, packet
 * loss, RTT, codec, resolution, frame rate, audio format or loudness yet, so
 * no plausible-looking placeholder may exist anywhere in the runtime. Real
 * telemetry arrives in later Phase E work and will carry its own type.
 */

export type StreamStatus =
  | "idle"
  | "connecting"
  | "live"
  | "warning"
  | "error"
  /** Caller-first slot whose SRT caller was never provisioned/attached. */
  | "provisioning_failed";

export interface StreamInput {
  id: string;
  label: string;
  enabled: boolean;
  srtAddress: string;
  passphrase?: string;
  status: StreamStatus;
  videoSrc?: string;
  /** MediaMTX playback path for this source. */
  streamName?: string;
  /** 1-based source slot. */
  slot?: number;
}

/** Minimal session shape used by the completed-session report dialog. */
export interface Session {
  id: string;
  name: string;
  status: "live" | "ended" | "scheduled";
  createdAt: string;
  inputCount: number;
  pin: string;
  inputs: StreamInput[];
}

export interface QCMarker {
  id: string;
  timestamp: string;
  streamLabel: string;
  note: string;
}
