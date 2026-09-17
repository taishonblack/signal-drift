/**
 * Telemetry provider boundary (Phase E.2).
 *
 * Later phases (E.3 audio metering, E.4 SRT transport, E.5 persistence, E.7
 * monitoring intelligence) plug into THIS interface instead of building parallel
 * telemetry systems. Nothing here fabricates an implementation just to satisfy
 * the interface: an unimplemented reader returns not-measured explicitly.
 */

import {
  emptyOutputAudio,
  emptyReceiver,
  emptySourceAudio,
  emptyTransport,
  emptyVideo,
  observed,
  type MediaTelemetrySnapshot,
  type OutputAudioTelemetry,
  type ReceiverTelemetry,
  type RouteIdentity,
  type SourceAudioTelemetry,
  type TransportTelemetry,
  type VideoTelemetry,
  unavailable,
} from "./contract";
import type { ParsedFfmpegMetadata } from "./ffmpeg-metadata-types";

export interface MediaMetadataResult {
  video: VideoTelemetry;
  audioSource: SourceAudioTelemetry;
  audioOutput: OutputAudioTelemetry;
  /** Set only for a genuine observation. */
  observedAt?: string | null;
  source?: MediaTelemetrySnapshot["source"];
  observationPoint?: MediaTelemetrySnapshot["observationPoint"];
  /**
   * Typed, sanitized failure code when nothing could be observed. Never shown
   * as a stream fault: a telemetry failure is not a signal failure.
   */
  failure?: MediaProbeFailureCode | null;
}

export interface TelemetryProvider {
  /** Genuine source format metadata, when the server has captured it. */
  getMediaMetadata(route: RouteIdentity): Promise<MediaMetadataResult>;
  /** SRT transport statistics — not measured in E.2 (E.4). */
  getTransportTelemetry(route: RouteIdentity): Promise<TransportTelemetry>;
  /** Browser receive statistics — not measured in E.2. */
  getReceiverTelemetry(route: RouteIdentity): Promise<ReceiverTelemetry>;
}

/**
 * The provider MAKO uses today. No server surface returns FFmpeg's captured
 * input metadata yet (the caller API is lifecycle-only and MediaMTX's API and
 * metrics are disabled), so every group is explicitly empty rather than guessed.
 */
export class NullTelemetryProvider implements TelemetryProvider {
  async getMediaMetadata() {
    return {
      video: emptyVideo(),
      audioSource: emptySourceAudio(),
      audioOutput: emptyOutputAudio(),
    };
  }
  async getTransportTelemetry() {
    return emptyTransport();
  }
  async getReceiverTelemetry() {
    return emptyReceiver();
  }
}

/**
 * MAKO's own caller output configuration. CONFIGURATION, never a measurement of
 * the source: MAKO launches FFmpeg with libopus at 48 kHz stereo and `-b:a 128k`.
 * Supplied per-route by the server so nothing is assumed when it is unknown.
 */
export interface CallerOutputConfig {
  audioCodec: string;
  audioSampleRate: number;
  audioChannels: number;
  audioBitrate: number;
}

/** Map genuine parsed FFmpeg metadata onto the contract. */
export function videoFromParsed(
  parsed: ParsedFfmpegMetadata,
  observedAt: string,
): VideoTelemetry {
  const v = parsed.video;
  const base = emptyVideo();
  if (!v) return base;
  return {
    codec: v.codec !== undefined ? observed(v.codec, "ffmpeg", observedAt) : base.codec,
    codecProfile:
      v.codecProfile !== undefined ? observed(v.codecProfile, "ffmpeg", observedAt) : base.codecProfile,
    width: v.width !== undefined ? observed(v.width, "ffmpeg", observedAt) : base.width,
    height: v.height !== undefined ? observed(v.height, "ffmpeg", observedAt) : base.height,
    frameRate:
      v.frameRate !== undefined ? observed(v.frameRate, "ffmpeg", observedAt) : base.frameRate,
    scanType: v.scanType !== undefined ? observed(v.scanType, "ffmpeg", observedAt) : base.scanType,
    colorSpace:
      v.colorSpace !== undefined ? observed(v.colorSpace, "ffmpeg", observedAt) : base.colorSpace,
  };
}

export function sourceAudioFromParsed(
  parsed: ParsedFfmpegMetadata,
  observedAt: string,
): SourceAudioTelemetry {
  const a = parsed.audio;
  const base = emptySourceAudio();
  if (!a) return base;
  const label = a.codecProfile ? `${a.codec ?? ""} (${a.codecProfile})`.trim() : a.codec;
  return {
    codec: label ? observed(label, "ffmpeg", observedAt) : base.codec,
    sampleRate:
      a.sampleRate !== undefined ? observed(a.sampleRate, "ffmpeg", observedAt) : base.sampleRate,
    channelCount:
      a.channelCount !== undefined
        ? observed(a.channelCount, "ffmpeg", observedAt)
        : base.channelCount,
    channelLayout:
      a.channelLayout !== undefined
        ? observed(a.channelLayout, "ffmpeg", observedAt)
        : base.channelLayout,
    encodedBitrate:
      a.encodedBitrate !== undefined
        ? observed(a.encodedBitrate, "ffmpeg", observedAt)
        : base.encodedBitrate,
  };
}

/** MAKO's output audio, always tagged as configuration. */
export function outputAudioFromConfig(
  config: CallerOutputConfig | null | undefined,
  observedAt: string,
): OutputAudioTelemetry {
  if (!config) return emptyOutputAudio();
  return {
    outputAudioCodec: observed(config.audioCodec, "mako_config", observedAt),
    outputAudioSampleRate: observed(config.audioSampleRate, "mako_config", observedAt),
    outputAudioChannels: observed(config.audioChannels, "mako_config", observedAt),
    configuredOutputAudioBitrate: observed(config.audioBitrate, "mako_config", observedAt),
  };
}

/**
 * Build a snapshot from genuine server-reported media metadata. Transport and
 * receiver groups stay not-measured in E.2, and the configured SRT receiver
 * latency is stored as configuration only — it can never appear as RTT.
 */
export function snapshotFromMetadata(args: {
  identity: RouteIdentity;
  parsed: ParsedFfmpegMetadata;
  observedAt: string;
  outputConfig?: CallerOutputConfig | null;
  configuredReceiverLatencyUs?: number | null;
}): MediaTelemetrySnapshot {
  const { identity, parsed, observedAt } = args;
  const transport = emptyTransport();
  return {
    runtimeRouteId: identity.runtimeRouteId,
    sessionId: identity.sessionId,
    slot: identity.slot,
    infrastructureSourceId: identity.infrastructureSourceId ?? null,
    playbackPath: identity.playbackPath ?? null,
    observedAt,
    source: "ffmpeg",
    observationPoint: "ffmpeg_input",
    video: videoFromParsed(parsed, observedAt),
    audioSource: sourceAudioFromParsed(parsed, observedAt),
    audioOutput: outputAudioFromConfig(args.outputConfig, observedAt),
    transport: {
      ...transport,
      configuredReceiverLatencyUs:
        typeof args.configuredReceiverLatencyUs === "number"
          ? observed(args.configuredReceiverLatencyUs, "mako_config", observedAt)
          : unavailable(),
    },
    receiver: emptyReceiver(),
  };
}
