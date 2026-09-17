/**
 * MAKO media telemetry contract (Phase E.2).
 *
 * One typed model for every technical value MAKO shows an operator. Rules that
 * this file exists to enforce:
 *
 *   - Telemetry identity is the caller-first runtime route id. Never a slot
 *     number on its own, never a friendly name, never `camN`.
 *   - Every value carries provenance (which system observed it) and a status.
 *     A value MAKO does not measure stays unavailable / not measured; nothing
 *     is ever defaulted, inferred or estimated.
 *   - Configuration and observation are different things and never merge.
 */

/** Which system produced a value. `mako_config` is configuration, not a measurement. */
export type TelemetrySource = "ffmpeg" | "srt" | "webrtc" | "mediamtx" | "mako_config";

/** Deliberately no "estimated": MAKO does not estimate engineering values. */
export type TelemetryStatus = "observed" | "unavailable" | "stale" | "not_measured";

export interface Observed<T> {
  value: T | null;
  observedAt: string | null;
  source: TelemetrySource | null;
  status: TelemetryStatus;
}

export function observed<T>(
  value: T,
  source: TelemetrySource,
  observedAt: string,
): Observed<T> {
  return { value, observedAt, source, status: "observed" };
}

/** Measurable in principle, but no observation is currently available. */
export function unavailable<T>(): Observed<T> {
  return { value: null, observedAt: null, source: null, status: "unavailable" };
}

/** MAKO does not measure this yet at all (arrives in a later phase). */
export function notMeasured<T>(): Observed<T> {
  return { value: null, observedAt: null, source: null, status: "not_measured" };
}

/** True only for a genuine observation with a value. */
export function hasValue<T>(field: Observed<T> | undefined): boolean {
  return !!field && field.status === "observed" && field.value !== null;
}

export interface VideoTelemetry {
  codec: Observed<string>;
  codecProfile: Observed<string>;
  width: Observed<number>;
  height: Observed<number>;
  frameRate: Observed<number>;
  /** "progressive" | "interlaced" — only when genuinely reported. */
  scanType: Observed<string>;
  colorSpace: Observed<string>;
}

/** The INCOMING stream's audio, as reported about the source. */
export interface SourceAudioTelemetry {
  codec: Observed<string>;
  sampleRate: Observed<number>;
  channelCount: Observed<number>;
  channelLayout: Observed<string>;
  /** Only when the source parser explicitly reports a bitrate. */
  encodedBitrate: Observed<number>;
}

/**
 * What MAKO itself publishes for browser playback. This is CONFIGURATION
 * (MAKO launches FFmpeg with these flags), never a measurement of the source.
 */
export interface OutputAudioTelemetry {
  outputAudioCodec: Observed<string>;
  outputAudioSampleRate: Observed<number>;
  outputAudioChannels: Observed<number>;
  configuredOutputAudioBitrate: Observed<number>;
}

/**
 * SRT transport. Phase E.2 measures none of it (E.4).
 *
 * `rtt` accepts an `srt`-sourced observation only, which is what structurally
 * prevents MAKO's configured receiver latency (`latency=120000`) from ever
 * being displayed as RTT or "Latency".
 */
export interface TransportTelemetry {
  bitrate: Observed<number>;
  packetLoss: Observed<number>;
  rtt: Observed<number> & { source: "srt" | null };
  /** MAKO's configured SRT receiver latency in µs. Configuration, not latency. */
  configuredReceiverLatencyUs: Observed<number>;
}

/** Browser-side receive statistics (later phase). */
export interface ReceiverTelemetry {
  framesDecoded: Observed<number>;
  framesDropped: Observed<number>;
  jitter: Observed<number>;
}

export interface MediaTelemetrySnapshot {
  /** Canonical telemetry identity. */
  runtimeRouteId: string;
  sessionId: string;
  slot: number;
  /** `src_xxxxxx` */
  infrastructureSourceId: string | null;
  /** `src_xxxxxx-opus` */
  playbackPath: string | null;

  observedAt: string | null;
  source: TelemetrySource | null;

  video: VideoTelemetry;
  audioSource: SourceAudioTelemetry;
  audioOutput: OutputAudioTelemetry;
  transport: TransportTelemetry;
  receiver: ReceiverTelemetry;
}

export function emptyVideo(): VideoTelemetry {
  return {
    codec: unavailable(),
    codecProfile: unavailable(),
    width: unavailable(),
    height: unavailable(),
    frameRate: unavailable(),
    scanType: unavailable(),
    colorSpace: unavailable(),
  };
}

export function emptySourceAudio(): SourceAudioTelemetry {
  return {
    codec: unavailable(),
    sampleRate: unavailable(),
    channelCount: unavailable(),
    channelLayout: unavailable(),
    encodedBitrate: unavailable(),
  };
}

export function emptyOutputAudio(): OutputAudioTelemetry {
  return {
    outputAudioCodec: unavailable(),
    outputAudioSampleRate: unavailable(),
    outputAudioChannels: unavailable(),
    configuredOutputAudioBitrate: unavailable(),
  };
}

/** Phase E.2: nothing on the transport is measured. */
export function emptyTransport(): TransportTelemetry {
  return {
    bitrate: notMeasured(),
    packetLoss: notMeasured(),
    rtt: { ...notMeasured<number>(), source: null },
    configuredReceiverLatencyUs: unavailable(),
  };
}

export function emptyReceiver(): ReceiverTelemetry {
  return {
    framesDecoded: notMeasured(),
    framesDropped: notMeasured(),
    jitter: notMeasured(),
  };
}

export interface RouteIdentity {
  runtimeRouteId: string;
  sessionId: string;
  slot: number;
  infrastructureSourceId?: string | null;
  playbackPath?: string | null;
}

/** An identity-only snapshot: correct provenance, no invented values. */
export function emptySnapshot(identity: RouteIdentity): MediaTelemetrySnapshot {
  return {
    runtimeRouteId: identity.runtimeRouteId,
    sessionId: identity.sessionId,
    slot: identity.slot,
    infrastructureSourceId: identity.infrastructureSourceId ?? null,
    playbackPath: identity.playbackPath ?? null,
    observedAt: null,
    source: null,
    video: emptyVideo(),
    audioSource: emptySourceAudio(),
    audioOutput: emptyOutputAudio(),
    transport: emptyTransport(),
    receiver: emptyReceiver(),
  };
}

/** A snapshot older than this is no longer presented as current. */
export const TELEMETRY_STALE_AFTER_MS = 30_000;

/**
 * Downgrade observations that are too old to be presented as current. Nothing
 * else is inferred — a stale value keeps its number and provenance so the UI
 * can say plainly that it is no longer fresh.
 */
export function freshness(
  snapshot: MediaTelemetrySnapshot,
  now: number = Date.now(),
  staleAfterMs: number = TELEMETRY_STALE_AFTER_MS,
): MediaTelemetrySnapshot {
  const age = (at: string | null) => (at ? now - new Date(at).getTime() : Infinity);
  const mark = <T,>(f: Observed<T>): Observed<T> =>
    f.status === "observed" && age(f.observedAt) > staleAfterMs ? { ...f, status: "stale" } : f;

  const group = <G extends Record<string, Observed<unknown>>>(g: G): G => {
    const out = {} as Record<string, unknown>;
    for (const [k, v] of Object.entries(g)) out[k] = { ...mark(v), ...("source" in v ? {} : {}) };
    return out as G;
  };

  return {
    ...snapshot,
    video: group(snapshot.video as unknown as Record<string, Observed<unknown>>) as unknown as VideoTelemetry,
    audioSource: group(
      snapshot.audioSource as unknown as Record<string, Observed<unknown>>,
    ) as unknown as SourceAudioTelemetry,
    audioOutput: group(
      snapshot.audioOutput as unknown as Record<string, Observed<unknown>>,
    ) as unknown as OutputAudioTelemetry,
    transport: {
      ...snapshot.transport,
      bitrate: mark(snapshot.transport.bitrate),
      packetLoss: mark(snapshot.transport.packetLoss),
      rtt: { ...mark(snapshot.transport.rtt), source: snapshot.transport.rtt.source },
      configuredReceiverLatencyUs: snapshot.transport.configuredReceiverLatencyUs,
    },
    receiver: group(
      snapshot.receiver as unknown as Record<string, Observed<unknown>>,
    ) as unknown as ReceiverTelemetry,
  };
}

/**
 * Resolve the snapshot for a runtime route. Lookup is by route id ONLY: an
 * ended or replaced route cannot leak its telemetry into another route that
 * happens to occupy the same slot.
 */
export function snapshotForRoute(
  snapshots: MediaTelemetrySnapshot[],
  runtimeRouteId: string | null | undefined,
): MediaTelemetrySnapshot | null {
  if (!runtimeRouteId) return null;
  return snapshots.find((s) => s.runtimeRouteId === runtimeRouteId) ?? null;
}
