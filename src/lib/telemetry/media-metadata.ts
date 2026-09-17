/**
 * Phase E.2B — map a genuine ffprobe observation of MAKO's own RTSP publication
 * onto the E.2 telemetry contract.
 *
 * Provenance rule (non-negotiable): the probe point is AFTER MAKO's FFmpeg
 * caller. Video is stream-copied (`-c:v copy`), so the observed H.264
 * characteristics are genuine, but audio is transcoded (AAC-LC in, Opus out).
 * Therefore the observed audio populates the MAKO OUTPUT group only —
 * `audioSource` stays unavailable until a source-side observation exists.
 *
 * Nothing here defaults, infers or estimates: an absent ffprobe field stays
 * unavailable.
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
  type RouteIdentity,
  type VideoTelemetry,
} from "./contract";

export interface MediaProbeVideo {
  codec?: string | null;
  profile?: string | null;
  width?: number | null;
  height?: number | null;
  /** Rational (`"30/1"`, `"30000/1001"`) or a plain number. */
  frame_rate?: string | number | null;
  field_order?: string | null;
  color_space?: string | null;
}

export interface MediaProbeAudioOutput {
  codec?: string | null;
  sample_rate?: number | null;
  channels?: number | null;
  channel_layout?: string | null;
}

/** Normalized server response for a successful probe. */
export interface MediaProbePayload {
  source_id: string;
  playback_path: string;
  observed_at: string;
  observation_point: "rtsp_publication";
  video?: MediaProbeVideo | null;
  audio_output?: MediaProbeAudioOutput | null;
}

/**
 * Parse ffprobe's rational frame rate.
 *
 * `30/1` → 30. `30000/1001` → 29.97 (never rounded to 30). Anything
 * unparseable, zero-denominator or non-finite → null, which the contract keeps
 * as unavailable.
 */
export function parseFrameRate(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.includes("/")) {
    const [n, d] = trimmed.split("/");
    const num = Number(n);
    const den = Number(d);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0 || num <= 0) return null;
    const exact = num / den;
    if (Number.isInteger(exact)) return exact;
    // Preserve the 29.97 / 59.94 family: two decimals, never a rounded integer.
    return Math.round(exact * 100) / 100;
  }

  const plain = Number(trimmed);
  return Number.isFinite(plain) && plain > 0 ? plain : null;
}

/** Scan type is reported only when ffprobe genuinely says so. */
function scanTypeFrom(fieldOrder: string | null | undefined): string | null {
  if (typeof fieldOrder !== "string") return null;
  const v = fieldOrder.trim().toLowerCase();
  if (!v || v === "unknown") return null;
  if (v === "progressive") return "progressive";
  return "interlaced";
}

export function videoFromProbe(
  video: MediaProbeVideo | null | undefined,
  observedAt: string,
): VideoTelemetry {
  const base = emptyVideo();
  if (!video) return base;

  const fps = parseFrameRate(video.frame_rate);
  const scan = scanTypeFrom(video.field_order);
  const color =
    typeof video.color_space === "string" && video.color_space.trim() && video.color_space !== "unknown"
      ? video.color_space.trim()
      : null;

  return {
    codec: video.codec ? observed(video.codec, "ffmpeg", observedAt) : base.codec,
    codecProfile: video.profile ? observed(video.profile, "ffmpeg", observedAt) : base.codecProfile,
    width:
      typeof video.width === "number" && video.width > 0
        ? observed(video.width, "ffmpeg", observedAt)
        : base.width,
    height:
      typeof video.height === "number" && video.height > 0
        ? observed(video.height, "ffmpeg", observedAt)
        : base.height,
    frameRate: fps !== null ? observed(fps, "ffmpeg", observedAt) : base.frameRate,
    scanType: scan ? observed(scan, "ffmpeg", observedAt) : base.scanType,
    colorSpace: color ? observed(color, "ffmpeg", observedAt) : base.colorSpace,
  };
}

/**
 * MAKO's published audio, observed on the RTSP publication. This is MAKO's
 * OUTPUT, never the source's audio.
 */
export function outputAudioFromProbe(
  audio: MediaProbeAudioOutput | null | undefined,
  observedAt: string,
): OutputAudioTelemetry {
  const base = emptyOutputAudio();
  if (!audio) return base;
  return {
    outputAudioCodec: audio.codec
      ? observed(audio.codec, "ffmpeg", observedAt)
      : base.outputAudioCodec,
    outputAudioSampleRate:
      typeof audio.sample_rate === "number" && audio.sample_rate > 0
        ? observed(audio.sample_rate, "ffmpeg", observedAt)
        : base.outputAudioSampleRate,
    outputAudioChannels:
      typeof audio.channels === "number" && audio.channels > 0
        ? observed(audio.channels, "ffmpeg", observedAt)
        : base.outputAudioChannels,
    // Configuration-only field: an observed publication bitrate is never
    // presented as MAKO's configured bitrate.
    configuredOutputAudioBitrate: base.configuredOutputAudioBitrate,
  };
}

/**
 * Build a snapshot from a genuine RTSP-publication probe. Source audio,
 * transport and receiver groups stay untouched (unavailable / not measured).
 */
export function snapshotFromProbe(args: {
  identity: RouteIdentity;
  payload: MediaProbePayload;
}): MediaTelemetrySnapshot {
  const { identity, payload } = args;
  const observedAt = payload.observed_at;
  return {
    runtimeRouteId: identity.runtimeRouteId,
    sessionId: identity.sessionId,
    slot: identity.slot,
    infrastructureSourceId: identity.infrastructureSourceId ?? payload.source_id ?? null,
    playbackPath: identity.playbackPath ?? payload.playback_path ?? null,
    observedAt,
    source: "ffmpeg",
    observationPoint: "rtsp_publication",
    video: videoFromProbe(payload.video, observedAt),
    audioSource: emptySourceAudio(),
    audioOutput: outputAudioFromProbe(payload.audio_output, observedAt),
    transport: emptyTransport(),
    receiver: emptyReceiver(),
  };
}
